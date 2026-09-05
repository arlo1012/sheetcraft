import { WorkbookDomainError, toWorkbookErrorData, type WorkbookErrorData } from "../errors.js";
import type { Workbook } from "../workbook.js";
import {
  applyCellBordersCommand,
  applyAdjustCellNumberFormatDecimalsCommand,
  applyCellStyleCommand,
  applyRestoreCellStylesCommand,
} from "./formatting.js";
import { applyResizeSheetDimensionCommand } from "./dimensions.js";
import { applySetSheetFilterCommand } from "./filter.js";
import {
  applyMergeCellsCommand,
  applySetSheetFreezePanesCommand,
  applyUnmergeCellsCommand,
} from "./metadata.js";
import {
  applyAddSheetCommand,
  applyDeleteSheetCommand,
  applyMoveSheetCommand,
  applyRenameSheetCommand,
} from "./sheets.js";
import { applyRestoreSheetStateCommand, applySheetAxisCommand } from "./structure.js";
import { applySortSheetRangeCommand } from "./sort.js";
import { applyDeleteFloatingImageCommand, applySetFloatingImageCommand } from "./images.js";
import type { WorkbookCommand } from "./contracts.js";
import {
  applyClearCellRangeCommand,
  applyMoveCellRangeCommand,
  applySetCellContentsCommand,
} from "./values.js";

export type ApplyWorkbookCommandResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; inverse: WorkbookCommand }
  | { ok: false; error: WorkbookErrorData };

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): WorkbookCommand | null {
  try {
    switch (command.type) {
      case "setCellContents":
        return applySetCellContentsCommand(workbook, command);
      case "clearCellRange":
        return applyClearCellRangeCommand(workbook, command);
      case "moveCellRange":
        return applyMoveCellRangeCommand(workbook, command);
      case "applyCellStyle":
        return applyCellStyleCommand(workbook, command);
      case "applyCellBorders":
        return applyCellBordersCommand(workbook, command);
      case "adjustCellNumberFormatDecimals":
        return applyAdjustCellNumberFormatDecimalsCommand(workbook, command);
      case "restoreCellStyles":
        return applyRestoreCellStylesCommand(workbook, command);
      case "resizeSheetDimension":
        return applyResizeSheetDimensionCommand(workbook, command);
      case "setSheetFreezePanes":
        return applySetSheetFreezePanesCommand(workbook, command);
      case "mergeCells":
        return applyMergeCellsCommand(workbook, command);
      case "unmergeCells":
        return applyUnmergeCellsCommand(workbook, command);
      case "setSheetFilter":
        return applySetSheetFilterCommand(workbook, command);
      case "sortSheetRange":
        return applySortSheetRangeCommand(workbook, command);
      case "setFloatingImage":
        return applySetFloatingImageCommand(workbook, command);
      case "deleteFloatingImage":
        return applyDeleteFloatingImageCommand(workbook, command);
      case "addSheet":
        return applyAddSheetCommand(workbook, command);
      case "deleteSheet":
        return applyDeleteSheetCommand(workbook, command);
      case "renameSheet":
        return applyRenameSheetCommand(workbook, command);
      case "moveSheet":
        return applyMoveSheetCommand(workbook, command);
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
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    throw new WorkbookDomainError(
      toWorkbookErrorData(error),
      error instanceof Error ? error.message : undefined,
    );
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
