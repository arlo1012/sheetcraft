import { isFormulaError, type CellContent, type FormulaValue } from "../formula/types.js";
import {
  buildPivotResult,
  getPivotDetails,
  getPivotTableRange,
  getPivotSourceRanges,
  getPivotPresentation,
  normalizePivotTable,
  normalizePivotTables,
  addressInRange,
  rangesIntersect,
  type SheetPivotTable,
} from "../pivot-tables.js";
import {
  createCellKey,
  createSheetSparseState,
  replaceSheetSparseState,
  createSheet,
  setCellContent,
  getCellStyle,
  setCellStyle,
  type CellAddress,
  createWorkbookEvaluator,
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
  type Workbook,
  type Sheet,
  type SheetTable,
  type SheetSparseCell,
} from "../workbook.js";
import { resolveTableCellStyle } from "../table-styles.js";
import { resolvePivotTableStyle } from "../pivot-table-styles.js";
import { mergeCellStyle } from "../style.js";
import { deserializeSheet, serializeSheet } from "../serialization.js";
import { createAddSheetCommand } from "./sheets.js";
import { createRestoreSheetStateCommand } from "./structure.js";
import { getSheetOrThrow, invalidCommandPayload, validateCommandPayload } from "./helpers.js";
import type {
  AddSheetCommand,
  SetPivotTableCommand,
  RemovePivotTableCommand,
  RestoreFullSheetStateCommand,
} from "./contracts.js";
import type { SheetChartDrawing } from "../sheet-drawings.js";
function literal(value: FormulaValue): CellContent | undefined {
  return value === null
    ? undefined
    : isFormulaError(value)
      ? { kind: "error", error: value }
      : { kind: "literal", value };
}
export function createSetPivotTableCommand(
  sheetId: string,
  table: SheetPivotTable,
  options: { overwrite?: boolean; chartId?: string } = {},
): SetPivotTableCommand {
  return {
    type: "setPivotTable",
    sheetId,
    table: validateCommandPayload("pivot", table, () =>
      normalizePivotTable({ ...table, dataCache: undefined }),
    ),
    overwrite: options.overwrite ?? false,
    ...(options.chartId ? { chartId: options.chartId } : {}),
  };
}
function plan(workbook: Workbook, sheet: Sheet, command: SetPivotTableCommand) {
  const table = normalizePivotTable(command.table);
  const existing = sheet.pivotTables?.find((item) => item.id === table.id);
  if (
    typeof command.overwrite !== "boolean" ||
    (command.chartId !== undefined && (!command.chartId || typeof command.chartId !== "string"))
  )
    throw invalidCommandPayload("pivot", command);
  if (sheet.properties.protected && (!existing || !sheet.protection?.pivotTables))
    throw invalidCommandPayload("protected", sheet.id);
  const result = buildPivotResult(workbook, table);
  const range = result.matrix.length
    ? {
        start: { ...table.anchor },
        end: {
          row: table.anchor.row + result.matrix.length - 1,
          column: table.anchor.column + result.matrix[0]!.length - 1,
        },
      }
    : getPivotTableRange({ ...table, outputRange: null });
  if (range.end.row >= MAX_SHEET_ROWS || range.end.column >= MAX_SHEET_COLUMNS)
    throw invalidCommandPayload("destination", range);
  if (
    getPivotSourceRanges(table).some(
      (area) => area.sheetId === sheet.id && area.range && rangesIntersect(range, area.range),
    )
  )
    throw invalidCommandPayload("sourceOverlap", range);
  if (sheet.mergedCells.some((merge) => rangesIntersect(merge, range)))
    throw invalidCommandPayload("merged", range);
  if (
    sheet.tables?.some((item) => rangesIntersect(item.range, range)) ||
    sheet.pivotTables?.some(
      (item) => item.id !== table.id && rangesIntersect(getPivotTableRange(item), range),
    )
  )
    throw invalidCommandPayload("tableOverlap", range);
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  for (const [key, cell] of sheet.cells)
    if (cell.content?.kind === "formula") {
      const [row, column] = key.split(":").map(Number);
      evaluator.getComputedValue({ row: row!, column: column! });
    }
  for (const spill of evaluator.getSpillProjections?.() ?? [])
    if (addressInRange(spill.address, range)) throw invalidCommandPayload("spill", spill.address);
  const previousState = createSheetSparseState(sheet);
  const originals = new Map(previousState.cells.map((cell) => [createCellKey(cell.address), cell]));
  const cells = new Map(originals);
  if (existing?.outputRange)
    for (const [key, cell] of cells)
      if (addressInRange(cell.address, existing.outputRange)) {
        const { content: _content, style: _style, namedStyle: _namedStyle, ...rest } = cell;
        if (rest.note || rest.hyperlink || rest.sparkline) cells.set(key, rest);
        else cells.delete(key);
      }
  // Reserve the empty report's area as well; failed configuration never partially clears cells.
  if (!result.matrix.length && !command.overwrite)
    for (const cell of previousState.cells)
      if (
        addressInRange(cell.address, range) &&
        !(existing?.outputRange && addressInRange(cell.address, existing.outputRange)) &&
        (cell.content || cell.note || cell.hyperlink || cell.sparkline)
      )
        throw invalidCommandPayload("overwrite", cell.address);
  if (!result.matrix.length && command.overwrite)
    for (const [key, cell] of cells)
      if (addressInRange(cell.address, range)) {
        const {
          content: _content,
          note: _note,
          hyperlink: _hyperlink,
          sparkline: _sparkline,
          ...rest
        } = cell;
        if (rest.style || rest.namedStyle) cells.set(key, rest);
        else cells.delete(key);
      }
  const presentation = getPivotPresentation(table);
  const reportStyle = resolvePivotTableStyle(workbook, table);
  const styledTable: SheetTable = {
    id: table.id,
    name: table.name,
    range: { ...range, start: { ...range.start, row: range.start.row + result.headerStart } },
    columns: [],
    style: reportStyle,
    headerRow: presentation.columnHeaders,
    totalRow: result.totalRow !== null,
    firstColumn: presentation.rowHeaders,
    lastColumn: result.totalColumnStart !== null,
    bandedRows: presentation.bandedRows,
    bandedColumns: presentation.bandedColumns,
    filterButton: false,
    filter: null,
  };
  result.matrix.forEach((row, rowIndex) =>
    row.forEach((value, columnIndex) => {
      const address = { row: range.start.row + rowIndex, column: range.start.column + columnIndex };
      const key = createCellKey(address);
      const previous = sheet.cells.get(key);
      if (
        !command.overwrite &&
        !(existing?.outputRange && addressInRange(address, existing.outputRange)) &&
        (previous?.content || previous?.sparkline || previous?.note || previous?.hyperlink)
      )
        throw invalidCommandPayload("overwrite", address);
      const original = originals.get(key);
      const cell: SheetSparseCell = {
        ...(cells.get(key) ?? { address }),
        style: mergeCellStyle(
          existing?.outputRange && addressInRange(address, existing.outputRange)
            ? undefined
            : original?.style,
          rowIndex < result.headerStart
            ? columnIndex < 2 && rowIndex < table.filters.length
              ? (reportStyle.elements[columnIndex === 0 ? "pageFieldLabels" : "pageFieldValues"]
                  ?.style ?? (columnIndex === 0 ? { bold: true } : {}))
              : {}
            : (resolveTableCellStyle(
                styledTable,
                rowIndex < result.headerRows
                  ? { ...address, row: styledTable.range.start.row }
                  : address,
              ) ?? {}),
        ),
      };
      if (columnIndex === 0 && result.rowIndents[rowIndex])
        cell.style = mergeCellStyle(cell.style, { indent: result.rowIndents[rowIndex] });
      if (result.subtotalRows.includes(rowIndex))
        cell.style = mergeCellStyle(cell.style, { bold: true });
      delete cell.namedStyle;
      const content = literal(value);
      if (content) cell.content = content;
      else delete cell.content;
      if (cell.content || cell.style || cell.note || cell.hyperlink || cell.sparkline)
        cells.set(key, cell);
      else cells.delete(key);
    }),
  );
  const nextTable: SheetPivotTable = {
    ...table,
    outputRange: result.matrix.length ? range : null,
    dataCache: result.dataCache,
    resultLayout: {
      labelColumns: result.rowLabelColumns,
      dataRows: result.dataRows,
      valueRows: result.rowMembers.flatMap((members, row) => (members === null ? [] : [row])),
      rowLabels: result.rowLabels,
      rowFieldIndices: result.rowFieldIndices,
      ...(table.reportLayout && result.headerRows > 0
        ? { headerRows: result.headerRows, seriesLabels: result.seriesLabels }
        : {}),
    },
  };
  const drawings = (previousState.drawings ?? []).map((drawing) =>
    drawing.kind === "chart" && drawing.chart.pivotTableId === table.id
      ? { ...drawing, chart: { ...drawing.chart, range: nextTable.outputRange } }
      : drawing,
  );
  if (
    command.chartId &&
    !drawings.some((drawing) => drawing.kind === "chart" && drawing.chart.pivotTableId === table.id)
  ) {
    if (drawings.some((drawing) => drawing.id === command.chartId))
      throw invalidCommandPayload("chartId", command.chartId);
    const chart: SheetChartDrawing = {
      id: command.chartId,
      kind: "chart",
      name: table.name,
      anchor: {
        row: range.start.row,
        column: Math.min(MAX_SHEET_COLUMNS - 1, range.end.column + 2),
      },
      offsetX: 8,
      offsetY: 8,
      width: 480,
      height: 300,
      text: "",
      shape: "rectangle",
      fill: "#ffffff",
      stroke: "#d1d5db",
      strokeWidth: 1,
      color: "#111827",
      fontSize: 14,
      bold: false,
      italic: false,
      rotation: 0,
      chart: {
        pivotTableId: table.id,
        type: "column",
        range: nextTable.outputRange,
        title: table.name,
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: true,
        labels: false,
        stacked: false,
        showHidden: true,
      },
    };
    drawings.push(chart);
  }
  return {
    previousState,
    result,
    state: {
      ...previousState,
      cells: [...cells.values()],
      pivotTables: existing
        ? normalizePivotTables(previousState.pivotTables).map((item) =>
            item.id === table.id ? nextTable : item,
          )
        : [...normalizePivotTables(previousState.pivotTables), nextTable],
      drawings,
    },
  };
}
export function analyzePivotTable(workbook: Workbook, table: SheetPivotTable) {
  return buildPivotResult(workbook, table);
}
export function applySetPivotTableCommand(
  workbook: Workbook,
  command: SetPivotTableCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const result = validateCommandPayload("pivot", command.table, () =>
    plan(workbook, sheet, command),
  );
  return replaceSheetSparseState(sheet, result.state)
    ? createRestoreSheetStateCommand(sheet.id, result.previousState)
    : null;
}
export function createPivotSheetCommand(
  workbook: Workbook,
  table: SheetPivotTable,
  options: { id: string; name?: string; chartId?: string },
): AddSheetCommand {
  const command = createAddSheetCommand(workbook, options);
  const sheet = deserializeSheet(command.sheet);
  const shadow: Workbook = {
    ...workbook,
    sheets: new Map([...workbook.sheets, [sheet.id, sheet]]),
  };
  applySetPivotTableCommand(
    shadow,
    createSetPivotTableCommand(sheet.id, table, { chartId: options.chartId }),
  );
  command.sheet = serializeSheet(sheet);
  return command;
}
export function createRemovePivotTableCommand(
  sheetId: string,
  tableId: string,
  clearOutput = false,
): RemovePivotTableCommand {
  return { type: "removePivotTable", sheetId, tableId, clearOutput };
}
export function applyRemovePivotTableCommand(
  workbook: Workbook,
  command: RemovePivotTableCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const table = sheet.pivotTables?.find((item) => item.id === command.tableId);
  if (!table) return null;
  if (typeof command.clearOutput !== "boolean")
    throw invalidCommandPayload("clearOutput", command.clearOutput);
  const before = createSheetSparseState(sheet);
  const temporary = createSheet(sheet.name, sheet.id);
  replaceSheetSparseState(temporary, before);
  temporary.pivotTables = normalizePivotTables(temporary.pivotTables).filter(
    (item) => item.id !== table.id,
  );
  if (command.clearOutput && table.outputRange)
    for (const [key, cell] of temporary.cells) {
      const [row, column] = key.split(":").map(Number);
      if (addressInRange({ row: row!, column: column! }, table.outputRange)) {
        const { content: _content, style: _style, namedStyle: _namedStyle, ...rest } = cell;
        if (rest.note || rest.hyperlink || rest.sparkline) temporary.cells.set(key, rest);
        else temporary.cells.delete(key);
      }
    }
  temporary.drawings = (temporary.drawings ?? []).map((drawing) => {
    if (drawing.kind !== "chart" || drawing.chart.pivotTableId !== table.id) return drawing;
    const { pivotTableId: _pivotId, ...chart } = drawing.chart;
    return { ...drawing, chart };
  });
  replaceSheetSparseState(sheet, createSheetSparseState(temporary));
  return createRestoreSheetStateCommand(sheet.id, before);
}

