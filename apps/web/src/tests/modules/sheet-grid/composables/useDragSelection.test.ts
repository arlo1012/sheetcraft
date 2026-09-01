import { describe, expect, test } from "vitest";
import { createCellSelection } from "@idea10/sheet-engine/selection";
import { useDragSelection } from "../../../../modules/sheet-grid/composables/useDragSelection";

describe("useDragSelection", () => {
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
