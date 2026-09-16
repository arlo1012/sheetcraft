import {
  createSheetSparseState,
  createWorkbookEvaluator,
  setCellContent,
  type CellRange,
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
} from "./helpers.js";

type SubtotalMetadata = { id: string; range: CellRange; generatedRows: number[] };
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

export function createApplySubtotalsCommand(
  sheetId: string,
  range: CellRange,
  groupByColumns: readonly number[],
  summaryColumns: readonly number[],
  operation: ApplySubtotalsCommand["operation"],
  options?: { hasHeader?: boolean; subtotalId?: string },
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
  };
}

export function applyApplySubtotalsCommand(
  workbook: Workbook,
  command: ApplySubtotalsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId) as SheetWithSubtotals;
  const range = normalizeRange(command.range);
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
  const subtotalId =
    command.subtotalId ??
    `subtotal-${range.start.row}-${range.end.row}-${(sheet.subtotalMetadata ?? []).length}`;
  if ((sheet.subtotalMetadata ?? []).some((entry) => entry.id === subtotalId))
    throw invalidCommandPayload("subtotalId", command.subtotalId, "Subtotal ID already exists.");
  const firstDataRow = range.start.row + (command.hasHeader ? 1 : 0);
  if (firstDataRow > range.end.row) return null;
  const breaks: number[] = [];
  const groupStarts: number[] = [firstDataRow];
  let previousKey = keyForRow(workbook, command, firstDataRow);
  for (let row = firstDataRow + 1; row <= range.end.row; row += 1) {
    const key = keyForRow(workbook, command, row);
    if (key !== previousKey) {
      breaks.push(row - 1);
      groupStarts.push(row);
    }
    previousKey = key;
  }
  breaks.push(range.end.row);
  const before = createSheetSparseState(sheet);
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
  };
  sheet.subtotalMetadata = [...(sheet.subtotalMetadata ?? []), metadata];
  sheet.outlineGroups = [
    ...(sheet.outlineGroups ?? []),
    ...breaks.map((end, index) => ({
      id: `${metadata.id}-group-${index}`,
      axis: "row" as const,
      start: groupStarts[index]! + index,
      end: end + index,
      collapsed: false,
    })),
  ];
  return { type: "restoreSheetState", sheetId: command.sheetId, state: before };
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
  for (const row of entries.flatMap((entry) => entry.generatedRows).sort((a, b) => b - a))
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
  return { type: "restoreSheetState", sheetId: command.sheetId, state: before };
}
