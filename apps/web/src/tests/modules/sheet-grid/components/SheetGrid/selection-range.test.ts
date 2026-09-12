import { describe, expect, test } from "vitest";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

type OverlayRects = Array<{ rect: { x: number; y: number; width: number; height: number } }>;

function selectionRects(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]): OverlayRects {
  return (
    (wrapper.getComponent(SheetSurface).props("overlays") as { rangeRects?: OverlayRects })
      .rangeRects ?? []
  );
}

function activeRects(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]): OverlayRects {
  return (
    (wrapper.getComponent(SheetSurface).props("overlays") as { activeRects?: OverlayRects })
      .activeRects ?? []
  );
}

function dispatchPointerUp(): void {
  const event = new MouseEvent("pointerup", { button: 0 }) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: 1 });
  window.dispatchEvent(event);
}

describe("SheetGrid range selection", () => {
  test("extends a range with Shift click while retaining the active cell", async () => {
    const { session, wrapper } = mountSheetGrid();

    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0, shiftKey: true });

    expect(activeCell(wrapper)).toBe("A1");
    expect(selectionRects(wrapper)).toEqual([
      expect.objectContaining({ rect: { x: 0, y: 0, width: 288, height: 72 } }),
    ]);
    expect(activeRects(wrapper)).toEqual([
      expect.objectContaining({ rect: { x: 0, y: 0, width: 96, height: 24 } }),
    ]);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("emits the completed cell selection as a format painter target", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ formatPainterActive: true });
    await triggerCell(wrapper, { row: 2, column: 3 }, "mousedown", {
      button: 0,
      buttons: 1,
    });
    dispatchPointerUp();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("formatPainterTarget")).toEqual([
      [
        {
          start: { row: 2, column: 3 },
          end: { row: 2, column: 3 },
        },
      ],
    ]);
  });

  test("cancels the armed format painter with Escape", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ formatPainterActive: true });

    await wrapper.get("section.sheet-grid").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("cancelFormatPainter")).toEqual([[]]);
  });

  test("applies the armed format painter to the keyboard selection with Enter", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ formatPainterActive: true });
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    await editor.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("formatPainterTarget")).toEqual([
      [
        {
          start: { row: 0, column: 0 },
          end: { row: 0, column: 1 },
        },
      ],
    ]);
  });

  test("extends with Shift arrows and ordinary arrows reset to one moved cell", async () => {
    const { session, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    await editor.trigger("keydown", { key: "ArrowDown", shiftKey: true });

    expect(activeCell(wrapper)).toBe("A1");
    expect(selectionRects(wrapper)).toEqual([
      expect.objectContaining({ rect: { x: 0, y: 0, width: 192, height: 48 } }),
    ]);
    await editor.trigger("keydown", { key: "ArrowRight" });
    expect(activeCell(wrapper)).toBe("B1");
    expect(selectionRects(wrapper)).toEqual([
      expect.objectContaining({ rect: { x: 96, y: 0, width: 96, height: 24 } }),
    ]);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("aligns non-origin selection outlines with the preceding gridline pixels", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0, shiftKey: true });

    expect(selectionRects(wrapper)).toEqual([
      expect.objectContaining({ rect: { x: 96, y: 24, width: 192, height: 48 } }),
    ]);
    expect(activeRects(wrapper)).toEqual([
      expect.objectContaining({ rect: { x: 96, y: 24, width: 96, height: 24 } }),
    ]);
  });

  test("cycles Tab and Enter inside a retained range", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0, shiftKey: true });

    await editor.trigger("keydown", { key: "Tab" });
    expect(activeCell(wrapper)).toBe("B1");
    expect(selectionRects(wrapper)[0]?.rect.width).toBe(192);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Enter" });
    expect(activeCell(wrapper)).toBe("B2");
    expect(selectionRects(wrapper)[0]?.rect.height).toBe(48);
  });
});
