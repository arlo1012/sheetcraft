import { DOMWrapper, mount, type VueWrapper } from "@vue/test-utils";
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
  createMoveSheetAxisCommand,
  createResizeSheetDimensionCommand,
  createSetSheetFreezePanesCommand,
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
import SheetCanvasLayer from "../../../../../modules/sheet-grid/components/SheetCanvasLayer.vue";
import type { AxisMovePayload } from "../../../../../modules/sheet-grid/composables/useAxisMoveDrag";
import { createAppI18n } from "../../../../../shared/i18n";
import { createBrowserIdFactory } from "../../../../../shared/runtime/browser-id-factory";
import type { CellAddress } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";

export type SheetGridFixtureOptions = {
  attachTo?: HTMLElement;
  initialRowCount?: number;
  initialColumnCount?: number;
  rowExpansionStep?: number;
  columnExpansionStep?: number;
  rowExpansionTail?: number;
  columnExpansionTail?: number;
  showHeaders?: boolean;
  showGridLines?: boolean;
  showAxisQuickTools?: boolean;
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
      showHeaders: options?.showHeaders,
      showGridLines: options?.showGridLines,
      showAxisQuickTools: options?.showAxisQuickTools,
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
      applyAxisMove(payload: AxisMovePayload): boolean {
        return executeWorkbookCommand(
          session,
          createMoveSheetAxisCommand(
            sheet.id,
            payload.axis,
            payload.index,
            payload.count,
            payload.toIndex,
          ),
        );
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
      onFreezeChange(freezePanes: { rows: number; columns: number }) {
        executeWorkbookCommand(session, createSetSheetFreezePanesCommand(sheet.id, freezePanes));
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

/**
 * Dispatches a pointer event through the canvas at the centre of a logical cell.
 * Tests therefore exercise the same viewport hit-testing used by the sheet.
 */
export async function triggerCell(
  wrapper: VueWrapper,
  address: CellAddress,
  event: string,
  options: MouseEventInit = {},
): Promise<void> {
  const canvasLayer = wrapper.getComponent(SheetCanvasLayer);
  const layout = canvasLayer.props("layout") as SheetViewportLayout;
  const scale = (canvasLayer.props("scale") as number | undefined) ?? 1;
  const rect = layout.getCellViewportRect(address);
  if (!rect) throw new Error(`Cell ${address.row}:${address.column} is outside the viewport`);

  const canvas = canvasLayer.get<HTMLCanvasElement>("[data-sheet-canvas]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger(event, {
    ...options,
    clientX: bounds.left + (rect.x + rect.width / 2) * scale,
    clientY: bounds.top + (rect.y + rect.height / 2) * scale,
  });
}

export function getCanvasLayout(wrapper: VueWrapper): SheetViewportLayout {
  return wrapper.getComponent(SheetCanvasLayer).props("layout") as SheetViewportLayout;
}
