<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import SpreadsheetRibbon from "./SpreadsheetRibbon.vue";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import type { SheetGridViewState } from "@idea10/sheet-engine/view-state";
import WorkbookFormulaBar from "../modules/workbook/components/WorkbookFormulaBar.vue";
import WorkbookStatusBar from "../modules/workbook/components/WorkbookStatusBar.vue";
import type { GridPastePayload } from "../modules/sheet-grid/useGridClipboard";
import {
  createAddSheetCommand,
  createApplyCellBordersCommand,
  createApplyCellStyleCommand,
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createInsertSheetAxisCommand,
  createPasteCellValuesCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetCellValueCommand,
} from "@idea10/core/commands";
import type { CellBorderAction, CellStylePatch } from "@idea10/core/style";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "@idea10/core/history";
import { formatCellValueForInput, parseCellInput } from "@idea10/core/input";
import { findCellByText, type SheetSearchDirection } from "@idea10/core/search";
import { getSelectionSummary } from "@idea10/core/selection-summary";
import {
  createDefaultSelectionCellStyleState,
  getSelectionCellStyleState,
  isCellStyleRangeSupported,
} from "@idea10/core/style-state";
import {
  getActiveSheet,
  getCellValue,
  getWorkbookSheets,
  MAX_SHEET_ROWS,
  setActiveSheet,
  type CellAddress,
  type CellRange,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import { useAppI18n, type MessageKey, type MessageParams } from "../shared/i18n";
import { createBrowserIdFactory } from "../shared/runtime/browser-id-factory";

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

const { t } = useAppI18n();
const session = reactive(
  createWorkbookSession({ idFactory: createBrowserIdFactory() }),
) as WorkbookSession;
const activeSheet = computed(() => getActiveSheet(session.workbook));
const sheets = computed(() => getWorkbookSheets(session.workbook));
const viewStates = reactive(new Map<string, SheetGridViewState>());
const selectionRanges = reactive(new Map<string, CellRange>());
const gridRef = ref<InstanceType<typeof SheetGrid>>();
const searchQuery = ref("");
const workspaceStatus = ref<FeedbackState>();
let workspaceStatusTimer: number | undefined;
const activeAddress = computed(
  () => viewStates.get(activeSheet.value.id)?.selection.active ?? { row: 0, column: 0 },
);
const activeAddressLabel = computed(() => formatCellAddress(activeAddress.value));
const activeCellInput = computed(() =>
  formatCellValueForInput(getCellValue(activeSheet.value, activeAddress.value)),
);
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
const workspaceStatusText = computed(() =>
  workspaceStatus.value ? t(workspaceStatus.value.key, workspaceStatus.value.params) : "",
);

function clearWorkspaceStatus(): void {
  if (workspaceStatusTimer !== undefined) {
    window.clearTimeout(workspaceStatusTimer);
    workspaceStatusTimer = undefined;
  }
  workspaceStatus.value = undefined;
}

function showWorkspaceStatus(status: FeedbackState): void {
  clearWorkspaceStatus();
  workspaceStatus.value = status;
  workspaceStatusTimer = window.setTimeout(() => {
    workspaceStatus.value = undefined;
    workspaceStatusTimer = undefined;
  }, 2_800);
}

function commitCell(payload: { address: CellAddress; input: string }): void {
  executeWorkbookCommand(
    session,
    createSetCellValueCommand(activeSheet.value.id, payload.address, parseCellInput(payload.input)),
    "cells.edit",
  );
  clearWorkspaceStatus();
}

function pasteCells(payload: GridPastePayload): void {
  executeWorkbookCommand(
    session,
    createPasteCellValuesCommand(activeSheet.value.id, payload.plan.anchor, payload.plan.values, {
      clearRange: payload.clearRange,
      styles: payload.styles,
    }),
    payload.clearRange ? "cells.move" : "cells.paste",
  );
}

function clearCells(range: CellRange): void {
  executeWorkbookCommand(
    session,
    createClearCellRangeCommand(activeSheet.value.id, range),
    "cells.clear",
  );
}

function applyCellStyle(patch: CellStylePatch): void {
  if (!isFormattingSupported.value) {
    showWorkspaceStatus({ key: "format.selectionTooLarge" });
    return;
  }
  executeWorkbookCommand(
    session,
    createApplyCellStyleCommand(activeSheet.value.id, activeSelectionRange.value, patch),
    "format.cells",
  );
  clearWorkspaceStatus();
}

function applyCellBorders(action: CellBorderAction): void {
  if (!isFormattingSupported.value) {
    showWorkspaceStatus({ key: "format.selectionTooLarge" });
    return;
  }
  executeWorkbookCommand(
    session,
    createApplyCellBordersCommand(activeSheet.value.id, activeSelectionRange.value, action),
    "format.borders",
  );
  clearWorkspaceStatus();
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
    "dimensions.resize",
  );
}

function insertAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
  executeWorkbookCommand(
    session,
    createInsertSheetAxisCommand(activeSheet.value.id, payload.axis, payload.index, payload.count),
    "structure.insert",
  );
}

function deleteAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
  executeWorkbookCommand(
    session,
    createDeleteSheetAxisCommand(activeSheet.value.id, payload.axis, payload.index, payload.count),
    "structure.delete",
  );
}

function selectSheet(sheetId: string): void {
  setActiveSheet(session.workbook, sheetId);
  clearWorkspaceStatus();
}

function addSheet(): void {
  executeWorkbookCommand(
    session,
    createAddSheetCommand(session.workbook, { idFactory: session.idFactory }),
    "sheets.add",
  );
  clearWorkspaceStatus();
}

function renameSheet(payload: { sheetId: string; name: string }): void {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    showWorkspaceStatus({ key: "workspace.sheetNameEmpty" });
    return;
  }

  const duplicate = sheets.value.some(
    (sheet) =>
      sheet.id !== payload.sheetId && sheet.name.toLowerCase() === normalizedName.toLowerCase(),
  );
  if (duplicate) {
    showWorkspaceStatus({
      key: "workspace.sheetNameDuplicate",
      params: { name: normalizedName },
    });
    return;
  }

  try {
    executeWorkbookCommand(
      session,
      createRenameSheetCommand(payload.sheetId, payload.name),
      "sheets.rename",
    );
    clearWorkspaceStatus();
  } catch {
    showWorkspaceStatus({ key: "workspace.renameFailed" });
  }
}

function deleteSheet(sheetId: string): void {
  executeWorkbookCommand(
    session,
    createDeleteSheetCommand(session.workbook, sheetId),
    "sheets.delete",
  );
  selectionRanges.delete(sheetId);
  viewStates.delete(sheetId);
  clearWorkspaceStatus();
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
    showWorkspaceStatus({ key: "workspace.invalidAddress" });
    return;
  }

  clearWorkspaceStatus();
  gridRef.value?.navigateToCell(address);
}

function traverseFromFormulaBar(payload: { address: CellAddress; direction: "up" | "down" }): void {
  const rowOffset = payload.direction === "up" ? -1 : 1;
  gridRef.value?.navigateToCell({
    row: Math.max(0, Math.min(payload.address.row + rowOffset, MAX_SHEET_ROWS - 1)),
    column: payload.address.column,
  });
}

function updateSearchQuery(query: string): void {
  searchQuery.value = query;
  clearWorkspaceStatus();
}

function findCell(direction: SheetSearchDirection): void {
  if (!searchQuery.value.trim()) {
    showWorkspaceStatus({ key: "workspace.enterSearchTerm" });
    return;
  }

  const match = findCellByText(
    activeSheet.value,
    searchQuery.value,
    activeAddress.value,
    direction,
  );
  if (!match) {
    showWorkspaceStatus({ key: "workspace.noMatches" });
    return;
  }

  gridRef.value?.navigateToCell(match);
  showWorkspaceStatus({
    key: "workspace.found",
    params: { address: formatCellAddress(match) },
  });
}

onBeforeUnmount(clearWorkspaceStatus);
</script>

<template>
  <section class="spreadsheet-workspace" :aria-label="t('workspace.editor')">
    <SpreadsheetRibbon
      :state="activeSelectionStyle"
      :disabled="!isFormattingSupported"
      @apply-borders="applyCellBorders"
      @apply-style="applyCellStyle"
      @undo="undoWorkbookCommand(session)"
      @redo="redoWorkbookCommand(session)"
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
