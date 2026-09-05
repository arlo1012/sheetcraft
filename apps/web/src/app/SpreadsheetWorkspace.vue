<script setup lang="ts">
import { ref } from "vue";
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

const props = defineProps<{ workbookStore?: WorkbookStore }>();
const formulaBarRef = ref<InstanceType<typeof WorkbookFormulaBar> | null>(null);

const {
  session,
  workbookRevision,
  workbookGeneration,
  replaceWorkbook,
  flushPendingGridEdit,
  hasPendingGridEdit,
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
  workspaceStatusText,
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
} = useSpreadsheetWorkspaceController();

const persistence = useWorkbookPersistence({
  store: props.workbookStore ?? createIndexedDbWorkbookStore(),
  getWorkbook: () => session.workbook,
  getRevision: () => workbookRevision.value,
  replaceWorkbook,
});
const { loading, status: saveStatus, error: saveError } = persistence;
const fileActions = useWorkbookFileActions({
  persistence,
  getWorkbook: () => session.workbook,
  flushPendingEdits: () =>
    flushPendingGridEdit() && (formulaBarRef.value?.flushPendingEdit() ?? true),
  hasPendingEdits: () => hasPendingGridEdit() || (formulaBarRef.value?.hasPendingEdit() ?? false),
});
const { busy: fileBusy, confirmation, feedback } = fileActions;

function onWorkspaceKeydown(event: KeyboardEvent): void {
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
    :aria-busy="loading || fileBusy"
    @keydown.capture="onWorkspaceKeydown"
  >
    <SpreadsheetRibbon
      :state="activeSelectionStyle"
      :disabled="!isFormattingSupported"
      :format-painter-active="formatPainterActive"
      :data-state="dataToolState"
      :merge-state="mergeState"
      :inert="loading || fileBusy"
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
          :disabled="loading || fileBusy"
          @save="fileActions.save"
          @import-json="fileActions.importJson"
          @export-json="fileActions.exportJson"
          @reload="fileActions.requestReload"
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
    </div>
    <WorkbookFormulaBar
      :key="workbookGeneration"
      ref="formulaBarRef"
      :inert="loading || fileBusy"
      :address="activeAddress"
      :address-label="activeAddressLabel"
      :input-value="activeCellInput"
      :search-query="searchQuery"
      @navigate="navigateToAddress"
      @commit-cell="commitCell"
      @traverse="traverseFromFormulaBar"
      @update-search-query="updateSearchQuery"
      @find="findCell"
    />
    <div class="spreadsheet-workspace__grid" :inert="loading || fileBusy">
      <SheetGrid
        :key="workbookGeneration"
        :ref="setGridNavigator"
        :sheet="activeSheet"
        :workbook-revision="workbookRevision"
        :apply-paste="pasteCells"
        :view-state="activeSheetViewState"
        :format-painter-active="formatPainterActive"
        @clear-cells="clearCells"
        @clipboard-feedback="showClipboardFeedback"
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
      :inert="loading || fileBusy"
      :sheets="sheets"
      :active-sheet-id="session.workbook.activeSheetId"
      :status-text="workspaceStatusText"
      :selection-summary="activeSelectionSummary"
      @select="selectSheet"
      @add="addSheet"
      @duplicate="duplicateSheet"
      @rename="renameSheet"
      @delete="deleteSheet"
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

  &__grid {
    min-width: 0;
    min-height: 0;
  }
}
</style>
