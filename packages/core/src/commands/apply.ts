import { WorkbookDomainError, toWorkbookErrorData, type WorkbookErrorData } from "../errors.js";
import type { Workbook } from "../workbook.js";
import {
  applyCellBordersCommand,
  applyCellStyleCommand,
  applyRestoreCellStylesCommand,
} from "./formatting.js";
import { applyResizeSheetDimensionCommand } from "./dimensions.js";
import {
  applyAddSheetCommand,
  applyDeleteSheetCommand,
  applyRenameSheetCommand,
} from "./sheets.js";
import { applyRestoreSheetStateCommand, applySheetAxisCommand } from "./structure.js";
import type { WorkbookCommand } from "./contracts.js";
import { applyClearCellRangeCommand, applySetCellValuesCommand } from "./values.js";

export type ApplyWorkbookCommandResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; inverse: WorkbookCommand }
  | { ok: false; error: WorkbookErrorData };

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): WorkbookCommand | null {
  switch (command.type) {
    case "setCellValues":
      return applySetCellValuesCommand(workbook, command);
    case "clearCellRange":
      return applyClearCellRangeCommand(workbook, command);
    case "applyCellStyle":
      return applyCellStyleCommand(workbook, command);
    case "applyCellBorders":
      return applyCellBordersCommand(workbook, command);
    case "restoreCellStyles":
      return applyRestoreCellStylesCommand(workbook, command);
    case "resizeSheetDimension":
      return applyResizeSheetDimensionCommand(workbook, command);
    case "addSheet":
      return applyAddSheetCommand(workbook, command);
    case "deleteSheet":
      return applyDeleteSheetCommand(workbook, command);
    case "renameSheet":
      return applyRenameSheetCommand(workbook, command);
    case "insertSheetAxis":
    case "deleteSheetAxis":
      return applySheetAxisCommand(workbook, command);
    case "restoreSheetState":
      return applyRestoreSheetStateCommand(workbook, command);
    default: {
      const unknownCommand = command as { type?: unknown };
      throw new WorkbookDomainError(
        {
          code: "invalid_command",
          details: { type: typeof unknownCommand.type === "string" ? unknownCommand.type : null },
        },
        "Unknown workbook command.",
      );
    }
  }
}

export function tryApplyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): ApplyWorkbookCommandResult {
  try {
    const inverse = applyWorkbookCommand(workbook, command);
    return inverse ? { ok: true, changed: true, inverse } : { ok: true, changed: false };
  } catch (error) {
    return { ok: false, error: toWorkbookErrorData(error) };
  }
}
