<script setup lang="ts">
import { formatCellAddress } from "@idea10/core/coordinates";
import type { SheetGoToOptions } from "@idea10/core/go-to";
import { computed, nextTick, ref, shallowRef, shallowReactive, useId, watch } from "vue";
import {
  createSetSheetOutlineGroupCollapsedCommand,
  createSetSheetOutlineLevelCommand,
  type CellFormatChange,
} from "@idea10/core/commands";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { useWorkbookFullscreen } from "../modules/workbook/composables/useWorkbookFullscreen";
import { useEyeComfortMode } from "../modules/workbook/composables/useEyeComfortMode";
import { normalizeSheetZoom, SHEET_ZOOM_STEP } from "../shared/sheet-view/zoom";
import { useCellEditSession } from "../shared/cell-editing/useCellEditSession";
import { useFormulaToolsController } from "../modules/formula-tools/useFormulaToolsController";
import { useFormulaEditorController } from "../modules/formula-tools/useFormulaEditorController";
import FormulaFunctionBrowser from "../modules/formula-tools/components/FormulaFunctionBrowser.vue";
import FormulaEditorDialog from "../modules/formula-tools/components/FormulaEditorDialog.vue";
import { useDataToolsController } from "../modules/data-tools/useDataToolsController";
import { useDuplicateErrorChecks } from "../modules/data-tools/useDuplicateErrorChecks";
import type { ErrorCheckSettings } from "../modules/data-tools/duplicate-error-preferences";
import DuplicateErrorCheckOptionsDialog from "../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue";
import DataTableDialog from "../modules/data-tools/components/DataTableDialog.vue";
import GoalSeekDialog from "../modules/data-tools/components/GoalSeekDialog.vue";
import PlanningSolverDialog from "../modules/data-tools/components/PlanningSolverDialog.vue";
import DataProofreadingDialog from "../modules/data-tools/components/DataProofreadingDialog.vue";
import DataToolbar from "../modules/data-tools/components/DataToolbar.vue";
import DataToolsDialogs from "../modules/data-tools/components/DataToolsDialogs.vue";
import DuplicateValuesDialog from "../modules/data-tools/components/DuplicateValuesDialog.vue";
import ConsolidateDialog from "../modules/data-tools/components/ConsolidateDialog.vue";
import FillNumberSequenceDialog from "../modules/data-tools/components/FillNumberSequenceDialog.vue";
import FillRankDialog from "../modules/data-tools/components/FillRankDialog.vue";
import FillSeriesDialog from "../modules/data-tools/components/FillSeriesDialog.vue";
import FillBlanksDialog from "../modules/data-tools/components/FillBlanksDialog.vue";
import FillTextDialog from "../modules/data-tools/components/FillTextDialog.vue";
import FillCurrentDateDialog from "../modules/data-tools/components/FillCurrentDateDialog.vue";
import DropdownListDialog from "../modules/data-tools/components/DropdownListDialog.vue";
import LookupFillDialog from "../modules/data-tools/components/LookupFillDialog.vue";
import DataComparisonDialog from "../modules/data-tools/components/DataComparisonDialog.vue";
import AdvancedFilterDialog from "../modules/data-tools/components/AdvancedFilterDialog.vue";
import type { FillDirection } from "@idea10/sheet-engine/fill-selection";
import type { AdvancedFilterDraft } from "../modules/data-tools/data-tools-types";
import FilterColumnPanel from "../modules/data-tools/components/FilterColumnPanel.vue";
import DataValidationFeedbackDialog from "../modules/data-tools/components/DataValidationFeedbackDialog.vue";
import RangeReferencePicker from "../shared/range-reference/RangeReferencePicker.vue";
import {
  useRangeReferencePicker,
  type RangeReferenceSelectionOptions,
} from "../shared/range-reference/useRangeReferencePicker";
import NamedRangesDialog from "../modules/formula-tools/components/NamedRangesDialog.vue";
import {
  createIndexedDbImageAssetStore,
  type ImageAssetStore,
} from "../modules/image-assets/imageAssetStore";
import { useImageAssetUrls } from "../modules/image-assets/useImageAssetUrls";
import { useSheetImageActions } from "../modules/sheet-images/useSheetImageActions";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import { useSheetContextActions } from "./composables/useSheetContextActions";
import type { SheetContextMenuState } from "../modules/sheet-grid/context-menu-contracts";
import SheetColumnStatisticsDialog from "../modules/sheet-grid/components/SheetColumnStatisticsDialog.vue";
import SheetColumnChoiceDialog from "../modules/sheet-grid/components/SheetColumnChoiceDialog.vue";
import SheetContextFilterDialog from "../modules/sheet-grid/components/SheetContextFilterDialog.vue";
import { createAxisToolActions } from "../modules/sheet-grid/axis-tool-actions";
import { createCellFillActions } from "../modules/sheet-grid/cell-fill-actions";
import { createCellOperationActions } from "../modules/sheet-grid/cell-operation-actions";
import { browserCellTextMeasurer } from "../shared/cell-text/text-metrics";
import { useAppI18n } from "../shared/i18n";
import RowColumnOperationsMenu from "../modules/sheet-grid/components/RowColumnOperationsMenu.vue";
import WorksheetOperationsMenu from "../modules/workbook/components/WorksheetOperationsMenu.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import SheetHorizontalScrollbar from "../modules/sheet-grid/components/SheetHorizontalScrollbar.vue";
import type { SheetHorizontalScrollState } from "../modules/sheet-grid/horizontal-scroll";
import WorkbookFormulaBar from "../modules/workbook/components/WorkbookFormulaBar.vue";
import {
  applyFindFormatChange,
  buildFindFormatFromCell,
  createFindFormatDraft,
} from "../modules/workbook/workbook-find-format";
import type {
  WorkbookFindFormatMode,
  WorkbookFindMode,
  WorkbookFindResult,
} from "../modules/workbook/workbook-find-types";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../shared/range-reference/formatRangeReference";
import WorkbookFindDialog from "../modules/workbook/components/WorkbookFindDialog.vue";
import { useWorkbookFindShortcuts } from "../modules/workbook/composables/useWorkbookFindShortcuts";
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import {
  useSpreadsheetWorkspaceController,
  type CellFormatSelection,
  type ConditionalFormattingSelection,
} from "./composables/useSpreadsheetWorkspaceController";
import CellFormatDialog, {
  type CellFormatTab,
} from "../modules/cell-format/components/CellFormatDialog.vue";
import ConditionalFormatManagerDialog from "../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import type { ConditionalFormatQuickRule } from "../modules/conditional-formatting/components/ConditionalFormattingMenu.vue";
import { getConditionalFormatPreset } from "../modules/conditional-formatting/conditional-format-presets";
import {
  createConditionalFormatRuleId,
  formatConditionalFormatRanges,
} from "../modules/conditional-formatting/conditional-formatting-ui";
import WorkbookFileActions from "../modules/workbook-persistence/components/WorkbookFileActions.vue";
import WorkbookFileFeedback from "../modules/workbook-persistence/components/WorkbookFileFeedback.vue";
import { createIndexedDbWorkbookStore } from "../modules/workbook-persistence/indexedDbWorkbookStore";
import { useWorkbookPersistence } from "../modules/workbook-persistence/useWorkbookPersistence";
import { useWorkbookFileActions } from "../modules/workbook-persistence/useWorkbookFileActions";
import type { WorkbookStore } from "../modules/workbook-persistence/workbookStore";
import XlsxFileActions from "../modules/workbook-xlsx/components/XlsxFileActions.vue";
import XlsxFileFeedback from "../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import { useWorkbookXlsxActions } from "../modules/workbook-xlsx/useWorkbookXlsxActions";
import type { CellAddress, SheetDimensionAxis, SheetProperties } from "@idea10/core/workbook";

const props = defineProps<{
  workbookStore?: WorkbookStore;
  imageAssetStore?: ImageAssetStore;
}>();
const formulaBarRef = ref<InstanceType<typeof WorkbookFormulaBar> | null>(null);
const findDialogVisible = ref(false);
const findDialogRef = ref<InstanceType<typeof WorkbookFindDialog>>();
const findMode = ref<WorkbookFindMode>("find");

function restoreSearchFocus(): void {
  if (!findDialogVisible.value) {
    formulaBarRef.value?.focusSearch();
  }
}
const gridId = `workbook-grid-${useId()}`;
const zoom = ref(100);
const showHeaders = ref(true);
const showGridLines = ref(true);
const showAxisQuickTools = ref(false);
const eyeComfortEnabled = useEyeComfortMode();
const highlightEnabled = ref(false);
const highlightColor = ref("#22a06b");
const { fullscreen, fullscreenAvailable, toggleFullscreen } = useWorkbookFullscreen(() => {
  void MessagePlugin.warning(t("statusBar.fullscreenFailed"));
});
const horizontalScrollState = shallowReactive<SheetHorizontalScrollState>({
  position: 0,
  viewportSize: 0,
  contentSize: 0,
});

function updateHorizontalScrollState(state: SheetHorizontalScrollState): void {
  Object.assign(horizontalScrollState, state);
}

const {
  session,
  executeCommand,
  executeReplaceableCommand,
  recalculate,
  workbookRevision,
  workbookGeneration,
  replaceWorkbook,
  focusCellEditor,
  fitSelectionToViewport,
  handleFormulaReferenceKeydown,
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
  activeSelectionRange,
  activeSelectionMode,
  fillSelection,
  activeSheetEvaluator,
  isFormattingSupported,
  activeSelectionStyle,
  formatPainterActive,
  activeSelectionSummary,
  setSelectionDragging,
  dataToolState,
  activeValidationInfo,
  validationFeedback,
  acceptValidationInput,
  dismissValidationInput,
  mergeState,
  commitCell,
  commitCellValue,
  setCellImage,
  setFloatingImage,
  deleteFloatingImage,
  convertFloatingImageToCell,
  convertCellImageToFloating,
  pasteCells,
  clearCells,
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
  undo,
  redo,
  setGridNavigator,
  clearGridClipboard,
  scrollGridHorizontally,
} = useSpreadsheetWorkspaceController();

