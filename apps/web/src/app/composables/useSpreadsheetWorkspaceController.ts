import {
  computed,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import {
  createAddSheetCommand,
  createAdjustCellIndentCommand,
  createAdjustCellNumberFormatDecimalsCommand,
  createApplyCellBordersCommand,
  createApplyCellFormatCommand,
  createApplyCellStyleCommand,
  createClearCellRangeCommand,
  createClearSheetFilterCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createInsertSheetAxisCommand,
  createMergeCellsCommand,
  createMoveSheetCommand,
  createMoveSheetAxisCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetCellContentCommand,
  createSetFloatingImageCommand,
  createDeleteFloatingImageCommand,
  createConvertFloatingImageToCellCommand,
  createConvertCellImageToFloatingCommand,
  createSetSheetFilterCriteriaCommand,
  createSetSheetFreezePanesCommand,
  createSetSheetPropertiesCommand,
  createSortSheetRangeCommand,
  createUnmergeCellsCommand,
  getCellMergeModeAvailability,
  getSheetFilterColumnDistinctValues,
  getSheetFilterValueKey,
  type SortDirection,
  type CellFormatChange,
  type CellMergeMode,
  type WorkbookCommand,
  type WorkbookOperation,
} from "@idea10/core/commands";
import { getCellMatrixSize, tileCellMatrix, type CellValueMatrix } from "@idea10/core/clipboard";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import {
  createWorkbookSession,
  createWorkbookHistory,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "@idea10/core/history";
import {
  formatCellContentForInput,
  formatComputedValueForDisplay,
  parseCellContent,
} from "@idea10/core/input";
import { isTextCellNumberFormat } from "@idea10/core/number-format";
import type { ExcelDateSystem } from "@idea10/core/formula";
import { createAutoSumFormula, createFormulaError } from "@idea10/core/formula";
import { doMergedCellRangesIntersect } from "@idea10/core";
import { WorkbookDomainError } from "@idea10/core/errors";
import type { IdFactory } from "@idea10/core/runtime";
import { findCellByText, type SheetSearchDirection } from "@idea10/core/search";
import { getSelectionSummary } from "@idea10/core/selection-summary";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import {
  createDefaultSelectionCellStyleState,
  getSelectionCellStyleState,
  getSelectionBorderState,
  isCellStyleRangeSupported,
  type SelectionCellStyleState,
  type SelectionBorderState,
} from "@idea10/core/style-state";
import {
  getActiveSheet,
  createWorkbookEvaluator,
  getCellContent,
  getCellStyle,
  getWorkbookSheets,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  setActiveSheet,
  type FloatingImage,
  type ImageTransform,
  type CellAddress,
  type CellRange,
  type SheetFilter,
  type SheetFilterValue,
  type SheetDimensionAxis,
  type SheetProperties,
  type Sheet,
  type Workbook,
} from "@idea10/core/workbook";
import {
  getSelectionMode,
  getSelectionRange,
  type SelectionMode,
} from "@idea10/sheet-engine/selection";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
import type { AxisMovePayload } from "../../modules/sheet-grid/composables/useAxisMoveDrag";
import {
  getCellRangeStyles,
  type CellStyleMatrix,
  type GridClipboardFeedback,
  type GridPastePayload,
  type GridPasteResult,
} from "../../modules/sheet-grid/useGridClipboard";
import {
  createGridPasteCommand,
  GridPasteError,
} from "../../modules/sheet-grid/createGridPasteCommand";
import {
  createGridClipboardRowVisibility,
  createVisibleGridPastePlan,
  getVisibleClipboardRows,
  rangeIntersectsMergedCells,
} from "../../modules/sheet-grid/gridClipboardRows";
import { useAppI18n, type MessageKey, type MessageParams } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { useDeferredSelectionSnapshot } from "../../modules/workbook/composables/useDeferredSelectionSnapshot";
import type {
  FilterValueKey,
  HomeDataToolState,
  MergeCellsState,
} from "../../modules/home-tools/components/data-tool-state";
import {
  getCellFormatBorderCapabilities,
  type CellFormatBorderCapabilities,
} from "../../modules/cell-format/border-capabilities";

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

type FormatPainterSource = {
  values: CellValueMatrix;
  styles: CellStyleMatrix;
};

export type SheetGridNavigator = {
  clearClipboard?(): void;
  flushPendingEdit?(): boolean;
  hasPendingEdit?(): boolean;
  focusGrid(): void;
  handleReferenceKeydown?(event: KeyboardEvent): boolean;
  navigateToCell(address: CellAddress): void;
  scrollHorizontally?(position: number, allowExpansion?: boolean): void;
  fitSelectionToViewport?(): void;
};

export type SpreadsheetWorkspaceControllerOptions = {
  idFactory?: IdFactory;
  statusDuration?: number;
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

export function useSpreadsheetWorkspaceController(
  options: SpreadsheetWorkspaceControllerOptions = {},
) {
  const { t, locale } = useAppI18n();
  const idFactory = options.idFactory ?? createBrowserIdFactory();
  const session = reactive(createWorkbookSession({ idFactory })) as WorkbookSession;
  const viewStates = reactive(new Map<string, SheetGridViewState>());
  const gridRef = shallowRef<SheetGridNavigator>();
  const workbookVersion = ref(0);
  const calculationVersion = ref(0);
  const workbookGeneration = ref(0);
  const selectionDragging = ref(false);
  const searchQuery = ref("");
  const formatPainterSource = ref<FormatPainterSource>();
  const workspaceStatus = ref<FeedbackState>();
  let workspaceStatusTimer: ReturnType<typeof setTimeout> | undefined;

  const activeSheet = computed(() => {
    void workbookVersion.value;
    return getActiveSheet(session.workbook);
  });
  const sheets = computed(() => {
    void workbookVersion.value;
    return getWorkbookSheets(session.workbook);
  });
  const activeSheetViewState = computed(() => viewStates.get(activeSheet.value.id));
  const activeAddress = computed(
    () => activeSheetViewState.value?.selection.active ?? { row: 0, column: 0 },
  );
  const activeAddressLabel = computed(() => formatCellAddress(activeAddress.value));
  const activeCellInput = computed(() =>
    formatCellContentForInput(getCellContent(activeSheet.value, activeAddress.value)),
  );
  const activeSheetEvaluator = computed(() => {
    void workbookVersion.value;
    void calculationVersion.value;
    return createWorkbookEvaluator(session.workbook, activeSheet.value.id);
  });
  const activeSelectionRange = computed<CellRange>(() => {
    const selection = activeSheetViewState.value?.selection;
    return selection
      ? getSelectionRange(selection)
      : { start: { ...activeAddress.value }, end: { ...activeAddress.value } };
  });
  const activeSelectionMode = computed<SelectionMode>(() => getSelectionModeValue());
  const deferredSelection = useDeferredSelectionSnapshot({
    activeAddress,
    isDragging: selectionDragging,
    range: activeSelectionRange,
    selectionMode: activeSelectionMode,
  });
  const toolbarSelection = deferredSelection;
  const isFormattingSupported = computed(() =>
    isCellStyleRangeSupported(activeSelectionRange.value),
  );
  const activeSelectionStyle = computed(() =>
    isCellStyleRangeSupported(toolbarSelection.value.range)
      ? getSelectionCellStyleState(activeSheet.value, toolbarSelection.value.range)
      : createDefaultSelectionCellStyleState(),
  );
  const activeSelectionSummary = computed(() =>
    getSelectionSummary(
      activeSheet.value,
      toolbarSelection.value.range,
      activeSheetEvaluator.value,
    ),
  );
  const dataToolState = computed<HomeDataToolState>(() => {
    const sheet = activeSheet.value;
    const selection = toolbarSelection.value;
    const filterRange = getFilterTargetRange(
      selection.range,
      selection.activeAddress,
      selection.mode,
    );
    const filterEnabled = Boolean(
      filterRange &&
      !sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, filterRange)),
    );
    const options = filterEnabled
      ? getSheetFilterColumnDistinctValues(
          sheet,
          filterRange!,
          selection.activeAddress.column,
          activeSheetEvaluator.value,
        ).map((key) => ({ key, label: formatFilterValueLabel(key) }))
      : [];
    const activeFilter =
      sheet.filter && filterRange && areRangesEqual(sheet.filter.range, filterRange)
        ? sheet.filter
        : null;
    const criterion = activeFilter?.columns.find(
      (column) => column.column === selection.activeAddress.column,
    );
    const sortRange = getSortTargetRange(selection.range, selection.activeAddress, selection.mode);
    const sortIntersectsFilter = Boolean(
      sortRange && sheet.filter && doMergedCellRangesIntersect(sortRange, sheet.filter.range),
    );
    const filterDataRange = sheet.filter ? getFilterDataRange(sheet.filter.range) : null;
    return {
      activeCell: { ...selection.activeAddress },
      sortEnabled: Boolean(
        sortRange &&
        !sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, sortRange)) &&
        (!sortIntersectsFilter || (filterDataRange && areRangesEqual(sortRange, filterDataRange))),
      ),
      filterEnabled,
      freezeEnabled: true,
      filter: {
        active: activeFilter !== null,
        options,
        appliedKeys: (criterion?.allowedValues ?? options.map((option) => option.key)).map(
          (value) => ({
            ...value,
          }),
        ),
      },
      freeze: { ...sheet.freezePanes },
    };
  });
  const mergeState = computed<MergeCellsState>(() => {
    const sheet = activeSheet.value;
    const selection = toolbarSelection.value;
    const range = selection.range;
    const cellSelection = selection.mode === "cells";
    const intersectsMerge = sheet.mergedCells.some((merged) =>
      doMergedCellRangesIntersect(merged, range),
    );
    const crossesFreeze =
      (range.start.row < sheet.freezePanes.rows && range.end.row >= sheet.freezePanes.rows) ||
      (range.start.column < sheet.freezePanes.columns &&
        range.end.column >= sheet.freezePanes.columns);
    const intersectsFilter = Boolean(
      sheet.filter && doMergedCellRangesIntersect(sheet.filter.range, range),
    );
    const hasMultipleCells =
      range.start.row !== range.end.row || range.start.column !== range.end.column;
    const canUseModes =
      cellSelection &&
      hasMultipleCells &&
      isCellStyleRangeSupported(range) &&
      !sheet.properties.protected;
    const availableModes: Record<CellMergeMode, boolean> = {
      all:
        canUseModes &&
        getCellMergeModeAvailability(sheet, range, "all", activeSheetEvaluator.value),
      center:
        canUseModes &&
        getCellMergeModeAvailability(sheet, range, "center", activeSheetEvaluator.value),
      "same-columns":
        canUseModes &&
        getCellMergeModeAvailability(sheet, range, "same-columns", activeSheetEvaluator.value),
      "same-rows":
        canUseModes &&
        getCellMergeModeAvailability(sheet, range, "same-rows", activeSheetEvaluator.value),
      content:
        canUseModes &&
        getCellMergeModeAvailability(sheet, range, "content", activeSheetEvaluator.value),
      across:
        canUseModes &&
        getCellMergeModeAvailability(sheet, range, "across", activeSheetEvaluator.value),
    };
    return {
      canMerge:
        cellSelection &&
        hasMultipleCells &&
        !intersectsMerge &&
        !crossesFreeze &&
        !intersectsFilter,
      canUnmerge: cellSelection && intersectsMerge,
      availableModes,
    };
  });

  function getCellFormatMergeState(
    sheet: Sheet,
    range: CellRange,
  ): CellFormatSelection["mergeState"] {
    const intersecting = sheet.mergedCells.filter((merged) =>
      doMergedCellRangesIntersect(merged, range),
    );
    const exactMerge = intersecting.some((merged) => areRangesEqual(merged, range));
    return {
      canMerge: mergeState.value.canMerge,
      canUnmerge: mergeState.value.canUnmerge,
      merged: exactMerge ? "on" : intersecting.length > 0 ? "mixed" : "off",
    };
  }
  const workspaceStatusText = computed(() =>
    workspaceStatus.value ? t(workspaceStatus.value.key, workspaceStatus.value.params) : "",
  );
  const formatPainterActive = computed(() => formatPainterSource.value !== undefined);

  function collectCommandSheetIds(command: WorkbookCommand, sheetIds: Set<string>): void {
    if (command.type === "setCellContents") {
      for (const change of command.changes) {
        sheetIds.add(change.sheetId);
      }
    } else if (command.type === "addSheet") {
      sheetIds.add(command.sheet.id);
    } else if ("sheetId" in command) {
      sheetIds.add(command.sheetId);
    }
  }

  function pruneViewStates(): void {
    const retainedSheetIds = new Set(session.workbook.sheets.keys());
    for (const entry of [...session.history.undoStack, ...session.history.redoStack]) {
      collectCommandSheetIds(entry.command, retainedSheetIds);
    }
    for (const sheetId of viewStates.keys()) {
      if (!retainedSheetIds.has(sheetId)) {
        viewStates.delete(sheetId);
      }
    }
  }

  function execute(command: WorkbookCommand, operation?: WorkbookOperation): boolean {
    let changed: boolean;
    try {
      changed = executeWorkbookCommand(session, command, operation);
    } catch (error) {
      if (error instanceof WorkbookDomainError && error.data.code === "sheet_protected") {
        return false;
      }
      throw error;
    }
    if (changed) {
      workbookVersion.value += 1;
      pruneViewStates();
    }
    return changed;
  }

  function clearWorkspaceStatus(): void {
    if (workspaceStatusTimer !== undefined) {
      clearTimeout(workspaceStatusTimer);
      workspaceStatusTimer = undefined;
    }
    workspaceStatus.value = undefined;
  }

  function showWorkspaceStatus(status: FeedbackState): void {
    clearWorkspaceStatus();
    workspaceStatus.value = status;
    workspaceStatusTimer = setTimeout(() => {
      workspaceStatus.value = undefined;
      workspaceStatusTimer = undefined;
    }, options.statusDuration ?? 2_800);
  }

  function getSelectionModeValue() {
    return activeSheetViewState.value
      ? getSelectionMode(activeSheetViewState.value.selection)
      : "cells";
  }

  function isAddressInRange(address: CellAddress, range: CellRange): boolean {
    return (
      address.row >= range.start.row &&
      address.row <= range.end.row &&
      address.column >= range.start.column &&
      address.column <= range.end.column
    );
  }

  function areRangesEqual(left: CellRange, right: CellRange): boolean {
    return (
      left.start.row === right.start.row &&
      left.start.column === right.start.column &&
      left.end.row === right.end.row &&
      left.end.column === right.end.column
    );
  }

  function getFilterDataRange(range: CellRange): CellRange {
    return {
      start: { row: range.start.row + 1, column: range.start.column },
      end: { ...range.end },
    };
  }

  function getFilterTargetRange(
    selectionRange = activeSelectionRange.value,
    selectionAddress = activeAddress.value,
    selectionMode = getSelectionModeValue(),
  ): CellRange | null {
    if (selectionMode !== "cells") return null;
    const filter = activeSheet.value.filter;
    if (filter && isAddressInRange(selectionAddress, filter.range)) {
      return filter.range;
    }
    return selectionRange.end.row > selectionRange.start.row ? selectionRange : null;
  }

  function getSortTargetRange(
    selectionRange = activeSelectionRange.value,
    selectionAddress = activeAddress.value,
    selectionMode = getSelectionModeValue(),
  ): CellRange | null {
    if (selectionMode !== "cells") return null;
    const filter = activeSheet.value.filter;
    if (filter && isAddressInRange(selectionAddress, filter.range)) {
      const range = getFilterDataRange(filter.range);
      return range.end.row > range.start.row ? range : null;
    }
    return selectionRange.end.row > selectionRange.start.row ? selectionRange : null;
  }

  function formatFilterValueLabel(value: SheetFilterValue): string {
    if (value.kind === "blank") return t("cell.blank");
    if (value.kind === "string" && value.value === "") return '""';
    return formatComputedValueForDisplay(
      value.kind === "error" ? createFormulaError(value.code) : value.value,
    );
  }

  function executeFeature(
    createCommand: () => WorkbookCommand,
    operation: WorkbookOperation,
    failureKey: MessageKey,
  ): boolean {
    try {
      const changed = execute(createCommand(), operation);
      clearWorkspaceStatus();
      return changed;
    } catch {
      showWorkspaceStatus({ key: failureKey });
      return false;
    }
  }

  function commitCell(payload: { address: CellAddress; input: string; sheetId?: string }): void {
    const sheetId = payload.sheetId ?? activeSheet.value.id;
    const sheet = session.workbook.sheets.get(sheetId);
    if (!sheet) return;
    execute(
      createSetCellContentCommand(
        sheetId,
        payload.address,
        parseCellContent(payload.input, {
          asText: isTextCellNumberFormat(getCellStyle(sheet, payload.address)?.numberFormat),
        }),
      ),
      "cells.edit",
    );
    clearWorkspaceStatus();
  }

  function setCellImage(payload: {
    sheetId: string;
    address: CellAddress;
    assetId: string;
    altText: string;
    transform?: ImageTransform;
  }): void {
    execute(
      createSetCellContentCommand(payload.sheetId, payload.address, {
        kind: "image",
        image: {
          assetId: payload.assetId,
          altText: payload.altText,
          ...(payload.transform ? { transform: payload.transform } : {}),
        },
      }),
      "cells.edit",
    );
  }

  function setFloatingImage(image: FloatingImage, sheetId = activeSheet.value.id): void {
    execute(createSetFloatingImageCommand(sheetId, image));
  }

  function deleteFloatingImage(id: string): void {
    execute(createDeleteFloatingImageCommand(activeSheet.value.id, id));
  }

  function convertFloatingImageToCell(id: string): void {
    try {
      if (execute(createConvertFloatingImageToCellCommand(activeSheet.value.id, id))) {
        showWorkspaceStatus({ key: "image.converted" });
      }
    } catch {
      showWorkspaceStatus({ key: "image.convertFailed" });
    }
  }

  function convertCellImageToFloating(payload: {
    sheetId: string;
    address: CellAddress;
    imageId: string;
    size: { width: number; height: number };
  }): void {
    execute(
      createConvertCellImageToFloatingCommand(
        payload.sheetId,
        payload.address,
        payload.imageId,
        payload.size,
      ),
    );
  }

  function pasteCells(payload: GridPastePayload): GridPasteResult {
    if (activeSheet.value.properties.protected) return { ok: false, reason: "pasteRejected" };
    try {
      execute(
        createGridPasteCommand(activeSheet.value, payload),
        payload.kind === "all" && payload.moveSource ? "cells.move" : "cells.paste",
      );
      clearWorkspaceStatus();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof GridPasteError ? error.reason : "pasteRejected",
      };
    }
  }

  function showClipboardFeedback(feedback: GridClipboardFeedback): void {
    showWorkspaceStatus({ key: `clipboard.${feedback}` });
  }

  function clearCells(range: CellRange): void {
    execute(createClearCellRangeCommand(activeSheet.value.id, range), "cells.clear");
  }

  function autoSum(): void {
    const target = activeAddress.value;
    const evaluator = activeSheetEvaluator.value;
    const formula = createAutoSumFormula(target, evaluator.getComputedValue);
    if (!formula) {
      showWorkspaceStatus({ key: "workspace.autoSumUnavailable" });
      return;
    }
    if (
      execute(
        createSetCellContentCommand(activeSheet.value.id, target, {
          kind: "formula",
          formula: { source: formula },
        }),
        "cells.edit",
      )
    ) {
      showWorkspaceStatus({ key: "workspace.autoSumApplied", params: { formula } });
    }
  }

  function sortSelection(direction: SortDirection): void {
    const range = getSortTargetRange();
    if (!range || !dataToolState.value.sortEnabled) {
      showWorkspaceStatus({ key: "workspace.sortUnavailable" });
      return;
    }
    if (
      executeFeature(
        () =>
          createSortSheetRangeCommand(
            activeSheet.value.id,
            range,
            activeAddress.value.column,
            direction,
          ),
        "data.sort",
        "workspace.sortUnavailable",
      )
    ) {
      gridRef.value?.clearClipboard?.();
    }
  }

  function applyFilter(includedKeys: FilterValueKey[]): void {
    const range = getFilterTargetRange();
    if (!range || !dataToolState.value.filterEnabled) {
      showWorkspaceStatus({ key: "workspace.filterUnavailable" });
      return;
    }
    const column = activeAddress.value.column;
    const valuesByKey = new Map<string, SheetFilterValue>();
    for (const value of includedKeys) valuesByKey.set(getSheetFilterValueKey(value), { ...value });
    const allowedValues = [...valuesByKey.values()];
    const options = dataToolState.value.filter.options;
    const allSelected =
      allowedValues.length === options.length &&
      options.every((option) => valuesByKey.has(getSheetFilterValueKey(option.key)));
    const currentFilter = activeSheet.value.filter;
    const columns: SheetFilter["columns"] =
      currentFilter && areRangesEqual(currentFilter.range, range)
        ? currentFilter.columns
            .filter((criterion) => criterion.column !== column)
            .map((criterion) => ({
              column: criterion.column,
              allowedValues: criterion.allowedValues.map((value) => ({ ...value })),
            }))
        : [];
    if (!allSelected) columns.push({ column, allowedValues });
    executeFeature(
      () => createSetSheetFilterCriteriaCommand(activeSheet.value.id, range, columns),
      "data.filter",
      "workspace.filterUnavailable",
    );
  }

  function clearFilter(): void {
    executeFeature(
      () => createClearSheetFilterCommand(activeSheet.value.id),
      "data.filter",
      "workspace.filterUnavailable",
    );
  }

  function freeze(mode: "panes" | "top-row" | "first-column"): void {
    const freezePanes =
      mode === "top-row"
        ? { rows: 1, columns: 0 }
        : mode === "first-column"
          ? { rows: 0, columns: 1 }
          : { rows: activeAddress.value.row, columns: activeAddress.value.column };
    executeFeature(
      () => createSetSheetFreezePanesCommand(activeSheet.value.id, freezePanes),
      "view.freeze",
      "workspace.freezeUnavailable",
    );
  }

  function unfreeze(): void {
    executeFeature(
      () => createSetSheetFreezePanesCommand(activeSheet.value.id, { rows: 0, columns: 0 }),
      "view.freeze",
      "workspace.freezeUnavailable",
    );
  }

  function setFreezePanes(freezePanes: { rows: number; columns: number }): void {
    executeFeature(
      () => createSetSheetFreezePanesCommand(activeSheet.value.id, freezePanes),
      "view.freeze",
      "workspace.freezeUnavailable",
    );
  }

  function mergeSelection(mode: CellMergeMode = "all"): void {
    if (!(mergeState.value.availableModes?.[mode] ?? mergeState.value.canMerge)) {
      showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
      return;
    }
    if (
      executeFeature(
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
      gridRef.value?.clearClipboard?.();
    }
  }

  function unmergeSelection(): void {
    if (!mergeState.value.canUnmerge) {
      showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
      return;
    }
    if (
      executeFeature(
        () => createUnmergeCellsCommand(activeSheet.value.id, activeSelectionRange.value),
        "cells.unmerge",
        "workspace.mergeUnavailable",
      )
    ) {
      gridRef.value?.clearClipboard?.();
    }
  }

  function applyCellStyle(patch: CellStylePatch): void {
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    execute(
      createApplyCellStyleCommand(activeSheet.value.id, activeSelectionRange.value, patch),
      "format.cells",
    );
    clearWorkspaceStatus();
  }

  function applyCellBorders(action: CellBorderAction): void {
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    execute(
      createApplyCellBordersCommand(activeSheet.value.id, activeSelectionRange.value, action),
      "format.borders",
    );
    clearWorkspaceStatus();
  }

  function captureCellFormatSelection(): CellFormatSelection | undefined {
    if (!isFormattingSupported.value || activeSheet.value.properties.protected) return;
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
      mergeState: getCellFormatMergeState(sheet, range),
      sampleValue:
        typeof value === "object" && value !== null ? formatComputedValueForDisplay(value) : value,
      dateSystem: session.workbook.dateSystem,
    };
  }

  function applyCellFormat(change: CellFormatChange, target: CellFormatSelection): boolean {
    const sheet = session.workbook.sheets.get(target.sheetId);
    if (target.generation !== workbookGeneration.value || !sheet || sheet.properties.protected) {
      return false;
    }
    if (!isCellStyleRangeSupported(target.range)) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return false;
    }
    if (change.merge === true && !target.mergeState.canMerge) {
      showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
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
    const changed = execute(
      createApplyCellFormatCommand(target.sheetId, target.range, change),
      "format.cells",
    );
    if (changed && mergeWillChange) gridRef.value?.clearClipboard?.();
    clearWorkspaceStatus();
    return true;
  }

  function updateBorderFormat(patch: CellBorderFormatPatch): void {
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    execute(
      createApplyCellFormatCommand(activeSheet.value.id, activeSelectionRange.value, {
        borderFormat: patch,
      }),
      "format.borders",
    );
    clearWorkspaceStatus();
  }

  function adjustNumberFormatDecimals(delta: -1 | 1): void {
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    execute(
      createAdjustCellNumberFormatDecimalsCommand(
        activeSheet.value.id,
        activeSelectionRange.value,
        delta,
      ),
      "format.cells",
    );
    clearWorkspaceStatus();
  }

  function adjustIndent(delta: -1 | 1): void {
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    execute(
      createAdjustCellIndentCommand(activeSheet.value.id, activeSelectionRange.value, delta),
      "format.cells",
    );
    clearWorkspaceStatus();
  }

  function activateFormatPainter(): void {
    if (formatPainterSource.value) {
      cancelFormatPainter();
      return;
    }
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    const sheet = activeSheet.value;
    const range = activeSelectionRange.value;
    const rows = getVisibleClipboardRows(createGridClipboardRowVisibility(sheet), range);
    if (!rows?.length || rangeIntersectsMergedCells(sheet, range)) {
      showWorkspaceStatus({
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
    clearWorkspaceStatus();
    gridRef.value?.focusGrid();
  }

  function cancelFormatPainter(): void {
    formatPainterSource.value = undefined;
    clearWorkspaceStatus();
  }

  function applyFormatPainterTarget(range: CellRange): void {
    const source = formatPainterSource.value;
    if (!source) {
      return;
    }
    if (!isCellStyleRangeSupported(range)) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    const plan = createVisibleGridPastePlan(
      source.values,
      range,
      range.start,
      createGridClipboardRowVisibility(activeSheet.value),
    );
    if (!plan) {
      showWorkspaceStatus({ key: "workspace.formatPainterRangeMismatch" });
      return;
    }
    const result = pasteCells({
      kind: "formats",
      plan,
      styles: tileCellMatrix(source.styles, getCellMatrixSize(plan.values)),
    });
    if (!result.ok) {
      showWorkspaceStatus({ key: `clipboard.${result.reason}` });
      return;
    }
    formatPainterSource.value = undefined;
    clearWorkspaceStatus();
  }

  function resizeDimension(payload: {
    axis: SheetDimensionAxis;
    index: number;
    size: number;
  }): void {
    execute(
      createResizeSheetDimensionCommand(
        activeSheet.value.id,
        payload.axis,
        payload.index,
        payload.size,
      ),
      "dimensions.resize",
    );
  }

  function insertAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
    execute(
      createInsertSheetAxisCommand(
        activeSheet.value.id,
        payload.axis,
        payload.index,
        payload.count,
      ),
      "structure.insert",
    );
  }

  function deleteAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
    execute(
      createDeleteSheetAxisCommand(
        activeSheet.value.id,
        payload.axis,
        payload.index,
        payload.count,
      ),
      "structure.delete",
    );
  }

  function moveAxis(payload: AxisMovePayload): boolean {
    return executeFeature(
      () =>
        createMoveSheetAxisCommand(
          activeSheet.value.id,
          payload.axis,
          payload.index,
          payload.count,
          payload.toIndex,
        ),
      "structure.move",
      "grid.axisMoveUnavailable",
    );
  }

  function selectSheet(sheetId: string): void {
    if (setActiveSheet(session.workbook, sheetId)) {
      workbookVersion.value += 1;
    }
    clearWorkspaceStatus();
  }

  function updateSheetProperties(payload: {
    sheetId: string;
    patch: Partial<SheetProperties>;
  }): void {
    if (!session.workbook.sheets.has(payload.sheetId)) return;
    execute(createSetSheetPropertiesCommand(session.workbook, payload.sheetId, payload.patch));
    if (activeSheet.value.properties.protected) cancelFormatPainter();
    clearWorkspaceStatus();
  }

  function restoreSheet(sheetId: string): void {
    updateSheetProperties({ sheetId, patch: { hidden: false } });
    selectSheet(sheetId);
  }

  function addSheet(): void {
    execute(
      createAddSheetCommand(session.workbook, { idFactory: session.idFactory }),
      "sheets.add",
    );
    clearWorkspaceStatus();
  }

  function duplicateSheet(sheetId: string): void {
    const command = createDuplicateSheetCommand(session.workbook, sheetId, {
      idFactory: session.idFactory,
    });
    if (execute(command, "sheets.add")) {
      showWorkspaceStatus({
        key: "workspace.sheetDuplicated",
        params: { name: command.sheet.name },
      });
      return;
    }
    clearWorkspaceStatus();
  }

  function renameSheet(payload: { sheetId: string; name: string }): void {
    const normalizedName = payload.name.trim();
    if (!normalizedName) {
      showWorkspaceStatus({ key: "workspace.sheetNameEmpty" });
      return;
    }

    const duplicate = sheets.value.some(
      (sheet) =>
        sheet.id !== payload.sheetId && sheet.name.toLowerCase() === normalizedName.toLowerCase(),
    );
    if (duplicate) {
      showWorkspaceStatus({
        key: "workspace.sheetNameDuplicate",
        params: { name: normalizedName },
      });
      return;
    }

    try {
      execute(createRenameSheetCommand(payload.sheetId, payload.name), "sheets.rename");
      clearWorkspaceStatus();
    } catch {
      showWorkspaceStatus({ key: "workspace.renameFailed" });
    }
  }

  function deleteSheet(sheetId: string): void {
    execute(createDeleteSheetCommand(session.workbook, sheetId), "sheets.delete");
    clearWorkspaceStatus();
  }

  function moveSheet(payload: { sheetId: string; toIndex: number }): void {
    const sheet = session.workbook.sheets.get(payload.sheetId);
    if (!sheet) {
      return;
    }
    if (execute(createMoveSheetCommand(session.workbook, payload.sheetId, payload.toIndex))) {
      showWorkspaceStatus({
        key: "workspace.sheetMoved",
        params: { name: sheet.name, position: payload.toIndex + 1 },
      });
      return;
    }
    clearWorkspaceStatus();
  }

  function areViewSelectionsEqual(
    left: SheetGridViewState["selection"],
    right: SheetGridViewState["selection"],
  ): boolean {
    return (
      left.mode === right.mode &&
      left.active.row === right.active.row &&
      left.active.column === right.active.column &&
      left.anchor.row === right.anchor.row &&
      left.anchor.column === right.anchor.column &&
      left.focus.row === right.focus.row &&
      left.focus.column === right.focus.column
    );
  }

  function updateActiveSheetViewState(viewState: SheetGridViewState): void {
    const next = createSheetGridViewState(viewState);
    const sheetId = activeSheet.value.id;
    const current = viewStates.get(sheetId);
    if (!current) {
      viewStates.set(sheetId, next);
      return;
    }

    if (!areViewSelectionsEqual(current.selection, next.selection)) {
      current.selection = next.selection;
    }
    if (current.scrollPosition.x !== next.scrollPosition.x) {
      current.scrollPosition.x = next.scrollPosition.x;
    }
    if (current.scrollPosition.y !== next.scrollPosition.y) {
      current.scrollPosition.y = next.scrollPosition.y;
    }
    if (current.gridExtent.rowCount !== next.gridExtent.rowCount) {
      current.gridExtent.rowCount = next.gridExtent.rowCount;
    }
    if (current.gridExtent.columnCount !== next.gridExtent.columnCount) {
      current.gridExtent.columnCount = next.gridExtent.columnCount;
    }
  }

  function replaceWorkbook(workbook: Workbook): void {
    gridRef.value?.clearClipboard?.();
    session.workbook = workbook;
    session.history = createWorkbookHistory(session.history.maxEntries);
    viewStates.clear();
    searchQuery.value = "";
    formatPainterSource.value = undefined;
    clearWorkspaceStatus();
    workbookGeneration.value += 1;
    workbookVersion.value += 1;
  }

  function flushPendingGridEdit(): boolean {
    return gridRef.value?.flushPendingEdit?.() ?? true;
  }

  function hasPendingGridEdit(): boolean {
    return gridRef.value?.hasPendingEdit?.() ?? false;
  }

  function focusCellEditor(): void {
    gridRef.value?.focusGrid();
  }

  function handleFormulaReferenceKeydown(event: KeyboardEvent): boolean {
    return gridRef.value?.handleReferenceKeydown?.(event) ?? false;
  }

  function navigateToAddress(input: string): void {
    const address = parseCellAddress(input);
    if (!address) {
      showWorkspaceStatus({ key: "workspace.invalidAddress" });
      return;
    }
    clearWorkspaceStatus();
    gridRef.value?.navigateToCell(address);
  }

  function traverseFromFormulaBar(payload: {
    address: CellAddress;
    direction: "up" | "down" | "left" | "right";
    sheetId?: string;
  }): void {
    if (payload.sheetId && payload.sheetId !== activeSheet.value.id) return;
    const rowOffset = payload.direction === "up" ? -1 : payload.direction === "down" ? 1 : 0;
    const columnOffset = payload.direction === "left" ? -1 : payload.direction === "right" ? 1 : 0;
    gridRef.value?.navigateToCell({
      row: Math.max(0, Math.min(payload.address.row + rowOffset, MAX_SHEET_ROWS - 1)),
      column: Math.max(0, Math.min(payload.address.column + columnOffset, MAX_SHEET_COLUMNS - 1)),
    });
  }

  function updateSearchQuery(query: string): void {
    searchQuery.value = query;
    clearWorkspaceStatus();
  }

  function findCell(direction: SheetSearchDirection): void {
    if (!searchQuery.value.trim()) {
      showWorkspaceStatus({ key: "workspace.enterSearchTerm" });
      return;
    }
    const match = findCellByText(
      activeSheet.value,
      searchQuery.value,
      activeAddress.value,
      direction,
      activeSheetEvaluator.value,
    );
    if (!match) {
      showWorkspaceStatus({ key: "workspace.noMatches" });
      return;
    }
    gridRef.value?.navigateToCell(match);
    showWorkspaceStatus({ key: "workspace.found", params: { address: formatCellAddress(match) } });
  }

  function undo(): boolean {
    const changed = undoWorkbookCommand(session);
    if (changed) {
      workbookVersion.value += 1;
      pruneViewStates();
    }
    return changed;
  }

  function redo(): boolean {
    const changed = redoWorkbookCommand(session);
    if (changed) {
      workbookVersion.value += 1;
      pruneViewStates();
    }
    return changed;
  }

  function setGridNavigator(navigator: Element | ComponentPublicInstance | null): void {
    gridRef.value =
      navigator && "navigateToCell" in navigator && "focusGrid" in navigator
        ? (navigator as unknown as SheetGridNavigator)
        : undefined;
  }

  function scrollGridHorizontally(position: number, allowExpansion = false): void {
    gridRef.value?.scrollHorizontally?.(position, allowExpansion);
  }

  function fitSelectionToViewport(): void {
    gridRef.value?.fitSelectionToViewport?.();
  }

  function setSelectionDragging(dragging: boolean): void {
    selectionDragging.value = dragging;
  }

  onScopeDispose(clearWorkspaceStatus);

  return {
    session,
    executeCommand: execute,
    recalculate: () => {
      calculationVersion.value += 1;
    },
    workbookRevision: readonly(workbookVersion),
    workbookGeneration: readonly(workbookGeneration),
    replaceWorkbook,
    flushPendingGridEdit,
    hasPendingGridEdit,
    focusCellEditor,
    handleFormulaReferenceKeydown,
    viewStates,
    searchQuery,
    t,
    activeSheet,
    sheets,
    activeSheetViewState,
    activeAddress,
    activeAddressLabel,
    activeCellInput,
    activeSheetEvaluator,
    activeSelectionRange,
    setSelectionDragging,
    isFormattingSupported,
    activeSelectionStyle,
    activeSelectionSummary,
    dataToolState,
    mergeState,
    workspaceStatusText,
    formatPainterActive,
    commitCell,
    setCellImage,
    setFloatingImage,
    deleteFloatingImage,
    convertFloatingImageToCell,
    convertCellImageToFloating,
    pasteCells,
    showClipboardFeedback,
    clearCells,
    autoSum,
    sortSelection,
    applyFilter,
    clearFilter,
    freeze,
    unfreeze,
    setFreezePanes,
    mergeSelection,
    unmergeSelection,
    applyCellStyle,
    applyCellBorders,
    captureCellFormatSelection,
    applyCellFormat,
    updateBorderFormat,
    adjustNumberFormatDecimals,
    adjustIndent,
    activateFormatPainter,
    applyFormatPainterTarget,
    cancelFormatPainter,
    resizeDimension,
    insertAxis,
    deleteAxis,
    moveAxis,
    selectSheet,
    updateSheetProperties,
    restoreSheet,
    addSheet,
    duplicateSheet,
    renameSheet,
    deleteSheet,
    moveSheet,
    updateActiveSheetViewState,
    navigateToAddress,
    traverseFromFormulaBar,
    updateSearchQuery,
    findCell,
    undo,
    redo,
    setGridNavigator,
    fitSelectionToViewport,
    scrollGridHorizontally,
  };
}
