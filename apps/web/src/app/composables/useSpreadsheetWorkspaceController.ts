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
  createAdjustCellNumberFormatDecimalsCommand,
  createApplyCellBordersCommand,
  createApplyCellStyleCommand,
  createClearCellRangeCommand,
  createClearSheetFilterCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createInsertSheetAxisCommand,
  createMergeCellsCommand,
  createMoveSheetCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetCellContentCommand,
  createSetSheetFilterCriteriaCommand,
  createSetSheetFreezePanesCommand,
  createSortSheetRangeCommand,
  createUnmergeCellsCommand,
  getSheetFilterColumnDistinctValues,
  getSheetFilterValueKey,
  type SortDirection,
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
import { createAutoSumFormula, createFormulaError } from "@idea10/core/formula";
import { doMergedCellRangesIntersect } from "@idea10/core";
import type { IdFactory } from "@idea10/core/runtime";
import { findCellByText, type SheetSearchDirection } from "@idea10/core/search";
import { getSelectionSummary } from "@idea10/core/selection-summary";
import type { CellBorderAction, CellStylePatch } from "@idea10/core/style";
import {
  createDefaultSelectionCellStyleState,
  getSelectionCellStyleState,
  isCellStyleRangeSupported,
} from "@idea10/core/style-state";
import {
  getActiveSheet,
  createSheetEvaluator,
  getCellContent,
  getWorkbookSheets,
  MAX_SHEET_ROWS,
  setActiveSheet,
  type CellAddress,
  type CellRange,
  type SheetFilter,
  type SheetFilterValue,
  type SheetDimensionAxis,
  type Workbook,
} from "@idea10/core/workbook";
import { getSelectionMode, getSelectionRange } from "@idea10/sheet-engine/selection";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
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
import type {
  FilterValueKey,
  HomeDataToolState,
  MergeCellsState,
} from "../../modules/home-tools/components/data-tool-state";

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
  navigateToCell(address: CellAddress): void;
};

export type SpreadsheetWorkspaceControllerOptions = {
  idFactory?: IdFactory;
  statusDuration?: number;
};