const cellEditSession = useCellEditSession({ onCommit: commitCell });
const duplicateInputError = computed(() => {
  const feedback = validationFeedback.value;
  if (feedback?.source !== "duplicate" || feedback.target.sheetId !== activeSheet.value.id)
    return undefined;
  return {
    address: feedback.target.address,
    title: t("dataTools.duplicates.rejectionTitle"),
    message: t("dataTools.duplicates.rejectionMessage"),
  };
});
const modalValidationFeedback = computed(() =>
  duplicateInputError.value ? undefined : validationFeedback.value,
);
watch(
  () => [
    cellEditSession.state.active,
    cellEditSession.state.draft,
    cellEditSession.state.owner?.sheetId,
    cellEditSession.state.owner?.address.row,
    cellEditSession.state.owner?.address.column,
    activeSheet.value.id,
  ],
  () => {
    if (validationFeedback.value?.source === "duplicate") dismissValidationInput();
  },
  { flush: "sync" },
);
const { locale } = useAppI18n();
const fillActions = createCellFillActions({
  getWorkbook: () => session.workbook,
  getSheetId: () => activeSheet.value.id,
  getRevision: () => workbookRevision.value,
  execute: executeReplaceableCommand,
});
const canFillRows = computed(
  () =>
    activeSelectionMode.value === "cells" &&
    activeSelectionRange.value.start.row < activeSelectionRange.value.end.row,
);
const canFillColumns = computed(
  () =>
    activeSelectionMode.value === "cells" &&
    activeSelectionRange.value.start.column < activeSelectionRange.value.end.column,
);
async function fillFromDataToolbar(direction: FillDirection): Promise<void> {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    imageBusy.value ||
    formatPainterActive.value
  )
    return;
  if (!cellEditSession.finish()) return;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  await nextTick();
  if (generation !== workbookGeneration.value || sheetId !== activeSheet.value.id) return;
  fillSelection(direction);
  focusCellEditor();
}
const axisTools = createAxisToolActions({
  getSheet: () => activeSheet.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getLocale: () => locale.value,
  getDateSystem: () => session.workbook.dateSystem,
  measurer: browserCellTextMeasurer,
  flushPendingEdits: () => cellEditSession.finish(),
  execute: executeCommand,
  onError: () => {
    void MessagePlugin.warning(t("axisMenu.operationFailed"));
  },
});
const cellOperationActions = createCellOperationActions({
  getSheet: () => activeSheet.value,
  flushPendingEdits: () => cellEditSession.finish(),
  execute: executeCommand,
  onError: () => {
    void MessagePlugin.warning(t("axisMenu.operationFailed"));
  },
});
const contextMenuState = computed<SheetContextMenuState>(() => ({
  format: activeSelectionStyle.value,
  formattingDisabled: !isFormattingSupported.value || activeSheet.value.properties.protected,
  data: dataToolState.value,
  merge: mergeState.value,
}));
const contextActions = useSheetContextActions({
  getSheet: () => activeSheet.value,
  getRange: () => activeSelectionRange.value,
  getAddress: () => activeAddress.value,
  getState: () => contextMenuState.value,
  getGeneration: () => workbookGeneration.value,
  flush: () => cellEditSession.finish(),
  execute: executeCommand,
  axis: axisTools,
  cells: cellOperationActions,
  focus: focusCellEditor,
  onError: () => {
    void MessagePlugin.warning(t("axisMenu.operationFailed"));
  },
  applyFilter,
  runExisting: ({ action, range }) => {
    switch (action.type) {
      case "insert": {
        const address = action.direction === "before" ? range.start : range.end;
        const index =
          (action.axis === "row" ? address.row : address.column) +
          (action.direction === "after" ? 1 : 0);
        insertAxis({ axis: action.axis, index, count: action.count });
        break;
      }
      case "delete": {
        const index = action.axis === "row" ? range.start.row : range.start.column;
        const count = (action.axis === "row" ? range.end.row : range.end.column) - index + 1;
        deleteAxis({ axis: action.axis, index, count });
        break;
      }
      case "formatCells":
        openCellFormat("number");
        break;
      case "formatPainter":
        activateFormatPainter();
        break;
      case "sort":
        sortSelection(action.direction);
        break;
      case "clearFilter":
        clearFilter();
        break;
      case "applyStyle":
        applyCellStyle(action.patch);
        break;
      case "applyBorders":
        applyCellBorders(action.action);
        break;
      case "updateBorderFormat":
        updateBorderFormat(action.patch);
        break;
      case "merge":
        mergeSelection(action.mode);
        break;
      case "unmerge":
        unmergeSelection();
        break;
      case "autoSum":
        formulaTools.aggregate("SUM");
        break;
    }
  },
});
const { statisticsRange, choiceAddress, filterState: contextFilterState } = contextActions;
watch(workbookGeneration, () => cellEditSession.cancel(), { flush: "sync" });
const cellFormatSelection = shallowRef<CellFormatSelection>();
const cellFormatInitialTab = ref<CellFormatTab>("border");
const conditionalFormattingSelection = shallowRef<ConditionalFormattingSelection>();
const conditionalFormatQuickRule = ref<ConditionalFormatQuickRule>();
const conditionalFormatRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const conditionalFormatPickingValue = ref(false);
const { active: pickingConditionalFormatRange, reference: pickedConditionalFormatReference } =
  conditionalFormatRangePicker;
watch(workbookGeneration, () => {
  cellFormatSelection.value = undefined;
  conditionalFormattingSelection.value = undefined;
  conditionalFormatRangePicker.cancel();
});

function openCellFormat(tab: CellFormatTab = "border"): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  cellFormatInitialTab.value = tab;
  cellFormatSelection.value = captureCellFormatSelection();
}

function closeCellFormat(): void {
  cellFormatSelection.value = undefined;
  void nextTick(focusCellEditor);
}

function confirmCellFormat(change: CellFormatChange): void {
  const target = cellFormatSelection.value;
  if (!target) return;
  applyCellFormat(change, target);
  closeCellFormat();
}

function openConditionalFormatting(kind?: ConditionalFormatQuickRule): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  const target = captureConditionalFormattingSelection();
  if (!target) return;
  const preset = kind ? getConditionalFormatPreset(kind) : undefined;
  if (preset) {
    setConditionalFormats(
      [
        {
          id: createConditionalFormatRuleId(),
          ranges: [target.range],
          anchor: { ...target.range.start },
          condition: preset,
          style: {},
        },
        ...target.rules,
      ],
      target,
    );
    void nextTick(focusCellEditor);
    return;
  }
  conditionalFormatQuickRule.value = kind;
  conditionalFormattingSelection.value = target;
}

function closeConditionalFormatting(): void {
  conditionalFormatRangePicker.cancel();
  conditionalFormattingSelection.value = undefined;
  conditionalFormatQuickRule.value = undefined;
  void nextTick(focusCellEditor);
}

async function selectConditionalFormatReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const selected = await conditionalFormatRangePicker.selectReference(current);
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !conditionalFormattingSelection.value
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  if (selected === undefined) return undefined;
  const target = resolveRangeReference(workbook, selected, sheetId);
  if (!target || target.sheetId !== sheetId) return undefined;
  return formatConditionalFormatRanges([target.range]);
}

async function selectConditionalFormatValueReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  conditionalFormatPickingValue.value = true;
  try {
    const selected = await conditionalFormatRangePicker.selectReference(current, {
      singleCell: true,
    });
    if (
      session.workbook !== workbook ||
      workbookGeneration.value !== generation ||
      !conditionalFormattingSelection.value
    )
      return undefined;
    if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
    if (selected === undefined) return undefined;
    const target = resolveRangeReference(workbook, selected, sheetId);
    if (
      !target ||
      target.range.start.row !== target.range.end.row ||
      target.range.start.column !== target.range.end.column
    )
      return undefined;
    const reference = formatRangeReference(workbook.sheets.get(target.sheetId)!.name, target.range);
    return target.sheetId === sheetId
      ? `=${reference.slice(reference.lastIndexOf("!") + 1)}`
      : reference;
  } finally {
    conditionalFormatPickingValue.value = false;
  }
}

function saveConditionalFormats(rules: Parameters<typeof setConditionalFormats>[0]): void {
  const target = conditionalFormattingSelection.value;
  if (!target) return;
  if (setConditionalFormats(rules, target)) closeConditionalFormatting();
}

function clearConditionalFormatRules(scope: "selection" | "sheet"): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || !cellEditSession.finish()) return;
  clearConditionalFormats(scope);
}

function onSelectSheet(sheetId: string): void {
  if (cellEditSession.state.composing) return;
  if (cellEditSession.state.active && cellEditSession.state.draft.startsWith("=")) {
    cellEditSession.activateSurface("formula-bar");
    selectSheet(sheetId);
    void nextTick(() => formulaBarRef.value?.focus({ preserveSelection: true }));
    return;
  }
  if (cellEditSession.finish()) selectSheet(sheetId);
}

async function onTraverseFromFormulaBar(payload: {
  address: { row: number; column: number };
  direction: "up" | "down" | "left" | "right";
  sheetId?: string;
}): Promise<void> {
  if (payload.sheetId && payload.sheetId !== activeSheet.value.id) {
    selectSheet(payload.sheetId);
    await nextTick();
  }
  traverseFromFormulaBar(payload);
}

function onCancelFormulaEdit(sheetId?: string): void {
  if (sheetId && sheetId !== activeSheet.value.id) selectSheet(sheetId);
  void nextTick(focusCellEditor);
}