/** A single add-sheet command preserves one-step undo/redo for Show Details. */
export function createPivotDetailsSheetCommand(
  workbook: Workbook,
  sheetId: string,
  tableId: string,
  address: CellAddress,
  options?: Parameters<typeof createAddSheetCommand>[1],
): AddSheetCommand {
  const table = getSheetOrThrow(workbook, sheetId).pivotTables?.find((item) => item.id === tableId);
  if (!table) throw new RangeError("Missing pivot table.");
  const details = getPivotDetails(workbook, table, address);
  if (details.records.length + 1 > MAX_SHEET_ROWS || details.headers.length > MAX_SHEET_COLUMNS)
    throw new RangeError("Pivot details exceed sheet bounds.");
  const command = createAddSheetCommand(workbook, options);
  const sheet = deserializeSheet(command.sheet);
  details.headers.forEach((header, column) =>
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value: header }),
  );
  const formats = details.headers.map((_, field) => {
    const area = table.consolidation?.ranges[0];
    const sourceSheet = workbook.sheets.get(area?.sheetId ?? table.sourceSheetId);
    const range = area?.range ?? table.source;
    if (!sourceSheet || !range || (table.consolidation && field > 2)) return undefined;
    const address = table.consolidation
      ? {
          row: range.start.row + (field === 1 ? 0 : 1),
          column: range.start.column + (field === 0 ? 0 : 1),
        }
      : { row: range.start.row + 1, column: range.start.column + field };
    return getCellStyle(sourceSheet, address)?.numberFormat;
  });
  details.records.forEach((record, row) =>
    record.forEach((value, column) => {
      const address = { row: row + 1, column };
      setCellContent(sheet, address, literal(value));
      const numberFormat = formats[column];
      if (typeof value === "number" && numberFormat) setCellStyle(sheet, address, { numberFormat });
    }),
  );
  return { ...command, sheet: serializeSheet(sheet) };
}
