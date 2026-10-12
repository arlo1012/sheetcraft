import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import ShapeGallery from "../../../modules/sheet-drawings/components/ShapeGallery.vue";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import { createAppI18n } from "../../../shared/i18n";
const shape: SheetGraphicDrawing = {
  id: "s",
  kind: "shape",
  name: "s",
  anchor: { row: 0, column: 0 },
  offsetX: 8,
  offsetY: 8,
  width: 180,
  height: 90,
  text: "label",
  shape: "rectangle",
  shapeGeometry: { preset: "roundRect", adjustments: { adj: 30000 } },
  fill: "#abcdef",
  stroke: "#123456",
  strokeWidth: 2,
  color: "#123456",
  fontSize: 14,
  bold: false,
  italic: false,
  rotation: 37,
};
function fixture(
  drawing = shape,
  requestTextBox?: (direction: "horizontal" | "vertical") => boolean,
) {
  return mount(DrawingEditorDialog, {
    attachTo: document.body,
    props: { drawing, disabled: false, requestTextBox },
    global: { plugins: [createAppI18n("zh-CN")], stubs: { TTextarea: true } },
  });
}
const choice = (id: string) => SHAPE_GALLERY.flatMap((g) => g.items).find((c) => c.id === id)!;
describe("standard gallery editor intent and draft integrity", () => {
  test("choosing existing preset does not reset custom adjustment and never aliases original object", async () => {
    const w = fixture();
    w.getComponent(ShapeGallery).vm.$emit("choose", choice("roundRect"));
    await nextTick();
    w.getComponent(Dialog).vm.$emit("confirm");
    const saved = w.emitted("confirm")![0]![0] as SheetGraphicDrawing;
    expect(saved.shapeGeometry).toEqual(shape.shapeGeometry);
    expect(saved.shapeGeometry).not.toBe(shape.shapeGeometry);
    expect(saved.shapeGeometry!.adjustments).not.toBe(shape.shapeGeometry!.adjustments);
    expect(shape.shapeGeometry!.adjustments!.adj).toBe(30000);
    w.unmount();
  });
  test("line selection creates actual endpoints and later closed preset drops only stale line metadata", async () => {
    const w = fixture();
    w.getComponent(ShapeGallery).vm.$emit("choose", choice("doubleArrow"));
    await nextTick();
    w.getComponent(Dialog).vm.$emit("confirm");
    expect(w.emitted("confirm")![0]![0]).toMatchObject({
      shapeGeometry: { preset: "line" },
      shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "triangle" } },
      fill: "#abcdef",
    });
    w.getComponent(ShapeGallery).vm.$emit("choose", choice("ellipse"));
    await nextTick();
    w.getComponent(Dialog).vm.$emit("confirm");
    const saved = w.emitted("confirm")!.at(-1)![0] as SheetGraphicDrawing;
    expect(saved.shapeGeometry).toEqual({ preset: "ellipse" });
    expect(saved.shapeLineEnds).toBeUndefined();
    expect(saved.text).toBe("label");
    w.unmount();
  });
  test("old shape remains old until explicit selection", async () => {
    const { shapeGeometry: _shapeGeometry, ...legacy } = shape,
      w = fixture(legacy);
    w.getComponent(Dialog).vm.$emit("confirm");
    expect((w.emitted("confirm")![0]![0] as SheetGraphicDrawing).shapeGeometry).toBeUndefined();
    w.getComponent(ShapeGallery).vm.$emit("choose", choice("rect"));
    await nextTick();
    w.getComponent(Dialog).vm.$emit("confirm");
    expect(w.emitted("confirm")![1]![0]).toMatchObject({ shapeGeometry: { preset: "rect" } });
    w.unmount();
  });
  test("cancel emits no committed draft; rejected text-box switch stays mounted with explanation", async () => {
    const request = vi.fn(() => false),
      w = fixture(shape, request),
      uid = w.vm.$.uid;
    w.getComponent(ShapeGallery).vm.$emit("choose", choice("verticalTextBox"));
    await nextTick();
    expect(request).toHaveBeenCalledWith("vertical");
    expect(w.vm.$.uid).toBe(uid);
    expect(w.get('[role="alert"]').text()).toContain("草稿已保留");
    expect(w.emitted("confirm")).toBeUndefined();
    w.getComponent(Dialog).vm.$emit("close");
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });
  test("invalid standard parameters cannot commit or masquerade as a legacy shape", () => {
    const w = fixture({
      ...shape,
      width: 16384,
      shapeGeometry: { preset: "wedgeRectCallout", adjustments: { adj1: 2147483647 } },
    });
    expect(w.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    w.getComponent(Dialog).vm.$emit("confirm");
    expect(w.emitted("confirm")).toBeUndefined();
    w.unmount();
  });
});