const assetStore = props.imageAssetStore ?? createIndexedDbImageAssetStore();
const {
  urls: imageAssetUrls,
  loading: loadingImageAssetIds,
  missing: missingImageAssetIds,
} = useImageAssetUrls(() => session.workbook, assetStore);
const imageActions = useSheetImageActions({
  assetStore,
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getAddress: () => activeAddress.value,
  flushPendingEdits: () => cellEditSession.finish(),
  setCellImage,
  setFloatingImage,
  convertCellImageToFloating,
});
const { busy: imageBusy } = imageActions;

const persistence = useWorkbookPersistence({
  store: props.workbookStore ?? createIndexedDbWorkbookStore(),
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  replaceWorkbook,
});
const { loading, status: saveStatus, error: saveError } = persistence;
const fileActions = useWorkbookFileActions({
  persistence,
  assetStore,
  getWorkbook: () => session.workbook,
  flushPendingEdits: () => cellEditSession.finish(),
  hasPendingEdits: cellEditSession.hasPendingEdit,
  isBlocked: () => xlsxActions.busy.value || xlsxActions.confirmation.value !== undefined,
});
const { busy: fileBusy, confirmation, feedback } = fileActions;
const xlsxActions = useWorkbookXlsxActions({
  assetStore,
  persistence,
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  flushPendingEdits: () => cellEditSession.finish(),
  hasPendingEdits: cellEditSession.hasPendingEdit,
  isBlocked: () => fileBusy.value || confirmation.value !== undefined || imageBusy.value,
});
const { busy: xlsxBusy, confirmation: xlsxConfirmation, feedback: xlsxFeedback } = xlsxActions;

const formulaTools = useFormulaToolsController({
  getWorkbook: () => session.workbook,
  getSelection: () => ({
    address: activeAddress.value,
    range: activeSelectionRange.value,
  }),
  getSheetEvaluator: () => activeSheetEvaluator.value,
  editSession: cellEditSession,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  execute: executeCommand,
  focusFormulaBar: () => formulaBarRef.value?.focus({ preserveSelection: true }),
  recalculate,
});
const duplicateErrorChecks = useDuplicateErrorChecks({
  getWorkbook: () => session.workbook,
  getSheet: () => activeSheet.value,
  getEvaluator: () => activeSheetEvaluator.value,
  getRevision: () => workbookRevision.value,
});
const {
  errorCells: duplicateErrorCells,
  settings: duplicateCheckSettings,
  ignoredCount: ignoredDuplicateCount,
} = duplicateErrorChecks;
const activeCellErrorKind = computed(() =>
  duplicateErrorChecks.errorKinds.value.get(
    `${activeAddress.value.row}:${activeAddress.value.column}`,
  ),
);
const activeCellErrorDescription = computed(() =>
  activeCellErrorKind.value === "number-stored-as-text"
    ? {
        numberConversion: true,
        label: t("dataTools.duplicates.errorChecks.numberStoredAsText"),
        message: t("dataTools.duplicates.errorChecks.numberStoredAsTextMessage"),
        ignoreAllHint: t("dataTools.duplicates.errorChecks.ignoreAllNumberTextHint"),
      }
    : undefined,
);
const duplicateErrorOptionsVisible = ref(false);
function openDuplicateErrorOptions(): void {
  if (
    loading.value ||
    fileBusy.value ||
    xlsxBusy.value ||
    imageBusy.value ||
    !cellEditSession.finish()
  )
    return;
  duplicateErrorOptionsVisible.value = true;
}
function closeDuplicateErrorOptions(): void {
  duplicateErrorOptionsVisible.value = false;
  void nextTick(focusCellEditor);
}
function confirmDuplicateErrorOptions(payload: {
  settings: ErrorCheckSettings;
  resetIgnored: boolean;
}): void {
  duplicateErrorChecks.applySettings(payload.settings, payload.resetIgnored);
  closeDuplicateErrorOptions();
}
function convertCellErrorValues(scope: "cell" | "selection" | "sheet"): void {
  if (loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value) return;
  if (!cellEditSession.finish()) return;
  convertNumberType("text-to-number", scope, { allowPrecisionLoss: true });
  void nextTick(focusCellEditor);
}
function ignoreSelectedDuplicateErrors(): void {
  duplicateErrorChecks.ignoreRange(activeSelectionRange.value);
  void nextTick(focusCellEditor);
}
function ignoreAllDuplicateErrors(): void {
  duplicateErrorChecks.ignoreAll(activeCellErrorKind.value);
  void nextTick(focusCellEditor);
}
function editErrorInFormulaBar(): void {
  if (!activeSheet.value.properties.protected) {
    void nextTick(() => formulaBarRef.value?.focus({ preserveSelection: true }));
  }
}
watch([workbookGeneration, () => activeSheet.value.id], () => {
  duplicateErrorOptionsVisible.value = false;
});
const dataTools = useDataToolsController({
  getWorkbook: () => session.workbook,
  getSelection: () => ({
    address: activeAddress.value,
    range: activeSelectionRange.value,
    mode: activeSelectionMode.value,
  }),
  getSheetEvaluator: () => activeSheetEvaluator.value,
  getGeneration: () => workbookGeneration.value,
  getRevision: () => workbookRevision.value,
  navigateToCell: (sheetId, address) => {
    if (activeSheet.value.id !== sheetId) selectSheet(sheetId);
    void nextTick(() => navigateToAddress(formatCellAddress(address)));
  },
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  execute: (command) => {
    const changed = executeCommand(command);
    if (changed) clearGridClipboard();
    return changed;
  },
  flush: () => cellEditSession.finish(),
  focusSheet: focusCellEditor,
  recalculate,
});
const {
  simulationDialog,
  simulationBusy,
  simulationError,
  simulationResult,
  goalSeekDraft,
  planningDraft,
  dataTableDraft,
  dataTablePreview,
  proofreadingVisible,
  proofreadingHasScanned,
  proofreadingDraft,
  proofreadingIssues,
  proofreadingError,
  proofreadingBusy,
  selectedProofreadingIssueIds,
  disabled: dataToolsDisabled,
  capabilities: dataToolCapabilities,
  filterActive: dataFilterActive,
  columns: dataToolColumns,
  sortInitial: dataSortInitial,
  rangeLabel: dataToolRangeLabel,
  splitPreview: dataSplitPreview,
  duplicateCount: dataDuplicateCount,
  validationInitial: dataValidationInitial,
  hasSubtotals: dataHasSubtotals,
  filterState: dataFilterState,
  sortVisible: dataSortVisible,
  textToColumnsVisible: dataTextToColumnsVisible,
  removeDuplicatesVisible: dataRemoveDuplicatesVisible,
  validationVisible: dataValidationVisible,
  subtotalVisible: dataSubtotalVisible,
  advancedFilterVisible: dataAdvancedFilterVisible,
  advancedFilterDraft: dataAdvancedFilterDraft,
  advancedFilterError: dataAdvancedFilterError,
  duplicateValuesVisible,
  duplicateValuesMode,
  duplicateValuesDraft,
  duplicateValuesError,
  consolidateVisible,
  consolidateDraft,
  consolidateError,
  consolidatePreview,
  fillNumberSequenceVisible,
  fillRankVisible,
  fillNumberSequenceInitial,
  fillRankInitial,
  fillSeriesVisible,
  fillBlanksVisible,
  fillTextVisible,
  fillCurrentDateVisible,
  fillSeriesInitial,
  fillBlanksInitial,
  fillTextInitial,
  fillCurrentDateInitial,
  fillError,
  fillRangeLabel,
  dropdownListVisible,
  dropdownListInitial,
  dropdownListError,
  lookupFillVisible,
  lookupFillDraft,
  lookupFillError,
  lookupFillPreview,
  sourceColumns: lookupFillSourceColumns,
  targetColumns: lookupFillTargetColumns,
  comparisonVisible,
  comparisonAction,
  comparisonDraft,
  comparisonError,
  comparisonColumns,
} = dataTools;
const {
  history: findHistory,
  replacement: findReplacement,
  replacementFormat: findReplacementFormat,
  replacementFormatSummary: findReplacementFormatSummary,
  format: findFormat,
  options: findOptions,
  optionsExpanded: findOptionsExpanded,
  results: findResults,
  resultCount: findResultCount,
  hasSearchedAll: findHasSearchedAll,
  status: findStatus,
  formatSummary: findFormatSummary,
} = workbookFind;
const findFormatTarget = ref<"find" | "replace">("find");
const findFormatDraft = shallowRef<ReturnType<typeof createFindFormatDraft>>();
const findFormatPicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingFindFormat, reference: pickedFindFormatReference } = findFormatPicker;
function openFind(mode: WorkbookFindMode = "find"): void {
  if (!cellEditSession.finish()) return;
  findMode.value = mode;
  findDialogVisible.value = true;
  void nextTick(() => findDialogRef.value?.focusQuery());
}
useWorkbookFindShortcuts({
  canOpen: (event) => {
    if (
      cellEditSession.state.composing ||
      formulaEditorVisible.value ||
      formulaInsertVisible.value ||
      activeRangePicker.value ||
      cellFormatSelection.value ||
      findFormatDraft.value
    )
      return false;
    const dialog = event.target instanceof Element ? event.target.closest(".t-dialog") : null;
    return !dialog || dialog.classList.contains("workbook-find-dialog-frame");
  },
  open: openFind,
});
function runFind(direction: "forward" | "backward"): void {
  if (cellEditSession.finish()) workbookFind.find(direction);
}
function runFindAll(): void {
  if (cellEditSession.finish()) workbookFind.findAll();
}
function runReplace(all = false): void {
  if (!cellEditSession.finish()) return;
  if (all) workbookFind.replaceAll();
  else workbookFind.replace();
}
function runGoTo(options: SheetGoToOptions): void {
  if (cellEditSession.finish()) workbookGoTo.locate(options);
}
function selectGoToResult(result: WorkbookFindResult): void {
  if (cellEditSession.finish()) workbookGoTo.selectResult(result);
}
function selectFindResult(result: WorkbookFindResult): void {
  if (cellEditSession.finish()) workbookFind.selectResult(result);
}
function configureFindFormat(target: "find" | "replace" = "find"): void {
  if (!cellEditSession.finish()) return;
  findFormatTarget.value = target;
  findFormatDraft.value = createFindFormatDraft(
    target === "replace" ? workbookFind.replacementFormat.value : workbookFind.format.value,
  );
}
function confirmFindFormat(change: CellFormatChange): void {
  if (findFormatTarget.value === "replace") {
    workbookFind.setReplacementFormat(
      applyFindFormatChange(workbookFind.replacementFormat.value, change),
    );
  } else {
    workbookFind.setFormat(applyFindFormatChange(workbookFind.format.value, change));
  }
  findFormatDraft.value = undefined;
}
async function pickFindFormat(
  mode: WorkbookFindFormatMode,
  purpose: "find" | "replace" = "find",
): Promise<void> {
  if (!cellEditSession.finish()) return;
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const selected = await findFormatPicker.selectReference(
    formatRangeReference(activeSheet.value.name, {
      start: activeAddress.value,
      end: activeAddress.value,
    }),
  );
  if (
    !selected ||
    workbook !== session.workbook ||
    generation !== workbookGeneration.value ||
    !findDialogVisible.value
  )
    return;
  const target = resolveRangeReference(workbook, selected, sheetId);
  if (!target) return;
  const sheet = workbook.sheets.get(target.sheetId);
  if (!sheet) return;
  const address = target.range.start;
  const setFormat =
    purpose === "replace" ? workbookFind.setReplacementFormat : workbookFind.setFormat;
  setFormat(
    buildFindFormatFromCell(sheet.cells.get(`${address.row}:${address.column}`)?.style, mode),
    `${sheet.name}!${formatCellAddress(address)}`,
  );
}
watch(findDialogVisible, (visible) => {
  if (!visible) {
    findFormatPicker.cancel();
    findFormatDraft.value = undefined;
  }
});
watch(workbookGeneration, () => {
  findFormatPicker.cancel();
  findFormatDraft.value = undefined;
});
const simulationRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingSimulationRange, reference: pickedSimulationReference } =
  simulationRangePicker;
