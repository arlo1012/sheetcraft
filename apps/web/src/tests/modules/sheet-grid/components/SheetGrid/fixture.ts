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
} from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "@sheetcraft/core/history";
import { parseCellContent } from "@sheetcraft/core/input";
import {
  getActiveSheet,
  type CellRange,
  type SheetDimensionAxis,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import SheetGrid from "../../../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import type { AxisMovePayload } from "../../../../../modules/sheet-grid/composables/useAxisMoveDrag";
import { createAppI18n } from "../../../../../shared/i18n";
import { createBrowserIdFactory } from "../../../../../shared/runtime/browser-id-factory";
import type { CellAddress } from "@sheetcraft/core/workbook";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { ActiveCellValidationInfo } from "../../../../../modules/sheet-grid/components/SheetDataControls.vue";
import type { CellEditSession } from "../../../../../shared/cell-editing/useCellEditSession";

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
  validationInfo?: ActiveCellValidationInfo;
  errorCells?: ReadonlySet<string>;
  editSession?: CellEditSession;
  beforeMount?: (sheet: ReturnType<typeof getActiveSheet>) => void;
  evaluator?: (
    session: WorkbookSession,
    sheet: ReturnType<typeof getActiveSheet>,
  ) => SheetEvaluator;
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
      evaluator: options?.evaluator?.(session, sheet),
      initialRowCount: options?.initialRowCount ?? 100,
      initialColumnCount: options?.initialColumnCount ?? 50,
      rowExpansionStep: options?.rowExpansionStep ?? 25,
      columnExpansionStep: options?.columnExpansionStep ?? 10,
      rowExpansionTail: options?.rowExpansionTail ?? 5,
      columnExpansionTail: options?.columnExpansionTail ?? 2,
      showHeaders: options?.showHeaders,
      showGridLines: options?.showGridLines,
      showAxisQuickTools: options?.showAxisQuickTools,
      validationInfo: options?.validationInfo,
      errorCells: options?.errorCells,
      editSession: options?.editSession,
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
  return wrapper.get("textarea.cell-editor").attributes("data-cell-editor");
}

/**
 * Dispatches a pointer event through the unified surface at the centre of a logical cell.
 * Tests therefore exercise the same viewport hit-testing used by the sheet.
 */
export async function triggerCell(
  wrapper: VueWrapper,
  address: CellAddress,
  event: string,
  options: PointerEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const layout = frame.layout;
  const scale = frame.scale;
  const rect = layout.getCellViewportRect(address);
  if (!rect) throw new Error(`Cell ${address.row}:${address.column} is outside the viewport`);

  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger(event === "mousedown" ? "pointerdown" : event, {
    ...options,
    pointerId: (options as MouseEventInit & { pointerId?: number }).pointerId ?? 1,
    clientX: bounds.left + (frame.body.x + rect.x + rect.width / 2) * scale,
    clientY: bounds.top + (frame.body.y + rect.y + rect.height / 2) * scale,
  });
}

export function getCanvasLayout(wrapper: VueWrapper): SheetViewportLayout {
  return (wrapper.getComponent(SheetSurface).props("frame") as SheetRenderFrame).layout;
}

export async function triggerAxisHeader(
  wrapper: VueWrapper,
  axis: SheetDimensionAxis,
  index: number,
  event: "pointerdown" | "pointermove" | "contextmenu" = "pointerdown",
  options: PointerEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const panes = axis === "row" ? frame.rowHeaders : frame.columnHeaders;
  const item = panes.flatMap((pane) => pane.items).find((candidate) => candidate.index === index);
  if (!item) throw new Error(`${axis} header ${index} is outside the viewport`);
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  const point =
    axis === "row"
      ? { x: frame.headerSize.width - 4, y: item.offset + item.size / 2 }
      : { x: item.offset + item.size / 2, y: frame.headerSize.height - 4 };
  await canvas.trigger(event, {
    ...options,
    clientX: bounds.left + point.x * frame.scale,
    clientY: bounds.top + point.y * frame.scale,
  });
}

export async function triggerAxisResize(
  wrapper: VueWrapper,
  axis: SheetDimensionAxis,
  index: number,
  options: PointerEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const panes = axis === "row" ? frame.rowHeaders : frame.columnHeaders;
  const item = panes.flatMap((pane) => pane.items).find((candidate) => candidate.index === index);
  if (!item) throw new Error(`${axis} header ${index} is outside the viewport`);
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  const point =
    axis === "row"
      ? { x: frame.headerSize.width - 4, y: item.offset + item.size - 1 }
      : { x: item.offset + item.size - 1, y: frame.headerSize.height - 4 };
  await canvas.trigger("pointerdown", {
    ...options,
    clientX: bounds.left + point.x * frame.scale,
    clientY: bounds.top + point.y * frame.scale,
  });
}

export async function triggerAxisInsert(
  wrapper: VueWrapper,
  axis: SheetDimensionAxis,
  index: number,
  options: PointerEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const headers = surface.props("headers") as { quickTools: { gutter: number } };
  const panes = axis === "row" ? frame.rowHeaders : frame.columnHeaders;
  const item = panes.flatMap((pane) => pane.items).find((candidate) => candidate.index === index);
  if (!item) throw new Error(`${axis} header ${index} is outside the viewport`);
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  const mainPoint =
    axis === "row"
      ? { x: frame.headerSize.width - 4, y: item.offset + item.size / 2 }
      : { x: item.offset + item.size / 2, y: frame.headerSize.height - 4 };
  const insertPoint =
    axis === "row"
      ? { x: headers.quickTools.gutter / 2, y: item.offset }
      : { x: item.offset, y: headers.quickTools.gutter / 2 };
  await canvas.trigger("pointermove", {
    clientX: bounds.left + mainPoint.x * frame.scale,
    clientY: bounds.top + mainPoint.y * frame.scale,
  });
  await canvas.trigger("pointerdown", {
    ...options,
    clientX: bounds.left + insertPoint.x * frame.scale,
    clientY: bounds.top + insertPoint.y * frame.scale,
  });
}

export async function triggerHeaderCorner(
  wrapper: VueWrapper,
  options: MouseEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const headers = surface.props("headers") as { quickTools: { gutter: number } };
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  const point = {
    x: Math.max(headers.quickTools.gutter, frame.headerSize.width / 2),
    y: Math.max(headers.quickTools.gutter, frame.headerSize.height / 2),
  };
  await canvas.trigger("pointerdown", {
    ...options,
    clientX: bounds.left + point.x * frame.scale,
    clientY: bounds.top + point.y * frame.scale,
  });
}

export function getSheetRenderFrame(wrapper: VueWrapper): SheetRenderFrame {
  return wrapper.getComponent(SheetSurface).props("frame") as SheetRenderFrame;
}
