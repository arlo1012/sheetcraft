import { assertPivotResultsAreWritable } from "./pivot-result-guard.js";
import { prepareTableCalculatedColumnEdit } from "../table-calculated-columns.js";
import { applySetPivotTableCommand, applyRemovePivotTableCommand } from "./pivot-tables.js";
import { applySetCellSparklinesCommand } from "./sparklines.js";
import {
  applySetSheetDrawingsCommand,
  applyReplaceSheetDrawingCollectionsCommand,
  normalizeReplaceSheetDrawingCollectionsCommand,
} from "./drawings.js";
import { invalidCommandPayload } from "./helpers.js";
import {
  applySetSheetProtectionCommand,
  applySetWorkbookStructureProtectionCommand,
} from "./protection.js";
import {
  assertWorkbookStructureProtection,
  allowProtectedCellCommand,
} from "./protection-guard.js";
import { applyBatchDeleteSheetAxesCommand } from "./batch.js";
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
import {
  applyResetSheetDimensionSizesCommand,
  applyResizeSheetDimensionCommand,
  applyResizeSheetDimensionsCommand,
  applyRestoreSheetDimensionStateCommand,
  applySetSheetDefaultColumnWidthCommand,
  applySetSheetDimensionHiddenCommand,
  applySetSheetDimensionSizesCommand,
} from "./dimensions.js";
import { applySetSheetFilterCommand } from "./filter.js";
import { applySetSheetPageSetupCommand } from "./page-setup.js";
import {
  applySetSheetPageDecorationCommand,
  applySetSheetsWatermarkCommand,
  applySetWorkbookWatermarkPresetsCommand,
} from "./page-decoration.js";
import { applyAdvancedFilterCommand } from "./advanced-filter.js";
import { applySplitColumnCommand, applyRemoveDuplicatesCommand } from "./data-transforms.js";
import { applyApplySubtotalsCommand, applyRemoveSubtotalsCommand } from "./subtotal.js";
import {
  applyClearSheetDataValidationsCommand,
  applySetSheetDataValidationsCommand,
} from "./validation.js";
import {
  applyClearSheetDuplicateRulesCommand,
  applySetSheetDuplicateRulesCommand,
} from "./duplicates.js";
import {
  applyClearSheetConditionalFormatsCommand,
  applySetSheetConditionalFormatsCommand,
} from "./conditional-formatting.js";
import {
  applyAddSheetOutlineGroupCommand,
  applyClearSheetOutlineCommand,
  applyRemoveSheetOutlineGroupCommand,
  applySetSheetOutlineGroupCollapsedCommand,
  applySetSheetOutlineGroupsCollapsedCommand,
  applySetSheetOutlineLevelCommand,
  applyUngroupSheetRangeCommand,
} from "./outline.js";
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
import { applyCellShiftCommand, applyRestoreCellShiftCommand } from "./cell-shift.js";
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
  applyRestorePictureCellConversionCommand,
  applySetFloatingImageCommand,
  applySetSheetFloatingImagesCommand,
} from "./images.js";
import type { WorkbookCommand } from "./contracts.js";
import {
  applySetWorkbookDateSystemCommand,
  applySetWorkbookCalculationCommand,
} from "./workbook-settings.js";
import { applySetWorkbookThemeCommand } from "./workbook-theme.js";
import { applySetWorkbookCellStylesCommand } from "./cell-styles.js";
import {
  applyMarkCellHyperlinkVisitedCommand,
  applySetCellHyperlinkCommand,
} from "./hyperlinks.js";
import { applySetCellNotesCommand } from "./notes.js";
import {
  applyDeleteDefinedNameCommand,
  applyUpsertDefinedNameCommand,
  applyReorderDefinedNamesCommand,
} from "./names.js";
import { applySetDefinedNamesCommand } from "./names-from-selection.js";
import {
  applyCreateTableCommand,
  applyApplyTableStyleToRangeCommand,
  applyRemoveTableCommand,
  applyRestoreTableTransactionCommand,
  applyResizeTableCommand,
  applySetWorkbookTableStylesCommand,
  applySetWorkbookPivotTableStylesCommand,
  applyUpdateTableCommand,
} from "../tables.js";
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
  if (allowProtectedCellCommand(workbook, command)) return;
  if (command.type === "setWorkbookTheme" && !command.cellStates && !command.tableStyles) {
    const affected = [...workbook.sheets.values()].find(
      (sheet) =>
        sheet.properties.protected &&
        ([...sheet.cells.values()].some((cell) =>
          Boolean(
            cell.style?.textColorTheme ||
            cell.style?.fillColorTheme ||
            cell.style?.fontTheme ||
            (cell.namedStyle &&
              (cell.namedStyle.styleId.startsWith("theme-") ||
                ["title", "heading-1", "heading-2", "heading-3", "heading-4", "total"].includes(
                  cell.namedStyle.styleId,
                ))),
          ),
        ) ||
          (sheet.tables ?? []).some((table) => table.style.id.startsWith("table-wps-"))),
    );
    if (affected) {
      throw new WorkbookDomainError(
        { code: "sheet_protected", details: { sheetId: toWorkbookErrorDetail(affected.id) } },
        `Sheet ${affected.id} is protected.`,
      );
    }
  }
  if (command.type === "setWorkbookCellStyles") {
    const currentById = new Map((workbook.cellStyles ?? []).map((style) => [style.id, style]));
    const nextById = new Map(command.styles.map((style) => [style.id, style]));
    const changedStyleIds = new Set<string>();
    for (const [id, current] of currentById) {
      if (JSON.stringify(current) !== JSON.stringify(nextById.get(id))) changedStyleIds.add(id);
    }
    if (changedStyleIds.size) {
      const affected = [...workbook.sheets.values()].find(
        (sheet) =>
          sheet.properties.protected &&
          [...sheet.cells.values()].some(
            (cell) => cell.namedStyle && changedStyleIds.has(cell.namedStyle.styleId),
          ),
      );
      if (affected) {
        throw new WorkbookDomainError(
          { code: "sheet_protected", details: { sheetId: toWorkbookErrorDetail(affected.id) } },
          `Sheet ${affected.id} is protected.`,
        );
      }
    }
  }
  const sheetIds =
    command.type === "setCellContents"
      ? [
          ...command.changes.map((change) => change.sheetId),
          ...(command.conditionalFormats ?? []).map((entry) => entry.sheetId),
        ]
      : command.type === "advancedFilter" && command.mode === "copy" && command.destination
        ? [command.destination.sheetId]
        : command.type === "restoreTableTransaction"
          ? command.states.map((state) => state.sheetId)
          : command.type === "setSheetsWatermark"
            ? command.sheetIds
            : command.type === "replaceSheetDrawingCollections"
              ? command.collections.map((entry) => entry.sheetId)
              : "sheetId" in command
                ? [command.sheetId]
                : [];
  const blocked = sheetIds.find((sheetId) => workbook.sheets.get(sheetId)?.properties.protected);
  if (!blocked) return;
  switch (command.type) {
    case "setCellContents":
    case "clearCellRange":
    case "setPivotTable":
    case "removePivotTable":
    case "createTable":
    case "applyTableStyleToRange":
    case "updateTable":
    case "resizeTable":
    case "removeTable":
    case "moveCellRange":
    case "insertCells":
    case "deleteCells":
    case "restoreCellShift":
    case "restoreTableTransaction":
    case "applyCellStyle":
    case "setCellHyperlink":
    case "markCellHyperlinkVisited":
    case "applyCellBorders":
    case "applyCellFormat":
    case "adjustCellNumberFormatDecimals":
    case "adjustCellIndent":
    case "restoreCellStyles":
    case "resizeSheetDimension":
    case "resizeSheetDimensions":
    case "setSheetDimensionSizes":
    case "setSheetDimensionHidden":
    case "resetSheetDimensionSizes":
    case "setSheetDefaultColumnWidth":
    case "restoreSheetDimensionState":
    case "setSheetFreezePanes":
    case "setSheetPageSetup":
    case "setSheetPageDecoration":
    case "setSheetsWatermark":
    case "setWorkbookWatermarkPresets":
    case "mergeCells":
    case "unmergeCells":
    case "setSheetFilter":
    case "advancedFilter":
    case "sortSheetRange":
    case "splitColumn":
    case "removeDuplicates":
    case "applySubtotals":
    case "removeSubtotals":
    case "setSheetDataValidations":
    case "clearSheetDataValidations":
    case "setSheetDuplicateRules":
    case "clearSheetDuplicateRules":
    case "setSheetConditionalFormats":
    case "clearSheetConditionalFormats":
    case "addSheetOutlineGroup":
    case "removeSheetOutlineGroup":
    case "setSheetOutlineGroupCollapsed":
    case "setSheetOutlineGroupsCollapsed":
    case "setSheetOutlineLevel":
    case "clearSheetOutline":
    case "ungroupSheetRange":
    case "setSheetDrawings":
    case "replaceSheetDrawingCollections":
    case "setSheetFloatingImages":
    case "setFloatingImage":
    case "deleteFloatingImage":
    case "convertFloatingImageToCell":
    case "convertCellImageToFloating":
    case "restoreFloatingImageToCell":
    case "restorePictureCellConversion":
    case "insertSheetAxis":
    case "deleteSheetAxis":
    case "batchDeleteSheetAxes":
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
  options: { fromHistory?: boolean } = {},
): WorkbookCommand | null {
  try {
    const discriminator = Object.getOwnPropertyDescriptor(command, "type");
    if (!discriminator || !("value" in discriminator))
      throw invalidCommandPayload(
        "type",
        null,
        "Workbook commands require an own type data field.",
      );
    if (discriminator.value === "replaceSheetDrawingCollections")
      command = normalizeReplaceSheetDrawingCollectionsCommand(
        command as Extract<WorkbookCommand, { type: "replaceSheetDrawingCollections" }>,
      );
    const calculatedColumnPlan =
      !options.fromHistory && command.type === "setCellContents"
        ? prepareTableCalculatedColumnEdit(workbook, command)
        : undefined;
    if (calculatedColumnPlan) command = calculatedColumnPlan.command;
    if (!options.fromHistory) {
      assertWorkbookStructureProtection(workbook, command);
      assertCommandDoesNotModifyProtectedSheet(workbook, command);
      assertPivotResultsAreWritable(workbook, command);
    }
    switch (command.type) {
      case "setSheetProtection":
        return applySetSheetProtectionCommand(workbook, command, options.fromHistory);
      case "setWorkbookStructureProtection":
        return applySetWorkbookStructureProtectionCommand(workbook, command, options.fromHistory);
      case "setWorkbookDateSystem":
        return applySetWorkbookDateSystemCommand(workbook, command);
      case "setWorkbookCalculation":
        return applySetWorkbookCalculationCommand(workbook, command);
      case "setWorkbookTheme":
        return applySetWorkbookThemeCommand(workbook, command);
      case "setWorkbookCellStyles":
        return applySetWorkbookCellStylesCommand(workbook, command);
      case "reorderDefinedNames":
        return applyReorderDefinedNamesCommand(workbook, command);
      case "setDefinedNames":
        return applySetDefinedNamesCommand(workbook, command);
      case "upsertDefinedName":
        return applyUpsertDefinedNameCommand(workbook, command);
      case "deleteDefinedName":
        return applyDeleteDefinedNameCommand(workbook, command);
      case "setCellContents":
        return applySetCellContentsCommand(workbook, command, calculatedColumnPlan?.update);
      case "clearCellRange":
        return applyClearCellRangeCommand(workbook, command);
      case "setPivotTable":
        return applySetPivotTableCommand(workbook, command);
      case "removePivotTable":
        return applyRemovePivotTableCommand(workbook, command);
      case "createTable":
        return applyCreateTableCommand(workbook, command);
      case "applyTableStyleToRange":
        return applyApplyTableStyleToRangeCommand(workbook, command);
      case "updateTable":
        return applyUpdateTableCommand(workbook, command);
      case "resizeTable":
        return applyResizeTableCommand(workbook, command);
      case "removeTable":
        return applyRemoveTableCommand(workbook, command);
      case "setWorkbookTableStyles":
        return applySetWorkbookTableStylesCommand(workbook, command);
      case "setWorkbookPivotTableStyles":
        return applySetWorkbookPivotTableStylesCommand(workbook, command);
      case "restoreTableTransaction":
        return applyRestoreTableTransactionCommand(workbook, command);
      case "moveCellRange":
        return applyMoveCellRangeCommand(workbook, command);
      case "insertCells":
      case "deleteCells":
        return applyCellShiftCommand(workbook, command);
      case "restoreCellShift":
        return applyRestoreCellShiftCommand(workbook, command);
      case "batchDeleteSheetAxes":
        return applyBatchDeleteSheetAxesCommand(workbook, command);
      case "applyCellStyle":
        return applyCellStyleCommand(workbook, command);
      case "setCellHyperlink":
        return applySetCellHyperlinkCommand(workbook, command);
      case "setCellSparklines":
        return applySetCellSparklinesCommand(workbook, command);
      case "setCellNotes":
        return applySetCellNotesCommand(workbook, command);
      case "markCellHyperlinkVisited":
        return applyMarkCellHyperlinkVisitedCommand(workbook, command);
      case "applyCellBorders":
        return applyCellBordersCommand(workbook, command);
      case "applyCellFormat":
        return applyCellFormatCommand(workbook, command);
      case "adjustCellNumberFormatDecimals":
        return applyAdjustCellNumberFormatDecimalsCommand(workbook, command);
      case "adjustCellIndent":
        return applyAdjustCellIndentCommand(workbook, command);
      case "restoreCellStyles":
        return applyRestoreCellStylesCommand(workbook, command, options.fromHistory);
      case "resizeSheetDimension":
        return applyResizeSheetDimensionCommand(workbook, command);
      case "resizeSheetDimensions":
        return applyResizeSheetDimensionsCommand(workbook, command);
      case "setSheetDimensionSizes":
        return applySetSheetDimensionSizesCommand(workbook, command);
      case "setSheetDimensionHidden":
        return applySetSheetDimensionHiddenCommand(workbook, command);
      case "resetSheetDimensionSizes":
        return applyResetSheetDimensionSizesCommand(workbook, command);
      case "setSheetDefaultColumnWidth":
        return applySetSheetDefaultColumnWidthCommand(workbook, command);
      case "restoreSheetDimensionState":
        return applyRestoreSheetDimensionStateCommand(workbook, command);
      case "setSheetFreezePanes":
        return applySetSheetFreezePanesCommand(workbook, command);
      case "setSheetPageSetup":
        return applySetSheetPageSetupCommand(workbook, command);
      case "setSheetPageDecoration":
        return applySetSheetPageDecorationCommand(workbook, command);
      case "setSheetsWatermark":
        return applySetSheetsWatermarkCommand(workbook, command);
      case "setWorkbookWatermarkPresets":
        return applySetWorkbookWatermarkPresetsCommand(workbook, command);
      case "mergeCells":
        return applyMergeCellsCommand(workbook, command);
      case "unmergeCells":
        return applyUnmergeCellsCommand(workbook, command);
      case "setSheetFilter":
        return applySetSheetFilterCommand(workbook, command);
      case "advancedFilter":
        return applyAdvancedFilterCommand(workbook, command);
      case "sortSheetRange":
        return applySortSheetRangeCommand(workbook, command);
      case "splitColumn":
        return applySplitColumnCommand(workbook, command);
      case "removeDuplicates":
        return applyRemoveDuplicatesCommand(workbook, command);
      case "applySubtotals":
        return applyApplySubtotalsCommand(workbook, command);
      case "removeSubtotals":
        return applyRemoveSubtotalsCommand(workbook, command);
      case "setSheetDataValidations":
        return applySetSheetDataValidationsCommand(workbook, command);
      case "clearSheetDataValidations":
        return applyClearSheetDataValidationsCommand(workbook, command);
      case "setSheetDuplicateRules":
        return applySetSheetDuplicateRulesCommand(workbook, command);
      case "clearSheetDuplicateRules":
        return applyClearSheetDuplicateRulesCommand(workbook, command);
      case "setSheetConditionalFormats":
        return applySetSheetConditionalFormatsCommand(workbook, command);
      case "clearSheetConditionalFormats":
        return applyClearSheetConditionalFormatsCommand(workbook, command);
      case "addSheetOutlineGroup":
        return applyAddSheetOutlineGroupCommand(workbook, command);
      case "removeSheetOutlineGroup":
        return applyRemoveSheetOutlineGroupCommand(workbook, command);
      case "setSheetOutlineGroupCollapsed":
        return applySetSheetOutlineGroupCollapsedCommand(workbook, command);
      case "setSheetOutlineGroupsCollapsed":
        return applySetSheetOutlineGroupsCollapsedCommand(workbook, command);
      case "setSheetOutlineLevel":
        return applySetSheetOutlineLevelCommand(workbook, command);
      case "clearSheetOutline":
        return applyClearSheetOutlineCommand(workbook, command);
      case "ungroupSheetRange":
        return applyUngroupSheetRangeCommand(workbook, command);
      case "setSheetDrawings":
        return applySetSheetDrawingsCommand(workbook, command);
      case "replaceSheetDrawingCollections":
        return applyReplaceSheetDrawingCollectionsCommand(workbook, command);
      case "setSheetFloatingImages":
        return applySetSheetFloatingImagesCommand(workbook, command);
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
      case "restorePictureCellConversion":
        return applyRestorePictureCellConversionCommand(workbook, command);
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