async function selectSimulationReference(
  current: string,
  options: RangeReferenceSelectionOptions = { singleCell: true },
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const dialog = simulationDialog.value;
  const selected = await simulationRangePicker.selectReference(current, options);
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !dialog ||
    simulationDialog.value !== dialog
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(simulationDialog, () => simulationRangePicker.cancel());
const proofreadingRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingProofreadingRange, reference: pickedProofreadingReference } =
  proofreadingRangePicker;
async function selectProofreadingReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  const selected = await proofreadingRangePicker.selectReference(current);
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !proofreadingVisible.value
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(proofreadingVisible, (visible) => {
  if (!visible) proofreadingRangePicker.cancel();
});
const splitRangePicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingSplitRange, reference: pickedSplitReference } = splitRangePicker;
async function selectSplitReference(
  current: string,
  options: RangeReferenceSelectionOptions = { singleCell: true },
): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  const selected = await splitRangePicker.selectReference(current, options);
  if (session.workbook !== workbook || !dataTextToColumnsVisible.value) return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(dataTextToColumnsVisible, (visible) => {
  if (!visible) splitRangePicker.cancel();
});
const validationRangePicker = useRangeReferencePicker(() => activeSheet.value.name, {
  singleCell: true,
});
const { active: pickingValidationRange, reference: pickedValidationReference } =
  validationRangePicker;
const validationPickingCell = ref(true);
async function selectValidationReference(
  current: string,
  options: RangeReferenceSelectionOptions = { singleCell: true },
): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  validationPickingCell.value = options.singleCell === true;
  const selected = await validationRangePicker.selectReference(current, options);
  if (session.workbook !== workbook || !dataValidationVisible.value) return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(dataValidationVisible, (visible) => {
  if (!visible) validationRangePicker.cancel();
});
const dropdownRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingDropdownRange, reference: pickedDropdownReference } = dropdownRangePicker;
async function selectDropdownReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const sheetId = activeSheet.value.id;
  const selected = await dropdownRangePicker.selectReference(current);
  if (session.workbook !== workbook || !dropdownListVisible.value) return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
watch(dropdownListVisible, (visible) => {
  if (!visible) dropdownRangePicker.cancel();
});
const fillRankRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingFillRankRange, reference: pickedFillRankReference } = fillRankRangePicker;
const fillRankPickingDestination = ref(false);
async function selectFillRankReference(
  current: string,
  singleCell: boolean,
): Promise<string | undefined> {
  const workbook = session.workbook;
  const generation = workbookGeneration.value;
  const sheetId = activeSheet.value.id;
  fillRankPickingDestination.value = singleCell;
  const selected = await fillRankRangePicker.selectReference(current, { singleCell });
  if (
    session.workbook !== workbook ||
    workbookGeneration.value !== generation ||
    !fillRankVisible.value
  )
    return undefined;
  if (activeSheet.value.id !== sheetId && workbook.sheets.has(sheetId)) selectSheet(sheetId);
  return selected;
}
const selectFillRankSource = (current: string) => selectFillRankReference(current, false);
const selectFillRankDestination = (current: string) => selectFillRankReference(current, true);
watch(fillRankVisible, (visible) => {
  if (!visible) fillRankRangePicker.cancel();
});
const advancedRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingAdvancedRange, reference: pickedAdvancedReference } = advancedRangePicker;
const advancedRangeField = ref<"listRange" | "criteriaRange" | "destination">();
async function pickAdvancedFilterRange(field: "listRange" | "criteriaRange" | "destination") {
  advancedRangeField.value = field;
  const selected = await advancedRangePicker.selectReference(dataAdvancedFilterDraft.value[field]);
  advancedRangeField.value = undefined;
  if (selected !== undefined && dataAdvancedFilterVisible.value) {
    const draft: AdvancedFilterDraft = { ...dataAdvancedFilterDraft.value, [field]: selected };
    dataTools.updateAdvancedFilterDraft(draft);
  }
}
watch(dataAdvancedFilterVisible, (visible) => {
  if (!visible) advancedRangePicker.cancel();
});
const duplicateRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingDuplicateRange, reference: pickedDuplicateReference } = duplicateRangePicker;
async function pickDuplicateRange() {
  const selected = await duplicateRangePicker.selectReference(duplicateValuesDraft.value.range);
  if (selected !== undefined && duplicateValuesVisible.value) {
    dataTools.updateDuplicateValuesDraft({ ...duplicateValuesDraft.value, range: selected });
  }
}
watch(duplicateValuesVisible, (visible) => {
  if (!visible) duplicateRangePicker.cancel();
});
const comparisonRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingComparisonRange, reference: pickedComparisonReference } =
  comparisonRangePicker;
async function pickComparisonRange(field: "firstRange" | "secondRange") {
  const selected = await comparisonRangePicker.selectReference(comparisonDraft.value[field]);
  if (selected !== undefined && comparisonVisible.value) {
    dataTools.updateComparisonDraft({ ...comparisonDraft.value, [field]: selected });
  }
}
watch(comparisonVisible, (visible) => {
  if (!visible) comparisonRangePicker.cancel();
});
const lookupFillRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingLookupFillRange, reference: pickedLookupFillReference } =
  lookupFillRangePicker;
async function pickLookupFillRange(field: "sourceRange" | "targetRange") {
  const selected = await lookupFillRangePicker.selectReference(lookupFillDraft.value[field]);
  if (selected !== undefined && lookupFillVisible.value) {
    dataTools.updateLookupFillDraft({ ...lookupFillDraft.value, [field]: selected });
  }
}
watch(lookupFillVisible, (visible) => {
  if (!visible) lookupFillRangePicker.cancel();
});
const consolidateRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingConsolidateRange, reference: pickedConsolidateReference } =
  consolidateRangePicker;
async function selectConsolidateSourceReference(current: string): Promise<string | undefined> {
  const workbook = session.workbook;
  const selected = await consolidateRangePicker.selectReference(current);
  return session.workbook === workbook && consolidateVisible.value ? selected : undefined;
}
async function pickConsolidateRange() {
  const selected = await consolidateRangePicker.selectReference(
    consolidateDraft.value.destination,
    { singleCell: true },
  );
  if (selected === undefined || !consolidateVisible.value) return;
  dataTools.updateConsolidateDraft({ ...consolidateDraft.value, destination: selected });
}
watch(consolidateVisible, (visible) => {
  if (!visible) consolidateRangePicker.cancel();
});
const dataToolsModalOpen = computed(
  () =>
    (Boolean(simulationDialog.value) && !pickingSimulationRange.value) ||
    (proofreadingVisible.value && !pickingProofreadingRange.value) ||
    fillNumberSequenceVisible.value ||
    (fillRankVisible.value && !pickingFillRankRange.value) ||
    fillSeriesVisible.value ||
    fillBlanksVisible.value ||
    fillTextVisible.value ||
    fillCurrentDateVisible.value ||
    duplicateErrorOptionsVisible.value ||
    dataTools.sortVisible.value ||
    (dataTools.textToColumnsVisible.value && !pickingSplitRange.value) ||
    dataTools.removeDuplicatesVisible.value ||
    (dataValidationVisible.value && !pickingValidationRange.value) ||
    dataTools.subtotalVisible.value ||
    (dataAdvancedFilterVisible.value && !pickingAdvancedRange.value) ||
    (duplicateValuesVisible.value && !pickingDuplicateRange.value) ||
    (comparisonVisible.value && !pickingComparisonRange.value) ||
    (lookupFillVisible.value && !pickingLookupFillRange.value) ||
    (dropdownListVisible.value && !pickingDropdownRange.value) ||
    (consolidateVisible.value && !pickingConsolidateRange.value),
);

