<script setup lang="ts">
import { computed, reactive } from "vue";
import SheetGrid from "../modules/sheet-grid/components/SheetGrid.vue";
import type { GridPastePayload } from "../modules/sheet-grid/useGridClipboard";
import {
  createClearCellRangeCommand,
  createPasteCellValuesCommand,
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
import {
  getActiveSheet,
  type CellAddress,
  type CellRange,
  type SheetDimensionAxis,
} from "../modules/workbook/workbook";

const session = reactive(createWorkbookSession()) as WorkbookSession;
const activeSheet = computed(() => getActiveSheet(session.workbook));

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
</script>

<template>
  <section class="spreadsheet-workspace" aria-label="Spreadsheet editor">
    <div class="spreadsheet-workspace__grid">
      <SheetGrid
        :sheet="activeSheet"
        @clear-cells="clearCells"
        @commit-cell="commitCell"
        @paste-cells="pasteCells"
        @resize-dimension="resizeDimension"
        @undo="undoWorkbookCommand(session)"
        @redo="redoWorkbookCommand(session)"
      />
    </div>
    <footer class="spreadsheet-workspace__footer" aria-label="Workbook sheets">
      <span class="spreadsheet-workspace__sheet-tab" aria-current="page">
        {{ activeSheet.name }}
      </span>
      <span class="spreadsheet-workspace__status">Ready</span>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.spreadsheet-workspace {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 30px;
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

  &__sheet-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 88px;
    padding: 0 16px;
    background: var(--ui-surface-primary);
    color: var(--ui-text-primary);
    font-weight: 600;

    &::after {
      position: absolute;
      inset: auto 0 0;
      height: 2px;
      background: var(--ui-brand-primary);
      content: "";
    }
  }

  &__status {
    display: inline-flex;
    align-items: center;
    padding-right: 12px;
    color: var(--ui-text-muted);
  }
}
</style>
