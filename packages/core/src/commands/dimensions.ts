import {
  getColumnWidth,
  getRowHeight,
  setColumnWidth,
  setRowHeight,
  type Workbook,
} from "../workbook.js";
import type { ResizeSheetDimensionCommand } from "./contracts.js";
import { getSheetOrThrow } from "./helpers.js";

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
    throw new RangeError(`Unknown sheet dimension axis ${command.axis}.`);
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
