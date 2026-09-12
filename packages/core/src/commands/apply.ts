import {
  WorkbookDomainError,
  toWorkbookErrorData,
  toWorkbookErrorDetail,
  type WorkbookErrorData,
} from "../errors.js";
import type { Workbook } from "../workbook.js";
import {
  applyCellBordersCommand,
  applyAdjustCellIndentCommand,
  applyAdjustCellNumberFormatDecimalsCommand,
  applyCellFormatCommand,
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
  applySetSheetPropertiesCommand,
} from "./sheets.js";
import {
  applyMoveSheetAxisCommand,
  applyRestoreSheetStateCommand,
  applySheetAxisCommand,
} from "./structure.js";
import { applySortSheetRangeCommand } from "./sort.js";
import {
  applyConvertFloatingImageToCellCommand,
  applyConvertCellImageToFloatingCommand,
  applyDeleteFloatingImageCommand,
  applyRestoreFloatingImageToCellCommand,
  applySetFloatingImageCommand,
} from "./images.js";
import type { WorkbookCommand } from "./contracts.js";
import {
  applySetWorkbookDateSystemCommand,
  applySetWorkbookCalculationCommand,
} from "./workbook-settings.js";
import { applyDeleteDefinedNameCommand, applyUpsertDefinedNameCommand } from "./names.js";
import { applySetDefinedNamesCommand } from "./names-from-selection.js";
import {
  applyClearCellRangeCommand,
  applyMoveCellRangeCommand,
  applySetCellContentsCommand,
} from "./values.js";

export type ApplyWorkbookCommandResult =
  | { ok: true; changed: false }
  | { ok: true; changed: true; inverse: WorkbookCommand }
  | { ok: false; error: WorkbookErrorData };

function assertCommandDoesNotModifyProtectedSheet(
  workbook: Workbook,
  command: WorkbookCommand,
): void {
  const sheetIds =
    command.type === "setCellContents"
      ? command.changes.map((change) => change.sheetId)
      : "sheetId" in command
        ? [command.sheetId]
        : [];
  const blocked = sheetIds.find((sheetId) => workbook.sheets.get(sheetId)?.properties.protected);
  if (!blocked) return;
  switch (command.type) {
    case "setCellContents":
    case "clearCellRange":
    case "moveCellRange":
    case "applyCellStyle":
    case "applyCellBorders":
    case "applyCellFormat":
    case "adjustCellNumberFormatDecimals":
    case "adjustCellIndent":
    case "restoreCellStyles":
    case "resizeSheetDimension":
    case "setSheetFreezePanes":
    case "mergeCells":
    case "unmergeCells":
    case "setSheetFilter":
    case "sortSheetRange":
    case "setFloatingImage":
    case "deleteFloatingImage":
    case "convertFloatingImageToCell":
    case "convertCellImageToFloating":
    case "restoreFloatingImageToCell":
    case "insertSheetAxis":
    case "deleteSheetAxis":
    case "moveSheetAxis":
    case "restoreSheetState":
      throw new WorkbookDomainError(
        {
          code: "sheet_protected",
          details: { sheetId: toWorkbookErrorDetail(blocked) },
        },
        `Sheet ${blocked} is protected.`,
      );
  }
}

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): WorkbookCommand | null {
  try {
    assertCommandDoesNotModifyProtectedSheet(workbook, command);
    switch (command.type) {
      case "setWorkbookDateSystem":
        return applySetWorkbookDateSystemCommand(workbook, command);
      case "setWorkbookCalculation":
        return applySetWorkbookCalculationCommand(workbook, command);
      case "setDefinedNames":
        return applySetDefinedNamesCommand(workbook, command);
      case "upsertDefinedName":
        return applyUpsertDefinedNameCommand(workbook, command);
      case "deleteDefinedName":
        return applyDeleteDefinedNameCommand(workbook, command);
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
      case "applyCellFormat":
        return applyCellFormatCommand(workbook, command);
      case "adjustCellNumberFormatDecimals":
        return applyAdjustCellNumberFormatDecimalsCommand(workbook, command);
      case "adjustCellIndent":
        return applyAdjustCellIndentCommand(workbook, command);
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
      case "convertFloatingImageToCell":
        return applyConvertFloatingImageToCellCommand(workbook, command);
      case "convertCellImageToFloating":
        return applyConvertCellImageToFloatingCommand(workbook, command);
      case "restoreFloatingImageToCell":
        return applyRestoreFloatingImageToCellCommand(workbook, command);
      case "addSheet":
        return applyAddSheetCommand(workbook, command);
      case "deleteSheet":
        return applyDeleteSheetCommand(workbook, command);
      case "setSheetProperties":
        return applySetSheetPropertiesCommand(workbook, command);
      case "renameSheet":
        return applyRenameSheetCommand(workbook, command);
      case "moveSheet":
        return applyMoveSheetCommand(workbook, command);
      case "insertSheetAxis":
      case "deleteSheetAxis":
        return applySheetAxisCommand(workbook, command);
      case "moveSheetAxis":
        return applyMoveSheetAxisCommand(workbook, command);
      case "restoreSheetState":
        return applyRestoreSheetStateCommand(workbook, command);
      default: {
        const unknownCommand = command as { type?: unknown };
        throw new WorkbookDomainError(
          {
            code: "invalid_command",
            details: {
              type: typeof unknownCommand.type === "string" ? unknownCommand.type : null,
            },
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
