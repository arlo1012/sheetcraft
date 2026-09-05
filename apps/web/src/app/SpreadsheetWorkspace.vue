<script setup lang="ts">
import { ref, watch } from "vue";
import { useCellEditSession } from "../shared/cell-editing/useCellEditSession";
import {
  createIndexedDbImageAssetStore,
  type ImageAssetStore,
} from "../modules/image-assets/imageAssetStore";
import { useImageAssetUrls } from "../modules/image-assets/useImageAssetUrls";
import { useSheetImageActions } from "../modules/sheet-images/useSheetImageActions";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import WorkbookFormulaBar from "../modules/workbook/components/WorkbookFormulaBar.vue";
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import { useSpreadsheetWorkspaceController } from "./composables/useSpreadsheetWorkspaceController";
import WorkbookFileActions from "../modules/workbook-persistence/components/WorkbookFileActions.vue";
import WorkbookFileFeedback from "../modules/workbook-persistence/components/WorkbookFileFeedback.vue";
import { createIndexedDbWorkbookStore } from "../modules/workbook-persistence/indexedDbWorkbookStore";
import { useWorkbookPersistence } from "../modules/workbook-persistence/useWorkbookPersistence";
import { useWorkbookFileActions } from "../modules/workbook-persistence/useWorkbookFileActions";
import type { WorkbookStore } from "../modules/workbook-persistence/workbookStore";
import XlsxFileActions from "../modules/workbook-xlsx/components/XlsxFileActions.vue";
import XlsxFileFeedback from "../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import { useWorkbookXlsxActions } from "../modules/workbook-xlsx/useWorkbookXlsxActions";

const props = defineProps<{ workbookStore?: WorkbookStore; imageAssetStore?: ImageAssetStore }>();
const formulaBarRef = ref<InstanceType<typeof WorkbookFormulaBar> | null>(null);

const {
  session,
  workbookRevision,
  workbookGeneration,
  replaceWorkbook,
  focusCellEditor,
  handleFormulaReferenceKeydown,
  searchQuery,
  t,
  activeSheet,
  sheets,
  activeSheetViewState,
  activeAddress,
  activeAddressLabel,
  activeCellInput,
  isFormattingSupported,
  activeSelectionStyle,
  formatPainterActive,
  activeSelectionSummary,
  dataToolState,
  mergeState,
  commitCell,
  setCellImage,
  setFloatingImage,
  deleteFloatingImage,
  convertFloatingImageToCell,
  convertCellImageToFloating,
  pasteCells,
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
} = useSpreadsheetWorkspaceController();

const cellEditSession = useCellEditSession({ onCommit: commitCell });
watch(workbookGeneration, () => cellEditSession.cancel(), { flush: "sync" });

function onSelectSheet(sheetId: string): void {
  if (cellEditSession.finish()) selectSheet(sheetId);
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
  persistence,
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  flushPendingEdits: () => cellEditSession.finish(),
  hasPendingEdits: cellEditSession.hasPendingEdit,
  isBlocked: () => fileBusy.value || confirmation.value !== undefined || imageBusy.value,
});
const {
  busy: xlsxBusy,
  confirmation: xlsxConfirmation,
  feedback: xlsxFeedback,
  report: xlsxReport,
} = xlsxActions;

function onWorkspaceKeydown(event: KeyboardEvent): void {
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
      :disabled="!isFormattingSupported"
      :format-painter-active="formatPainterActive"
      :data-state="dataToolState"
      :merge-state="mergeState"
      :inert="loading || fileBusy || xlsxBusy"
      @insert-image="imageActions.requestInsert"
      @apply-borders="applyCellBorders"
      @apply-style="applyCellStyle"
      @adjust-decimals="adjustNumberFormatDecimals"
      @activate-format-painter="activateFormatPainter"
      @auto-sum="autoSum"
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
      <template #file-actions>
        <WorkbookFileActions
          :status="saveStatus"
          :disabled="loading || fileBusy || xlsxBusy || !!xlsxConfirmation"
          @save="fileActions.save"
          @import-json="fileActions.importJson"
          @export-json="fileActions.exportJson"
          @reload="fileActions.requestReload"
        />
        <XlsxFileActions
          :disabled="loading || fileBusy || imageBusy || !!confirmation || !!xlsxConfirmation"
          :busy="xlsxBusy"
          @import-xlsx="xlsxActions.importXlsx"
          @export-xlsx="xlsxActions.exportXlsx"
        />
      </template>
    </SpreadsheetRibbon>
    <div class="spreadsheet-workspace__file-feedback">
      <WorkbookFileFeedback
        :error="saveError"
        :feedback="feedback"
        :confirmation="confirmation"
        :busy="fileBusy"
        @confirm="fileActions.confirm"
        @cancel="fileActions.cancel"
      />
      <XlsxFileFeedback
        :feedback="xlsxFeedback"
        :report="xlsxReport"
        :confirmation="xlsxConfirmation"
        :busy="xlsxBusy"
        @confirm="xlsxActions.confirm"
        @cancel="xlsxActions.cancel"
      />
    </div>
    <WorkbookFormulaBar
      :key="workbookGeneration"
      ref="formulaBarRef"
      :inert="loading || fileBusy || xlsxBusy"
      :address="activeAddress"
      :sheet-id="activeSheet.id"
      :address-label="activeAddressLabel"
      :input-value="activeCellInput"
      :edit-session="cellEditSession"
      :handle-reference-keydown="handleFormulaReferenceKeydown"
      :search-query="searchQuery"
      @navigate="navigateToAddress"
      @commit-cell="commitCell"
      @traverse="traverseFromFormulaBar"
      @update-search-query="updateSearchQuery"
      @find="findCell"
    />
    <div class="spreadsheet-workspace__grid" :inert="loading || fileBusy || xlsxBusy">
      <SheetGrid
        :key="workbookGeneration"
        :ref="setGridNavigator"
        :sheet="activeSheet"
        :reference-editor="formulaBarRef"
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
        :view-state="activeSheetViewState"
        :format-painter-active="formatPainterActive"
        @clear-cells="clearCells"
        @commit-cell="commitCell"
        @delete-axis="deleteAxis"
        @format-painter-target="applyFormatPainterTarget"
        @insert-axis="insertAxis"
        @resize-dimension="resizeDimension"
        @cancel-format-painter="cancelFormatPainter"
        @undo="undo"
        @redo="redo"
        @view-state-change="updateActiveSheetViewState"
      />
    </div>
    <WorkbookStatusBar
      :inert="loading || fileBusy || xlsxBusy"
      :sheets="sheets"
      :active-sheet-id="session.workbook.activeSheetId"
      :selection-summary="activeSelectionSummary"
      @select="onSelectSheet"
      @add="cellEditSession.finish() && addSheet()"
      @duplicate="cellEditSession.finish() && duplicateSheet($event)"
      @rename="renameSheet"
      @delete="cellEditSession.finish() && deleteSheet($event)"
      @move="moveSheet"
    />
  </section>
</template>

<style scoped lang="scss">
.spreadsheet-workspace {
  display: grid;
  grid-template-rows: auto auto 34px minmax(0, 1fr) 30px;
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
  }
}
</style>
