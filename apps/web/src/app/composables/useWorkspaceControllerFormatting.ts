import type { ComputedRef, Ref } from "vue";
import { doMergedCellRangesIntersect } from "@sheetcraft/core";
import {
  getCellMatrixSize,
  tileCellMatrix,
  type CellValueMatrix,
} from "@sheetcraft/core/clipboard";
import {
  createAdjustCellIndentCommand,
  createAdjustCellNumberFormatDecimalsCommand,
  createApplyCellBordersCommand,
  createApplyCellFormatCommand,
  createApplyCellStyleCommand,
  createClearSheetConditionalFormatsCommand,
  createConvertCellValueTypeCommand,
  createMergeCellsCommand,
  createSetSheetConditionalFormatsCommand,
  createUnmergeCellsCommand,
  type CellFormatChange,
  type CellMergeMode,
  type CellValueConversionMode,
  type CellValueConversionOptions,
  type WorkbookCommand,
  type WorkbookOperation,
} from "@sheetcraft/core/commands";
import {
  cloneConditionalFormatRule,
  type SheetConditionalFormatRule,
} from "@sheetcraft/core/conditional-formatting";
import type { ExcelDateSystem } from "@sheetcraft/core/formula";
import { formatComputedValueForDisplay } from "@sheetcraft/core/input";
import type {
  CellBorderAction,
  CellBorderFormatPatch,
  CellStylePatch,
} from "@sheetcraft/core/style";
import {
  getSelectionBorderState,
  getSelectionCellStyleState,
  isCellStyleRangeSupported,
  type SelectionBorderState,
  type SelectionCellStyleState,
} from "@sheetcraft/core/style-state";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  getCellFormatBorderCapabilities,
  type CellFormatBorderCapabilities,
} from "../../modules/cell-format/border-capabilities";
import type { ConditionalFormatSheetChange } from "../../modules/conditional-formatting/conditional-format-manager-types";
import type { MergeCellsState } from "../../modules/home-tools/components/data-tool-state";
import {
  createGridClipboardRowVisibility,
  createVisibleGridPastePlan,
  getVisibleClipboardRows,
  rangeIntersectsMergedCells,
} from "../../modules/sheet-grid/gridClipboardRows";
import {
  getCellRangeStyles,
  type CellStyleMatrix,
  type GridPastePayload,
  type GridPasteResult,
} from "../../modules/sheet-grid/useGridClipboard";
import type { MessageKey, MessageParams } from "../../shared/i18n";

export type FormatPainterSource = {
  values: CellValueMatrix;
  styles: CellStyleMatrix;
};

export type CellFormatSelection = {
  sheetId: string;
  range: CellRange;
  generation: number;
  state: SelectionCellStyleState;
  borderState: SelectionBorderState;
  borderCapabilities: CellFormatBorderCapabilities;
  mergeState: {
    canMerge: boolean;
    canUnmerge: boolean;
    merged: "on" | "off" | "mixed";
  };
  sampleValue: string | number | boolean | null;
  dateSystem: ExcelDateSystem;
};

export type ConditionalFormattingSelection = {
  sheetId: string;
  generation: number;
  range: CellRange;
  rules: SheetConditionalFormatRule[];
  sampleValue?: string | number | boolean | null;
};

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

type WorkspaceControllerFormattingOptions = {
  getWorkbook: () => Workbook;
  activeSheet: ComputedRef<Sheet>;
  activeAddress: ComputedRef<CellAddress>;
  activeSelectionRange: ComputedRef<CellRange>;
  activeSheetEvaluator: ComputedRef<SheetEvaluator>;
  isFormattingSupported: ComputedRef<boolean>;
  mergeState: ComputedRef<MergeCellsState>;
  workbookGeneration: Ref<number>;
  formatPainterSource: Ref<FormatPainterSource | undefined>;
  locale: Ref<string>;
  getCellFormatMergeState: (sheet: Sheet, range: CellRange) => CellFormatSelection["mergeState"];
  execute: (command: WorkbookCommand, operation?: WorkbookOperation) => boolean;
  executeFeature: (
    createCommand: () => WorkbookCommand,
    operation: WorkbookOperation,
    unavailableKey: MessageKey,
  ) => boolean;
  pasteCells: (payload: GridPastePayload) => GridPasteResult;
  flushPendingGridEdit: () => boolean;
  clearGridClipboard: () => void;
  focusGrid: () => void;
  showWorkspaceStatus: (status: FeedbackState) => void;
  clearWorkspaceStatus: () => void;
};

