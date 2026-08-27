<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { formatCellAddress, parseCellAddress } from "../modules/sheet-grid/address";
import GridNavigationBar from "../modules/sheet-grid/components/GridNavigationBar.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import type { SheetGridViewState } from "../modules/sheet-grid/view-state";
import WorkbookSheetTabs from "../modules/workbook/components/WorkbookSheetTabs.vue";
import type { GridPastePayload } from "../modules/sheet-grid/useGridClipboard";
import {
  createAddSheetCommand,
  createClearCellRangeCommand,
  createDeleteSheetCommand,
  createPasteCellValuesCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetCellValueCommand,
} from "../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../modules/workbook/history";
import { parseCellInput } from "../modules/workbook/input";
import { findCellByText, type SheetSearchDirection } from "../modules/workbook/search";
import {
  getActiveSheet,
  getWorkbookSheets,
  setActiveSheet,
  type CellAddress,
  type CellRange,
  type SheetDimensionAxis,
} from "../modules/workbook/workbook";

const session = reactive(createWorkbookSession()) as WorkbookSession;
const activeSheet = computed(() => getActiveSheet(session.workbook));
const sheets = computed(() => getWorkbookSheets(session.workbook));
const viewStates = reactive(new Map<string, SheetGridViewState>());
const gridRef = ref<InstanceType<typeof SheetGrid>>();
const searchQuery = ref("");
const navigationFeedback = ref("");
const workspaceStatus = ref("Ready");
const activeAddress = computed(
  () => viewStates.get(activeSheet.value.id)?.selection.active ?? { row: 0, column: 0 },
);
const activeAddressLabel = computed(() => formatCellAddress(activeAddress.value));

function commitCell(payload: { address: CellAddress; input: string }): void {
  executeWorkbookCommand(
    session,
    createSetCellValueCommand(activeSheet.value.id, payload.address, parseCellInput(payload.input)),
    "Edit cell",
  );
}

function pasteCells(payload: GridPastePayload): void {
  executeWorkbookCommand(
    session,
    createPasteCellValuesCommand(activeSheet.value.id, payload.plan.anchor, payload.plan.values, {
      clearRange: payload.clearRange,
    }),
    payload.clearRange ? "Move cells" : "Paste cells",
  );
}

function clearCells(range: CellRange): void {
  executeWorkbookCommand(
    session,
    createClearCellRangeCommand(activeSheet.value.id, range),
    "Clear cells",
  );
}

function resizeDimension(payload: { axis: SheetDimensionAxis; index: number; size: number }): void {
  executeWorkbookCommand(
    session,
    createResizeSheetDimensionCommand(
      activeSheet.value.id,
      payload.axis,
      payload.index,
      payload.size,
    ),
    payload.axis === "column" ? "Resize column" : "Resize row",
  );
}

function selectSheet(sheetId: string): void {
  setActiveSheet(session.workbook, sheetId);
  navigationFeedback.value = "";
}

function addSheet(): void {
  executeWorkbookCommand(session, createAddSheetCommand(session.workbook), "Add sheet");
  workspaceStatus.value = "Ready";
}

function renameSheet(payload: { sheetId: string; name: string }): void {
  try {
    executeWorkbookCommand(
      session,
      createRenameSheetCommand(payload.sheetId, payload.name),
      "Rename sheet",
    );
    workspaceStatus.value = "Ready";
  } catch (error) {
    workspaceStatus.value = error instanceof Error ? error.message : "Unable to rename sheet";
  }
}

function deleteSheet(sheetId: string): void {
  executeWorkbookCommand(
    session,
    createDeleteSheetCommand(session.workbook, sheetId),
    "Delete sheet",
  );
  workspaceStatus.value = "Ready";
}

function getActiveSheetViewState(): SheetGridViewState | undefined {
  return viewStates.get(activeSheet.value.id);
}

function updateActiveSheetViewState(viewState: SheetGridViewState): void {
  viewStates.set(activeSheet.value.id, viewState);
}

function navigateToAddress(input: string): void {
  const address = parseCellAddress(input);
  if (!address) {
    navigationFeedback.value = "Invalid address";
    return;
  }

  navigationFeedback.value = "";
  gridRef.value?.navigateToCell(address);
}

function updateSearchQuery(query: string): void {
  searchQuery.value = query;
  navigationFeedback.value = "";
}

function findCell(direction: SheetSearchDirection): void {
  if (!searchQuery.value.trim()) {
    navigationFeedback.value = "Enter a search term";
    return;
  }

  const match = findCellByText(
    activeSheet.value,
    searchQuery.value,
    activeAddress.value,
    direction,
  );
  if (!match) {
    navigationFeedback.value = "No matches";
    return;
  }

  gridRef.value?.navigateToCell(match);
  navigationFeedback.value = `Found ${formatCellAddress(match)}`;
}
</script>

<template>
  <section class="spreadsheet-workspace" aria-label="Spreadsheet editor">
    <GridNavigationBar
      :address="activeAddressLabel"
      :search-query="searchQuery"
      :search-feedback="navigationFeedback"
      @navigate="navigateToAddress"
      @update-search-query="updateSearchQuery"
      @find="findCell"
    />
    <div class="spreadsheet-workspace__grid">
      <SheetGrid
        ref="gridRef"
        :sheet="activeSheet"
        :view-state="getActiveSheetViewState()"
        @clear-cells="clearCells"
        @commit-cell="commitCell"
        @paste-cells="pasteCells"
        @resize-dimension="resizeDimension"
        @undo="undoWorkbookCommand(session)"
        @redo="redoWorkbookCommand(session)"
        @view-state-change="updateActiveSheetViewState"
      />
    </div>
    <footer class="spreadsheet-workspace__footer">
      <WorkbookSheetTabs
        :sheets="sheets"
        :active-sheet-id="session.workbook.activeSheetId"
        @select="selectSheet"
        @add="addSheet"
        @rename="renameSheet"
        @delete="deleteSheet"
      />
      <span class="spreadsheet-workspace__status" aria-live="polite">{{ workspaceStatus }}</span>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.spreadsheet-workspace {
  display: grid;
  grid-template-rows: 34px minmax(0, 1fr) 30px;
  width: 100%;
  height: 100dvh;
  min-width: 320px;
  min-height: 360px;
  overflow: hidden;
  background: var(--ui-surface-primary);

  &__grid {
    min-width: 0;
    min-height: 0;
  }

  &__footer {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 16px;
    background: var(--ui-surface-muted);
    border-top: 1px solid var(--ui-border-strong);
    color: var(--ui-text-secondary);
    font-size: 12px;
  }

  &__status {
    display: inline-flex;
    align-items: center;
    padding-right: 12px;
    color: var(--ui-text-muted);
  }
}
</style>