function chooseValidationValue(payload: {
  address: CellAddress;
  value: string | number | boolean;
}): void {
  if (!cellEditSession.finish()) return;
  commitCellValue(payload);
  void nextTick(focusCellEditor);
}

function retryValidationInput(): void {
  dismissValidationInput();
  void nextTick(() =>
    cellEditSession.state.surface === "formula-bar"
      ? formulaBarRef.value?.focus({ preserveSelection: true })
      : focusCellEditor(),
  );
}

function cancelValidationInput(): void {
  dismissValidationInput();
  cellEditSession.cancel();
  void nextTick(focusCellEditor);
}

function confirmValidationInput(): void {
  if (acceptValidationInput()) cellEditSession.cancel();
  void nextTick(focusCellEditor);
}

function toggleOutline(payload: { id: string; collapsed: boolean }): void {
  if (dataToolsDisabled.value || !cellEditSession.finish()) return;
  executeCommand(
    createSetSheetOutlineGroupCollapsedCommand(activeSheet.value.id, payload.id, payload.collapsed),
  );
}

function showOutlineLevel(payload: { axis: SheetDimensionAxis; level: number }): void {
  if (dataToolsDisabled.value || !cellEditSession.finish()) return;
  executeCommand(
    createSetSheetOutlineLevelCommand(activeSheet.value.id, payload.axis, payload.level),
  );
}
const {
  disabled: formulaToolsDisabled,
  editTargetSheet,
  namesVisible,
  namedRanges,
  nameSelectionReference,
  recentFunctions,
  calculationSettings,
} = formulaTools;
const formulaReadOnly = computed(() => editTargetSheet.value.properties.protected);
const formulaInsertVisible = ref(false);

function closeFormulaInsert(): void {
  formulaInsertVisible.value = false;
  void nextTick(() => formulaBarRef.value?.focus({ preserveSelection: true }));
}

function insertFunctionFromBar(name: string): void {
  formulaTools.insertFunction(name);
  closeFormulaInsert();
}

const formulaEditor = useFormulaEditorController({
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  getAddress: () => activeAddress.value,
  editSession: cellEditSession,
  isBusy: () => loading.value || fileBusy.value || xlsxBusy.value || imageBusy.value,
  focusFormulaBar: () => formulaBarRef.value?.focus({ preserveSelection: true }),
});
const {
  visible: formulaEditorVisible,
  previewing: formulaPreviewing,
  previewValue: formulaPreviewValue,
  value: formulaEditorValue,
  targetLabel: formulaEditorTarget,
  error: formulaEditorError,
  disabled: formulaEditorDisabled,
} = formulaEditor;
watch(workbookGeneration, () => {
  formulaEditor.reset();
  formulaInsertVisible.value = false;
  namesVisible.value = false;
  recentFunctions.value = [];
});

const nameRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingNameRange, reference: pickedNameReference } = nameRangePicker;
const activeRangePicker = computed(() => {
  if (pickingFindFormat.value) return findFormatPicker;
  if (pickingSimulationRange.value) return simulationRangePicker;
  if (pickingProofreadingRange.value) return proofreadingRangePicker;
  if (pickingSplitRange.value) return splitRangePicker;
  if (pickingFillRankRange.value) return fillRankRangePicker;
  if (pickingValidationRange.value) return validationRangePicker;
  if (pickingDropdownRange.value) return dropdownRangePicker;
  if (pickingConsolidateRange.value) return consolidateRangePicker;
  if (pickingLookupFillRange.value) return lookupFillRangePicker;
  if (pickingComparisonRange.value) return comparisonRangePicker;
  if (pickingDuplicateRange.value) return duplicateRangePicker;
  if (pickingAdvancedRange.value) return advancedRangePicker;
  if (pickingConditionalFormatRange.value) return conditionalFormatRangePicker;
  if (pickingNameRange.value) return nameRangePicker;
  return undefined;
});
const pickingReferenceRange = computed(() => activeRangePicker.value !== undefined);
watch(namesVisible, (visible) => {
  if (!visible) nameRangePicker.cancel();
});

function changeSheetProperties(payload: {
  sheetId: string;
  patch: Partial<SheetProperties>;
}): void {
  if (!cellEditSession.finish()) return;
  updateSheetProperties(payload);
}

