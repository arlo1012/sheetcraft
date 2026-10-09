import { describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { createCellSelection } from "@sheetcraft/sheet-engine/selection";
import { useDragSelection } from "../../../../modules/sheet-grid/composables/useDragSelection";

describe("useDragSelection", () => {
  test.each(["mouse", "pointer"])(
    "stops %s selection when the left button is no longer held",
    (kind) => {
      const scope = effectScope();
      const change = vi.fn();
      const dragging = vi.fn();
      const selection = scope.run(() =>
        useDragSelection({
          getCellAtClientPoint: () => ({ row: 4, column: 5 }),
          getScroller: () => null,
          getViewportSize: () => ({ width: 320, height: 240 }),
          onComplete: vi.fn(),
          onDraggingChange: dragging,
          onEnsureGridExtentContains: vi.fn(),
          onEnsureGridExtentCoversViewport: vi.fn(),
          onScrollPositionChange: vi.fn(),
          onSelectionChange: change,
        }),
      )!;
      const event = (action: string, buttons: number, clientX: number) => {
        const result = new MouseEvent(`${kind}${action}`, { buttons, clientX });
        if (kind === "pointer") Object.defineProperty(result, "pointerId", { value: 1 });
        return result;
      };
      try {
        selection.start(createCellSelection({ row: 0, column: 0 }), event("down", 1, 0));
        window.dispatchEvent(event("move", 1, 10));
        expect(change).toHaveBeenCalledOnce();
        // A release outside the window may leave us with only the next move event.
        window.dispatchEvent(event("move", 0, 20));
        window.dispatchEvent(event("move", 1, 30));
        expect(change).toHaveBeenCalledOnce();
        expect(dragging.mock.calls).toEqual([[true], [false]]);
      } finally {
        scope.stop();
      }
    },
  );

  test("grows the allocated extent before applying a drag target", () => {
    const order: string[] = [];
    const selection = useDragSelection({
      getCellAtClientPoint: () => ({ row: 4, column: 5 }),
      getScroller: () => null,
      getViewportSize: () => ({ width: 320, height: 240 }),
      onComplete: () => undefined,
      onEnsureGridExtentContains: () => order.push("extent"),
      onEnsureGridExtentCoversViewport: () => undefined,
      onScrollPositionChange: () => undefined,
      onSelectionChange: () => order.push("selection"),
    });

    selection.start(
      createCellSelection({ row: 0, column: 0 }),
      new MouseEvent("mousedown", { buttons: 1, clientX: 0, clientY: 0 }),
    );
    window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 4, clientY: 0 }));
    selection.stop();

    expect(order).toEqual(["extent", "selection"]);
  });
});
