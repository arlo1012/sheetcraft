import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import creationLayerSource from "../../../modules/sheet-drawings/components/SheetShapeCreationLayer.vue?raw";
import SheetShapeCreationLayer from "../../../modules/sheet-drawings/components/SheetShapeCreationLayer.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import type {
  ShapeCreationRequest,
  ShapeCreationDraft,
} from "../../../modules/sheet-drawings/useShapeCreation";
import { createAppI18n } from "../../../shared/i18n";
function layout() {
  return createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 30,
      columnCount: 20,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 }),
    viewportSize: { width: 600, height: 400 },
  });
}
function fixture() {
  const workbook = createWorkbook({ id: "test", sheetId: "test-sheet" }),
    sheet = getActiveSheet(workbook),
    choice = SHAPE_GALLERY.flatMap((g) => g.items).find(
      (c) => c.kind === "preset" && c.preset === "rect",
    )!;
  if (choice.kind === "drawingTool") throw new Error("fixture");
  const request: ShapeCreationRequest = {
    workbook,
    sheet,
    requestId: 1,
    revision: 1,
    choice,
    continuous: false,
    base: createGraphicDrawing("new", "shape", "Rectangle", { row: 0, column: 0 }),
  };
  const commit = vi.fn((_request: ShapeCreationRequest, _drawing: ShapeCreationDraft) => true),
    cancel = vi.fn();
  const w = mount(SheetShapeCreationLayer, {
    attachTo: document.body,
    props: { request, layout: layout(), scale: 1, revision: 1, readOnly: false, commit, cancel },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return { w, request, commit, cancel };
}
function pointer(type: string, x: number, y: number, shiftKey = false) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    shiftKey,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}
describe("direct canvas creation layer", () => {
  test("shows live preview and submits exactly once at release", async () => {
    const f = fixture();
    const el = f.w.get("[data-shape-creation-layer]").element;
    expect(document.activeElement).toBe(el);
    el.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointermove", 200, 140));
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(true);
    window.dispatchEvent(pointer("pointerup", 200, 140));
    await nextTick();
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.calls[0]![1]).toMatchObject({ width: 150, height: 90 });
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(false);
    f.w.unmount();
  });
  test("click uses defaults and Shift drag constrains square", async () => {
    const f = fixture(),
      el = f.w.element;
    el.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointerup", 51, 51));
    await nextTick();
    expect(f.commit.mock.calls[0]![1]).toMatchObject({ width: 240, height: 120 });
    el.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointerup", 200, 140, true));
    await nextTick();
    expect(f.commit.mock.calls[1]![1]).toMatchObject({ width: 150, height: 150 });
    f.w.unmount();
  });
  test("one Escape cancels preview and exits mode, no history callback", async () => {
    const f = fixture();
    f.w.element.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointermove", 200, 140));
    await nextTick();
    f.w.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await nextTick();
    window.dispatchEvent(pointer("pointerup", 200, 140));
    expect(f.cancel).toHaveBeenCalledExactlyOnceWith(f.request);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(false);
    f.w.unmount();
  });
  test.each(["request", "revision", "readonly", "layout", "scale", "unmount"] as const)(
    "%s changes cancel the captured gesture",
    async (change) => {
      const f = fixture();
      f.w.element.dispatchEvent(pointer("pointerdown", 50, 50));
      window.dispatchEvent(pointer("pointermove", 200, 140));
      await nextTick();
      if (change === "request") await f.w.setProps({ request: { ...f.request, requestId: 2 } });
      if (change === "revision") await f.w.setProps({ revision: 2 });
      if (change === "readonly") await f.w.setProps({ readOnly: true });
      if (change === "layout") await f.w.setProps({ layout: layout() });
      if (change === "scale") await f.w.setProps({ scale: 2 });
      if (change === "unmount") f.w.unmount();
      window.dispatchEvent(pointer("pointerup", 200, 140));
      expect(f.commit).not.toHaveBeenCalled();
      if (change !== "unmount") f.w.unmount();
    },
  );
  test("rejected insertion keeps final preview and offers explicit retry", async () => {
    const f = fixture();
    f.commit.mockReturnValue(false);
    f.w.element.dispatchEvent(pointer("pointerdown", 50, 50));
    window.dispatchEvent(pointer("pointerup", 200, 140));
    await nextTick();
    expect(f.w.get('[role="status"]').text()).toContain("preserved");
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(true);
    f.commit.mockReturnValue(true);
    const retry = f.w.findAll("button").find((b) => b.text() === "Retry insertion")!;
    await retry.trigger("click");
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.w.find("[data-standard-shape-content]").exists()).toBe(false);
    f.w.unmount();
  });
  test("toolbar controls do not create shapes; IME and other form/dialog Escape stay untouched", async () => {
    const f = fixture();
    f.w.get("button").element.dispatchEvent(pointer("pointerdown", 30, 30));
    window.dispatchEvent(pointer("pointerup", 90, 90));
    expect(f.commit).not.toHaveBeenCalled();
    const input = document.createElement("input");
    document.body.append(input);
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    input.remove();
    f.w.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }),
    );
    expect(f.cancel).not.toHaveBeenCalled();
    f.w.unmount();
  });
});

test("creation root explicitly receives pointer input within noninteractive sheet overlay parents", () => {
  expect(creationLayerSource).toMatch(/\.shape-creation-layer\s*\{[^}]*pointer-events:\s*auto/s);
});