function onWorkspaceWheel(event: WheelEvent): void {
  if (!event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  event.stopPropagation();
  zoom.value = normalizeSheetZoom(
    zoom.value + (event.deltaY < 0 ? SHEET_ZOOM_STEP : -SHEET_ZOOM_STEP),
  );
}

function onWorkspaceKeydown(event: KeyboardEvent): void {
  if (formulaEditorVisible.value || formulaInsertVisible.value) return;
  const picker = activeRangePicker.value;
  if (picker) {
    if (event.key === "Escape") picker.cancel();
    else if (event.key === "Enter") picker.confirm();
    else if (event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (
    event.key === "1" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !cellEditSession.state.composing
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!cellFormatSelection.value) openCellFormat();
    return;
  }
  if (
    event.key === "F2" &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing &&
    !cellEditSession.state.composing
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (cellEditSession.state.surface === "formula-bar") focusCellEditor();
    else formulaBarRef.value?.focus({ preserveSelection: true });
    return;
  }
  if (event.key !== "Escape" || !formatPainterActive.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  cancelFormatPainter();
}
</script>

<template>
  <section
    class="spreadsheet-workspace"
    :aria-label="t('workspace.editor')"
    :aria-busy="loading || fileBusy || imageBusy || xlsxBusy"
    @keydown.capture="onWorkspaceKeydown"
    @wheel.capture="onWorkspaceWheel"
  >
    <input
      :ref="imageActions.fileInput"
      type="file"
      class="spreadsheet-workspace__image-input"
      accept="image/png,image/jpeg,image/webp,image/gif"
      :aria-label="t('image.insertMenu')"
      @change="imageActions.onFileChange"
    />
    <SpreadsheetRibbon
      :state="activeSelectionStyle"
      :disabled="!isFormattingSupported || activeSheet.properties.protected"
      :conditional-formatting-disabled="activeSheet.properties.protected"
      :read-only="activeSheet.properties.protected"
      @toggle-protection="
        changeSheetProperties({
          sheetId: activeSheet.id,
          patch: { protected: !activeSheet.properties.protected },
        })
      "
      :format-painter-active="formatPainterActive"
      :data-state="dataToolState"
      :merge-state="mergeState"
      :formula-disabled="formulaToolsDisabled"
      :edit-session-id="cellEditSession.id"
      :recent-functions="recentFunctions"
      :name-creation-enabled="!formulaToolsDisabled"
      :calculation-settings="calculationSettings"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        !!conditionalFormattingSelection ||
        !!findFormatDraft ||
        namesVisible ||
        pickingReferenceRange ||
        dataToolsModalOpen ||
        formulaEditorVisible ||
        formulaInsertVisible ||
        !!modalValidationFeedback
      "
      @insert-image="imageActions.requestInsert"
      @apply-borders="applyCellBorders"
      @update-border-format="updateBorderFormat"
      @open-cell-format="openCellFormat"
      @create-conditional-format="openConditionalFormatting"
      @manage-conditional-formats="openConditionalFormatting()"
      @clear-conditional-formats="clearConditionalFormatRules"
      @apply-style="applyCellStyle"
      @convert-number-type="convertNumberType"
      @adjust-decimals="adjustNumberFormatDecimals"
      @adjust-indent="adjustIndent"
      @activate-format-painter="activateFormatPainter"
      @auto-sum="formulaTools.aggregate('SUM')"
      @insert-function="formulaTools.insertFunction"
      @aggregate="formulaTools.aggregate"
      @open-names="formulaTools.openNames"
      @create-names-from-selection="formulaTools.createNamesFromSelection"
      @update-calculation-settings="formulaTools.updateCalculationSettings"
      @recalculate="formulaTools.recalculate"
      @formula-interaction-end="formulaTools.focusFormulaBar"
      @sort="sortSelection"
      @apply-filter="applyFilter"
      @clear-filter="clearFilter"
      @freeze="freeze"
      @unfreeze="unfreeze"
      @merge="mergeSelection"
      @unmerge="unmergeSelection"
      @undo="undo"
      @redo="redo"
    >
      <template #data-tools>
        <DataToolbar
          :disabled="dataToolsDisabled"
          :comparison-disabled="loading || fileBusy || xlsxBusy || imageBusy"
          :capabilities="dataToolCapabilities"
          :fill-disabled="formatPainterActive"
          :can-fill-rows="canFillRows"
          :can-fill-columns="canFillColumns"
          :filter-active="dataFilterActive"
          :edit-session-id="cellEditSession.id"
          @sort="dataTools.sort"
          @open-sort="dataTools.openSort"
          @open-goal-seek="dataTools.openGoalSeek"
          @open-planning="dataTools.openPlanning"
          @open-data-table="dataTools.openDataTable"
          @open-proofreading="dataTools.openDataProofreading"
          @toggle-filter="dataTools.toggleFilter"
          @advanced-filter="dataTools.openAdvancedFilter"
          @clear-filter="dataTools.clearFilter"
          @reapply-filter="dataTools.reapplyFilter"
          @open-text-to-columns="dataTools.openTextToColumns"
          @open-remove-duplicates="dataTools.openRemoveDuplicates"
          @open-duplicate-values="dataTools.openDuplicateValues"
          @open-consolidate="dataTools.openConsolidate"
          @open-lookup-fill="dataTools.openLookupFill"
          @open-comparison="dataTools.openComparison"
          @error-check-options="openDuplicateErrorOptions"
          @clear-duplicate-highlights="dataTools.clearDuplicateHighlights"
          @clear-duplicate-rejections="dataTools.clearDuplicateRejections"
          @open-validation="dataTools.openValidation"
          @open-dropdown-list="dataTools.openDropdownList"
          @fill="fillFromDataToolbar"
          @open-fill-series="dataTools.openFillSeries"
          @open-fill-number-sequence="dataTools.openFillNumberSequence"
          @open-fill-rank="dataTools.openFillRank"
          @flash-fill="dataTools.flashFill"
          @open-fill-current-date="dataTools.fillCurrentDate"
          @open-fill-blanks="dataTools.openFillBlanks"
          @open-fill-text="dataTools.openFillText"
          @group="dataTools.group"
          @ungroup="dataTools.ungroup"
          @clear-outline="dataTools.clearOutline"
          @expand="dataTools.setGroupsCollapsed(false)"
          @collapse="dataTools.setGroupsCollapsed(true)"
          @open-subtotal="dataTools.openSubtotal"
        />
      </template>
      <template #row-column-tools>
        <RowColumnOperationsMenu
          :sheet="activeSheet"
          :range="activeSelectionRange"
          :edit-session-id="cellEditSession.id"
          :disabled="loading || fileBusy || xlsxBusy || activeSheet.properties.protected"
          @resize="axisTools.resize"
          @auto-fit="axisTools.autoFit"
          @standard-width="axisTools.standardWidth"
          @visibility="axisTools.visibility"
          @cell-operation="cellOperationActions.cellOperation"
          @delete-empty-rows="cellOperationActions.deleteEmptyRows"
          @insert="cellEditSession.finish() && insertAxis($event)"
          @delete="cellEditSession.finish() && deleteAxis($event)"
        />
      </template>
      <template #worksheet-tools>
        <WorksheetOperationsMenu
          :sheets="sheets"
          :active-sheet-id="activeSheet.id"
          :disabled="loading || fileBusy || xlsxBusy"
          @add="cellEditSession.finish() && addSheet()"
          @duplicate="cellEditSession.finish() && duplicateSheet($event)"
          @rename="cellEditSession.finish() && renameSheet($event)"
          @move="cellEditSession.finish() && moveSheet($event)"
          @delete="cellEditSession.finish() && deleteSheet($event)"
          @update-properties="changeSheetProperties"
          @restore="cellEditSession.finish() && restoreSheet($event)"
        />
      </template>
      <template #file-actions>
        <WorkbookFileActions
          :status="saveStatus"
          :error="saveError"
          :feedback="feedback"
          :can-reset="fileActions.canReset.value"
          :disabled="loading || fileBusy || xlsxBusy || !!xlsxConfirmation"
          @save="fileActions.save"
          @import-json="fileActions.importJson"
          @export-json="fileActions.exportJson"
          @reload="fileActions.requestReload"
          @reset="fileActions.requestReset"
        >
          <template #extra-menu-actions="{ close }">
            <XlsxFileActions
              :disabled="loading || fileBusy || imageBusy || !!confirmation || !!xlsxConfirmation"
              :busy="xlsxBusy"
              @close="close"
              @import-xlsx="xlsxActions.importXlsx"
              @export-xlsx="xlsxActions.exportXlsx"
            />
          </template>
        </WorkbookFileActions>
      </template>
    </SpreadsheetRibbon>
    <DataToolsDialogs
      :sort-visible="dataSortVisible"
      :text-to-columns-visible="dataTextToColumnsVisible"
      :remove-duplicates-visible="dataRemoveDuplicatesVisible"
      :validation-visible="dataValidationVisible"
      :subtotal-visible="dataSubtotalVisible"
      :columns="dataToolColumns"
      :sort-initial="dataSortInitial"
      :sort-color-columns="dataTools.sortColorColumns.value"
      :date-system="session.workbook.dateSystem"
      :range-label="dataToolRangeLabel"
      :split-preview="dataSplitPreview"
      :split-column-count="dataTools.splitColumnCount.value"
      :split-preview-rows="dataTools.splitPreviewRows.value"
      :split-source-rows="dataTools.splitSourceRows.value"
      :split-suggestions="dataTools.splitSuggestions.value"
      :split-preview-error="dataTools.splitPreviewError.value"
      :split-destination-label="dataTools.splitDestinationLabel.value"
      :split-picking="pickingSplitRange"
      :select-split-reference="selectSplitReference"
      :duplicate-count="dataDuplicateCount"
      :validation-initial="dataValidationInitial"
      :validation-suspended="pickingValidationRange"
      :select-validation-reference="selectValidationReference"
      :has-subtotals="dataHasSubtotals"
      @close-sort="dataTools.closeSort"
      @sort="dataTools.applySort"
      @close-text-to-columns="dataTools.closeTextToColumns"
      @text-to-columns="dataTools.applyTextToColumns"
      @text-to-columns-draft-change="dataTools.updateTextToColumnsDraft"
      @close-remove-duplicates="dataTools.closeRemoveDuplicates"
      @remove-duplicates="dataTools.applyRemoveDuplicates"
      @remove-duplicates-draft-change="dataTools.updateRemoveDuplicatesDraft"
      @close-validation="dataTools.closeValidation"
      @validation="dataTools.applyValidation"
      @clear-validation="dataTools.clearValidation"
      @close-subtotal="dataTools.closeSubtotal"
      @subtotal="dataTools.applySubtotal"
      @remove-subtotals="dataTools.removeSubtotals"
    />
    <RangeReferencePicker
      v-if="pickingSplitRange"
      :reference="pickedSplitReference"
      :edit-session-id="cellEditSession.id"
      @confirm="splitRangePicker.confirm"
      @cancel="splitRangePicker.cancel"
    />
    <RangeReferencePicker
      v-if="pickingValidationRange"
      :reference="pickedValidationReference"
      :edit-session-id="cellEditSession.id"
      :title="validationPickingCell ? t('dataTools.validation.selectCell') : undefined"
      :hint="validationPickingCell ? t('dataTools.validation.selectCellHint') : undefined"
      @confirm="validationRangePicker.confirm"
      @cancel="validationRangePicker.cancel"
    />
    <DuplicateErrorCheckOptionsDialog
      :visible="duplicateErrorOptionsVisible"
      :settings="duplicateCheckSettings"
      :ignored-count="ignoredDuplicateCount"
      @confirm="confirmDuplicateErrorOptions"
      @close="closeDuplicateErrorOptions"
    />
    <ConsolidateDialog
      :visible="consolidateVisible"
      :initial="consolidateDraft"
      :error="consolidateError"
      :preview="consolidatePreview"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingConsolidateRange"
      :select-source-reference="selectConsolidateSourceReference"
      @close="dataTools.closeConsolidate"
      @apply="dataTools.applyConsolidate"
      @draft-change="dataTools.updateConsolidateDraft"
      @pick-range="pickConsolidateRange"
    />
    <RangeReferencePicker
      v-if="pickingConsolidateRange"
      :reference="pickedConsolidateReference"
      :title="t('dataTools.consolidate.title')"
      @confirm="consolidateRangePicker.confirm"
      @cancel="consolidateRangePicker.cancel"
    />
    <FillNumberSequenceDialog
      :visible="fillNumberSequenceVisible"
      :initial="fillNumberSequenceInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillNumberSequence"
    />
    <FillRankDialog
      :visible="fillRankVisible"
      :initial="fillRankInitial"
      :error="fillError"
      :picking="pickingFillRankRange"
      :select-source-reference="selectFillRankSource"
      :select-destination-reference="selectFillRankDestination"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillRank"
    />
    <RangeReferencePicker
      v-if="pickingFillRankRange"
      :reference="pickedFillRankReference"
      :edit-session-id="cellEditSession.id"
      :title="
        t(
          fillRankPickingDestination
            ? 'dataTools.fill.pickRankDestination'
            : 'dataTools.fill.pickRankSource',
        )
      "
      @confirm="fillRankRangePicker.confirm"
      @cancel="fillRankRangePicker.cancel"
    />
    <FillSeriesDialog
      :visible="fillSeriesVisible"
      :initial="fillSeriesInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillSeries"
    />
    <FillBlanksDialog
      :visible="fillBlanksVisible"
      :initial="fillBlanksInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillBlanks"
    />
    <FillTextDialog
      :visible="fillTextVisible"
      :initial="fillTextInitial"
      :error="fillError"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillText"
    />
    <FillCurrentDateDialog
      :visible="fillCurrentDateVisible"
      :initial="fillCurrentDateInitial"
      :error="fillError"
      :range-label="fillRangeLabel"
      @close="dataTools.closeFillTool"
      @apply="dataTools.applyFillCurrentDate"
    />
    <DropdownListDialog
      :visible="dropdownListVisible"
      :initial="dropdownListInitial"
      :error="dropdownListError"
      :suspended="pickingDropdownRange"
      :select-reference="selectDropdownReference"
      @close="dataTools.closeDropdownList"
      @apply="dataTools.applyDropdownList"
    />
    <RangeReferencePicker
      v-if="pickingDropdownRange"
      :reference="pickedDropdownReference"
      :edit-session-id="cellEditSession.id"
      :title="t('dataTools.dropdown.title')"
      @confirm="dropdownRangePicker.confirm"
      @cancel="dropdownRangePicker.cancel"
    />
    <LookupFillDialog
      :visible="lookupFillVisible"
      :initial="lookupFillDraft"
      :error="lookupFillError"
      :preview="lookupFillPreview"
      :source-columns="lookupFillSourceColumns"
      :target-columns="lookupFillTargetColumns"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingLookupFillRange"
      @close="dataTools.closeLookupFill"
      @apply="dataTools.applyLookupFill"
      @draft-change="dataTools.updateLookupFillDraft"
      @pick-range="pickLookupFillRange"
    />
    <RangeReferencePicker
      v-if="pickingLookupFillRange"
      :reference="pickedLookupFillReference"
      :title="t('dataTools.lookupFill.title')"
      @confirm="lookupFillRangePicker.confirm"
      @cancel="lookupFillRangePicker.cancel"
    />
    <DataComparisonDialog
      :visible="comparisonVisible"
      :action="comparisonAction"
      :initial="comparisonDraft"
      :columns="comparisonColumns"
      :error="comparisonError"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingComparisonRange"
      @close="dataTools.closeComparison"
      @apply="dataTools.applyComparison"
      @draft-change="dataTools.updateComparisonDraft"
      @pick-range="pickComparisonRange"
    />
    <RangeReferencePicker
      v-if="pickingComparisonRange"
      :reference="pickedComparisonReference"
      :edit-session-id="cellEditSession.id"
      @confirm="comparisonRangePicker.confirm"
      @cancel="comparisonRangePicker.cancel"
    />
    <DataTableDialog
      :visible="simulationDialog === 'dataTable'"
      :initial="dataTableDraft"
      :busy="simulationBusy"
      :error="simulationError"
      :result="dataTablePreview"
      :suspended="pickingSimulationRange"
      :select-reference="selectSimulationReference"
      @close="dataTools.closeSimulation"
      @solve="dataTools.solveDataTable"
      @apply="dataTools.applyDataTable"
      @draft-change="dataTools.updateDataTableDraft"
    />
    <GoalSeekDialog
      :visible="simulationDialog === 'goalSeek'"
      :initial="goalSeekDraft"
      :busy="simulationBusy"
      :error="simulationError"
      :result="simulationResult"
      :suspended="pickingSimulationRange"
      :select-reference="selectSimulationReference"
      @close="dataTools.closeSimulation"
      @solve="dataTools.solveGoalSeek"
      @apply="dataTools.applySimulation"
      @draft-change="dataTools.updateGoalSeekDraft"
    />
    <PlanningSolverDialog
      :visible="simulationDialog === 'planning'"
      :initial="planningDraft"
      :busy="simulationBusy"
      :error="simulationError"
      :result="simulationResult"
      :suspended="pickingSimulationRange"
      :select-reference="selectSimulationReference"
      @close="dataTools.closeSimulation"
      @solve="dataTools.solvePlanning"
      @apply="dataTools.applySimulation"
      @draft-change="dataTools.updatePlanningDraft"
    />
    <RangeReferencePicker
      v-if="pickingSimulationRange"
      :reference="pickedSimulationReference"
      :edit-session-id="cellEditSession.id"
      @confirm="simulationRangePicker.confirm"
      @cancel="simulationRangePicker.cancel"
    />
    <DataProofreadingDialog
      :visible="proofreadingVisible"
      :has-scanned="proofreadingHasScanned"
      :draft="proofreadingDraft"
      :issues="proofreadingIssues"
      :selected-ids="selectedProofreadingIssueIds"
      :busy="proofreadingBusy"
      :error="proofreadingError"
      :picking="pickingProofreadingRange"
      :select-reference="selectProofreadingReference"
      @close="dataTools.closeDataProofreading"
      @draft-change="dataTools.updateDataProofreadingDraft"
      @scan="dataTools.scanDataProofreadingResults"
      @selection-change="dataTools.setSelectedProofreadingIssueIds"
      @select-issue="dataTools.selectDataProofreadingIssue"
      @apply-issue="dataTools.applyDataProofreadingIssue"
      @apply-type="dataTools.applyDataProofreadingType"
      @apply-selected="dataTools.applySelectedDataProofreadingIssues"
      @ignore-issue="dataTools.ignoreDataProofreadingIssue"
      @ignore-type="dataTools.ignoreDataProofreadingType"
    />
    <RangeReferencePicker
      v-if="pickingProofreadingRange"
      :reference="pickedProofreadingReference"
      :edit-session-id="cellEditSession.id"
      @confirm="proofreadingRangePicker.confirm"
      @cancel="proofreadingRangePicker.cancel"
    />
    <DuplicateValuesDialog
      :visible="duplicateValuesVisible"
      :mode="duplicateValuesMode"
      :initial="duplicateValuesDraft"
      :error="duplicateValuesError"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="pickingDuplicateRange"
      @close="dataTools.closeDuplicateValues"
      @apply="dataTools.applyDuplicateValues"
      @draft-change="dataTools.updateDuplicateValuesDraft"
      @pick-range="pickDuplicateRange"
    />
    <RangeReferencePicker
      v-if="pickingDuplicateRange"
      :reference="pickedDuplicateReference"
      :edit-session-id="cellEditSession.id"
      @confirm="duplicateRangePicker.confirm"
      @cancel="duplicateRangePicker.cancel"
    />
    <AdvancedFilterDialog
      :visible="dataAdvancedFilterVisible"
      :initial="dataAdvancedFilterDraft"
      :error="dataAdvancedFilterError"
      :busy="loading || fileBusy || xlsxBusy || imageBusy"
      :picking="advancedRangeField"
      @close="dataTools.closeAdvancedFilter"
      @apply="dataTools.applyAdvancedFilter"
      @draft-change="dataTools.updateAdvancedFilterDraft"
      @pick-range="pickAdvancedFilterRange"
    />
    <RangeReferencePicker
      v-if="pickingAdvancedRange"
      :reference="pickedAdvancedReference"
      :edit-session-id="cellEditSession.id"
      @confirm="advancedRangePicker.confirm"
      @cancel="advancedRangePicker.cancel"
    />
    <FilterColumnPanel
      v-if="dataFilterState"
      v-bind="dataFilterState"
      :date-system="session.workbook.dateSystem"
      @sort="dataTools.sortFilterColumn"
      @apply="dataTools.applyColumnFilter"
      @clear="dataTools.clearColumnFilter"
      @close="dataTools.closeColumnFilter"
    />
    <DataValidationFeedbackDialog
      v-if="modalValidationFeedback"
      :feedback="modalValidationFeedback"
      @retry="retryValidationInput"
      @accept="confirmValidationInput"
      @cancel="cancelValidationInput"
    />
    <NamedRangesDialog
      :edit-session-id="cellEditSession.id"
      :visible="namesVisible"
      :suspended="pickingNameRange"
      :select-reference="nameRangePicker.selectReference"
      :ranges="namedRanges"
      :sheets="sheets"
      :active-sheet-id="activeSheet.id"
      :selection-reference="nameSelectionReference"
      @close="formulaTools.closeNames"
      @save="formulaTools.saveName"
      @delete="formulaTools.deleteName"
    />
    <RangeReferencePicker
      v-if="pickingNameRange"
      :reference="pickedNameReference"
      :edit-session-id="cellEditSession.id"
      @confirm="nameRangePicker.confirm"
      @cancel="nameRangePicker.cancel"
    />
    <CellFormatDialog
      v-if="cellFormatSelection"
      :state="cellFormatSelection.state"
      :border-state="cellFormatSelection.borderState"
      :border-capabilities="cellFormatSelection.borderCapabilities"
      :merge-state="cellFormatSelection.mergeState"
      :sample-value="cellFormatSelection.sampleValue"
      :date-system="cellFormatSelection.dateSystem"
      :initial-tab="cellFormatInitialTab"
      @confirm="confirmCellFormat"
      @cancel="closeCellFormat"
    />
    <ConditionalFormatManagerDialog
      v-if="conditionalFormattingSelection"
      :visible="true"
      :rules="conditionalFormattingSelection.rules"
      :selection-ranges="formatConditionalFormatRanges([conditionalFormattingSelection.range])"
      :create-kind="conditionalFormatQuickRule"
      :sample-value="conditionalFormattingSelection.sampleValue"
      :date-system="session.workbook.dateSystem"
      :select-reference="selectConditionalFormatReference"
      :select-value-reference="selectConditionalFormatValueReference"
      @save="saveConditionalFormats"
      @close="closeConditionalFormatting"
    />
    <RangeReferencePicker
      v-if="pickingConditionalFormatRange"
      :reference="pickedConditionalFormatReference"
      :edit-session-id="cellEditSession.id"
      :title="
        t(
          conditionalFormatPickingValue
            ? 'conditionalFormatting.value'
            : 'conditionalFormatting.appliesTo',
        )
      "
      @confirm="conditionalFormatRangePicker.confirm"
      @cancel="conditionalFormatRangePicker.cancel"
    />
    <div class="spreadsheet-workspace__file-feedback">
      <WorkbookFileFeedback
        :confirmation="confirmation"
        :busy="fileBusy"
        @confirm="fileActions.confirm"
        @cancel="fileActions.cancel"
      />
      <XlsxFileFeedback
        :feedback="xlsxFeedback"
        :confirmation="xlsxConfirmation"
        :busy="xlsxBusy"
        @confirm="xlsxActions.confirm"
        @cancel="xlsxActions.cancel"
        @dismiss="xlsxActions.dismissFeedback"
      />
    </div>
    <WorkbookFormulaBar
      :read-only="formulaReadOnly"
      :key="workbookGeneration"
      ref="formulaBarRef"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        !!findFormatDraft ||
        pickingReferenceRange ||
        dataToolsModalOpen ||
        formulaEditorVisible ||
        formulaInsertVisible ||
        !!modalValidationFeedback
      "
      :address="activeAddress"
      :sheet-id="activeSheet.id"
      :sheet-name="activeSheet.name"
      :edit-target-sheet-name="editTargetSheet.name"
      :address-label="activeAddressLabel"
      :input-value="activeCellInput"
      :edit-session="cellEditSession"
      :handle-reference-keydown="handleFormulaReferenceKeydown"
      :search-open="findDialogVisible"
      :previewing="formulaPreviewing"
      :preview-value="formulaPreviewValue"
      :formula-editor-disabled="formulaEditorDisabled"
      @navigate="navigateToAddress"
      @commit-cell="commitCell"
      @traverse="onTraverseFromFormulaBar"
      @cancel-edit="onCancelFormulaEdit"
      @open-search="openFind('find')"
      @update-previewing="formulaPreviewing = $event"
      @open-formula-editor="formulaEditor.open"
      @open-insert-function="formulaInsertVisible = true"
    />
    <FormulaFunctionBrowser
      :visible="formulaInsertVisible"
      :recent-functions="recentFunctions"
      :edit-session-id="cellEditSession.id"
      @insert-function="insertFunctionFromBar"
      @close="closeFormulaInsert"
    />
    <FormulaEditorDialog
      :visible="formulaEditorVisible"
      :value="formulaEditorValue"
      :target-label="formulaEditorTarget"
      :preview-value="formulaPreviewValue"
      :edit-session-id="cellEditSession.id"
      :recent-functions="recentFunctions"
      :error="formulaEditorError"
      @change="formulaEditor.change"
      @composing="formulaEditor.composing"
      @confirm="formulaEditor.confirm"
      @close="formulaEditor.close"
    />
    <WorkbookFindDialog
      ref="findDialogRef"
      :mode="findMode"
      :replacement="findReplacement"
      :replacement-format="findReplacementFormat"
      :replacement-format-summary="findReplacementFormatSummary"
      :go-to-results="workbookGoTo.results.value"
      :go-to-result-count="workbookGoTo.resultCount.value"
      :go-to-status="workbookGoTo.status.value"
      :visible="findDialogVisible && !pickingFindFormat && !findFormatDraft"
      :query="searchQuery"
      :history="findHistory"
      :options="findOptions"
      :expanded="findOptionsExpanded"
      :results="findResults"
      :has-searched-all="findHasSearchedAll"
      :result-count="findResultCount"
      :status="findStatus"
      :format-summary="findFormatSummary"
      :format="findFormat"
      @update-query="updateSearchQuery"
      @update-mode="findMode = $event"
      @update-replacement="findReplacement = $event"
      @update-options="workbookFind.updateOptions"
      @update-expanded="workbookFind.setOptionsExpanded"
      @find="runFind"
      @find-all="runFindAll"
      @replace="runReplace()"
      @replace-all="runReplace(true)"
      @go-to="runGoTo"
      @select-go-to-result="selectGoToResult"
      @select-result="selectFindResult"
      @pick-format="pickFindFormat"
      @configure-format="configureFindFormat()"
      @configure-replacement-format="configureFindFormat('replace')"
      @pick-replacement-format="pickFindFormat($event, 'replace')"
      @clear-replacement-format="workbookFind.setReplacementFormat()"
      @clear-format="workbookFind.setFormat()"
      @close="findDialogVisible = false"
      @closed="restoreSearchFocus"
    />
    <RangeReferencePicker
      v-if="pickingFindFormat"
      :reference="pickedFindFormatReference"
      :title="t('navigation.findPickFormat')"
      :hint="t('navigation.findPickFormatHint')"
      :edit-session-id="cellEditSession.id"
      @confirm="findFormatPicker.confirm"
      @cancel="findFormatPicker.cancel"
    />
    <CellFormatDialog
      v-if="findFormatDraft"
      :state="findFormatDraft.state"
      :border-state="findFormatDraft.borderState"
      :border-capabilities="{ innerHorizontal: false, innerVertical: false }"
      :sample-value="(findFormatTarget === 'replace' ? findReplacement : searchQuery) || 'Aa'"
      initial-tab="font"
      @confirm="confirmFindFormat"
      @cancel="findFormatDraft = undefined"
    />
    <div
      class="spreadsheet-workspace__grid"
      :class="{ 'is-eye-comfort': eyeComfortEnabled }"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        !!findFormatDraft ||
        dataToolsModalOpen ||
        formulaEditorVisible ||
        formulaInsertVisible ||
        !!modalValidationFeedback
      "
    >
      <SheetGrid
        v-model:zoom="zoom"
        :show-headers="showHeaders"
        :show-grid-lines="showGridLines"
        :show-axis-quick-tools="showAxisQuickTools"
        :highlight-enabled="highlightEnabled"
        :highlight-color="highlightColor"
        :grid-id="gridId"
        external-horizontal-scrollbar
        :read-only="activeSheet.properties.protected"
        :key="workbookGeneration"
        :ref="setGridNavigator"
        :sheet="activeSheet"
        :evaluator="activeSheetEvaluator"
        :context-menu-state="contextMenuState"
        :validation-info="activeValidationInfo"
        :input-error="duplicateInputError"
        @dismiss-input-error="retryValidationInput"
        :error-cells="duplicateErrorCells"
        :active-cell-error="activeCellErrorDescription"
        :error-indicator-color="duplicateCheckSettings.indicatorColor"
        @convert-cell-to-number="convertCellErrorValues('cell')"
        @convert-selection-to-number="convertCellErrorValues('selection')"
        @correct-sheet-errors="convertCellErrorValues('sheet')"
        @ignore-selected-cell-errors="ignoreSelectedDuplicateErrors"
        @ignore-all-cell-errors="ignoreAllDuplicateErrors"
        @edit-error-in-formula-bar="editErrorInFormulaBar"
        @error-check-options="openDuplicateErrorOptions"
        @filter-column-request="dataTools.openColumnFilter($event.column, $event.anchor)"
        @validation-choose="chooseValidationValue"
        @outline-toggle="toggleOutline"
        @outline-level="showOutlineLevel"
        @context-action="contextActions.request"
        :date-system="session.workbook.dateSystem"
        :reference-editor="activeRangePicker?.editor ?? formulaBarRef"
        :edit-session="cellEditSession"
        :image-asset-urls="imageAssetUrls"
        :loading-image-asset-ids="loadingImageAssetIds"
        :missing-image-asset-ids="missingImageAssetIds"
        @update-floating-image="setFloatingImage"
        @delete-floating-image="deleteFloatingImage"
        @convert-floating-image-to-cell="convertFloatingImageToCell"
        @paste-image-file="imageActions.pasteImageFile"
        @convert-cell-image-to-floating="imageActions.convertCellImageToFloating"
        @paste-floating-image="imageActions.pasteFloatingImage"
        :workbook-revision="workbookRevision"
        :apply-paste="pasteCells"
        :apply-axis-move="moveAxis"
        :apply-fill="fillActions.apply"
        @end-fill="fillActions.clear"
        @fill-feedback="
          MessagePlugin.warning(
            t(
              $event === 'duplicate'
                ? 'dataTools.duplicates.duplicateRejected'
                : `autoFill.${$event}`,
            ),
          )
        "
        :view-state="activeSheetViewState"
        :format-painter-active="formatPainterActive"
        @clear-cells="clearCells"
        @commit-cell="commitCell"
        @delete-axis="deleteAxis"
        @format-painter-target="applyFormatPainterTarget"
        @insert-axis="insertAxis"
        @freeze-change="setFreezePanes"
        @resize-dimension="resizeDimension"
        @cancel-format-painter="cancelFormatPainter"
        @flash-fill="dataTools.flashFill"
        @undo="undo"
        @redo="redo"
        @view-state-change="updateActiveSheetViewState"
        @selection-dragging-change="setSelectionDragging"
        @horizontal-scroll-change="updateHorizontalScrollState"
      />
    </div>
    <SheetColumnStatisticsDialog
      v-if="statisticsRange"
      :sheet="activeSheet"
      :evaluator="activeSheetEvaluator"
      :range="statisticsRange"
      :locale="locale"
      @close="contextActions.closePanels()"
    />
    <SheetColumnChoiceDialog
      v-if="choiceAddress"
      :sheet="activeSheet"
      :evaluator="activeSheetEvaluator"
      :address="choiceAddress"
      :read-only="activeSheet.properties.protected"
      @choose="contextActions.choose"
      @close="contextActions.closePanels()"
    />
    <SheetContextFilterDialog
      v-if="contextFilterState"
      :options="contextFilterState.options"
      :applied-keys="contextFilterState.appliedKeys"
      :disabled="activeSheet.properties.protected"
      @apply="contextActions.confirmFilter"
      @close="contextActions.closePanels()"
    />
    <WorkbookStatusBar
      :edit-session-id="
        cellEditSession.state.draft.startsWith('=') ? cellEditSession.id : undefined
      "
      v-model:zoom="zoom"
      @fit-selection="fitSelectionToViewport"
      v-model:show-headers="showHeaders"
      v-model:show-grid-lines="showGridLines"
      v-model:show-axis-quick-tools="showAxisQuickTools"
      v-model:eye-comfort-enabled="eyeComfortEnabled"
      v-model:highlight-enabled="highlightEnabled"
      v-model:highlight-color="highlightColor"
      :fullscreen="fullscreen"
      :fullscreen-available="fullscreenAvailable"
      @toggle-fullscreen="toggleFullscreen"
      :inert="loading || fileBusy || xlsxBusy || !!cellFormatSelection"
      :sheets="sheets"
      :active-sheet-id="session.workbook.activeSheetId"
      :selection-summary="activeSelectionSummary"
      @select="onSelectSheet"
      @add="cellEditSession.finish() && addSheet()"
      @duplicate="cellEditSession.finish() && duplicateSheet($event)"
      @rename="renameSheet"
      @delete="cellEditSession.finish() && deleteSheet($event)"
      @move="moveSheet"
      @update-properties="changeSheetProperties"
      @restore="cellEditSession.finish() && restoreSheet($event)"
    >
      <template #horizontal-scrollbar>
        <SheetHorizontalScrollbar
          :key="activeSheet.id"
          :state="horizontalScrollState"
          :controls="gridId"
          @scroll="scrollGridHorizontally"
        />
      </template>
    </WorkbookStatusBar>
  </section>
</template>

<style scoped lang="scss">
.spreadsheet-workspace {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) 49px;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-width: 320px;
  min-height: 360px;
  overflow: hidden;
  background: var(--idea-surface-panel);

  &__image-input {
    display: none;
  }

  &__grid {
    min-width: 0;
    min-height: 0;

    &.is-eye-comfort {
      --idea-surface-panel: var(--idea-eye-comfort-surface);
      --idea-surface-secondary: var(--idea-eye-comfort-header);
      --idea-border-subtle: var(--idea-eye-comfort-gridline);
    }
  }
}
</style>
