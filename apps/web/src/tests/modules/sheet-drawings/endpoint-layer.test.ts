import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getShapeLineLocalEndpoints } from "../../../modules/sheet-drawings/shape-endpoint-layout";
import { standardShapeFlipPoint } from "../../../modules/sheet-drawings/shape-geometry";
import { createAppI18n } from "../../../shared/i18n";
const shape: SheetGraphicDrawing = {
  ...createGraphicDrawing("s", "shape", "Arrow", { row: 5, column: 4 }),
  offsetX: 4,
  offsetY: 6,
  width: 120,
  height: 80,
  rotation: 37,
  shapeGeometry: { preset: "line" },
  shapeLineEnds: { end: { kind: "triangle", width: "large", length: "small" } },
  shapeFlipX: true,
};
const layout = createSheetViewportLayout({
  geometry: createSheetGeometry({ rowCount: 40, columnCount: 20, rowHeight: 24, columnWidth: 80 }),
  rows: createRowVisibilityIndex({ rowCount: 40, defaultRowHeight: 24 }),
  viewportSize: { width: 800, height: 600 },
  freeze: { rows: 1, columns: 1 },
  bodyScrollPosition: { x: 80, y: 48 },
});
function world(drawing = shape, index: 0 | 1 = 1) {
  return pictureFrameLocalToWorld(
    getFloatingImageSheetRect(drawing, layout)!,
    drawing.rotation,
    standardShapeFlipPoint(drawing, getShapeLineLocalEndpoints(drawing)![index]),
  );
}
function viewport(drawing = shape, index: 0 | 1 = 1) {
  const point = world(drawing, index),
    translation = getPicturePaneTranslation("body", layout);
  return { x: point.x + translation.x, y: point.y + translation.y };
}
function fixture() {
  return mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: [shape],
      selectedDrawingId: "s",
      revision: 1,
      layout,
      scale: 2,
      readOnly: false,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
}
function pointer(type: string, point: { x: number; y: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x * 2,
    clientY: point.y * 2,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  return event;
}
describe("line endpoint actual layer ownership and projection", () => {
  test("actual endpoint release survives Core history and internal snapshot without rewriting other drawings", async () => {
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory() }),
      sheet = getActiveSheet(workbook);
    const other = { ...shape, id: "other", name: "Untouched" };
    sheet.drawings = [shape, other];
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const actions = useDrawingActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getAddress: () => shape.anchor,
      flush: () => true,
      execute: (command) => executeWorkbookCommand(session, command),
      isBusy: () => false,
      name: () => "Shape",
    });
    const before = serializeWorkbook(workbook),
      w = fixture();
    await nextTick();
    const start = viewport(),
      target = { x: start.x + 40, y: start.y + 20 };
    w.get('[data-shape-endpoint="1"]').element.dispatchEvent(pointer("pointerdown", start));
    window.dispatchEvent(pointer("pointerup", target));
    await nextTick();
    actions.update(w.emitted("update")![0]![0] as SheetGraphicDrawing);
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.drawings![1]).toEqual(other);
    const after = serializeWorkbook(workbook);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(workbook)).toEqual(after);
    w.unmount();
  });
  test("line selection has two real endpoint controls without box resize/rotation controls", async () => {
    const w = fixture();
    await nextTick();
    expect(w.findAll("[data-shape-endpoint]")).toHaveLength(2);
    expect(
      w.findAll("[data-shape-resize], [data-shape-rotate], .standard-shape-selection__outline"),
    ).toHaveLength(0);
    expect(w.get('[data-shape-endpoint="0"]').attributes("aria-label")).toContain("Line start");
    w.unmount();
  });
  test("scaled scrolled pane drag preserves grab offset and commits once with the other endpoint fixed", async () => {
    const w = fixture();
    await nextTick();
    const start = viewport(),
      grab = { x: start.x + 3, y: start.y - 2 },
      target = { x: grab.x + 40, y: grab.y + 20 },
      fixed = world(shape, 0);
    w.get('[data-shape-endpoint="1"]').element.dispatchEvent(pointer("pointerdown", grab));
    window.dispatchEvent(pointer("pointermove", target));
    await nextTick();
    expect(w.emitted("update")).toBeUndefined();
    window.dispatchEvent(pointer("pointerup", target));
    await nextTick();
    expect(w.emitted("update")).toHaveLength(1);
    const result = w.emitted("update")![0]![0] as SheetGraphicDrawing;
    expect(world(result, 0).x).toBeCloseTo(fixed.x, 7);
    expect(world(result, 0).y).toBeCloseTo(fixed.y, 7);
    expect(world(result, 1).x).toBeCloseTo(world().x + 40, 7);
    expect(world(result, 1).y).toBeCloseTo(world().y + 20, 7);
    expect(result.shapeLineEnds).toEqual(shape.shapeLineEnds);
    expect(result.rotation).toBe(37);
    w.unmount();
  });
  test.each(["revision", "replacement", "readonly", "layout", "scale", "escape"] as const)(
    "%s cancels the endpoint preview without update",
    async (change) => {
      const w = fixture();
      await nextTick();
      const start = viewport(),
        target = { x: start.x + 40, y: start.y + 20 };
      w.get('[data-shape-endpoint="1"]').element.dispatchEvent(pointer("pointerdown", start));
      window.dispatchEvent(pointer("pointermove", target));
      await nextTick();
      if (change === "revision") await w.setProps({ revision: 2 });
      else if (change === "replacement")
        await w.setProps({ drawings: [{ ...shape, name: "New" }] });
      else if (change === "readonly") await w.setProps({ readOnly: true });
      else if (change === "layout") await w.setProps({ layout: { ...layout } });
      else if (change === "scale") await w.setProps({ scale: 1 });
      else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.dispatchEvent(pointer("pointerup", target));
      await nextTick();
      expect(w.emitted("update")).toBeUndefined();
      w.unmount();
    },
  );
  test.each(["replacement", "deletion"] as const)(
    "old endpoint callback cannot start after %s",
    async (change) => {
      const w = fixture();
      await nextTick();
      const callback = w.getComponent(StandardShapeSelection).vm.$.vnode.props!.onEndpoint as (
        index: 0 | 1,
        event: PointerEvent,
      ) => void;
      await w.setProps({
        drawings: change === "replacement" ? [{ ...shape, stroke: "#abcdef", name: "New" }] : [],
      });
      const start = viewport(),
        target = { x: start.x + 40, y: start.y + 20 };
      const event = pointer("pointerdown", start);
      callback(1, event as unknown as PointerEvent);
      window.dispatchEvent(pointer("pointermove", target));
      window.dispatchEvent(pointer("pointerup", target));
      await nextTick();
      expect(w.emitted("update")).toBeUndefined();
      expect(event.defaultPrevented).toBe(false);
      w.unmount();
    },
  );
  test("endpoint keyboard step is world-axis based, Shift changes step and modifiers/IME are untouched", async () => {
    const w = fixture();
    await nextTick();
    const endpoint = w.get('[data-shape-endpoint="1"]');
    await endpoint.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    const result = w.emitted("update")![0]![0] as SheetGraphicDrawing;
    expect(world(result, 1).x).toBeCloseTo(world().x + 10, 7);
    expect(world(result, 1).y).toBeCloseTo(world().y, 7);
    await endpoint.trigger("keydown", { key: "ArrowRight", ctrlKey: true });
    await endpoint.trigger("keydown", { key: "ArrowDown", isComposing: true });
    expect(w.emitted("update")).toHaveLength(1);
    w.unmount();
  });
});
