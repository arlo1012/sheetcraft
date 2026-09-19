<script setup lang="ts">
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
import { useDataToolsController } from "../modules/data-tools/useDataToolsController";
import { useDuplicateErrorChecks } from "../modules/data-tools/useDuplicateErrorChecks";
import type { ErrorCheckSettings } from "../modules/data-tools/duplicate-error-preferences";
import DuplicateErrorCheckOptionsDialog from "../modules/data-tools/components/DuplicateErrorCheckOptionsDialog.vue";
import DataToolbar from "../modules/data-tools/components/DataToolbar.vue";
import DataToolsDialogs from "../modules/data-tools/components/DataToolsDialogs.vue";
import DuplicateValuesDialog from "../modules/data-tools/components/DuplicateValuesDialog.vue";
import AdvancedFilterDialog from "../modules/data-tools/components/AdvancedFilterDialog.vue";
import type { AdvancedFilterDraft } from "../modules/data-tools/data-tools-types";
import FilterColumnPanel from "../modules/data-tools/components/FilterColumnPanel.vue";
import DataValidationFeedbackDialog from "../modules/data-tools/components/DataValidationFeedbackDialog.vue";
import RangeReferencePicker from "../shared/range-reference/RangeReferencePicker.vue";
import { useRangeReferencePicker } from "../shared/range-reference/useRangeReferencePicker";
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
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import {
  useSpreadsheetWorkspaceController,
  type CellFormatSelection,
} from "./composables/useSpreadsheetWorkspaceController";
import CellFormatDialog, {
  type CellFormatTab,
} from "../modules/cell-format/components/CellFormatDialog.vue";
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
  t,
  activeSheet,
  sheets,
  activeSheetViewState,
  activeAddress,
  activeAddressLabel,
  activeCellInput,
  activeSelectionRange,
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
  clearGridClipboard,
  scrollGridHorizontally,
} = useSpreadsheetWorkspaceController();

const cellEditSession = useCellEditSession({ onCommit: commitCell });
const { locale } = useAppI18n();
const fillActions = createCellFillActions({
  getWorkbook: () => session.workbook,
  getSheetId: () => activeSheet.value.id,
  getRevision: () => workbookRevision.value,
  execute: executeReplaceableCommand,
});
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
watch(workbookGeneration, () => {
  cellFormatSelection.value = undefined;
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
function ignoreSelectedDuplicateErrors(): void {
  duplicateErrorChecks.ignoreRange(activeSelectionRange.value);
  void nextTick(focusCellEditor);
}
function ignoreAllDuplicateErrors(): void {
  duplicateErrorChecks.ignoreAll();
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
  getSelection: () => ({ address: activeAddress.value, range: activeSelectionRange.value }),
  getSheetEvaluator: () => activeSheetEvaluator.value,
  getGeneration: () => workbookGeneration.value,
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
} = dataTools;
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
const dataToolsModalOpen = computed(
  () =>
    duplicateErrorOptionsVisible.value ||
    dataTools.sortVisible.value ||
    dataTools.textToColumnsVisible.value ||
    dataTools.removeDuplicatesVisible.value ||
    dataTools.validationVisible.value ||
    dataTools.subtotalVisible.value ||
    (dataAdvancedFilterVisible.value && !pickingAdvancedRange.value) ||
    (duplicateValuesVisible.value && !pickingDuplicateRange.value),
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
watch(workbookGeneration, () => {
  namesVisible.value = false;
  recentFunctions.value = [];
});

const nameRangePicker = useRangeReferencePicker(() => activeSheet.value.name);
const { active: pickingNameRange, reference: pickedNameReference } = nameRangePicker;
const pickingReferenceRange = computed(
  () => pickingNameRange.value || pickingAdvancedRange.value || pickingDuplicateRange.value,
);
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
  if (pickingReferenceRange.value) {
    const picker = pickingDuplicateRange.value
      ? duplicateRangePicker
      : pickingAdvancedRange.value
        ? advancedRangePicker
        : nameRangePicker;
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
        namesVisible ||
        pickingReferenceRange ||
        dataToolsModalOpen ||
        !!validationFeedback
      "
      @insert-image="imageActions.requestInsert"
      @apply-borders="applyCellBorders"
      @update-border-format="updateBorderFormat"
      @open-cell-format="openCellFormat"
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
          :capabilities="dataToolCapabilities"
          :filter-active="dataFilterActive"
          :edit-session-id="cellEditSession.id"
          @sort="dataTools.sort"
          @open-sort="dataTools.openSort"
          @toggle-filter="dataTools.toggleFilter"
          @advanced-filter="dataTools.openAdvancedFilter"
          @clear-filter="dataTools.clearFilter"
          @reapply-filter="dataTools.reapplyFilter"
          @open-text-to-columns="dataTools.openTextToColumns"
          @open-remove-duplicates="dataTools.openRemoveDuplicates"
          @open-duplicate-values="dataTools.openDuplicateValues"
          @error-check-options="openDuplicateErrorOptions"
          @clear-duplicate-highlights="dataTools.clearDuplicateHighlights"
          @clear-duplicate-rejections="dataTools.clearDuplicateRejections"
          @open-validation="dataTools.openValidation"
          @group="dataTools.group"
          @ungroup="dataTools.ungroup"
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
          :disabled="loading || fileBusy || xlsxBusy || !!xlsxConfirmation"
          @save="fileActions.save"
          @import-json="fileActions.importJson"
          @export-json="fileActions.exportJson"
          @reload="fileActions.requestReload"
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
      :duplicate-count="dataDuplicateCount"
      :validation-initial="dataValidationInitial"
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
    <DuplicateErrorCheckOptionsDialog
      :visible="duplicateErrorOptionsVisible"
      :settings="duplicateCheckSettings"
      :ignored-count="ignoredDuplicateCount"
      @confirm="confirmDuplicateErrorOptions"
      @close="closeDuplicateErrorOptions"
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
      v-if="validationFeedback"
      :feedback="validationFeedback"
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
        pickingReferenceRange ||
        dataToolsModalOpen ||
        !!validationFeedback
      "
      :address="activeAddress"
      :sheet-id="activeSheet.id"
      :sheet-name="activeSheet.name"
      :edit-target-sheet-name="editTargetSheet.name"
      :address-label="activeAddressLabel"
      :input-value="activeCellInput"
      :edit-session="cellEditSession"
      :handle-reference-keydown="handleFormulaReferenceKeydown"
      :search-query="searchQuery"
      @navigate="navigateToAddress"
      @commit-cell="commitCell"
      @traverse="onTraverseFromFormulaBar"
      @cancel-edit="onCancelFormulaEdit"
      @update-search-query="updateSearchQuery"
      @find="findCell"
    />
    <div
      class="spreadsheet-workspace__grid"
      :class="{ 'is-eye-comfort': eyeComfortEnabled }"
      :inert="
        loading ||
        fileBusy ||
        xlsxBusy ||
        !!cellFormatSelection ||
        dataToolsModalOpen ||
        !!validationFeedback
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
        :error-cells="duplicateErrorCells"
        :error-indicator-color="duplicateCheckSettings.indicatorColor"
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
        :reference-editor="
          pickingDuplicateRange
            ? duplicateRangePicker.editor
            : pickingAdvancedRange
              ? advancedRangePicker.editor
              : pickingNameRange
                ? nameRangePicker.editor
                : formulaBarRef
        "
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
  grid-template-rows: auto auto 34px minmax(0, 1fr) 49px;
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
