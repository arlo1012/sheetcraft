import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";
import { getStandardShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
const drawing: SheetGraphicDrawing = {
  id: "s",
  kind: "shape",
  name: "s",
  anchor: { row: 1, column: 1 },
  offsetX: 4,
  offsetY: 6,
  width: 120,
  height: 80,
  text: "",
  shape: "rectangle",
  shapeGeometry: { preset: "roundRect" },
  fill: "#abcdef",
  stroke: "#000000",
  strokeWidth: 2,
  color: "#000000",
  fontSize: 14,
  bold: false,
  italic: false,
  rotation: 37,
};
const rect = { x: 84, y: 30, width: 120, height: 80 };
function fixture(drawingValue = drawing) {
  return mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: [drawingValue],
      revision: 1,
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
}
function pointer(type: string, p: { x: number; y: number }) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: p.x,
    clientY: p.y,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}
async function select(w: ReturnType<typeof fixture>, d = drawing) {
  const p = pictureFrameLocalToWorld(rect, d.rotation, { x: 60, y: 40 });
  w.get("[data-sheet-drawing-id]").element.dispatchEvent(pointer("pointerdown", p));
  window.dispatchEvent(pointer("pointerup", p));
  await nextTick();
}
describe("standard shape actual layer gesture consumers", () => {
  test("transparent donut center neither starts nor consumes a grid gesture", async () => {
    const d = { ...drawing, rotation: 0, shapeGeometry: { preset: "donut" as const } },
      w = fixture(d);
    const e = pointer("pointerdown", { x: rect.x + 60, y: rect.y + 40 });
    w.get("[data-sheet-drawing-id]").element.dispatchEvent(e);
    await nextTick();
    expect(e.defaultPrevented).toBe(false);
    expect(w.emitted("select")).toBeUndefined();
    w.unmount();
  });
  test("selection outline rotates with body and adjustment holds width/height/angle", async () => {
    const w = fixture();
    await select(w);
    expect(w.get(".standard-shape-selection__outline").attributes("style")).toContain(
      "rotate(37deg)",
    );
    expect(w.findAll("[data-shape-resize]")).toHaveLength(8);
    expect(w.findAll("[data-shape-adjustment]")).toHaveLength(1);
    const h = getStandardShapeGeometry(drawing.shapeGeometry, 120, 80)!.handles[0]!.position,
      from = pictureFrameLocalToWorld(rect, 37, h),
      to = pictureFrameLocalToWorld(rect, 37, { x: 40, y: 0 });
    const before = w.emitted("update")?.length ?? 0;
    w.get('[data-shape-adjustment="0"]').element.dispatchEvent(pointer("pointerdown", from));
    window.dispatchEvent(pointer("pointermove", to));
    await nextTick();
    window.dispatchEvent(pointer("pointerup", to));
    await nextTick();
    const after = w.emitted("update")!;
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)![0]).toMatchObject({ width: 120, height: 80, rotation: 37 });
    expect(
      (after.at(-1)![0] as SheetGraphicDrawing).shapeGeometry?.adjustments?.adj,
    ).toBeGreaterThan(20000);
    w.unmount();
  });
  test.each(["revision", "replacement", "readonly"] as const)(
    "does not commit an old drag after %s changes",
    async (change) => {
      const w = fixture();
      const from = pictureFrameLocalToWorld(rect, 37, { x: 60, y: 40 }),
        to = { x: from.x + 30, y: from.y + 20 };
      w.get("[data-sheet-drawing-id]").element.dispatchEvent(pointer("pointerdown", from));
      window.dispatchEvent(pointer("pointermove", to));
      await nextTick();
      if (change === "revision") await w.setProps({ revision: 2 });
      else if (change === "replacement")
        await w.setProps({ drawings: [{ ...drawing, name: "replacement" }] });
      else await w.setProps({ readOnly: true });
      window.dispatchEvent(pointer("pointerup", to));
      await nextTick();
      expect(w.emitted("update")).toBeUndefined();
      w.unmount();
    },
  );
  test("Escape cancels resize preview and unmount cancels pending adjustment", async () => {
    const w = fixture();
    await select(w);
    const before = w.emitted("update")?.length ?? 0;
    const from = pictureFrameLocalToWorld(rect, 37, { x: 120, y: 80 });
    w.get('[data-shape-resize="se"]').element.dispatchEvent(pointer("pointerdown", from));
    window.dispatchEvent(pointer("pointermove", { x: from.x + 30, y: from.y + 20 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(pointer("pointerup", { x: from.x + 30, y: from.y + 20 }));
    await nextTick();
    expect(w.emitted("update")?.length ?? 0).toBe(before);
    w.unmount();
  });
});