/** Owns cell merge, styling, borders, number conversion, conditional formatting, and format-painter commands for WorkspaceController. */
export function useWorkspaceControllerFormatting(options: WorkspaceControllerFormattingOptions) {
  const {
    activeSheet,
    activeAddress,
    activeSelectionRange,
    activeSheetEvaluator,
    isFormattingSupported,
    mergeState,
    workbookGeneration,
    formatPainterSource,
    locale,
  } = options;

  function mergeSelection(mode: CellMergeMode = "all"): void {
    if (!(mergeState.value.availableModes?.[mode] ?? mergeState.value.canMerge)) {
      options.showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
      return;
    }
    if (
      options.executeFeature(
        () =>
          createMergeCellsCommand(
            activeSheet.value.id,
            activeSelectionRange.value,
            mode,
            mode === "content" ? locale.value : undefined,
          ),
        "cells.merge",
        "workspace.mergeUnavailable",
      )
    ) {
      options.clearGridClipboard();
    }
  }

  function unmergeSelection(): void {
    if (!mergeState.value.canUnmerge) {
      options.showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
      return;
    }
    if (
      options.executeFeature(
        () => createUnmergeCellsCommand(activeSheet.value.id, activeSelectionRange.value),
        "cells.unmerge",
        "workspace.mergeUnavailable",
      )
    ) {
      options.clearGridClipboard();
    }
  }

  function applyCellStyle(patch: CellStylePatch): void {
    if (!isFormattingSupported.value) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    options.execute(
      createApplyCellStyleCommand(activeSheet.value.id, activeSelectionRange.value, patch),
      "format.cells",
    );
    options.clearWorkspaceStatus();
  }

  function convertNumberType(
    mode: CellValueConversionMode,
    scope: "cell" | "selection" | "sheet" = "selection",
    conversionOptions?: CellValueConversionOptions,
  ): void {
    if (activeSheet.value.properties.protected || !options.flushPendingGridEdit()) return;
    try {
      const range =
        scope === "cell"
          ? { start: activeAddress.value, end: activeAddress.value }
          : scope === "sheet"
            ? {
                start: { row: 0, column: 0 },
                end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
              }
            : activeSelectionRange.value;
      const command = createConvertCellValueTypeCommand(
        activeSheet.value,
        range,
        mode,
        conversionOptions,
      );
      if (command.changes.length === 0) {
        options.showWorkspaceStatus({ key: "workspace.conversionNoMatch" });
        return;
      }
      if (options.execute(command, "cells.edit")) {
        options.showWorkspaceStatus({
          key: "workspace.conversionCompleted",
          params: { count: command.changes.length },
        });
      }
    } catch {
      options.showWorkspaceStatus({ key: "workspace.conversionUnavailable" });
    }
  }

  function applyCellBorders(action: CellBorderAction): void {
    if (!isFormattingSupported.value) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    options.execute(
      createApplyCellBordersCommand(activeSheet.value.id, activeSelectionRange.value, action),
      "format.borders",
    );
    options.clearWorkspaceStatus();
  }

  function captureCellFormatSelection(): CellFormatSelection | undefined {
    if (
      !isFormattingSupported.value ||
      (activeSheet.value.properties.protected && !activeSheet.value.protection?.formatCells)
    )
      return;
    const sheet = activeSheet.value;
    const range = activeSelectionRange.value;
    const value = activeSheetEvaluator.value.getComputedValue(activeAddress.value);
    return {
      sheetId: sheet.id,
      range: { start: { ...range.start }, end: { ...range.end } },
      generation: workbookGeneration.value,
      state: getSelectionCellStyleState(sheet, range),
      borderState: getSelectionBorderState(sheet, range),
      borderCapabilities: getCellFormatBorderCapabilities(range, sheet.mergedCells),
      mergeState: {
        ...options.getCellFormatMergeState(sheet, range),
        ...(sheet.properties.protected ? { canMerge: false, canUnmerge: false } : {}),
      },
      sampleValue:
        typeof value === "object" && value !== null ? formatComputedValueForDisplay(value) : value,
      dateSystem: options.getWorkbook().dateSystem,
    };
  }

  function captureConditionalFormattingSelection(): ConditionalFormattingSelection | undefined {
    if (activeSheet.value.properties.protected) return;
    const range = activeSelectionRange.value;
    const value = activeSheetEvaluator.value.getComputedValue(range.start);
    return {
      sheetId: activeSheet.value.id,
      generation: workbookGeneration.value,
      sampleValue:
        typeof value === "object" && value !== null ? formatComputedValueForDisplay(value) : value,
      range: { start: { ...range.start }, end: { ...range.end } },
      rules: (activeSheet.value.conditionalFormats ?? []).map(cloneConditionalFormatRule),
    };
  }

  function setConditionalFormats(
    rules: readonly SheetConditionalFormatRule[],
    target: ConditionalFormattingSelection,
  ): boolean {
    const sheet = options.getWorkbook().sheets.get(target.sheetId);
    if (target.generation !== workbookGeneration.value || !sheet || sheet.properties.protected) {
      return false;
    }
    options.execute(createSetSheetConditionalFormatsCommand(target.sheetId, rules), "format.cells");
    return true;
  }

  /**
   * Applies the manager's changed sheets as individual Core commands. Validate and
   * construct every command before mutation so a later protected/missing sheet
   * cannot leave an earlier sheet saved on its own.
   */
  function setConditionalFormatsForSheets(
    changes: readonly ConditionalFormatSheetChange[],
    generation: number,
  ): boolean {
    if (generation !== workbookGeneration.value) return false;

    const commands: WorkbookCommand[] = [];
    const workbook = options.getWorkbook();
    for (const change of changes) {
      const sheet = workbook.sheets.get(change.sheetId);
      if (!sheet || sheet.properties.protected) return false;
      if (JSON.stringify(sheet.conditionalFormats ?? []) === JSON.stringify(change.rules)) continue;
      commands.push(createSetSheetConditionalFormatsCommand(change.sheetId, change.rules));
    }

    for (const command of commands) options.execute(command, "format.cells");
    return true;
  }

  function clearConditionalFormats(scope: "selection" | "sheet"): boolean {
    const sheet = activeSheet.value;
    if (sheet.properties.protected) return false;
    return options.execute(
      createClearSheetConditionalFormatsCommand(
        sheet.id,
        scope === "selection" ? activeSelectionRange.value : undefined,
      ),
      "format.cells",
    );
  }

  function applyCellFormat(change: CellFormatChange, target: CellFormatSelection): boolean {
    const sheet = options.getWorkbook().sheets.get(target.sheetId);
    if (
      target.generation !== workbookGeneration.value ||
      !sheet ||
      (sheet.properties.protected && !sheet.protection?.formatCells)
    ) {
      return false;
    }
    if (!isCellStyleRangeSupported(target.range)) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return false;
    }
    if (change.merge === true && !target.mergeState.canMerge) {
      options.showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
      return false;
    }
    if (
      Object.keys(change.style ?? {}).length === 0 &&
      (change.borders?.length ?? 0) === 0 &&
      Object.keys(change.borderFormat ?? {}).length === 0 &&
      change.merge === undefined
    )
      return true;
    const mergeWillChange =
      change.merge !== undefined &&
      (change.merge
        ? !sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, target.range))
        : sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, target.range)));
    const changed = options.execute(
      createApplyCellFormatCommand(target.sheetId, target.range, change),
      "format.cells",
    );
    if (changed && mergeWillChange) options.clearGridClipboard();
    options.clearWorkspaceStatus();
    return true;
  }

  function updateBorderFormat(patch: CellBorderFormatPatch): void {
    if (!isFormattingSupported.value) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    options.execute(
      createApplyCellFormatCommand(activeSheet.value.id, activeSelectionRange.value, {
        borderFormat: patch,
      }),
      "format.borders",
    );
    options.clearWorkspaceStatus();
  }

  function adjustNumberFormatDecimals(delta: -1 | 1): void {
    if (!isFormattingSupported.value) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    options.execute(
      createAdjustCellNumberFormatDecimalsCommand(
        activeSheet.value.id,
        activeSelectionRange.value,
        delta,
      ),
      "format.cells",
    );
    options.clearWorkspaceStatus();
  }

  function adjustIndent(delta: -1 | 1): void {
    if (!isFormattingSupported.value) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    options.execute(
      createAdjustCellIndentCommand(activeSheet.value.id, activeSelectionRange.value, delta),
      "format.cells",
    );
    options.clearWorkspaceStatus();
  }

  function cancelFormatPainter(): void {
    formatPainterSource.value = undefined;
    options.clearWorkspaceStatus();
  }

  function activateFormatPainter(): void {
    if (formatPainterSource.value) {
      cancelFormatPainter();
      return;
    }
    if (!isFormattingSupported.value) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    const sheet = activeSheet.value;
    const range = activeSelectionRange.value;
    const rows = getVisibleClipboardRows(
      createGridClipboardRowVisibility(sheet, activeSheetEvaluator.value),
      range,
    );
    if (!rows?.length || rangeIntersectsMergedCells(sheet, range)) {
      options.showWorkspaceStatus({
        key: rows?.length ? "clipboard.mergedRangeUnsupported" : "clipboard.noVisibleCells",
      });
      return;
    }
    const rowRanges = rows.map((row) => ({
      start: { row, column: range.start.column },
      end: { row, column: range.end.column },
    }));
    const styles = rowRanges.flatMap((rowRange) => getCellRangeStyles(sheet, rowRange));
    formatPainterSource.value = {
      values: styles.map((row) => row.map(() => null)),
      styles,
    };
    options.clearWorkspaceStatus();
    options.focusGrid();
  }

  function applyFormatPainterTarget(range: CellRange): void {
    const source = formatPainterSource.value;
    if (!source) {
      return;
    }
    if (!isCellStyleRangeSupported(range)) {
      options.showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    const plan = createVisibleGridPastePlan(
      source.values,
      range,
      range.start,
      createGridClipboardRowVisibility(activeSheet.value, activeSheetEvaluator.value),
    );
    if (!plan) {
      options.showWorkspaceStatus({ key: "workspace.formatPainterRangeMismatch" });
      return;
    }
    const result = options.pasteCells({
      kind: "formats",
      plan,
      styles: tileCellMatrix(source.styles, getCellMatrixSize(plan.values)),
    });
    if (!result.ok) {
      options.showWorkspaceStatus({ key: `clipboard.${result.reason}` });
      return;
    }
    formatPainterSource.value = undefined;
    options.clearWorkspaceStatus();
  }

  return {
    mergeSelection,
    unmergeSelection,
    applyCellStyle,
    convertNumberType,
    applyCellBorders,
    captureCellFormatSelection,
    captureConditionalFormattingSelection,
    setConditionalFormats,
    setConditionalFormatsForSheets,
    clearConditionalFormats,
    applyCellFormat,
    updateBorderFormat,
    adjustNumberFormatDecimals,
    adjustIndent,
    activateFormatPainter,
    cancelFormatPainter,
    applyFormatPainterTarget,
  };
}
