<script setup lang="ts">
import { nextTick, ref, shallowRef, shallowReactive, useId, watch } from "vue";
import type { CellFormatChange } from "@idea10/core/commands";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import { useWorkbookFullscreen } from "../modules/workbook/composables/useWorkbookFullscreen";
import { useEyeComfortMode } from "../modules/workbook/composables/useEyeComfortMode";
import { normalizeSheetZoom, SHEET_ZOOM_STEP } from "../shared/sheet-view/zoom";
import { useCellEditSession } from "../shared/cell-editing/useCellEditSession";
import {
  createIndexedDbImageAssetStore,
  type ImageAssetStore,
} from "../modules/image-assets/imageAssetStore";
import { useImageAssetUrls } from "../modules/image-assets/useImageAssetUrls";
import { useSheetImageActions } from "../modules/sheet-images/useSheetImageActions";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
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
import type { SheetProperties } from "@idea10/core/workbook";

const props = defineProps<{ workbookStore?: WorkbookStore; imageAssetStore?: ImageAssetStore }>();
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
  scrollGridHorizontally,
} = useSpreadsheetWorkspaceController();

const cellEditSession = useCellEditSession({ onCommit: commitCell });
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
  assetStore,
  persistence,
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  flushPendingEdits: () => cellEditSession.finish(),
  hasPendingEdits: cellEditSession.hasPendingEdit,
  isBlocked: () => fileBusy.value || confirmation.value !== undefined || imageBusy.value,
});
const { busy: xlsxBusy, confirmation: xlsxConfirmation, feedback: xlsxFeedback } = xlsxActions;

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
      :inert="loading || fileBusy || xlsxBusy || !!cellFormatSelection"
      @insert-image="imageActions.requestInsert"
      @apply-borders="applyCellBorders"
      @update-border-format="updateBorderFormat"
      @open-cell-format="openCellFormat"
      @apply-style="applyCellStyle"
      @adjust-decimals="adjustNumberFormatDecimals"
      @adjust-indent="adjustIndent"
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
        :error="saveError"
        :feedback="feedback"
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
      :read-only="activeSheet.properties.protected"
      :key="workbookGeneration"
      ref="formulaBarRef"
      :inert="loading || fileBusy || xlsxBusy || !!cellFormatSelection"
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
    <div
      class="spreadsheet-workspace__grid"
      :class="{ 'is-eye-comfort': eyeComfortEnabled }"
      :inert="loading || fileBusy || xlsxBusy || !!cellFormatSelection"
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
        :date-system="session.workbook.dateSystem"
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
        :apply-axis-move="moveAxis"
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
        @horizontal-scroll-change="updateHorizontalScrollState"
      />
    </div>
    <WorkbookStatusBar
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
