import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheetSparseState,
  replaceSheetSparseState,
  type SheetDimensionAxis,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";
import { cloneCellStyle } from "../style.js";
import type {
  DeleteSheetAxisCommand,
  InsertSheetAxisCommand,
  RestoreSheetStateCommand,
} from "./contracts.js";
import { cloneSparseState, getSheetOrThrow } from "./helpers.js";

export function createInsertSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): InsertSheetAxisCommand {
  return { type: "insertSheetAxis", sheetId, axis, index, count };
}

export function createDeleteSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): DeleteSheetAxisCommand {
  return { type: "deleteSheetAxis", sheetId, axis, index, count };
}

export function createRestoreSheetStateCommand(
  sheetId: string,
  state: SheetSparseState,
): RestoreSheetStateCommand {
  return { type: "restoreSheetState", sheetId, state: cloneSparseState(state) };
}

function assertSheetAxisRange(axis: SheetDimensionAxis, index: number, count: number): number {
  if (axis !== "row" && axis !== "column") {
    throw new RangeError(`Unknown sheet dimension axis ${axis}.`);
  }
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (!Number.isInteger(index) || index < 0 || index >= maximum) {
    throw new RangeError(
      `${axis === "row" ? "Row" : "Column"} index ${index} is outside the sheet.`,
    );
  }
  if (!Number.isInteger(count) || count <= 0 || count > maximum - index) {
    throw new RangeError(`Cannot change ${count} ${axis}s starting at index ${index}.`);
  }
  return maximum;
}

function transformAxisIndex(
  value: number,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): number | null {
  if (operation === "insert") {
    if (value >= maximum - count) return null;
    return value >= index ? value + count : value;
  }
  if (value >= index && value < index + count) return null;
  return value >= index + count ? value - count : value;
}

function transformSheetSparseState(
  state: SheetSparseState,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): SheetSparseState {
  const cells = state.cells.flatMap((cell) => {
    const sourceIndex = axis === "row" ? cell.address.row : cell.address.column;
    const targetIndex = transformAxisIndex(sourceIndex, index, count, maximum, operation);
    if (targetIndex === null) return [];
    return [
      {
        address:
          axis === "row"
            ? { row: targetIndex, column: cell.address.column }
            : { row: cell.address.row, column: targetIndex },
        ...(cell.value === undefined ? {} : { value: cell.value }),
        ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      },
    ];
  });
  const transformDimensions = (dimensions: SheetSparseState["rowHeights"]) =>
    dimensions.flatMap((dimension) => {
      const targetIndex = transformAxisIndex(dimension.index, index, count, maximum, operation);
      return targetIndex === null ? [] : [{ index: targetIndex, size: dimension.size }];
    });
  return {
    cells,
    rowHeights:
      axis === "row"
        ? transformDimensions(state.rowHeights)
        : state.rowHeights.map((item) => ({ ...item })),
    columnWidths:
      axis === "column"
        ? transformDimensions(state.columnWidths)
        : state.columnWidths.map((item) => ({ ...item })),
  };
}

export function applyRestoreSheetStateCommand(
  workbook: Workbook,
  command: RestoreSheetStateCommand,
): RestoreSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previousState = createSheetSparseState(sheet);
  return replaceSheetSparseState(sheet, command.state)
    ? createRestoreSheetStateCommand(command.sheetId, previousState)
    : null;
}

export function applySheetAxisCommand(
  workbook: Workbook,
  command: InsertSheetAxisCommand | DeleteSheetAxisCommand,
): RestoreSheetStateCommand | null {
  const maximum = assertSheetAxisRange(command.axis, command.index, command.count);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previousState = createSheetSparseState(sheet);
  const nextState = transformSheetSparseState(
    previousState,
    command.axis,
    command.index,
    command.count,
    maximum,
    command.type === "insertSheetAxis" ? "insert" : "delete",
  );
  return replaceSheetSparseState(sheet, nextState)
    ? createRestoreSheetStateCommand(command.sheetId, previousState)
    : null;
}
