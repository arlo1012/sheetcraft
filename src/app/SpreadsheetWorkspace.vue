<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import LocaleSwitcher from "./LocaleSwitcher.vue";
import { formatCellAddress, parseCellAddress } from "../modules/sheet-grid/address";
import GridNavigationBar from "../modules/sheet-grid/components/GridNavigationBar.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import type { SheetGridViewState } from "../modules/sheet-grid/view-state";
import WorkbookSheetTabs from "../modules/workbook/components/WorkbookSheetTabs.vue";
import type { GridPastePayload } from "../modules/sheet-grid/useGridClipboard";
import {
  createAddSheetCommand,
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
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
import { useAppI18n, type MessageKey, type MessageParams } from "../shared/i18n";

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

const { t } = useAppI18n();
const session = reactive(createWorkbookSession()) as WorkbookSession;
const activeSheet = computed(() => getActiveSheet(session.workbook));
const sheets = computed(() => getWorkbookSheets(session.workbook));
const viewStates = reactive(new Map<string, SheetGridViewState>());
const gridRef = ref<InstanceType<typeof SheetGrid>>();
const searchQuery = ref("");
const navigationFeedback = ref<FeedbackState>();
const workspaceStatus = ref<FeedbackState>({ key: "workspace.ready" });
const activeAddress = computed(
  () => viewStates.get(activeSheet.value.id)?.selection.active ?? { row: 0, column: 0 },
);
const activeAddressLabel = computed(() => formatCellAddress(activeAddress.value));
const navigationFeedbackText = computed(() =>
  navigationFeedback.value ? t(navigationFeedback.value.key, navigationFeedback.value.params) : "",
);
const workspaceStatusText = computed(() =>
  t(workspaceStatus.value.key, workspaceStatus.value.params),
);

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

function insertAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
  executeWorkbookCommand(
    session,
    createInsertSheetAxisCommand(activeSheet.value.id, payload.axis, payload.index, payload.count),
    payload.axis === "row" ? "Insert rows" : "Insert columns",
  );
}

function deleteAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
  executeWorkbookCommand(
    session,
    createDeleteSheetAxisCommand(activeSheet.value.id, payload.axis, payload.index, payload.count),
    payload.axis === "row" ? "Delete rows" : "Delete columns",
  );
}

function selectSheet(sheetId: string): void {
  setActiveSheet(session.workbook, sheetId);
  navigationFeedback.value = undefined;
}

function addSheet(): void {
  executeWorkbookCommand(session, createAddSheetCommand(session.workbook), "Add sheet");
  workspaceStatus.value = { key: "workspace.ready" };
}

function renameSheet(payload: { sheetId: string; name: string }): void {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    workspaceStatus.value = { key: "workspace.sheetNameEmpty" };
    return;
  }

  const duplicate = sheets.value.some(
    (sheet) =>
      sheet.id !== payload.sheetId && sheet.name.toLowerCase() === normalizedName.toLowerCase(),
  );
  if (duplicate) {
    workspaceStatus.value = {
      key: "workspace.sheetNameDuplicate",
      params: { name: normalizedName },
    };
    return;
  }

  try {
    executeWorkbookCommand(
      session,
      createRenameSheetCommand(payload.sheetId, payload.name),
      "Rename sheet",
    );
    workspaceStatus.value = { key: "workspace.ready" };
  } catch {
    workspaceStatus.value = { key: "workspace.renameFailed" };
  }
}

function deleteSheet(sheetId: string): void {
  executeWorkbookCommand(
    session,
    createDeleteSheetCommand(session.workbook, sheetId),
    "Delete sheet",
  );
  workspaceStatus.value = { key: "workspace.ready" };
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
    navigationFeedback.value = { key: "workspace.invalidAddress" };
    return;
  }

  navigationFeedback.value = undefined;
  gridRef.value?.navigateToCell(address);
}

function updateSearchQuery(query: string): void {
  searchQuery.value = query;
  navigationFeedback.value = undefined;
}

function findCell(direction: SheetSearchDirection): void {
  if (!searchQuery.value.trim()) {
    navigationFeedback.value = { key: "workspace.enterSearchTerm" };
    return;
  }

  const match = findCellByText(
    activeSheet.value,
    searchQuery.value,
    activeAddress.value,
    direction,
  );
  if (!match) {
    navigationFeedback.value = { key: "workspace.noMatches" };
    return;
  }

  gridRef.value?.navigateToCell(match);
  navigationFeedback.value = {
    key: "workspace.found",
    params: { address: formatCellAddress(match) },
  };
}
</script>

<template>
  <section class="spreadsheet-workspace" :aria-label="t('workspace.editor')">
    <GridNavigationBar
      :address="activeAddressLabel"
      :search-query="searchQuery"
      :search-feedback="navigationFeedbackText"
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
        @delete-axis="deleteAxis"
        @insert-axis="insertAxis"
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
      <div class="spreadsheet-workspace__footer-tools">
        <span class="spreadsheet-workspace__status" aria-live="polite">
          {{ workspaceStatusText }}
        </span>
        <LocaleSwitcher />
      </div>
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

  &__footer-tools {
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
  }
}
</style>
