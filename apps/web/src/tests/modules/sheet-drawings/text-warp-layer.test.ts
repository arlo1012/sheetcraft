import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { getDrawingShapeTextWarpAdjustments } from "../../../modules/sheet-drawings/shape-text-warp-adjustment";

const shape: SheetGraphicDrawing = {
  ...createGraphicDrawing("warp", "shape", "Warp", { row: 1, column: 1 }),
  offsetX: 4,
  offsetY: 6,
  width: 120,
  height: 80,
  rotation: 37,
  shapeGeometry: { preset: "roundRect" },
  text: "",
  wordArt: true,
  shapeText: { ...createDefaultShapeText(), warp: { preset: "textWave1" } },
};
const rect = { x: 84, y: 30, width: 120, height: 80 };
const mounted: VueWrapper[] = [];
function fixture() {
  const wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: [shape],
      revision: 1,
      selectedDrawingId: shape.id,
      layout: createSheetViewportLayout({
        geometry: createSheetGeometry({
          rowCount: 20,
          columnCount: 12,
          rowHeight: 24,
          columnWidth: 80,
        }),
        rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 }),
        viewportSize: { width: 600, height: 400 },
      }),
      scale: 1,
      readOnly: false,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));
function pointer(type: string, point: { x: number; y: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}
function points() {
  const handle = getDrawingShapeTextWarpAdjustments(shape)[0]!;
  return {
    from: pictureFrameLocalToWorld(rect, shape.rotation, handle.paintedPosition),
    to: pictureFrameLocalToWorld(rect, shape.rotation, {
      x: handle.paintedPosition.x,
      y: handle.paintedPosition.y + 12,
    }),
  };
}
describe("live glyph-warp layer adjustment routing", () => {
  test("independent yellow gesture commits warp only once, preserving body and source", async () => {
    const wrapper = fixture(),
      { from, to } = points();
    expect(wrapper.find('[data-shape-adjustment="0"]').exists()).toBe(true);
    wrapper
      .get('[data-shape-text-warp-adjustment="0"]')
      .element.dispatchEvent(pointer("pointerdown", from));
    window.dispatchEvent(pointer("pointermove", to));
    await nextTick();
    expect(wrapper.emitted("update")).toBeUndefined();
    window.dispatchEvent(pointer("pointerup", to));
    await nextTick();
    const calls = wrapper.emitted("update")!;
    expect(calls).toHaveLength(1);
    const next = calls[0]![0] as SheetGraphicDrawing;
    expect(next.shapeText!.warp).not.toEqual(shape.shapeText!.warp);
    const { shapeText: nextText, ...nextBody } = next;
    const { shapeText: oldText, ...oldBody } = shape;
    expect(nextBody).toEqual(oldBody);
    const { warp: _nextWarp, ...nextSource } = nextText!;
    const { warp: _oldWarp, ...oldSource } = oldText!;
    expect(nextSource).toEqual(oldSource);
  });
  test("keyboard warp action does not route to the ordinary body adjustment", async () => {
    const wrapper = fixture();
    await wrapper
      .get('[data-shape-text-warp-adjustment="0"]')
      .trigger("keydown", { key: "ArrowDown", shiftKey: true });
    const next = wrapper.emitted("update")![0]![0] as SheetGraphicDrawing;
    expect(next.shapeText!.warp).not.toEqual(shape.shapeText!.warp);
    expect(next.shapeGeometry).toEqual(shape.shapeGeometry);
  });
  test.each(["escape", "revision", "replacement", "readonly"] as const)(
    "%s cancels the exact old adjustment owner",
    async (change) => {
      const wrapper = fixture(),
        { from, to } = points();
      wrapper
        .get('[data-shape-text-warp-adjustment="0"]')
        .element.dispatchEvent(pointer("pointerdown", from));
      window.dispatchEvent(pointer("pointermove", to));
      await nextTick();
      if (change === "escape")
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else if (change === "revision") await wrapper.setProps({ revision: 2 });
      else if (change === "readonly") await wrapper.setProps({ readOnly: true });
      else await wrapper.setProps({ drawings: [{ ...shape, name: "replaced" }] });
      window.dispatchEvent(pointer("pointerup", to));
      await nextTick();
      expect(wrapper.emitted("update")).toBeUndefined();
    },
  );
});
