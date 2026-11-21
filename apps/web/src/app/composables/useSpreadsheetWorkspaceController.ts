import {
  assertWorkbookShapeSupport,
  assertShapeCommandSupport,
  UnsupportedShapeFrameDocumentError,
} from "../../modules/sheet-drawings/shape-document-support";
import { normalizeCellImage, type CellImage } from "@sheetcraft/core/cell-picture-frame";
import type { ConvertFloatingImageToCellCommand } from "@sheetcraft/core/commands";
import {
  assertWorkbookPictureSupport,
  assertPictureCommandSupport,
} from "../../modules/sheet-images/picture-document-support";
import { UnsupportedPicturePaintError } from "../../modules/sheet-images/picture-paint-effects";
import { canEditCell, canEditRange } from "@sheetcraft/core";
import type { FillDirection } from "@sheetcraft/sheet-engine/fill-selection";
import {
  computed,
  nextTick,
  onScopeDispose,
  reactive,
  readonly,
  ref,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import {
  createBatchSetCellContentsCommand,
  createClearCellRangeCommand,
  createClearSheetFilterCommand,
  createSetCellContentCommand,
  createSetFloatingImageCommand,
  createDeleteFloatingImageCommand,
  createConvertFloatingImageToCellCommand,
  planFloatingPictureToCell,
  createConvertCellImageToFloatingCommand,
  createSetSheetFilterCriteriaCommand,
  createSetSheetFreezePanesCommand,
  createSortSheetRangeCommand,
  getCellMergeModeAvailability,
  getSheetFilterColumnDistinctValues,
  getSheetFilterValueKey,
  getSheetFilters,
  type SortDirection,
  type CellMergeMode,
  type WorkbookCommand,
  type WorkbookOperation,
} from "@sheetcraft/core/commands";
import { formatCellAddress, parseCellAddress } from "@sheetcraft/core/coordinates";
import {
  createWorkbookSession,
  createWorkbookHistory,
  executeWorkbookCommand,
  executeReplaceableWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
  type ReplaceableWorkbookCommandToken,
} from "@sheetcraft/core/history";
import {
  formatCellContentForInput,
  formatComputedValueForDisplay,
  parseCellContent,
} from "@sheetcraft/core/input";
import { isTextCellNumberFormat } from "@sheetcraft/core/number-format";
import type { CellEditCommit } from "../../shared/cell-editing/useCellEditSession";
import { applyInputFontRuns } from "../../shared/cell-editing/input-font-runs";
import {
  createAutoSumFormula,
  createFormulaError,
  createWorkbookCalculationSession,
} from "@sheetcraft/core/formula";
import { doMergedCellRangesIntersect } from "@sheetcraft/core";
import {
  getCellDataValidation,
  resolveDataValidationListValues,
  validateCellContentDataValidation,
} from "@sheetcraft/core/data-validation";
import { validateDuplicateEntries } from "@sheetcraft/core/duplicate-values";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import type { IdFactory } from "@sheetcraft/core/runtime";
import { getTableAtAddress } from "@sheetcraft/core/table-styles";
import { useWorkbookFindController } from "../../modules/workbook/composables/useWorkbookFindController";
import { useWorkbookGoToController } from "../../modules/workbook/composables/useWorkbookGoToController";
import { getSelectionSummary } from "@sheetcraft/core/selection-summary";
import { mergeCellStyle, type CellStylePatch } from "@sheetcraft/core/style";
import {
  getSelectionCellStyleState,
  isCellStyleRangeSupported,
} from "@sheetcraft/core/style-state";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getWorkbookSheets,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type FloatingImage,
  type CellAddress,
  type CellRange,
  type SheetFilter,
  type SheetFilterValue,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  getSelectionMode,
  getSelectionRange,
  type SelectionMode,
} from "@sheetcraft/sheet-engine/selection";
import {
  createSheetGridViewState,
  type SheetGridViewState,
} from "@sheetcraft/sheet-engine/view-state";
import type {
  GridClipboardFeedback,
  GridPastePayload,
  GridPasteResult,
} from "../../modules/sheet-grid/useGridClipboard";
import {
  createGridPasteCommand,
  GridPasteError,
} from "../../modules/sheet-grid/createGridPasteCommand";
import { useAppI18n, type MessageKey, type MessageParams } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { TypedEventBus } from "../../shared/runtime/typed-event-bus";
import type { WorkspaceEvents } from "../../shared/runtime/workspace-runtime";
import { useDeferredSelectionSnapshot } from "../../modules/workbook/composables/useDeferredSelectionSnapshot";
import { useDataValidationInput } from "../../modules/data-tools/useDataValidationInput";
import type {
  FilterValueKey,
  HomeDataToolState,
  MergeCellsState,
} from "../../modules/home-tools/components/data-tool-state";
import {
  useWorkspaceControllerFormatting,
  type CellFormatSelection,
  type ConditionalFormattingSelection,
  type FormatPainterSource,
} from "./useWorkspaceControllerFormatting";
import { useWorkspaceControllerSheets } from "./useWorkspaceControllerSheets";

