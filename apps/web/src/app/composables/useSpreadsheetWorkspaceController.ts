import {
  computed,
  onScopeDispose,
  reactive,
  ref,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import {
  createAddSheetCommand,
  createApplyCellBordersCommand,
  createApplyCellStyleCommand,
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createPasteCellValuesCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetCellValueCommand,
  type WorkbookCommand,
  type WorkbookOperation,
} from "@idea10/core/commands";
import {
  createPastePlan,
  getCellMatrixSize,
  getCellRangeValues,
  tileCellMatrix,
  type CellValueMatrix,
} from "@idea10/core/clipboard";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "@idea10/core/history";
import { formatCellValueForInput, parseCellInput } from "@idea10/core/input";
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
  getCellValue,
  getWorkbookSheets,
  MAX_SHEET_ROWS,
  setActiveSheet,
  type CellAddress,
  type CellRange,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import { getSelectionRange } from "@idea10/sheet-engine/selection";
import { createSheetGridViewState, type SheetGridViewState } from "@idea10/sheet-engine/view-state";
import {
  getCellRangeStyles,
  type CellStyleMatrix,
  type GridPastePayload,
} from "../../modules/sheet-grid/useGridClipboard";
import { useAppI18n, type MessageKey, type MessageParams } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

type FormatPainterSource = {
  values: CellValueMatrix;
  styles: CellStyleMatrix;
};

export type SheetGridNavigator = {
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
  const searchQuery = ref("");
  const formatPainterSource = ref<FormatPainterSource>();
  const workspaceStatus = ref<FeedbackState>();
  let workspaceStatusTimer: ReturnType<typeof setTimeout> | undefined;

  const activeSheet = computed(() => getActiveSheet(session.workbook));
  const sheets = computed(() => getWorkbookSheets(session.workbook));
  const activeSheetViewState = computed(() => viewStates.get(activeSheet.value.id));
  const activeAddress = computed(
    () => activeSheetViewState.value?.selection.active ?? { row: 0, column: 0 },
  );
  const activeAddressLabel = computed(() => formatCellAddress(activeAddress.value));
  const activeCellInput = computed(() =>
    formatCellValueForInput(getCellValue(activeSheet.value, activeAddress.value)),
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
  const workspaceStatusText = computed(() =>
    workspaceStatus.value ? t(workspaceStatus.value.key, workspaceStatus.value.params) : "",
  );
  const formatPainterActive = computed(() => formatPainterSource.value !== undefined);

  function collectCommandSheetIds(command: WorkbookCommand, sheetIds: Set<string>): void {
    if (command.type === "setCellValues") {
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

  function commitCell(payload: { address: CellAddress; input: string }): void {
    execute(
      createSetCellValueCommand(
        activeSheet.value.id,
        payload.address,
        parseCellInput(payload.input),
      ),
      "cells.edit",
    );
    clearWorkspaceStatus();
  }

  function pasteCells(payload: GridPastePayload): void {
    if (payload.kind === "formats") {
      execute(
        createPasteCellValuesCommand(
          activeSheet.value.id,
          payload.plan.anchor,
          getCellRangeValues(activeSheet.value, payload.plan.range),
          { styles: payload.styles },
        ),
        "cells.paste",
      );
      return;
    }
    if (payload.kind === "values") {
      execute(
        createPasteCellValuesCommand(
          activeSheet.value.id,
          payload.plan.anchor,
          payload.plan.values,
        ),
        "cells.paste",
      );
      return;
    }
    execute(
      createPasteCellValuesCommand(activeSheet.value.id, payload.plan.anchor, payload.plan.values, {
        clearRange: payload.clearRange,
        styles: payload.styles,
      }),
      payload.clearRange ? "cells.move" : "cells.paste",
    );
  }

  function clearCells(range: CellRange): void {
    execute(createClearCellRangeCommand(activeSheet.value.id, range), "cells.clear");
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

  function activateFormatPainter(): void {
    if (formatPainterSource.value) {
      cancelFormatPainter();
      return;
    }
    if (!isFormattingSupported.value) {
      showWorkspaceStatus({ key: "format.selectionTooLarge" });
      return;
    }
    formatPainterSource.value = {
      values: getCellRangeValues(activeSheet.value, activeSelectionRange.value),
      styles: getCellRangeStyles(activeSheet.value, activeSelectionRange.value),
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
    const plan = createPastePlan(source.values, range, range.start);
    if (!plan) {
      showWorkspaceStatus({ key: "workspace.formatPainterRangeMismatch" });
      return;
    }
    pasteCells({
      kind: "formats",
      plan,
      styles: tileCellMatrix(source.styles, getCellMatrixSize(plan.values)),
    });
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
    setActiveSheet(session.workbook, sheetId);
    clearWorkspaceStatus();
  }

  function addSheet(): void {
    execute(
      createAddSheetCommand(session.workbook, { idFactory: session.idFactory }),
      "sheets.add",
    );
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

  function updateActiveSheetViewState(viewState: SheetGridViewState): void {
    viewStates.set(activeSheet.value.id, createSheetGridViewState(viewState));
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
      pruneViewStates();
    }
    return changed;
  }

  function redo(): boolean {
    const changed = redoWorkbookCommand(session);
    if (changed) {
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
    workspaceStatusText,
    formatPainterActive,
    commitCell,
    pasteCells,
    clearCells,
    applyCellStyle,
    applyCellBorders,
    activateFormatPainter,
    applyFormatPainterTarget,
    cancelFormatPainter,
    resizeDimension,
    insertAxis,
    deleteAxis,
    selectSheet,
    addSheet,
    renameSheet,
    deleteSheet,
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
