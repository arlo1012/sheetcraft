import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  getColumnWidth,
  getRowHeight,
  setColumnWidth,
  setRowHeight,
  type Workbook,
} from "../workbook.js";
import type { ResizeSheetDimensionCommand } from "./contracts.js";
import { getSheetOrThrow, invalidCommandPayload } from "./helpers.js";

export function createResizeSheetDimensionCommand(
  sheetId: string,
  axis: ResizeSheetDimensionCommand["axis"],
  index: number,
  size: number,
): ResizeSheetDimensionCommand {
  return { type: "resizeSheetDimension", sheetId, axis, index, size };
}

export function applyResizeSheetDimensionCommand(
  workbook: Workbook,
  command: ResizeSheetDimensionCommand,
): ResizeSheetDimensionCommand | null {
  if (command.axis !== "row" && command.axis !== "column") {
    throw invalidCommandPayload("axis", command.axis);
  }
  const maximumIndex = command.axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (!Number.isInteger(command.index) || command.index < 0 || command.index >= maximumIndex) {
    throw invalidCommandPayload("index", command.index);
  }
  const minimumSize = command.axis === "row" ? MIN_ROW_HEIGHT : MIN_COLUMN_WIDTH;
  const maximumSize = command.axis === "row" ? MAX_ROW_HEIGHT : MAX_COLUMN_WIDTH;
  if (!Number.isInteger(command.size) || command.size < minimumSize || command.size > maximumSize) {
    throw invalidCommandPayload("size", command.size);
  }
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previousSize =
    command.axis === "row"
      ? getRowHeight(sheet, command.index)
      : getColumnWidth(sheet, command.index);
  const changed =
    command.axis === "row"
      ? setRowHeight(sheet, command.index, command.size)
      : setColumnWidth(sheet, command.index, command.size);
  return changed
    ? createResizeSheetDimensionCommand(command.sheetId, command.axis, command.index, previousSize)
    : null;
}