export type { CellFormatSelection, ConditionalFormattingSelection };

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

export type SheetGridNavigator = {
  fillSelection?(direction: FillDirection): boolean;
  clearClipboard?(): void;
  flushPendingEdit?(): boolean;
  hasPendingEdit?(): boolean;
  focusGrid(): void;
  handleReferenceKeydown?(event: KeyboardEvent): boolean;
  navigateToCell(address: CellAddress): void;
  navigateToRange?(range: CellRange): void;
  selectFloatingImage?(id: string | null): void;
  scrollHorizontally?(position: number, allowExpansion?: boolean): void;
  fitSelectionToViewport?(): void;
};

export type SpreadsheetWorkspaceControllerOptions = {
  idFactory?: IdFactory;
  statusDuration?: number;
  events?: TypedEventBus<WorkspaceEvents>;
};

export function useSpreadsheetWorkspaceController(
  options: SpreadsheetWorkspaceControllerOptions = {},
) {
  const { t, locale } = useAppI18n();
  const idFactory = options.idFactory ?? createBrowserIdFactory();
  const session = reactive(createWorkbookSession({ idFactory })) as WorkbookSession;
  let calculation = createWorkbookCalculationSession(session.workbook);
  const viewStates = reactive(new Map<string, SheetGridViewState>());
  const gridRef = shallowRef<SheetGridNavigator>();
  const workbookVersion = ref(0);
  const calculationVersion = ref(0);
  const workbookGeneration = ref(0);
  const selectionDragging = ref(false);
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
    return calculation.getEvaluator(activeSheet.value.id);
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
  const activeSelectionStyle = computed(() => {
    const address = toolbarSelection.value.activeAddress;
    return getSelectionCellStyleState(activeSheet.value, {
      start: address,
      end: address,
    });
  });
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
    const activeFilter = filterRange
      ? (getSheetFilters(sheet).find((filter) => areRangesEqual(filter.range, filterRange)) ?? null)
      : null;
    const criterion = activeFilter?.columns.find(
      (column) => column.column === selection.activeAddress.column,
    );
    const sortRange = getSortTargetRange(selection.range, selection.activeAddress, selection.mode);
    const sortIntersectsFilter = Boolean(
      sortRange && activeFilter && doMergedCellRangesIntersect(sortRange, activeFilter.range),
    );
    const filterDataRange = activeFilter ? getFilterDataRange(activeFilter.range) : null;
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
  const validationInput = useDataValidationInput({
    getWorkbook: () => session.workbook,
    getGeneration: () => workbookGeneration.value,
    execute: (command, options) => execute(command, "cells.edit", options),
    getDuplicateRejectionFeedback: () => ({
      title: t("dataTools.duplicates.rejectionTitle"),
      message: t("dataTools.duplicates.duplicateRejected"),
    }),
  });
  const activeValidationInfo = computed(() => {
    void workbookVersion.value;
    const sheet = activeSheet.value;
    const address = activeAddress.value;
    const rule = getCellDataValidation(sheet, address);
    if (!rule) return undefined;
    return {
      values:
        rule.type === "list" && rule.showDropdown !== false
          ? resolveDataValidationListValues(rule, {
              workbook: session.workbook,
              sheet,
              address,
            })
          : [],
      prompt:
        rule.prompt && rule.showInput !== false
          ? { title: rule.promptTitle, message: rule.prompt }
          : undefined,
    };
  });

  function collectCommandSheetIds(command: WorkbookCommand, sheetIds: Set<string>): void {
    if (command.type === "setCellContents") {
      for (const change of command.changes) {
        sheetIds.add(change.sheetId);
      }
    } else if (command.type === "addSheet") {
      sheetIds.add(command.sheet.id);
    } else if (command.type === "restoreTableTransaction") {
      for (const state of command.states) sheetIds.add(state.sheetId);
    } else if (command.type === "replaceSheetDrawingCollections") {
      for (const collection of command.collections) sheetIds.add(collection.sheetId);
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

  function execute(
    command: WorkbookCommand,
    operation?: WorkbookOperation,
    executeOptions: { allowDuplicateEntry?: boolean } = {},
  ): boolean {
    let changed: boolean;
    try {
      assertWorkbookShapeSupport(session.workbook);
      assertShapeCommandSupport(command);
      assertWorkbookPictureSupport(session.workbook);
      assertPictureCommandSupport(command, session.workbook);
      if (
        !(
          executeOptions.allowDuplicateEntry &&
          command.type === "setCellContents" &&
          command.changes.length === 1
        )
      )
        assertDuplicateEntriesAreAllowed(command);
      calculation.prepareMutation(
        command.type === "setWorkbookCalculation" ? command.calculation.mode : undefined,
      );
      changed = executeWorkbookCommand(session, command, operation);
    } catch (error) {
      if (error instanceof UnsupportedShapeFrameDocumentError) {
        showWorkspaceStatus({ key: "persistence.unsupportedShapes" });
        return false;
      }
      if (error instanceof UnsupportedPicturePaintError) {
        showWorkspaceStatus({ key: "picture.groupReflectionUnsupported" });
        return false;
      }
      if (
        error instanceof WorkbookDomainError &&
        (error.data.code === "sheet_protected" ||
          error.data.code === "workbook_protected" ||
          error.data.code === "pivot_result_protected")
      ) {
        showWorkspaceStatus({
          key:
            error.data.code === "pivot_result_protected"
              ? "pivot.resultProtected"
              : error.data.code === "workbook_protected"
                ? "review.workbookProtected"
                : "review.cellsProtected",
        });
        return false;
      }
      throw error;
    }
    if (changed) {
      calculation.invalidate();
      workbookVersion.value += 1;
      pruneViewStates();
      options.events?.emit("command:executed", {
        source: "execute",
        operation,
        sheetId: session.workbook.activeSheetId,
        revision: workbookVersion.value,
      });
    }
    return changed;
  }

  function executeReplaceableCommand(
    command: WorkbookCommand,
    token?: ReplaceableWorkbookCommandToken,
  ) {
    try {
      assertWorkbookShapeSupport(session.workbook);
      assertShapeCommandSupport(command);
      const previous = session.history.undoStack.at(-1);
      if (token && previous?.replacementToken === token.id)
        assertShapeCommandSupport(previous.command);
      assertWorkbookPictureSupport(session.workbook);
      assertPictureCommandSupport(command, session.workbook);
    } catch (error) {
      if (error instanceof UnsupportedShapeFrameDocumentError) {
        showWorkspaceStatus({ key: "persistence.unsupportedShapes" });
        return { changed: false, accepted: false };
      }
      if (!(error instanceof UnsupportedPicturePaintError)) throw error;
      showWorkspaceStatus({ key: "picture.groupReflectionUnsupported" });
      return { changed: false, accepted: false };
    }
    assertDuplicateEntriesAreAllowed(command);
    calculation.prepareMutation();
    const result = executeReplaceableWorkbookCommand(session, token, command);
    if (result.changed) {
      calculation.invalidate();
      workbookVersion.value += 1;
      pruneViewStates();
      options.events?.emit("command:executed", {
        source: "replaceable",
        sheetId: session.workbook.activeSheetId,
        revision: workbookVersion.value,
      });
    }
    return result;
  }

  /** Reject entire value mutations before history can record a partial duplicate entry. */
  function assertDuplicateEntriesAreAllowed(command: WorkbookCommand): void {
    const changes =
      command.type === "setCellContents"
        ? command.changes
        : command.type === "convertFloatingImageToCell"
          ? (() => {
              const sheet = session.workbook.sheets.get(command.sheetId);
              const plan = sheet
                ? planFloatingPictureToCell(sheet, command.id, command.path)
                : null;
              return plan
                ? [
                    {
                      sheetId: command.sheetId,
                      address: plan.address,
                      content: { kind: "image" as const, image: plan.image },
                    },
                  ]
                : [];
            })()
          : [];
    if (!changes.length) return;
    const result = validateDuplicateEntries(session.workbook, changes);
    if (!result.valid) {
      throw new WorkbookDomainError(
        {
          code: "invalid_command_payload",
          details: { field: "duplicate", sheetId: result.sheetId, ruleId: result.ruleId },
        },
        "A duplicate value is not allowed in this range.",
      );
    }
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
    const filter = getSheetFilters(activeSheet.value).find((candidate) =>
      isAddressInRange(selectionAddress, candidate.range),
    );
    if (filter) {
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
    const table = getTableAtAddress(activeSheet.value, selectionAddress);
    if (table) {
      const range = {
        start: {
          row: table.range.start.row + (table.headerRow ? 1 : 0),
          column: table.range.start.column,
        },
        end: {
          row: table.range.end.row - (table.totalRow ? 1 : 0),
          column: table.range.end.column,
        },
      };
      return range.end.row > range.start.row ? range : null;
    }
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
      clearWorkspaceStatus();
      const changed = execute(createCommand(), operation);
      if (changed) clearWorkspaceStatus();
      return changed;
    } catch {
      showWorkspaceStatus({ key: failureKey });
      return false;
    }
  }

  function commitCell(payload: CellEditCommit): boolean {
    const sheetId = payload.sheetId ?? activeSheet.value.id;
    const sheet = session.workbook.sheets.get(sheetId);
    if (!sheet || !canEditCell(sheet, payload.address)) return false;
    try {
      const accepted = validationInput.commit(
        {
          sheetId,
          address: payload.address,
          ...(payload.inputOrigin === "paste" ? {} : { inputIntent: "manual" as const }),
          content: applyInputFontRuns(
            payload.input,
            payload.inputFontRuns,
            parseCellContent(payload.input, {
              asText: isTextCellNumberFormat(getCellStyle(sheet, payload.address)?.numberFormat),
            }) ?? null,
          ),
        },
        { confirmPendingWarning: payload.confirmPendingWarning },
      );
      if (accepted) clearWorkspaceStatus();
      return accepted;
    } catch {
      showWorkspaceStatus({ key: "workspace.cellEditUnavailable" });
      return false;
    }
  }

  function commitCellValue(payload: {
    address: CellAddress;
    value: string | number | boolean;
    sheetId?: string;
  }): boolean {
    return validationInput.commit({
      sheetId: payload.sheetId ?? activeSheet.value.id,
      address: payload.address,
      content: { kind: "literal", value: payload.value },
    });
  }

  function acceptValidationInput(): boolean {
    try {
      return validationInput.accept();
    } catch {
      showWorkspaceStatus({ key: "workspace.cellEditUnavailable" });
      return false;
    }
  }

  function setCellImage(payload: CellImage & { sheetId: string; address: CellAddress }): boolean {
    const { sheetId, address, ...image } = payload;
    return execute(
      createSetCellContentCommand(sheetId, address, {
        kind: "image",
        image: normalizeCellImage(image),
      }),
      "cells.edit",
    );
  }

  function setFloatingImage(image: FloatingImage, sheetId = activeSheet.value.id): boolean {
    return execute(createSetFloatingImageCommand(sheetId, image));
  }

  function deleteFloatingImage(id: string): void {
    execute(createDeleteFloatingImageCommand(activeSheet.value.id, id));
  }

  function convertFloatingImageToCell(
    id: string,
    options?: Omit<ConvertFloatingImageToCellCommand, "type" | "id">,
  ): boolean {
    try {
      const changed = execute(
        createConvertFloatingImageToCellCommand(
          options?.sheetId ?? activeSheet.value.id,
          id,
          options,
        ),
      );
      if (changed) showWorkspaceStatus({ key: "image.converted" });
      return changed;
    } catch {
      showWorkspaceStatus({ key: "image.convertFailed" });
      return false;
    }
  }

  function convertCellImageToFloating(payload: {
    sheetId: string;
    address: CellAddress;
    imageId: string;
    size: { width: number; height: number };
  }): boolean {
    return execute(
      createConvertCellImageToFloatingCommand(
        payload.sheetId,
        payload.address,
        payload.imageId,
        payload.size,
      ),
    );
  }

  function pasteCells(payload: GridPastePayload): GridPasteResult {
    if (
      !canEditRange(activeSheet.value, payload.plan.range) ||
      (activeSheet.value.properties.protected &&
        (payload.kind === "formats" || (payload.kind === "all" && payload.moveSource)))
    )
      return { ok: false, reason: "pasteRejected" };
    try {
      clearWorkspaceStatus();
      const changed = execute(
        createGridPasteCommand(activeSheet.value, payload, activeSheetEvaluator.value),
        payload.kind === "all" && payload.moveSource ? "cells.move" : "cells.paste",
      );
      if (!changed && workspaceStatus.value?.key === "pivot.resultProtected")
        return { ok: false, reason: "pasteRejected" };
      clearWorkspaceStatus();
      return { ok: true };
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        showWorkspaceStatus({ key: "dataTools.duplicates.duplicateRejected" });
      }
      return {
        ok: false,
        reason: error instanceof GridPasteError ? error.reason : "pasteRejected",
      };
    }
  }

  function showClipboardFeedback(feedback: GridClipboardFeedback): void {
    if (
      feedback === "pasteRejected" &&
      (workspaceStatus.value?.key === "dataTools.duplicates.duplicateRejected" ||
        workspaceStatus.value?.key === "pivot.resultProtected")
    )
      return;
    showWorkspaceStatus({ key: `clipboard.${feedback}` });
  }

  function isDuplicateEntryError(error: unknown): boolean {
    return (
      error instanceof WorkbookDomainError &&
      error.data.code === "invalid_command_payload" &&
      error.data.details?.field === "duplicate"
    );
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
      showWorkspaceStatus({
        key: "workspace.autoSumApplied",
        params: { formula },
      });
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
    const currentFilter = getSheetFilters(activeSheet.value).find((filter) =>
      areRangesEqual(filter.range, range),
    );
    const columns: SheetFilter["columns"] =
      currentFilter && areRangesEqual(currentFilter.range, range)
        ? currentFilter.columns
            .filter((criterion) => criterion.column !== column)
            .map((criterion) => ({
              column: criterion.column,
              allowedValues: criterion.allowedValues.map((value) => ({
                ...value,
              })),
              ...(criterion.condition ? { condition: { ...criterion.condition } } : {}),
            }))
        : [];
    if (!allSelected) columns.push({ column, allowedValues });
    executeFeature(
      () =>
        createSetSheetFilterCriteriaCommand(activeSheet.value.id, range, columns, {
          allowMergedCells: currentFilter?.allowMergedCells,
        }),
      "data.filter",
      "workspace.filterUnavailable",
    );
  }

  function clearFilter(): void {
    const table = getTableAtAddress(activeSheet.value, activeAddress.value);
    if (table?.filter) {
      executeFeature(
        () =>
          createSetSheetFilterCriteriaCommand(activeSheet.value.id, table.filter!.range, [], {
            allowMergedCells: table.filter!.allowMergedCells,
          }),
        "data.filter",
        "workspace.filterUnavailable",
      );
      return;
    }
    executeFeature(
      () => createClearSheetFilterCommand(activeSheet.value.id),
      "data.filter",
      "workspace.filterUnavailable",
    );
  }

  function freeze(mode: "panes" | "rows" | "columns" | "top-row" | "first-column"): void {
    const freezePanes =
      mode === "top-row"
        ? { rows: 1, columns: 0 }
        : mode === "first-column"
          ? { rows: 0, columns: 1 }
          : {
              rows: mode === "columns" ? 0 : activeAddress.value.row,
              columns: mode === "rows" ? 0 : activeAddress.value.column,
            };
    executeFeature(
      () => createSetSheetFreezePanesCommand(activeSheet.value.id, freezePanes),
      "view.freeze",
      "workspace.freezeUnavailable",
    );
  }

  function unfreeze(): void {
    executeFeature(
      () =>
        createSetSheetFreezePanesCommand(activeSheet.value.id, {
          rows: 0,
          columns: 0,
        }),
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

  const {
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
  } = useWorkspaceControllerFormatting({
    getWorkbook: () => session.workbook,
    activeSheet,
    activeAddress,
    activeSelectionRange,
    activeSheetEvaluator,
    isFormattingSupported,
    mergeState,
    workbookGeneration,
    formatPainterSource,
    locale,
    getCellFormatMergeState,
    execute,
    executeFeature,
    pasteCells,
    flushPendingGridEdit,
    clearGridClipboard: () => gridRef.value?.clearClipboard?.(),
    focusGrid: () => gridRef.value?.focusGrid(),
    showWorkspaceStatus,
    clearWorkspaceStatus,
  });

  const {
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
  } = useWorkspaceControllerSheets({
    session,
    activeSheet,
    sheets,
    workbookVersion,
    events: options.events,
    execute,
    executeFeature,
    cancelFormatPainter,
    showWorkspaceStatus,
    clearWorkspaceStatus,
  });

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
    assertWorkbookShapeSupport(workbook);
    assertWorkbookPictureSupport(workbook);
    gridRef.value?.clearClipboard?.();
    session.workbook = workbook;
    calculation = createWorkbookCalculationSession(session.workbook);
    session.history = createWorkbookHistory(session.history.maxEntries);
    viewStates.clear();
    workbookFind.reset();
    formatPainterSource.value = undefined;
    clearWorkspaceStatus();
    workbookGeneration.value += 1;
    workbookVersion.value += 1;
    options.events?.emit("workbook:replaced", { generation: workbookGeneration.value });
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

  const workbookFind = useWorkbookFindController({
    getWorkbook: () => session.workbook,
    getRevision: () => [workbookVersion.value, calculationVersion.value],
    getAddress: () => activeAddress.value,
    getEvaluator: (sheetId) => calculation.getEvaluator(sheetId),
    applyReplacements: (changes, replacementFormat) => {
      const changesWithFormat = changes.map((change) => {
        if (!replacementFormat) return change;
        const sheet = session.workbook.sheets.get(change.sheetId);
        const patch = Object.fromEntries(
          replacementFormat.keys.map((key) => [key, replacementFormat.style[key] ?? null]),
        ) as CellStylePatch;
        return {
          ...change,
          style: sheet ? mergeCellStyle(getCellStyle(sheet, change.address), patch) : null,
        };
      });
      for (const change of changesWithFormat) {
        const sheet = session.workbook.sheets.get(change.sheetId);
        if (!sheet || !canEditCell(sheet, change.address)) return false;
        const rule = getCellDataValidation(sheet, change.address);
        if (
          rule &&
          rule.showError !== false &&
          !validateCellContentDataValidation(rule, change.content, {
            workbook: session.workbook,
            sheet,
            address: change.address,
          }).valid
        )
          return false;
      }
      return execute(
        createBatchSetCellContentsCommand(changesWithFormat, {
          reconcileBorders: Boolean(
            replacementFormat?.keys.some((key) => key.startsWith("border")),
          ),
        }),
        "cells.edit",
      );
    },
    navigate: (result) => {
      if (result.sheetId === activeSheet.value.id) {
        gridRef.value?.navigateToCell(result.address);
        return;
      }
      selectSheet(result.sheetId);
      const generation = workbookGeneration.value;
      void nextTick(() => {
        if (generation === workbookGeneration.value && activeSheet.value.id === result.sheetId)
          gridRef.value?.navigateToCell(result.address);
      });
    },
    feedback: (feedback) => (feedback ? showWorkspaceStatus(feedback) : clearWorkspaceStatus()),
  });
  const searchQuery = workbookFind.query;
  const workbookGoTo = useWorkbookGoToController({
    getWorkbook: () => session.workbook,
    getRevision: () => [workbookVersion.value, calculationVersion.value],
    getSelection: () => activeSelectionRange.value,
    getAddress: () => activeAddress.value,
    getEvaluator: (sheetId) => calculation.getEvaluator(sheetId),
    navigate: (sheetId, target) => {
      const navigate = () => {
        if (gridRef.value?.navigateToRange) gridRef.value.navigateToRange(target.range);
        else gridRef.value?.navigateToCell(target.range.start);
        if (target.imageId) gridRef.value?.selectFloatingImage?.(target.imageId);
      };
      if (sheetId === activeSheet.value.id) navigate();
      else {
        selectSheet(sheetId);
        const generation = workbookGeneration.value;
        void nextTick(() => {
          if (generation === workbookGeneration.value && sheetId === activeSheet.value.id)
            navigate();
        });
      }
    },
  });
  const updateSearchQuery = workbookFind.updateQuery;
  const findCell = workbookFind.find;

  function canApplyShapeHistoryCommand(command: WorkbookCommand | undefined): boolean {
    try {
      assertWorkbookShapeSupport(session.workbook);
      if (command) assertShapeCommandSupport(command);
      return true;
    } catch (error) {
      if (!(error instanceof UnsupportedShapeFrameDocumentError)) throw error;
      showWorkspaceStatus({ key: "persistence.unsupportedShapes" });
      return false;
    }
  }

  function undo(): boolean {
    const command = session.history.undoStack.at(-1)?.command;
    if (!canApplyShapeHistoryCommand(command)) return false;
    calculation.prepareMutation(
      command?.type === "setWorkbookCalculation" ? command.calculation.mode : undefined,
    );
    const changed = undoWorkbookCommand(session);
    if (changed) {
      calculation.invalidate();
      workbookVersion.value += 1;
      pruneViewStates();
      options.events?.emit("command:executed", {
        source: "undo",
        sheetId: session.workbook.activeSheetId,
        revision: workbookVersion.value,
      });
    }
    return changed;
  }

  function redo(): boolean {
    const command = session.history.redoStack.at(-1)?.command;
    if (!canApplyShapeHistoryCommand(command)) return false;
    calculation.prepareMutation(
      command?.type === "setWorkbookCalculation" ? command.calculation.mode : undefined,
    );
    const changed = redoWorkbookCommand(session);
    if (changed) {
      calculation.invalidate();
      workbookVersion.value += 1;
      pruneViewStates();
      options.events?.emit("command:executed", {
        source: "redo",
        sheetId: session.workbook.activeSheetId,
        revision: workbookVersion.value,
      });
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
    executeCommand: (command: WorkbookCommand, operation?: WorkbookOperation) =>
      execute(command, operation),
    executeReplaceableCommand,
    recalculate: () => {
      calculation.recalculate();
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
    workbookFind,
    workbookGoTo,
    t,
    activeSheet,
    sheets,
    activeSheetViewState,
    activeAddress,
    activeAddressLabel,
    activeCellInput,
    activeSheetEvaluator,
    activeSelectionRange,
    activeSelectionMode,
    setSelectionDragging,
    isFormattingSupported,
    activeSelectionStyle,
    activeSelectionSummary,
    dataToolState,
    activeValidationInfo,
    validationFeedback: validationInput.feedback,
    acceptValidationInput,
    dismissValidationInput: validationInput.dismiss,
    mergeState,
    workspaceStatusText,
    formatPainterActive,
    commitCell,
    commitCellValue,
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
    fillSelection: (direction: FillDirection) => gridRef.value?.fillSelection?.(direction) ?? false,
    clearGridClipboard: () => gridRef.value?.clearClipboard?.(),
    fitSelectionToViewport,
    scrollGridHorizontally,
  };
}
