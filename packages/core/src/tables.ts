import { normalizeCellTextCaption } from "./text-font-runs.js";
import type { TableStyleDefinition } from "./table-styles.js";
import type { PivotTableStyleDefinition } from "./pivot-table-styles.js";
import type { StructuredFormulaReference } from "./formula/types.js";
import {
  createSheetSparseState,
  createWorkbookEvaluator,
  replaceSheetSparseState,
  getCellContent,
  getTableDataRows,
  getCellStyle,
  setCellContent,
  setCellStyle,
  type CellAddress,
  type CellRange,
  type SheetTable,
  type Workbook,
} from "./workbook.js";
import { cloneCellStyle, mergeCellStyle } from "./style.js";
import { convertStructuredReferencesToA1, renameTableReferences } from "./formula/references.js";
import { hasHighlightedFirstColumn, resolveTableCellStyle } from "./table-styles.js";
import type {
  ApplyTableStyleToRangeCommand,
  CreateTableCommand,
  RemoveTableCommand,
  ResizeTableCommand,
  RestoreFullSheetStateCommand,
  RestoreTableTransactionCommand,
  SetWorkbookTableStylesCommand,
  SetWorkbookPivotTableStylesCommand,
  UpdateTableCommand,
} from "./commands/contracts.js";
import { assertCellRange, getSheetOrThrow, normalizeRange } from "./commands/helpers.js";
import { applyCellShiftCommand } from "./commands/cell-shift.js";
import { parseA1FormulaReference } from "./formula/reference-model.js";
import { getFormulaAst } from "./formula/parser.js";
import { doMergedCellRangesIntersect } from "./merged-cells.js";
import { invalidCommandPayload } from "./commands/helpers.js";
import {
  assertCalculatedColumnChanges,
  createCalculatedColumnNewMemberChanges,
  translateCalculatedColumnFormula,
  createCalculatedColumnPlanningWorkbook,
} from "./table-calculated-columns.js";
import { mapTableCalculatedColumnFormulas } from "./table-calculated-column-references.js";

