<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import { formatCellAddress, parseCellAddress } from "../modules/sheet-grid/address";
import GridNavigationBar from "../modules/sheet-grid/components/GridNavigationBar.vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import type { SheetGridViewState } from "../modules/sheet-grid/view-state";
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import type { GridPastePayload } from "../modules/sheet-grid/useGridClipboard";
import {
  createAddSheetCommand,
  createApplyCellStyleCommand,
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createPasteCellValuesCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetCellValueCommand,
} from "../modules/workbook/commands";
import type { CellStylePatch } from "../modules/workbook/cell-style";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../modules/workbook/history";
import { parseCellInput } from "../modules/workbook/input";
import { findCellByText, type SheetSearchDirection } from "../modules/workbook/search";
import { getSelectionSummary } from "../modules/workbook/selection-summary";
import {
  createDefaultSelectionCellStyleState,
  getSelectionCellStyleState,
  isCellStyleRangeSupported,
} from "../modules/workbook/style-state";
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
const selectionRanges = reactive(new Map<string, CellRange>());
const gridRef = ref<InstanceType<typeof SheetGrid>>();
const searchQuery = ref("");
const navigationFeedback = ref<FeedbackState>();
const workspaceStatus = ref<FeedbackState>({ key: "workspace.ready" });
const activeAddress = computed(
  () => viewStates.get(activeSheet.value.id)?.selection.active ?? { row: 0, column: 0 },
);
const activeAddressLabel = computed(() => formatCellAddress(activeAddress.value));
const activeSelectionRange = computed<CellRange>(
  () =>
    selectionRanges.get(activeSheet.value.id) ?? {
      start: { ...activeAddress.value },
      end: { ...activeAddress.value },
    },
);
const isFormattingSupported = computed(() => isCellStyleRangeSupported(activeSelectionRange.value));
const activeSelectionStyle = computed(() =>
  isFormattingSupported.value
    ? getSelectionCellStyleState(activeSheet.value, activeSelectionRange.value)
    : createDefaultSelectionCellStyleState(),
);
const activeSelectionSummary = computed(() =>
  getSelectionSummary(activeSheet.value, activeSelectionRange.value),
);
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
      styles: payload.styles,
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

function applyCellStyle(patch: CellStylePatch): void {
  if (!isFormattingSupported.value) {
    workspaceStatus.value = { key: "format.selectionTooLarge" };
    return;
  }
  executeWorkbookCommand(
    session,
    createApplyCellStyleCommand(activeSheet.value.id, activeSelectionRange.value, patch),
    "Format cells",
  );
  workspaceStatus.value = { key: "workspace.ready" };
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
  selectionRanges.delete(sheetId);
  viewStates.delete(sheetId);
  workspaceStatus.value = { key: "workspace.ready" };
}

function getActiveSheetViewState(): SheetGridViewState | undefined {
  return viewStates.get(activeSheet.value.id);
}

function updateActiveSheetViewState(viewState: SheetGridViewState): void {
  viewStates.set(activeSheet.value.id, viewState);
}

function updateActiveSelection(payload: { active: CellAddress; range: CellRange }): void {
  selectionRanges.set(activeSheet.value.id, {
    start: { ...payload.range.start },
    end: { ...payload.range.end },
  });
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
    <SpreadsheetRibbon
      :state="activeSelectionStyle"
      :disabled="!isFormattingSupported"
      @apply-style="applyCellStyle"
      @undo="undoWorkbookCommand(session)"
      @redo="redoWorkbookCommand(session)"
    />
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
        @selection-change="updateActiveSelection"
        @undo="undoWorkbookCommand(session)"
        @redo="redoWorkbookCommand(session)"
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
  grid-template-rows: 72px 34px minmax(0, 1fr) 30px;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-width: 320px;
  min-height: 360px;
  overflow: hidden;
  background: var(--td-bg-color-container);

  &__grid {
    min-width: 0;
    min-height: 0;
  }
}
</style>
