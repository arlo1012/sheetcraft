import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";

const drawing: SheetDrawing = {
  id: "drawing",
  kind: "shape",
  name: "Rectangle",
  anchor: { row: 1, column: 1 },
  offsetX: 4,
  offsetY: 6,
  width: 100,
  height: 50,
  text: "",
  shape: "rectangle",
  fill: "#abcdef",
  stroke: "#000000",
  strokeWidth: 1,
  color: "#000000",
  fontSize: 20,
  bold: false,
  italic: false,
  rotation: 0,
};
function fixture(readOnly = false) {
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 8, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 8, defaultRowHeight: 20 }),
    viewportSize: { width: 400, height: 200 },
  });
  return mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: { drawings: [drawing], layout, scale: 1, readOnly },
    global: { plugins: [createAppI18n("en-US")] },
  });
}
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

describe("drawing layer", () => {
  test("routes keyboard delete, movement, and edit to the selected drawing", async () => {
    const wrapper = fixture();
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]');
    await object.trigger("keydown", { key: "Delete" });
    expect(wrapper.emitted("delete")).toEqual([[drawing.id]]);
    await object.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    expect(wrapper.emitted("update")?.[0]?.[0]).toMatchObject({
      id: drawing.id,
      offsetX: 14,
      offsetY: 6,
    });
    await object.trigger("keydown", { key: "F2" });
    expect(wrapper.emitted("edit")).toEqual([[drawing]]);
    await object.trigger("dblclick");
    expect(wrapper.emitted("edit")).toHaveLength(2);
    wrapper.unmount();
  });

  test("cancels a drag without submitting preview geometry", async () => {
    const wrapper = fixture();
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]');
    object.element.dispatchEvent(pointer("pointerdown", 90, 30));
    document.dispatchEvent(pointer("pointermove", 120, 50));
    await nextTick();
    document.dispatchEvent(pointer("pointercancel", 120, 50));
    await nextTick();
    expect(wrapper.emitted("select")).toHaveLength(1);
    expect(wrapper.emitted("update")).toBeUndefined();
    wrapper.unmount();
  });

  test("blocks editing, deletion and movement in read-only mode", async () => {
    const wrapper = fixture(true);
    const object = wrapper.get('[data-sheet-drawing-id="drawing"]');
    for (const key of ["Delete", "ArrowRight", "Enter"]) await object.trigger("keydown", { key });
    await object.trigger("dblclick");
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(wrapper.emitted("edit")).toBeUndefined();
    wrapper.unmount();
  });
});