function cloneTable(table: SheetTable): SheetTable {
  return JSON.parse(JSON.stringify(table)) as SheetTable;
}

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function validateTableName(workbook: Workbook, base: string, id: string): string {
  const name = base.trim();
  if (
    !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) ||
    parseA1FormulaReference(name) ||
    /^R\d+C\d+$/i.test(name) ||
    /^(TRUE|FALSE)$/i.test(name) ||
    [...workbook.definedNames.values()].some(
      (definition) => definition.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw invalidCommandPayload(
      "name",
      base,
      "Table names must be valid identifiers and cannot look like cell addresses.",
    );
  for (const sheet of workbook.sheets.values())
    if (
      (sheet.tables ?? []).some(
        (table) => table.id !== id && table.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw invalidCommandPayload("name", base, "Table names must be unique in a workbook.");
  return name;
}

function columnNames(
  workbook: Workbook,
  sheet: ReturnType<typeof getSheetOrThrow>,
  range: CellRange,
  headerRow: boolean,
): SheetTable["columns"] {
  const used = new Set<string>();
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  return Array.from({ length: range.end.column - range.start.column + 1 }, (_, index) => {
    const column = range.start.column + index;
    const content = headerRow ? getCellContent(sheet, { row: range.start.row, column }) : null;
    const value =
      content?.kind === "literal"
        ? content.value
        : content?.kind === "formula"
          ? evaluator.getComputedValue({ row: range.start.row, column })
          : undefined;
    const header =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value).trim()
        : "";
    const base = header || `Column${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = `${base}${suffix++}`;
    used.add(name.toLowerCase());
    return { id: `column-${index + 1}`, name };
  });
}

function normalizeTable(workbook: Workbook, sheetId: string, source: SheetTable): SheetTable {
  const sheet = getSheetOrThrow(workbook, sheetId);
  const range = normalizeRange(source.range);
  assertCellRange(range);
  const minimumRows = 1 + Number(source.headerRow) + Number(source.totalRow);
  if (range.end.row - range.start.row + 1 < minimumRows)
    throw invalidCommandPayload(
      "range",
      source.range,
      "A table requires at least one data row in addition to its header and total rows.",
    );
  if (
    (sheet.tables ?? []).some((table) => table.id !== source.id && intersects(table.range, range))
  )
    throw invalidCommandPayload("tableOverlap", source.range, "Tables cannot overlap.");
  if (sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, range)))
    throw invalidCommandPayload(
      "tableOverlap",
      source.range,
      "Tables cannot intersect merged cells.",
    );
  const width = range.end.column - range.start.column + 1;
  const columns =
    source.columns.length === width
      ? source.columns
      : columnNames(workbook, sheet, range, source.headerRow);
  const names = new Set<string>();
  for (const column of columns) {
    if (!column.id || !column.name.trim() || names.has(column.name.toLowerCase()))
      throw invalidCommandPayload("name", column.name, "Table columns require unique names.");
    names.add(column.name.toLowerCase());
    if (
      column.calculatedColumnFormula !== undefined &&
      (typeof column.calculatedColumnFormula !== "string" ||
        !getFormulaAst(column.calculatedColumnFormula))
    )
      throw invalidCommandPayload("calculatedColumnFormula", column.calculatedColumnFormula);
  }
  return {
    ...cloneTable(source),
    name: validateTableName(workbook, source.name, source.id),
    range,
    columns: columns.map(({ calculatedColumnFormula, ...column }) => ({
      ...column,
      ...(calculatedColumnFormula === undefined ? {} : { calculatedColumnFormula }),
    })),
    style: clone(source.style),
    filter: source.filter ? clone(source.filter) : null,
  };
}

function intersects(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row <= right.end.row &&
    left.end.row >= right.start.row &&
    left.start.column <= right.end.column &&
    left.end.column >= right.start.column
  );
}

/** Resolves a structured reference to its inclusive A1 bounds. */
export function resolveTableReferenceBounds(
  workbook: Workbook,
  fromSheetId: string,
  reference: StructuredFormulaReference,
  formulaAddress?: { row: number; column: number },
): {
  sheetId: string;
  start: { row: number; column: number };
  end: { row: number; column: number };
} | null {
  let sheetId = fromSheetId;
  let table: SheetTable | undefined;
  if (reference.tableName) {
    for (const sheet of workbook.sheets.values()) {
      const found = (sheet.tables ?? []).find(
        (item) => item.name.toLowerCase() === reference.tableName!.toLowerCase(),
      );
      if (found) {
        table = found;
        sheetId = sheet.id;
        break;
      }
    }
  } else if (formulaAddress)
    table = (workbook.sheets.get(fromSheetId)?.tables ?? []).find(
      (item) =>
        formulaAddress.row >= item.range.start.row &&
        formulaAddress.row <= item.range.end.row &&
        formulaAddress.column >= item.range.start.column &&
        formulaAddress.column <= item.range.end.column,
    );
  if (!table) return null;
  const start = { ...table.range.start };
  const end = { ...table.range.end };
  if (reference.scope === "data" || reference.scope === "this-row") {
    start.row += table.headerRow ? 1 : 0;
    end.row -= table.totalRow ? 1 : 0;
  } else if (reference.scope === "headers") {
    if (!table.headerRow) return null;
    end.row = start.row;
  } else if (reference.scope === "totals") {
    if (!table.totalRow) return null;
    start.row = end.row;
  }
  if (reference.scope === "this-row") {
    if (!formulaAddress || formulaAddress.row < start.row || formulaAddress.row > end.row)
      return null;
    start.row = formulaAddress.row;
    end.row = formulaAddress.row;
  }
  if (reference.columns.length) {
    const indexes = reference.columns.map((column) =>
      table!.columns.findIndex((entry) => entry.name.toLowerCase() === column.name.toLowerCase()),
    );
    if (indexes.some((index) => index < 0)) return null;
    start.column = table.range.start.column + Math.min(...indexes);
    end.column = table.range.start.column + Math.max(...indexes);
  }
  return start.row <= end.row ? { sheetId, start, end } : null;
}

function restore(
  sheetId: string,
  state: ReturnType<typeof createSheetSparseState>,
): RestoreFullSheetStateCommand {
  return { type: "restoreSheetState", sheetId, state };
}

export function createRestoreTableTransactionCommand(
  workbook: Workbook,
): RestoreTableTransactionCommand {
  return {
    type: "restoreTableTransaction",
    states: [...workbook.sheets.values()].map((sheet) => ({
      sheetId: sheet.id,
      state: createSheetSparseState(sheet),
    })),
    tableStyles: clone(workbook.tableStyles ?? []),
    ...(workbook.defaultTableStyleId ? { defaultTableStyleId: workbook.defaultTableStyleId } : {}),
    pivotTableStyles: clone(workbook.pivotTableStyles ?? []),
    ...(workbook.defaultPivotTableStyleId
      ? { defaultPivotTableStyleId: workbook.defaultPivotTableStyleId }
      : {}),
    definedNames: clone([...workbook.definedNames.values()]),
  };
}

export function applyRestoreTableTransactionCommand(
  workbook: Workbook,
  command: RestoreTableTransactionCommand,
): RestoreTableTransactionCommand | null {
  const inverse = createRestoreTableTransactionCommand(workbook);
  let changed = false;
  for (const entry of command.states)
    changed =
      replaceSheetSparseState(getSheetOrThrow(workbook, entry.sheetId), entry.state) || changed;
  if (JSON.stringify(workbook.tableStyles ?? []) !== JSON.stringify(command.tableStyles)) {
    workbook.tableStyles = clone(command.tableStyles);
    changed = true;
  }
  if (workbook.defaultTableStyleId !== command.defaultTableStyleId) {
    workbook.defaultTableStyleId = command.defaultTableStyleId;
    changed = true;
  }
  if (
    JSON.stringify(workbook.pivotTableStyles ?? []) !==
    JSON.stringify(command.pivotTableStyles ?? [])
  ) {
    workbook.pivotTableStyles = clone(command.pivotTableStyles ?? []);
    changed = true;
  }
  if (workbook.defaultPivotTableStyleId !== command.defaultPivotTableStyleId) {
    workbook.defaultPivotTableStyleId = command.defaultPivotTableStyleId;
    changed = true;
  }
  if (
    command.definedNames !== undefined &&
    JSON.stringify([...workbook.definedNames.values()]) !== JSON.stringify(command.definedNames)
  ) {
    workbook.definedNames = new Map(clone(command.definedNames).map((name) => [name.id, name]));
    changed = true;
  }
  return changed ? inverse : null;
}

function rewriteTableName(workbook: Workbook, previousName: string, nextName: string): void {
  if (previousName === nextName) return;
  for (const sheet of workbook.sheets.values())
    for (const [key, cell] of sheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const source = renameTableReferences(cell.content.formula.source, previousName, nextName);
      if (source === cell.content.formula.source) continue;
      const separator = key.indexOf(":");
      setCellContent(
        sheet,
        { row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) },
        { kind: "formula", formula: { source } },
      );
    }
  mapTableCalculatedColumnFormulas(workbook, (source) =>
    renameTableReferences(source, previousName, nextName),
  );
}

export function createApplyTableStyleToRangeCommand(
  sheetId: string,
  range: CellRange,
  style: TableStyleDefinition,
  headerRows = 1,
): ApplyTableStyleToRangeCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  if (
    !Number.isSafeInteger(headerRows) ||
    headerRows < 0 ||
    headerRows > normalized.end.row - normalized.start.row + 1
  )
    throw invalidCommandPayload("headerRows", headerRows);
  return {
    type: "applyTableStyleToRange",
    sheetId,
    range: normalized,
    style: clone(style),
    headerRows,
  };
}
export function applyApplyTableStyleToRangeCommand(
  workbook: Workbook,
  command: ApplyTableStyleToRangeCommand,
): import("./commands/contracts.js").RestoreCellStylesCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const table: SheetTable = {
    id: "style-preview",
    name: "StylePreview",
    range: normalizeRange(command.range),
    columns: Array.from(
      { length: command.range.end.column - command.range.start.column + 1 },
      (_, index) => ({ id: `column-${index}`, name: `Column${index}` }),
    ),
    style: clone(command.style),
    headerRow: command.headerRows > 0,
    totalRow: false,
    firstColumn: hasHighlightedFirstColumn(command.style),
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: false,
    filter: null,
  };
  const changes: Array<{ address: CellAddress; style: import("./style.js").CellStyle | null }> = [];
  for (let row = table.range.start.row; row <= table.range.end.row; row += 1)
    for (let column = table.range.start.column; column <= table.range.end.column; column += 1) {
      const address = { row, column };
      const previous = cloneCellStyle(getCellStyle(sheet, address));
      const next = mergeCellStyle(
        previous,
        resolveTableCellStyle(table, address, command.headerRows) ?? {},
      );
      if (setCellStyle(sheet, address, next)) changes.push({ address, style: previous ?? null });
    }
  return changes.length ? { type: "restoreCellStyles", sheetId: sheet.id, changes } : null;
}

export function createCreateTableCommand(
  sheetId: string,
  table: SheetTable,
  options?: { hasHeaders?: boolean },
): CreateTableCommand {
  return {
    type: "createTable",
    sheetId,
    table: cloneTable(table),
    ...(options?.hasHeaders === false ? { hasHeaders: false } : {}),
  };
}

export function createUpdateTableCommand(
  sheetId: string,
  tableId: string,
  changes: UpdateTableCommand["changes"],
): UpdateTableCommand {
  return { type: "updateTable", sheetId, tableId, changes: clone(changes) };
}

export function createResizeTableCommand(
  sheetId: string,
  tableId: string,
  range: CellRange,
): ResizeTableCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  return { type: "resizeTable", sheetId, tableId, range: normalized };
}

export function createRemoveTableCommand(sheetId: string, tableId: string): RemoveTableCommand {
  return { type: "removeTable", sheetId, tableId };
}

export function createSetWorkbookTableStylesCommand(
  styles: TableStyleDefinition[],
  defaultTableStyleId?: string,
): SetWorkbookTableStylesCommand {
  return {
    type: "setWorkbookTableStyles",
    styles: clone(styles),
    ...(defaultTableStyleId ? { defaultTableStyleId } : {}),
  };
}

function applyTotals(
  workbook: Workbook,
  sheet: ReturnType<typeof getSheetOrThrow>,
  table: SheetTable,
  enabled: boolean,
): SheetTable {
  if (enabled === table.totalRow) return table;
  if (!enabled) {
    for (let column = table.range.start.column; column <= table.range.end.column; column += 1)
      setCellContent(sheet, { row: table.range.end.row, column }, null);
    return {
      ...table,
      totalRow: false,
      range: {
        start: { ...table.range.start },
        end: { ...table.range.end, row: table.range.end.row - 1 },
      },
    };
  }
  const totalRow = table.range.end.row + 1;
  applyCellShiftCommand(workbook, {
    type: "insertCells",
    sheetId: sheet.id,
    range: {
      start: { row: totalRow, column: table.range.start.column },
      end: { row: totalRow, column: table.range.end.column },
    },
    direction: "down",
  });
  table = {
    ...table,
    columns: sheet.tables?.find((entry) => entry.id === table.id)?.columns ?? table.columns,
  };
  for (let column = table.range.start.column; column <= table.range.end.column; column += 1) {
    const label = columnLabel(column);
    const dataStart = table.range.start.row + (table.headerRow ? 2 : 1);
    const dataEnd = table.range.end.row + 1;
    setCellContent(
      sheet,
      { row: totalRow, column },
      {
        kind: "formula",
        formula: { source: `=SUBTOTAL(109,${label}${dataStart}:${label}${dataEnd})` },
      },
    );
  }
  return {
    ...table,
    totalRow: true,
    range: { start: { ...table.range.start }, end: { ...table.range.end, row: totalRow } },
  };
}

function columnLabel(column: number): string {
  let value = column + 1;
  let result = "";
  while (value) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function applyCreateTableCommand(
  workbook: Workbook,
  command: CreateTableCommand,
): RestoreFullSheetStateCommand | RestoreTableTransactionCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previous =
    command.hasHeaders === false
      ? createRestoreTableTransactionCommand(workbook)
      : createSheetSparseState(sheet);
  const source =
    command.hasHeaders === false
      ? {
          ...command.table,
          headerRow: true,
          range: {
            start: { ...command.table.range.start },
            end: { ...command.table.range.end, row: command.table.range.end.row + 1 },
          },
          columns: Array.from(
            { length: command.table.range.end.column - command.table.range.start.column + 1 },
            (_, index) => ({ id: `column-${index + 1}`, name: `Column${index + 1}` }),
          ),
        }
      : command.table;
  const table = normalizeTable(workbook, command.sheetId, source);
  if ((sheet.tables ?? []).some((item) => item.id === table.id))
    throw new Error("Table IDs must be unique.");
  if (command.hasHeaders === false) {
    applyCellShiftCommand(workbook, {
      type: "insertCells",
      sheetId: sheet.id,
      range: {
        start: { ...command.table.range.start },
        end: { ...command.table.range.start, column: command.table.range.end.column },
      },
      direction: "down",
    });
  }
  sheet.tables = [...(sheet.tables ?? []), table];
  if (table.headerRow)
    for (const [index, column] of table.columns.entries()) {
      const address = { row: table.range.start.row, column: table.range.start.column + index };
      const source = getCellContent(sheet, address);
      const document =
        source?.kind === "literal" && typeof source.value === "string"
          ? normalizeCellTextCaption({ text: source.value, fontRuns: source.fontRuns }, column.name)
          : { text: column.name };
      setCellContent(sheet, address, {
        kind: "literal",
        value: document.text,
        ...(document.fontRuns ? { fontRuns: document.fontRuns } : {}),
      });
    }
  if (command.hasHeaders === false) return previous as RestoreTableTransactionCommand;
  return restore(command.sheetId, previous as ReturnType<typeof createSheetSparseState>);
}

function applyHeaderRow(
  workbook: Workbook,
  sheet: ReturnType<typeof getSheetOrThrow>,
  table: SheetTable,
  enabled: boolean,
): SheetTable {
  if (enabled === table.headerRow) return table;
  const range = {
    start: { ...table.range.start },
    end: { ...table.range.start, column: table.range.end.column },
  };
  if (enabled)
    applyCellShiftCommand(
      workbook,
      {
        type: "insertCells",
        sheetId: sheet.id,
        range,
        direction: "down",
      },
      { tableHeaderAdjustmentId: table.id },
    );
  else
    applyCellShiftCommand(
      workbook,
      {
        type: "deleteCells",
        sheetId: sheet.id,
        range,
        direction: "up",
      },
      { tableHeaderAdjustmentId: table.id },
    );
  table = {
    ...table,
    columns: sheet.tables?.find((entry) => entry.id === table.id)?.columns ?? table.columns,
  };
  if (enabled) {
    for (const [index, column] of table.columns.entries())
      setCellContent(
        sheet,
        { row: table.range.start.row, column: table.range.start.column + index },
        { kind: "literal", value: column.name },
      );
    return {
      ...table,
      headerRow: true,
      range: {
        start: { ...table.range.start },
        end: { ...table.range.end, row: table.range.end.row + 1 },
      },
    };
  }
  return {
    ...table,
    headerRow: false,
    range: {
      start: { ...table.range.start },
      end: { ...table.range.end, row: table.range.end.row - 1 },
    },
  };
}

export function applyUpdateTableCommand(
  workbook: Workbook,
  command: UpdateTableCommand,
  options: { calculatedColumnPlan?: boolean } = {},
): RestoreTableTransactionCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const current = (sheet.tables ?? []).find((table) => table.id === command.tableId);
  if (!current) throw new Error("Table does not exist.");
  const headerRowChange =
    command.changes.headerRow === undefined || command.changes.headerRow === current.headerRow
      ? undefined
      : command.changes.headerRow;
  const requestedRange =
    command.changes.range === undefined ? undefined : normalizeRange(command.changes.range);
  const rangeChanged =
    requestedRange !== undefined &&
    (requestedRange.start.row !== current.range.start.row ||
      requestedRange.start.column !== current.range.start.column ||
      requestedRange.end.row !== current.range.end.row ||
      requestedRange.end.column !== current.range.end.column);
  if (headerRowChange !== undefined && rangeChanged)
    throw invalidCommandPayload(
      "range",
      command.changes.range,
      "Changing a table header row cannot be combined with resizing the table.",
    );
  if (
    headerRowChange === false &&
    current.filter?.advanced?.hiddenRows.some(
      (interval) =>
        interval.start <= current.range.start.row + 1 &&
        interval.end >= current.range.start.row + 1,
    )
  )
    throw invalidCommandPayload(
      "headerRow",
      false,
      "Hiding table headers cannot preserve an advanced filter that hides the first data row.",
    );
  const targetRange =
    headerRowChange === undefined
      ? (command.changes.range ?? current.range)
      : {
          start: { ...current.range.start },
          end: {
            ...current.range.end,
            row: current.range.end.row + (headerRowChange ? 1 : -1),
          },
        };
  // Validate all user-controlled fields before header or total-row operations shift cells.
  const planned = normalizeTable(workbook, command.sheetId, {
    ...current,
    ...command.changes,
    range: targetRange,
    columns: current.columns,
    filter: current.filter,
  });
  // Header and total-row changes insert or remove a row. Validate their final
  // bounds before shifting cells so an overlap rejection is atomic.
  const rangeBeforeToggles = headerRowChange === undefined ? planned.range : current.range;
  const postToggleRange = {
    start: { ...rangeBeforeToggles.start },
    end: { ...rangeBeforeToggles.end },
  };
  if (headerRowChange !== undefined) postToggleRange.end.row += headerRowChange ? 1 : -1;
  if (command.changes.totalRow !== undefined && command.changes.totalRow !== current.totalRow)
    postToggleRange.end.row += command.changes.totalRow ? 1 : -1;
  normalizeTable(workbook, command.sheetId, {
    ...planned,
    range: postToggleRange,
    headerRow: command.changes.headerRow ?? current.headerRow,
    totalRow: command.changes.totalRow ?? current.totalRow,
    columns: current.columns,
    filter: current.filter,
  });
  if (
    !options.calculatedColumnPlan &&
    (rangeChanged ||
      headerRowChange !== undefined ||
      (command.changes.totalRow !== undefined && command.changes.totalRow !== current.totalRow)) &&
    [...workbook.sheets.values()].some((entry) =>
      entry.tables?.some((table) =>
        table.columns.some((column) => column.calculatedColumnFormula !== undefined),
      ),
    )
  ) {
    const shadow = createCalculatedColumnPlanningWorkbook(workbook);
    if (rangeChanged) {
      applyResizeTableCommand(shadow, {
        type: "resizeTable",
        sheetId: sheet.id,
        tableId: current.id,
        range: planned.range,
      });
      const { range: _range, ...changes } = command.changes;
      applyUpdateTableCommand(shadow, { ...command, changes }, { calculatedColumnPlan: true });
    } else {
      applyUpdateTableCommand(shadow, command, { calculatedColumnPlan: true });
    }
    return applyRestoreTableTransactionCommand(
      workbook,
      createRestoreTableTransactionCommand(shadow),
    );
  }
  const previous = createRestoreTableTransactionCommand(workbook);
  if (rangeChanged) resizeTableTotals(workbook, sheet, current, planned.range);
  let next =
    headerRowChange === undefined
      ? { ...planned, totalRow: current.totalRow }
      : {
          ...planned,
          range: { start: { ...current.range.start }, end: { ...current.range.end } },
          headerRow: current.headerRow,
          totalRow: current.totalRow,
        };
  if (headerRowChange !== undefined) next = applyHeaderRow(workbook, sheet, next, headerRowChange);
  // A second nested shift must see the first shift's new member geometry.
  if (headerRowChange !== undefined)
    sheet.tables = (sheet.tables ?? []).map((table) =>
      table.id === next.id ? { ...next, name: current.name } : table,
    );
  if (command.changes.totalRow !== undefined)
    next = applyTotals(workbook, sheet, next, command.changes.totalRow);
  if (
    rangeChanged ||
    headerRowChange !== undefined ||
    (command.changes.totalRow !== undefined && command.changes.totalRow !== current.totalRow)
  )
    next = {
      ...next,
      filter: resizeTableFilter(
        current.filter,
        next.range,
        next.totalRow,
        headerRowChange === undefined ? 0 : headerRowChange ? 1 : -1,
      ),
    };
  next = normalizeTable(workbook, command.sheetId, next);
  sheet.tables = (sheet.tables ?? []).map((table) => (table.id === next.id ? next : table));
  rewriteTableName(workbook, current.name, next.name);
  return previous;
}

function resizeTableFilter(
  filter: SheetTable["filter"],
  range: CellRange,
  totalRow: boolean,
  rowOffset = 0,
): SheetTable["filter"] {
  if (!filter) return null;
  const result = clone(filter);
  const endRow = range.end.row - (totalRow ? 1 : 0);
  // The filter model requires a header and a data row, even for headerless tables.
  if (endRow <= range.start.row) return null;
  result.range = { start: { ...range.start }, end: { ...range.end, row: endRow } };
  result.columns = result.columns.filter(
    (column) => column.column >= range.start.column && column.column <= range.end.column,
  );
  if (result.advanced)
    result.advanced.hiddenRows = result.advanced.hiddenRows.flatMap((interval) => {
      const start = Math.max(interval.start + rowOffset, range.start.row + 1);
      const end = Math.min(interval.end + rowOffset, endRow);
      return start <= end ? [{ start, end }] : [];
    });
  return result;
}

function resizeTableTotals(
  workbook: Workbook,
  sheet: ReturnType<typeof getSheetOrThrow>,
  current: SheetTable,
  range: CellRange,
): void {
  if (!current.totalRow) return;
  if (range.end.row > current.range.end.row) {
    const count = range.end.row - current.range.end.row;
    applyCellShiftCommand(workbook, {
      type: "insertCells",
      sheetId: sheet.id,
      range: {
        start: { row: current.range.end.row, column: current.range.start.column },
        end: { row: current.range.end.row + count - 1, column: current.range.end.column },
      },
      direction: "down",
    });
  }
  // Expansion moves the old totals down; shrinking leaves them in their old row.
  // Clear their entire old width, including columns excluded by the new range.
  const previousTotalRow = Math.max(current.range.end.row, range.end.row);
  for (let column = current.range.start.column; column <= current.range.end.column; column += 1)
    setCellContent(sheet, { row: previousTotalRow, column }, null);
  for (let column = range.start.column; column <= range.end.column; column += 1) {
    const dataStart = range.start.row + (current.headerRow ? 2 : 1);
    const dataEnd = range.end.row;
    const label = columnLabel(column);
    setCellContent(
      sheet,
      { row: range.end.row, column },
      {
        kind: "formula",
        formula: { source: `=SUBTOTAL(109,${label}${dataStart}:${label}${dataEnd})` },
      },
    );
  }
}

export function applyResizeTableCommand(
  workbook: Workbook,
  command: ResizeTableCommand,
): RestoreTableTransactionCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const current = (sheet.tables ?? []).find((table) => table.id === command.tableId);
  if (!current) throw new Error("Table does not exist.");
  const range = normalizeRange(command.range);
  // Validate the target range before a total-row expansion shifts any cells.
  // A rejected overlap must leave the workbook untouched.
  const generatedColumns = columnNames(workbook, sheet, range, current.headerRow);
  const oldAnchorRow = getTableDataRows(current).start;
  const nextAnchorRow = range.start.row + Number(current.headerRow);
  const usedIds = new Set(current.columns.map((column) => column.id));
  const usedNames = new Set(
    current.columns
      .filter((_, index) => {
        const physical = current.range.start.column + index;
        return physical >= range.start.column && physical <= range.end.column;
      })
      .map((column) => column.name.toLowerCase()),
  );
  const columns = generatedColumns.map((column, index) => {
    const physical = range.start.column + index;
    const previous =
      physical >= current.range.start.column && physical <= current.range.end.column
        ? current.columns[physical - current.range.start.column]
        : undefined;
    if (previous)
      return {
        ...previous,
        ...(previous.calculatedColumnFormula !== undefined
          ? {
              calculatedColumnFormula: translateCalculatedColumnFormula(
                previous.calculatedColumnFormula,
                { row: oldAnchorRow, column: physical },
                { row: nextAnchorRow, column: physical },
              ),
            }
          : {}),
      };
    let id = `${current.id}-column-${physical}`;
    let suffix = 2;
    while (usedIds.has(id)) id = `${current.id}-column-${physical}-${suffix++}`;
    usedIds.add(id);
    const base = column.name;
    let name = base;
    suffix = 2;
    while (usedNames.has(name.toLowerCase())) name = `${base}${suffix++}`;
    usedNames.add(name.toLowerCase());
    return { id, name };
  });
  const next = normalizeTable(workbook, command.sheetId, {
    ...current,
    range,
    columns,
    filter: resizeTableFilter(current.filter, range, current.totalRow),
  });
  let inherited: import("./commands/contracts.js").CellContentChange[] = [];
  if (next.columns.some((column) => column.calculatedColumnFormula !== undefined)) {
    // Simulate the existing totals-row shifts before validating any generated cell.
    const shadow = createCalculatedColumnPlanningWorkbook(workbook);
    const shadowSheet = shadow.sheets.get(sheet.id)!;
    resizeTableTotals(shadow, shadowSheet, current, range);
    const shifted = shadowSheet.tables!.find((table) => table.id === current.id)!;
    next.columns = next.columns.map((column, index) => {
      const previous = shifted.columns.find((entry) => entry.id === column.id);
      if (previous?.calculatedColumnFormula === undefined) return column;
      const physical = next.range.start.column + index;
      return {
        ...column,
        calculatedColumnFormula: translateCalculatedColumnFormula(
          previous.calculatedColumnFormula,
          { row: oldAnchorRow, column: physical },
          { row: nextAnchorRow, column: physical },
        ),
      };
    });
    shadowSheet.tables = shadowSheet.tables!.map((table) => (table.id === next.id ? next : table));
    inherited = createCalculatedColumnNewMemberChanges(shadow, sheet.id, current, next);
    assertCalculatedColumnChanges(shadow, { type: "setCellContents", changes: inherited });
  }
  const previous = createRestoreTableTransactionCommand(workbook);
  resizeTableTotals(workbook, sheet, current, range);
  sheet.tables = (sheet.tables ?? []).map((table) => (table.id === next.id ? next : table));
  for (const change of inherited) setCellContent(sheet, change.address, change.content);
  return previous;
}

export function applyRemoveTableCommand(
  workbook: Workbook,
  command: RemoveTableCommand,
): RestoreTableTransactionCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const table = (sheet.tables ?? []).find((item) => item.id === command.tableId);
  if (!table) return null;
  const previous = createRestoreTableTransactionCommand(workbook);
  for (let row = table.range.start.row; row <= table.range.end.row; row += 1)
    for (let column = table.range.start.column; column <= table.range.end.column; column += 1) {
      const address = { row, column };
      setCellStyle(
        sheet,
        address,
        mergeCellStyle(resolveTableCellStyle(table, address), getCellStyle(sheet, address) ?? {}),
      );
    }
  for (const formulaSheet of workbook.sheets.values()) {
    for (const [key, cell] of formulaSheet.cells) {
      if (cell.content?.kind !== "formula") continue;
      const separator = key.indexOf(":");
      const address = {
        row: Number(key.slice(0, separator)),
        column: Number(key.slice(separator + 1)),
      };
      const source = convertStructuredReferencesToA1(
        cell.content.formula.source,
        (reference, formulaAddress) => {
          const bounds = resolveTableReferenceBounds(
            workbook,
            formulaSheet.id,
            reference,
            formulaAddress,
          );
          return bounds
            ? {
                start: bounds.start,
                end: bounds.end,
                ...(bounds.sheetId === formulaSheet.id
                  ? {}
                  : { sheetName: workbook.sheets.get(bounds.sheetId)?.name }),
              }
            : null;
        },
        address,
        {
          shouldConvert: (reference, formulaAddress) =>
            reference.tableName
              ? reference.tableName.toLowerCase() === table.name.toLowerCase()
              : formulaSheet.id === sheet.id &&
                formulaAddress !== undefined &&
                formulaAddress.row >= table.range.start.row &&
                formulaAddress.row <= table.range.end.row &&
                formulaAddress.column >= table.range.start.column &&
                formulaAddress.column <= table.range.end.column,
        },
      );
      if (source !== cell.content.formula.source)
        setCellContent(formulaSheet, address, { kind: "formula", formula: { source } });
    }
  }
  mapTableCalculatedColumnFormulas(workbook, (source, sourceSheet, sourceTable, index) => {
    if (sourceTable.id === table.id) return source;
    const address = {
      row: getTableDataRows(sourceTable).start,
      column: sourceTable.range.start.column + index,
    };
    return convertStructuredReferencesToA1(
      source,
      (reference, formulaAddress) => {
        const bounds = resolveTableReferenceBounds(
          workbook,
          sourceSheet.id,
          reference,
          formulaAddress,
        );
        return bounds
          ? {
              start: bounds.start,
              end: bounds.end,
              absolute: reference.scope !== "this-row",
              ...(bounds.sheetId === sourceSheet.id
                ? {}
                : { sheetName: workbook.sheets.get(bounds.sheetId)?.name }),
            }
          : null;
      },
      address,
      {
        shouldConvert: (reference) =>
          reference.tableName?.toLowerCase() === table.name.toLowerCase(),
      },
    );
  });
  sheet.tables = (sheet.tables ?? []).filter((table) => table.id !== command.tableId);
  return previous;
}

export function applySetWorkbookTableStylesCommand(
  workbook: Workbook,
  command: SetWorkbookTableStylesCommand,
): RestoreTableTransactionCommand | null {
  const styles = clone(command.styles);
  if (new Set(styles.map((style) => style.id)).size !== styles.length)
    throw new Error("Table style IDs must be unique.");
  if (new Set(styles.map((style) => style.name.toLowerCase())).size !== styles.length)
    throw new Error("Table style names must be unique.");
  const previous = createRestoreTableTransactionCommand(workbook);
  if (
    JSON.stringify(workbook.tableStyles ?? []) === JSON.stringify(styles) &&
    workbook.defaultTableStyleId === command.defaultTableStyleId
  )
    return null;
  workbook.tableStyles = styles;
  workbook.defaultTableStyleId = command.defaultTableStyleId;
  const byId = new Map(styles.map((style) => [style.id, style]));
  for (const sheet of workbook.sheets.values())
    sheet.tables = (sheet.tables ?? []).map((table) => {
      const style = byId.get(table.style.id);
      return style ? { ...table, style: clone(style) } : table;
    });
  return previous;
}

export function createSetWorkbookPivotTableStylesCommand(
  styles: PivotTableStyleDefinition[],
  defaultPivotTableStyleId?: string,
): SetWorkbookPivotTableStylesCommand {
  return {
    type: "setWorkbookPivotTableStyles",
    styles: clone(styles),
    ...(defaultPivotTableStyleId ? { defaultPivotTableStyleId } : {}),
  };
}
export function applySetWorkbookPivotTableStylesCommand(
  workbook: Workbook,
  command: SetWorkbookPivotTableStylesCommand,
): SetWorkbookPivotTableStylesCommand | null {
  const styles = clone(command.styles);
  if (new Set(styles.map((style) => style.id)).size !== styles.length)
    throw new Error("Pivot table style IDs must be unique.");
  if (new Set(styles.map((style) => style.name.toLowerCase())).size !== styles.length)
    throw new Error("Pivot table style names must be unique.");
  if (
    JSON.stringify(workbook.pivotTableStyles ?? []) === JSON.stringify(styles) &&
    workbook.defaultPivotTableStyleId === command.defaultPivotTableStyleId
  )
    return null;
  const inverse = createSetWorkbookPivotTableStylesCommand(
    workbook.pivotTableStyles ?? [],
    workbook.defaultPivotTableStyleId,
  );
  workbook.pivotTableStyles = styles;
  workbook.defaultPivotTableStyleId = command.defaultPivotTableStyleId;
  return inverse;
}