export function useSpreadsheetWorkspaceController(
  options: SpreadsheetWorkspaceControllerOptions = {},
) {
  const { t } = useAppI18n();
  const idFactory = options.idFactory ?? createBrowserIdFactory();
  const session = reactive(createWorkbookSession({ idFactory })) as WorkbookSession;
  const viewStates = reactive(new Map<string, SheetGridViewState>());
  const gridRef = shallowRef<SheetGridNavigator>();
  const workbookVersion = ref(0);
  const workbookGeneration = ref(0);
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
  const activeSelectionRange = computed<CellRange>(() => {
    const selection = activeSheetViewState.value?.selection;
    return selection
      ? getSelectionRange(selection)
      : { start: { ...activeAddress.value }, end: { ...activeAddress.value } };
  });
  const isFormattingSupported = computed(() =>
    isCellStyleRangeSupported(activeSelectionRange.value),
  );
  const activeSelectionStyle = computed(() =>
    isFormattingSupported.value
      ? getSelectionCellStyleState(activeSheet.value, activeSelectionRange.value)
      : createDefaultSelectionCellStyleState(),
  );
  const activeSelectionSummary = computed(() =>
    getSelectionSummary(activeSheet.value, activeSelectionRange.value),
  );
  const dataToolState = computed<HomeDataToolState>(() => {
    const sheet = activeSheet.value;
    const filterRange = getFilterTargetRange();
    const filterEnabled = Boolean(
      filterRange &&
      !sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, filterRange)),
    );
    const options = filterEnabled
      ? getSheetFilterColumnDistinctValues(
          sheet,
          filterRange!,
          activeAddress.value.column,
          createSheetEvaluator(sheet),
        ).map((key) => ({ key, label: formatFilterValueLabel(key) }))
      : [];
    const activeFilter =
      sheet.filter && filterRange && areRangesEqual(sheet.filter.range, filterRange)
        ? sheet.filter
        : null;
    const criterion = activeFilter?.columns.find(
      (column) => column.column === activeAddress.value.column,
    );
    const sortRange = getSortTargetRange();
    const sortIntersectsFilter = Boolean(
      sortRange && sheet.filter && doMergedCellRangesIntersect(sortRange, sheet.filter.range),
    );
    const filterDataRange = sheet.filter ? getFilterDataRange(sheet.filter.range) : null;
    return {
      activeCell: { ...activeAddress.value },
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
    const range = activeSelectionRange.value;
    const cellSelection = getSelectionModeValue() === "cells";
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
    return {
      canMerge:
        cellSelection &&
        hasMultipleCells &&
        !intersectsMerge &&
        !crossesFreeze &&
        !intersectsFilter,
      canUnmerge: cellSelection && intersectsMerge,
    };
  });
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
    const changed = executeWorkbookCommand(session, command, operation);
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

  function getFilterTargetRange(): CellRange | null {
    if (getSelectionModeValue() !== "cells") return null;
    const filter = activeSheet.value.filter;
    if (filter && isAddressInRange(activeAddress.value, filter.range)) {
      return filter.range;
    }
    const range = activeSelectionRange.value;
    return range.end.row > range.start.row ? range : null;
  }

  function getSortTargetRange(): CellRange | null {
    if (getSelectionModeValue() !== "cells") return null;
    const filter = activeSheet.value.filter;
    if (filter && isAddressInRange(activeAddress.value, filter.range)) {
      const range = getFilterDataRange(filter.range);
      return range.end.row > range.start.row ? range : null;
    }
    const range = activeSelectionRange.value;
    return range.end.row > range.start.row ? range : null;
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

  function commitCell(payload: { address: CellAddress; input: string }): void {
    execute(
      createSetCellContentCommand(
        activeSheet.value.id,
        payload.address,
        parseCellContent(payload.input),
      ),
      "cells.edit",
    );
    clearWorkspaceStatus();
  }

  function pasteCells(payload: GridPastePayload): GridPasteResult {
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
    const evaluator = createSheetEvaluator(activeSheet.value);
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

  function mergeSelection(): void {
    if (!mergeState.value.canMerge) {
      showWorkspaceStatus({ key: "workspace.mergeUnavailable" });
      return;
    }
    if (
      executeFeature(
        () => createMergeCellsCommand(activeSheet.value.id, activeSelectionRange.value),
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

  function selectSheet(sheetId: string): void {
    if (setActiveSheet(session.workbook, sheetId)) {
      workbookVersion.value += 1;
    }
    clearWorkspaceStatus();
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

  function updateActiveSheetViewState(viewState: SheetGridViewState): void {
    viewStates.set(activeSheet.value.id, createSheetGridViewState(viewState));
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
    direction: "up" | "down";
  }): void {
    const rowOffset = payload.direction === "up" ? -1 : 1;
    gridRef.value?.navigateToCell({
      row: Math.max(0, Math.min(payload.address.row + rowOffset, MAX_SHEET_ROWS - 1)),
      column: payload.address.column,
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

  onScopeDispose(clearWorkspaceStatus);

  return {
    session,
    workbookRevision: readonly(workbookVersion),
    workbookGeneration: readonly(workbookGeneration),
    replaceWorkbook,
    flushPendingGridEdit,
    hasPendingGridEdit,
    viewStates,
    searchQuery,
    t,
    activeSheet,
    sheets,
    activeSheetViewState,
    activeAddress,
    activeAddressLabel,
    activeCellInput,
    activeSelectionRange,
    isFormattingSupported,
    activeSelectionStyle,
    activeSelectionSummary,
    dataToolState,
    mergeState,
    workspaceStatusText,
    formatPainterActive,
    commitCell,
    pasteCells,
    showClipboardFeedback,
    clearCells,
    autoSum,
    sortSelection,
    applyFilter,
    clearFilter,
    freeze,
    unfreeze,
    mergeSelection,
    unmergeSelection,
    applyCellStyle,
    applyCellBorders,
    adjustNumberFormatDecimals,
    activateFormatPainter,
    applyFormatPainterTarget,
    cancelFormatPainter,
    resizeDimension,
    insertAxis,
    deleteAxis,
    selectSheet,
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
  };
}
