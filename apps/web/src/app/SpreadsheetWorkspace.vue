<script setup lang="ts">
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import WorkbookFormulaBar from "../modules/workbook/components/WorkbookFormulaBar.vue";
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import { useSpreadsheetWorkspaceController } from "./composables/useSpreadsheetWorkspaceController";

const {
  session,
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
  activeSelectionSummary,
  workspaceStatusText,
  commitCell,
  pasteCells,
  clearCells,
  applyCellStyle,
  applyCellBorders,
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
} = useSpreadsheetWorkspaceController();
</script>

<template>
  <section class="spreadsheet-workspace" :aria-label="t('workspace.editor')">
    <SpreadsheetRibbon
      :state="activeSelectionStyle"
      :disabled="!isFormattingSupported"
      @apply-borders="applyCellBorders"
      @apply-style="applyCellStyle"
      @undo="undo"
      @redo="redo"
    />
    <WorkbookFormulaBar
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
    <div class="spreadsheet-workspace__grid">
      <SheetGrid
        :ref="setGridNavigator"
        :sheet="activeSheet"
        :view-state="activeSheetViewState"
        @clear-cells="clearCells"
        @commit-cell="commitCell"
        @delete-axis="deleteAxis"
        @insert-axis="insertAxis"
        @paste-cells="pasteCells"
        @resize-dimension="resizeDimension"
        @undo="undo"
        @redo="redo"
        @view-state-change="updateActiveSheetViewState"
      />
    </div>
    <WorkbookStatusBar
      :sheets="sheets"
      :active-sheet-id="session.workbook.activeSheetId"
      :status-text="workspaceStatusText"
      :selection-summary="activeSelectionSummary"
      @select="selectSheet"
      @add="addSheet"
      @rename="renameSheet"
      @delete="deleteSheet"
    />
  </section>
</template>

<style scoped lang="scss">
.spreadsheet-workspace {
  display: grid;
  grid-template-rows: auto 34px minmax(0, 1fr) 30px;
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
