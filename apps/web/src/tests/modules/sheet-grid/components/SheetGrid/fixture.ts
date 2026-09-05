import { DOMWrapper, mount } from "@vue/test-utils";
import { reactive } from "vue";
import type {
  GridPastePayload,
  GridPasteResult,
} from "../../../../../modules/sheet-grid/useGridClipboard";
import {
  createGridPasteCommand,
  GridPasteError,
} from "../../../../../modules/sheet-grid/createGridPasteCommand";
import {
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createResizeSheetDimensionCommand,
  createSetCellContentCommand,
} from "@idea10/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "@idea10/core/history";
import { parseCellContent } from "@idea10/core/input";
import { getActiveSheet, type CellRange, type SheetDimensionAxis } from "@idea10/core/workbook";
import SheetGrid from "../../../../../modules/sheet-grid/components/SheetGrid.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { createBrowserIdFactory } from "../../../../../shared/runtime/browser-id-factory";

export type SheetGridFixtureOptions = {
  attachTo?: HTMLElement;
  initialRowCount?: number;
  initialColumnCount?: number;
  rowExpansionStep?: number;
  columnExpansionStep?: number;
  rowExpansionTail?: number;
  columnExpansionTail?: number;
  beforeMount?: (sheet: ReturnType<typeof getActiveSheet>) => void;
};

export function mountSheetGrid(options?: SheetGridFixtureOptions) {
  const session = reactive(
    createWorkbookSession({ idFactory: createBrowserIdFactory() }),
  ) as WorkbookSession;
  const sheet = getActiveSheet(session.workbook);
  options?.beforeMount?.(sheet);
  const wrapper = mount(SheetGrid, {
    attachTo: options?.attachTo,
    global: {
      plugins: [createAppI18n("en-US")],
    },
    props: {
      sheet,
      initialRowCount: options?.initialRowCount ?? 100,
      initialColumnCount: options?.initialColumnCount ?? 50,
      rowExpansionStep: options?.rowExpansionStep ?? 25,
      columnExpansionStep: options?.columnExpansionStep ?? 10,
      rowExpansionTail: options?.rowExpansionTail ?? 5,
      columnExpansionTail: options?.columnExpansionTail ?? 2,
      onClearCells(range: CellRange) {
        executeWorkbookCommand(session, createClearCellRangeCommand(sheet.id, range));
      },
      onCommitCell(payload) {
        executeWorkbookCommand(
          session,
          createSetCellContentCommand(sheet.id, payload.address, parseCellContent(payload.input)),
        );
      },
      applyPaste(payload: GridPastePayload): GridPasteResult {
        try {
          executeWorkbookCommand(session, createGridPasteCommand(sheet, payload));
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            reason: error instanceof GridPasteError ? error.reason : "pasteRejected",
          };
        }
      },
      onResizeDimension(payload: { axis: SheetDimensionAxis; index: number; size: number }) {
        executeWorkbookCommand(
          session,
          createResizeSheetDimensionCommand(sheet.id, payload.axis, payload.index, payload.size),
        );
      },
      onInsertAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }) {
        executeWorkbookCommand(
          session,
          createInsertSheetAxisCommand(sheet.id, payload.axis, payload.index, payload.count),
        );
      },
      onDeleteAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }) {
        executeWorkbookCommand(
          session,
          createDeleteSheetAxisCommand(sheet.id, payload.axis, payload.index, payload.count),
        );
      },
      onUndo() {
        undoWorkbookCommand(session);
      },
      onRedo() {
        redoWorkbookCommand(session);
      },
    },
  });

  return { session, sheet, wrapper };
}

export function getFloatingMenu() {
  return new DOMWrapper(document.body).get('ul[role="menu"]');
}

export function hasFloatingMenu(): boolean {
  return document.body.querySelector('ul[role="menu"]') !== null;
}

export function activeCell(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
): string | undefined {
  return wrapper.get("[data-active-cell]").attributes("data-active-cell");
}
