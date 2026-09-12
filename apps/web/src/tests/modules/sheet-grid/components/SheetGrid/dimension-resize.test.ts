import { describe, expect, test } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  getColumnWidth,
  getRowHeight,
} from "@idea10/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { getCanvasLayout, mountSheetGrid, triggerAxisResize, triggerCell } from "./fixture";

function pointer(type: string, options: MouseEventInit & { pointerId: number }): void {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId });
  window.dispatchEvent(event);
}

function resizeClient(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
  axis: "row" | "column",
  index: number,
): number {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as {
    scale: number;
    rowHeaders: readonly { items: readonly { index: number; offset: number; size: number }[] }[];
    columnHeaders: readonly { items: readonly { index: number; offset: number; size: number }[] }[];
  };
  const item = (axis === "row" ? frame.rowHeaders : frame.columnHeaders)
    .flatMap((pane) => pane.items)
    .find((candidate) => candidate.index === index)!;
  const bounds = surface
    .get<HTMLCanvasElement>("[data-sheet-surface]")
    .element.getBoundingClientRect();
  return axis === "row"
    ? bounds.top + (item.offset + item.size - 1) * frame.scale
    : bounds.left + (item.offset + item.size - 1) * frame.scale;
}

describe("SheetGrid dimension resizing", () => {
  test("does not turn a Canvas resize hit into a header selection", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    await triggerAxisResize(wrapper, "column", 0, { button: 0, pointerId: 1 });
    expect(wrapper.get("[data-cell-editor]").attributes("data-cell-editor")).toBe("B2");
  });

  test("previews then commits a column resize as one undoable command", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const start = resizeClient(wrapper, "column", 0);
    await triggerAxisResize(wrapper, "column", 0, { button: 0, pointerId: 2 });
    pointer("pointermove", { buttons: 1, pointerId: 2, clientX: start + 40 });
    await wrapper.vm.$nextTick();
    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(session.history.undoStack).toHaveLength(0);
    pointer("pointerup", { pointerId: 2, clientX: start + 40 });
    await wrapper.vm.$nextTick();
    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH + 40);
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("clamps a row preview and cancels without history", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const start = resizeClient(wrapper, "row", 0);
    await triggerAxisResize(wrapper, "row", 0, { button: 0, pointerId: 3 });
    pointer("pointermove", { buttons: 1, pointerId: 3, clientY: start + 2_000 });
    expect(wrapper.classes()).toContain("is-resizing-row");
    pointer("pointercancel", { pointerId: 3 });
    await wrapper.vm.$nextTick();
    expect(getRowHeight(sheet, 0)).toBe(DEFAULT_ROW_HEIGHT);
    expect(session.history.undoStack).toHaveLength(0);
    expect(MAX_ROW_HEIGHT).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
  });

  test("keeps header and cell geometry aligned after scrolling past a resized column", async () => {
    const { wrapper } = mountSheetGrid();
    const start = resizeClient(wrapper, "column", 0);
    await triggerAxisResize(wrapper, "column", 0, { button: 0, pointerId: 4 });
    pointer("pointermove", { buttons: 1, pointerId: 4, clientX: start + 40 });
    pointer("pointerup", { pointerId: 4, clientX: start + 40 });
    await wrapper.vm.$nextTick();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollLeft = 100;
    await scroller.trigger("scroll");
    const frame = wrapper.getComponent(SheetSurface).props("frame") as {
      headerSize: { width: number };
      columnHeaders: readonly { items: readonly { index: number; offset: number }[] }[];
    };
    const header = frame.columnHeaders
      .flatMap((pane) => pane.items)
      .find((item) => item.index === 1);
    const cell = getCanvasLayout(wrapper).getCellViewportRect({ row: 0, column: 1 });
    expect(cell).not.toBeNull();
    expect(header?.offset).toBe((cell?.x ?? 0) + frame.headerSize.width);
  });
});
