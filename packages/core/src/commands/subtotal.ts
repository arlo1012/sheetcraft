import {
  MAX_SHEET_COLUMNS,
  createSheetSparseState,
  createCellKey,
  createWorkbookEvaluator,
  replaceSheetSparseState,
  setCellContent,
  type CellRange,
  type DefinedName,
  type Workbook,
} from "../workbook.js";
import { applySheetAxisCommand } from "./structure.js";
import type {
  ApplySubtotalsCommand,
  RemoveSubtotalsCommand,
  RestoreFullSheetStateCommand,
} from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  parseCellKey,
} from "./helpers.js";

type SubtotalMetadata = {
  id: string;
  range: CellRange;
  generatedRows: number[];
  generatedColumns?: number[];
  summaryBelow?: boolean;
  pageBreakRows?: number[];
};
type SheetWithSubtotals = ReturnType<typeof getSheetOrThrow> & {
  subtotalMetadata?: SubtotalMetadata[];
  outlineGroups?: Array<{
    id: string;
    axis: "row" | "column";
    start: number;
    end: number;
    collapsed: boolean;
  }>;
};

function columnName(column: number): string {
  let result = "";
  for (let value = column + 1; value > 0; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function functionCode(operation: ApplySubtotalsCommand["operation"]): number {
  switch (operation) {
    case "average":
      return 1;
    case "count":
      return 2;
    case "max":
      return 4;
    case "min":
      return 5;
    case "product":
      return 6;
    case "sum":
      return 9;
  }
}

function keyForRow(workbook: Workbook, command: ApplySubtotalsCommand, row: number): string {
  const evaluator = createWorkbookEvaluator(workbook, command.sheetId);
  return JSON.stringify(
    command.groupByColumns.map((column) => evaluator.getComputedValue({ row, column })),
  );
}

type SubtotalLabelPlacement = { source: number; target: number };

function prepareSubtotalLabelColumn(
  workbook: Workbook,
  sheet: SheetWithSubtotals,
  command: ApplySubtotalsCommand,
  range: CellRange,
): {
  command: ApplySubtotalsCommand;
  range: CellRange;
  placement: SubtotalLabelPlacement | null;
  generatedColumns: number[];
} {
  if (!command.labels) return { command, range, placement: null, generatedColumns: [] };
  const source = command.groupByColumns.find((column) => !command.summaryColumns.includes(column));
  if (source !== undefined)
    return { command, range, placement: { source, target: source }, generatedColumns: [] };
  const column = command.groupByColumns[0]!;
  if (
    range.end.column >= MAX_SHEET_COLUMNS - 1 ||
    [...sheet.cells.keys()].some((key) => parseCellKey(key).column === MAX_SHEET_COLUMNS - 1)
  )
    throw invalidCommandPayload(
      "summaryColumns",
      command.summaryColumns,
      "There is no room to insert a subtotal label column.",
    );
  applySheetAxisCommand(workbook, {
    type: "insertSheetAxis",
    sheetId: sheet.id,
    axis: "column",
    index: column,
    count: 1,
  });
  const shift = (value: number) => (value >= column ? value + 1 : value);
  return {
    command: {
      ...command,
      groupByColumns: command.groupByColumns.map(shift),
      summaryColumns: command.summaryColumns.map(shift),
    },
    range: { start: { ...range.start }, end: { ...range.end, column: range.end.column + 1 } },
    placement: { source: column + 1, target: column },
    generatedColumns: [column],
  };
}

function removeEmptyGeneratedColumns(
  workbook: Workbook,
  sheet: SheetWithSubtotals,
  entries: readonly SubtotalMetadata[],
  protectedColumns: readonly number[] = [],
): number[] {
  const removed: number[] = [];
  const columns = [...new Set(entries.flatMap((entry) => entry.generatedColumns ?? []))].sort(
    (a, b) => b - a,
  );
  for (const column of columns) {
    // Generated rows have already been removed. Retain a column if it now contains user edits.
    if (
      protectedColumns.includes(column) ||
      [...sheet.cells.keys()].some((key) => parseCellKey(key).column === column)
    )
      continue;
    applySheetAxisCommand(workbook, {
      type: "deleteSheetAxis",
      sheetId: sheet.id,
      axis: "column",
      index: column,
      count: 1,
    });
    removed.push(column);
  }
  return removed;
}

function rollbackWorkbookChanges(
  workbook: Workbook,
  sheet: SheetWithSubtotals,
  state: ReturnType<typeof createSheetSparseState>,
  formulas: Array<{ sheetId: string; address: { row: number; column: number }; source: string }>,
  names: DefinedName[],
): void {
  replaceSheetSparseState(sheet, state);
  for (const formula of formulas) {
    const target = workbook.sheets.get(formula.sheetId);
    const cell = target?.cells.get(createCellKey(formula.address));
    if (target && cell?.content?.kind === "formula")
      target.cells.set(createCellKey(formula.address), {
        ...cell,
        content: { kind: "formula", formula: { source: formula.source } },
      });
  }
  workbook.definedNames.clear();
  for (const definition of names)
    workbook.definedNames.set(definition.id, {
      ...definition,
      reference: {
        sheetId: definition.reference.sheetId,
        start: { ...definition.reference.start },
        end: { ...definition.reference.end },
      },
    });
}

export function createApplySubtotalsCommand(
  sheetId: string,
  range: CellRange,
  groupByColumns: readonly number[],
  summaryColumns: readonly number[],
  operation: ApplySubtotalsCommand["operation"],
  options?: {
    hasHeader?: boolean;
    subtotalId?: string;
    labels?: { subtotal: string; grandTotal: string };
    replaceExisting?: boolean;
    pageBreaks?: boolean;
    summaryBelow?: boolean;
  },
): ApplySubtotalsCommand {
  return {
    type: "applySubtotals",
    sheetId,
    range: { start: { ...range.start }, end: { ...range.end } },
    groupByColumns: [...groupByColumns],
    summaryColumns: [...summaryColumns],
    operation,
    ...(options?.hasHeader ? { hasHeader: true } : {}),
    ...(options?.subtotalId ? { subtotalId: options.subtotalId } : {}),
    ...(options?.labels ? { labels: { ...options.labels } } : {}),
    ...(options?.replaceExisting ? { replaceExisting: true } : {}),
    ...(options?.pageBreaks ? { pageBreaks: true } : {}),
    ...(options?.summaryBelow === false ? { summaryBelow: false } : {}),
  };
}

export function applyApplySubtotalsCommand(
  workbook: Workbook,
  command: ApplySubtotalsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId) as SheetWithSubtotals;
  let range = normalizeRange(command.range);
  assertCellRange(range);
  if (!command.groupByColumns.length || !command.summaryColumns.length)
    throw invalidCommandPayload("groupByColumns", command.groupByColumns);
  const columns = [...command.groupByColumns, ...command.summaryColumns];
  if (
    columns.some(
      (column) =>
        !Number.isInteger(column) || column < range.start.column || column > range.end.column,
    )
  )
    throw invalidCommandPayload("columns", columns);
  const before = createSheetSparseState(sheet);
  const workbookFormulaSources = [...workbook.sheets.values()].flatMap((sourceSheet) =>
    [...sourceSheet.cells.entries()].flatMap(([key, cell]) =>
      sourceSheet.id === command.sheetId || cell.content?.kind !== "formula"
        ? []
        : [
            {
              sheetId: sourceSheet.id,
              address: parseCellKey(key),
              source: cell.content.formula.source,
            },
          ],
    ),
  );
  const definedNames = [...workbook.definedNames.values()].map((definition) => ({
    ...definition,
    reference: {
      sheetId: definition.reference.sheetId,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  }));
  const existingIds = new Set((sheet.subtotalMetadata ?? []).map((entry) => entry.id));
  let sequence = existingIds.size;
  let subtotalId = command.subtotalId ?? `subtotal-${range.start.row}-${range.end.row}-${sequence}`;
  while (!command.subtotalId && existingIds.has(subtotalId))
    subtotalId = `subtotal-${range.start.row}-${range.end.row}-${++sequence}`;
  if (existingIds.has(subtotalId))
    throw invalidCommandPayload("subtotalId", command.subtotalId, "Subtotal ID already exists.");
  try {
    if (command.replaceExisting) {
      const existing = (sheet.subtotalMetadata ?? []).filter(
        (entry) =>
          entry.range.start.row <= range.end.row &&
          entry.range.end.row >= range.start.row &&
          entry.range.start.column <= range.end.column &&
          entry.range.end.column >= range.start.column,
      );
      const rows = [...new Set(existing.flatMap((entry) => entry.generatedRows))].sort(
        (a, b) => b - a,
      );
      if (existing.length) {
        range = {
          start: {
            row: Math.min(range.start.row, ...existing.map((entry) => entry.range.start.row)),
            column: Math.min(
              range.start.column,
              ...existing.map((entry) => entry.range.start.column),
            ),
          },
          end: {
            row: Math.max(range.end.row, ...existing.map((entry) => entry.range.end.row)),
            column: Math.max(range.end.column, ...existing.map((entry) => entry.range.end.column)),
          },
        };
      }
      for (const row of rows) {
        applySheetAxisCommand(workbook, {
          type: "deleteSheetAxis",
          sheetId: command.sheetId,
          axis: "row",
          index: row,
          count: 1,
        });
        range = {
          ...range,
          start: {
            ...range.start,
            row: row < range.start.row ? range.start.row - 1 : range.start.row,
          },
          end: { ...range.end, row: row <= range.end.row ? range.end.row - 1 : range.end.row },
        };
      }
      const ids = new Set(existing.map((entry) => entry.id));
      sheet.subtotalMetadata = (sheet.subtotalMetadata ?? []).filter((entry) => !ids.has(entry.id));
      sheet.outlineGroups = (sheet.outlineGroups ?? []).filter(
        (group) => !existing.some((entry) => group.id.startsWith(`${entry.id}-group-`)),
      );
      const removedColumns = removeEmptyGeneratedColumns(workbook, sheet, existing, [
        ...command.groupByColumns,
        ...command.summaryColumns,
      ]);
      for (const column of removedColumns) {
        const shift = (value: number) => (value > column ? value - 1 : value);
        command = {
          ...command,
          groupByColumns: command.groupByColumns.map(shift),
          summaryColumns: command.summaryColumns.map(shift),
        };
        range = {
          start: { ...range.start, column: shift(range.start.column) },
          end: {
            ...range.end,
            column: column <= range.end.column ? range.end.column - 1 : range.end.column,
          },
        };
      }
    }
    const ignoredGeneratedRows = new Set(
      (sheet.subtotalMetadata ?? []).flatMap((entry) => entry.generatedRows),
    );
    const candidateRows = Array.from(
      { length: range.end.row - range.start.row + 1 },
      (_, offset) => range.start.row + offset,
    ).filter(
      (row) =>
        row >= range.start.row + Number(command.hasHeader ?? false) &&
        !ignoredGeneratedRows.has(row),
    );
    const firstDataRow = candidateRows[0];
    if (firstDataRow === undefined) {
      rollbackWorkbookChanges(workbook, sheet, before, workbookFormulaSources, definedNames);
      return null;
    }
    const prepared = prepareSubtotalLabelColumn(workbook, sheet, command, range);
    command = prepared.command;
    range = prepared.range;
    const labelPlacement = prepared.placement;
    const generatedColumns = prepared.generatedColumns;
    const breaks: number[] = [];
    const groupStarts: number[] = [firstDataRow];
    let previousKey = keyForRow(workbook, command, firstDataRow);
    let previousRow = firstDataRow;
    for (const row of candidateRows.slice(1)) {
      const key = keyForRow(workbook, command, row);
      if (key !== previousKey) {
        breaks.push(previousRow);
        groupStarts.push(row);
      }
      previousKey = key;
      previousRow = row;
    }
    breaks.push(candidateRows.at(-1)!);
    if (command.summaryBelow === false)
      return applyAboveSubtotals(
        workbook,
        command,
        sheet,
        range,
        breaks,
        groupStarts,
        firstDataRow,
        subtotalId,
        labelPlacement,
        generatedColumns,
        before,
        workbookFormulaSources,
        definedNames,
      );
    let insertedBelow = 0;
    for (let groupIndex = breaks.length - 1; groupIndex >= 0; groupIndex -= 1) {
      const endBeforeInsert = breaks[groupIndex]!;
      const insertAt = endBeforeInsert + 1;
      applySheetAxisCommand(workbook, {
        type: "insertSheetAxis",
        sheetId: command.sheetId,
        axis: "row",
        index: insertAt,
        count: 1,
      });
      const startWithShifts = groupStarts[groupIndex]!;
      const end = insertAt - 1;
      for (const column of command.summaryColumns) {
        setCellContent(
          sheet,
          { row: insertAt, column },
          {
            kind: "formula",
            formula: {
              source: `=SUBTOTAL(${functionCode(command.operation)},${columnName(column)}${startWithShifts + 1}:${columnName(column)}${end + 1})`,
            },
          },
        );
      }
      if (command.labels && labelPlacement) {
        const value = createWorkbookEvaluator(workbook, command.sheetId).getComputedValue({
          row: startWithShifts,
          column: labelPlacement.source,
        });
        setCellContent(
          sheet,
          { row: insertAt, column: labelPlacement.target },
          {
            kind: "literal",
            value: `${value === null ? "" : String(value)} ${command.labels.subtotal}`.trim(),
          },
        );
      }
      insertedBelow += 1;
    }
    const grandTotalRow = range.end.row + insertedBelow + 1;
    applySheetAxisCommand(workbook, {
      type: "insertSheetAxis",
      sheetId: command.sheetId,
      axis: "row",
      index: grandTotalRow,
      count: 1,
    });
    for (const column of command.summaryColumns) {
      setCellContent(
        sheet,
        { row: grandTotalRow, column },
        {
          kind: "formula",
          formula: {
            source: `=SUBTOTAL(${functionCode(command.operation)},${columnName(column)}${firstDataRow + 1}:${columnName(column)}${grandTotalRow})`,
          },
        },
      );
    }
    if (command.labels && labelPlacement)
      setCellContent(
        sheet,
        { row: grandTotalRow, column: labelPlacement.target },
        { kind: "literal", value: command.labels.grandTotal },
      );
    insertedBelow += 1;
    // Insertions were made bottom-up; stored row coordinates are already final.
    const metadata: SubtotalMetadata = {
      id: subtotalId,
      range: {
        start: { ...range.start },
        end: { row: range.end.row + insertedBelow, column: range.end.column },
      },
      // Earlier inserts shift all lower summary rows; persist their final rows.
      generatedRows: [...breaks.map((end, index) => end + index + 1), grandTotalRow],
      summaryBelow: true,
      ...(generatedColumns.length ? { generatedColumns } : {}),
      ...(command.pageBreaks
        ? { pageBreakRows: groupStarts.slice(1).map((start, index) => start + index + 1) }
        : {}),
    };
    sheet.subtotalMetadata = [...(sheet.subtotalMetadata ?? []), metadata];
    sheet.outlineGroups = [
      ...(sheet.outlineGroups ?? []),
      {
        id: `${metadata.id}-group-total`,
        axis: "row",
        start: firstDataRow,
        end: grandTotalRow - 1,
        collapsed: false,
      },
      ...breaks.map((end, index) => ({
        id: `${metadata.id}-group-${index}`,
        axis: "row" as const,
        start: groupStarts[index]! + index,
        end: end + index,
        collapsed: false,
      })),
    ];
    return {
      type: "restoreSheetState",
      sheetId: command.sheetId,
      state: before,
      workbookFormulaSources,
      definedNames,
    };
  } catch (cause) {
    rollbackWorkbookChanges(workbook, sheet, before, workbookFormulaSources, definedNames);
    throw cause;
  }
}

function applyAboveSubtotals(
  workbook: Workbook,
  command: ApplySubtotalsCommand,
  sheet: SheetWithSubtotals,
  range: CellRange,
  breaks: number[],
  groupStarts: number[],
  firstDataRow: number,
  subtotalId: string,
  labelPlacement: SubtotalLabelPlacement | null,
  generatedColumns: number[],
  before: ReturnType<typeof createSheetSparseState>,
  workbookFormulaSources: Array<{
    sheetId: string;
    address: { row: number; column: number };
    source: string;
  }>,
  definedNames: DefinedName[],
): RestoreFullSheetStateCommand {
  for (let index = groupStarts.length - 1; index >= 0; index -= 1) {
    const row = groupStarts[index]!;
    applySheetAxisCommand(workbook, {
      type: "insertSheetAxis",
      sheetId: command.sheetId,
      axis: "row",
      index: row,
      count: 1,
    });
    for (const column of command.summaryColumns)
      setCellContent(
        sheet,
        { row, column },
        {
          kind: "formula",
          formula: {
            source: `=SUBTOTAL(${functionCode(command.operation)},${columnName(column)}${row + 2}:${columnName(column)}${breaks[index]! + 2})`,
          },
        },
      );
    if (command.labels && labelPlacement) {
      const value = createWorkbookEvaluator(workbook, command.sheetId).getComputedValue({
        row: row + 1,
        column: labelPlacement.source,
      });
      setCellContent(
        sheet,
        { row, column: labelPlacement.target },
        {
          kind: "literal",
          value: `${value === null ? "" : String(value)} ${command.labels.subtotal}`.trim(),
        },
      );
    }
  }
  applySheetAxisCommand(workbook, {
    type: "insertSheetAxis",
    sheetId: command.sheetId,
    axis: "row",
    index: firstDataRow,
    count: 1,
  });
  const grandRow = firstDataRow;
  const totalEnd = range.end.row + groupStarts.length + 1;
  for (const column of command.summaryColumns)
    setCellContent(
      sheet,
      { row: grandRow, column },
      {
        kind: "formula",
        formula: {
          source: `=SUBTOTAL(${functionCode(command.operation)},${columnName(column)}${grandRow + 2}:${columnName(column)}${totalEnd + 1})`,
        },
      },
    );
  if (command.labels && labelPlacement)
    setCellContent(
      sheet,
      { row: grandRow, column: labelPlacement.target },
      { kind: "literal", value: command.labels.grandTotal },
    );
  const generatedRows = [grandRow, ...groupStarts.map((start, index) => start + index + 1)];
  const metadata: SubtotalMetadata = {
    id: subtotalId,
    range: {
      start: { ...range.start },
      end: { row: range.end.row + groupStarts.length + 1, column: range.end.column },
    },
    generatedRows,
    summaryBelow: false,
    ...(generatedColumns.length ? { generatedColumns } : {}),
    ...(command.pageBreaks
      ? { pageBreakRows: groupStarts.slice(1).map((start, index) => start + index + 2) }
      : {}),
  };
  sheet.subtotalMetadata = [...(sheet.subtotalMetadata ?? []), metadata];
  sheet.outlineGroups = [
    ...(sheet.outlineGroups ?? []),
    {
      id: `${metadata.id}-group-total`,
      axis: "row",
      start: grandRow + 1,
      end: totalEnd,
      collapsed: false,
    },
    ...breaks.map((end, index) => ({
      id: `${metadata.id}-group-${index}`,
      axis: "row" as const,
      start: groupStarts[index]! + index + 2,
      end: end + index + 2,
      collapsed: false,
    })),
  ];
  return {
    type: "restoreSheetState",
    sheetId: command.sheetId,
    state: before,
    workbookFormulaSources,
    definedNames,
  };
}

export function createRemoveSubtotalsCommand(
  sheetId: string,
  subtotalId?: string,
): RemoveSubtotalsCommand {
  return { type: "removeSubtotals", sheetId, ...(subtotalId ? { subtotalId } : {}) };
}

export function applyRemoveSubtotalsCommand(
  workbook: Workbook,
  command: RemoveSubtotalsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId) as SheetWithSubtotals;
  const entries = (sheet.subtotalMetadata ?? []).filter(
    (entry) => !command.subtotalId || entry.id === command.subtotalId,
  );
  if (!entries.length) return null;
  const before = createSheetSparseState(sheet);
  const workbookFormulaSources = [...workbook.sheets.values()].flatMap((sourceSheet) =>
    [...sourceSheet.cells.entries()].flatMap(([key, cell]) =>
      sourceSheet.id === command.sheetId || cell.content?.kind !== "formula"
        ? []
        : [
            {
              sheetId: sourceSheet.id,
              address: parseCellKey(key),
              source: cell.content.formula.source,
            },
          ],
    ),
  );
  const definedNames = [...workbook.definedNames.values()].map((definition) => ({
    ...definition,
    reference: {
      sheetId: definition.reference.sheetId,
      start: { ...definition.reference.start },
      end: { ...definition.reference.end },
    },
  }));
  try {
    for (const row of [...new Set(entries.flatMap((entry) => entry.generatedRows))].sort(
      (a, b) => b - a,
    ))
      applySheetAxisCommand(workbook, {
        type: "deleteSheetAxis",
        sheetId: command.sheetId,
        axis: "row",
        index: row,
        count: 1,
      });
    const removeIds = new Set(entries.map((entry) => entry.id));
    sheet.subtotalMetadata = (sheet.subtotalMetadata ?? []).filter(
      (entry) => !removeIds.has(entry.id),
    );
    sheet.outlineGroups = (sheet.outlineGroups ?? []).filter(
      (group) => !entries.some((entry) => group.id.startsWith(`${entry.id}-group-`)),
    );
    removeEmptyGeneratedColumns(workbook, sheet, entries);
    return {
      type: "restoreSheetState",
      sheetId: command.sheetId,
      state: before,
      workbookFormulaSources,
      definedNames,
    };
  } catch (cause) {
    rollbackWorkbookChanges(workbook, sheet, before, workbookFormulaSources, definedNames);
    throw cause;
  }
}
