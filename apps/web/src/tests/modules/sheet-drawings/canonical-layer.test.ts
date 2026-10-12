import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import {
  isFramedShapeDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "./framed-shape-fixture";
import { getStandardShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import { getLegacyShapeGeometry } from "../../../modules/sheet-drawings/legacy-shape-geometry";
import { getFreeShapeGeometry } from "../../../modules/sheet-drawings/free-shape-geometry";

function fixture(shape = framedShape(), hidden = false) {
  const sheet = getActiveSheet(createWorkbook({ id: "b", sheetId: "s" }));
  sheet.drawings = [shape];
  if (hidden) sheet.hiddenRows = new Set([1]);
  const metrics = createPictureSheetMetrics(sheet);
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 50,
      columnCount: 30,
      rowHeight: 24,
      columnWidth: 80,
      hiddenRows: sheet.hiddenRows,
    }),
    rows: createRowVisibilityIndex({
      rowCount: 50,
      defaultRowHeight: 24,
      hiddenRows: sheet.hiddenRows,
    }),
    viewportSize: { width: 800, height: 600 },
    freeze: { rows: 1, columns: 1 },
  });
  const apply = vi.fn((_next: SheetDrawing, _owner: SheetDrawing) => true);
  const wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      sheet,
      metrics,
      layout,
      scale: 1,
      revision: 0,
      readOnly: false,
      selectedDrawingId: shape.id,
      applyUpdate: apply,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return { sheet, metrics, layout, apply, wrapper, shape };
}
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}
function result(f: ReturnType<typeof fixture>) {
  const value = f.apply.mock.calls[0]?.[0] as unknown as SheetFramedGraphicDrawing;
  expect(isFramedShapeDrawing(value)).toBe(true);
  return value;
}
describe("canonical source/view layer", () => {
  test("keyboard edit/format emit exact committed owner, movement inverses into canonical frame", async () => {
    const f = fixture();
    try {
      const item = f.wrapper.findAll("[data-sheet-drawing-id]")[0]!;
      await item.trigger("keydown", { key: "F2" });
      expect(f.wrapper.emitted("edit")?.[0]?.[0]).toBe(f.wrapper.props("drawings")[0]);
      await f.wrapper.get("[data-shape-format-trigger]").trigger("click");
      expect(f.wrapper.emitted("format")?.[0]?.[0]).toBe(f.wrapper.props("drawings")[0]);
      await item.trigger("keydown", { key: "ArrowRight" });
      const value = result(f);
      expect(f.apply.mock.calls[0]?.[1]).toBe(f.wrapper.props("drawings")[0]);
      expect(resolveShapeFrame(value.shapeFrame, f.metrics).rect.x).toBe(81);
      expect(Object.hasOwn(value, "anchor")).toBe(false);
    } finally {
      f.wrapper.unmount();
    }
  });
  test.each([false, true])("side resize remains single-axis when ratio lock=%s", async (lock) => {
    const shape = framedShape();
    shape.shapeProperties = lock ? { lockAspectRatio: true } : undefined;
    const f = fixture(shape);
    try {
      const handle = f.wrapper.findAll('[data-shape-resize="e"]')[0]!;
      handle.element.dispatchEvent(pointer("pointerdown", 320, 84));
      window.dispatchEvent(pointer("pointerup", 360, 84));
      await nextTick();
      const rect = resolveShapeFrame(result(f).shapeFrame, f.metrics).rect;
      expect(rect.width).toBe(280);
      expect(rect.height).toBe(120);
    } finally {
      f.wrapper.unmount();
    }
  });
  test("corner ratio lock and cancellation preserve exact owner/history boundary", async () => {
    const shape = framedShape();
    shape.shapeProperties = { lockAspectRatio: true };
    const f = fixture(shape);
    try {
      const handle = f.wrapper.findAll('[data-shape-resize="se"]')[0]!;
      handle.element.dispatchEvent(pointer("pointerdown", 320, 144));
      window.dispatchEvent(pointer("pointerup", 380, 154));
      await nextTick();
      const rect = resolveShapeFrame(result(f).shapeFrame, f.metrics).rect;
      expect(rect.width / rect.height).toBeCloseTo(2);
      f.apply.mockClear();
      handle.element.dispatchEvent(pointer("pointerdown", 320, 144));
      window.dispatchEvent(pointer("pointercancel", 380, 154));
      await nextTick();
      expect(f.apply).not.toHaveBeenCalled();
    } finally {
      f.wrapper.unmount();
    }
  });
  test("move-only hidden origin remains rendered without changing logical marker", async () => {
    const shape = framedShape();
    shape.shapeFrame.anchor = {
      mode: "move-only",
      origin: { column: { index: 1, offset: 4 }, row: { index: 1, offset: 7 } },
      size: { width: 120, height: 50 },
    };
    const f = fixture(shape, true);
    try {
      expect(f.wrapper.find("[data-sheet-drawing-id]").exists()).toBe(true);
      expect(shape.shapeFrame.anchor).toEqual({
        mode: "move-only",
        origin: { column: { index: 1, offset: 4 }, row: { index: 1, offset: 7 } },
        size: { width: 120, height: 50 },
      });
    } finally {
      f.wrapper.unmount();
    }
  });
  test("collapsed frame has no paint or controls, retains source", () => {
    const shape = framedShape();
    shape.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
      end: { column: { index: 2, offset: 0 }, row: { index: 2, offset: 0 } },
    };
    const f = fixture(shape, true);
    try {
      expect(f.wrapper.find("[data-sheet-drawing-id]").exists()).toBe(false);
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.sheet.drawings?.[0]).toBe(shape);
    } finally {
      f.wrapper.unmount();
    }
  });
  test.each([true, false])(
    "protected object lock=%s controls actual keyboard edits",
    async (locked) => {
      const shape = framedShape();
      shape.shapeProperties = locked ? undefined : { locked: false };
      const f = fixture(shape);
      try {
        f.sheet.properties.protected = true;
        await f.wrapper.setProps({ revision: 1 });
        await f.wrapper
          .findAll("[data-sheet-drawing-id]")[0]!
          .trigger("keydown", { key: "ArrowRight" });
        expect(f.apply).toHaveBeenCalledTimes(locked ? 0 : 1);
      } finally {
        f.wrapper.unmount();
      }
    },
  );
  test("derived positive subpixel geometry retains numeric body; zero stays absent", () => {
    expect(getStandardShapeGeometry({ preset: "rect" }, 0.25, 0.5)?.width).toBe(0.25);
    expect(getLegacyShapeGeometry("rectangle", 0.25, 0.5)?.height).toBe(0.5);
    expect(
      getFreeShapeGeometry(
        {
          tool: "freeform",
          viewBox: { width: 2, height: 2 },
          commands: [
            ["M", 0, 0],
            ["L", 2, 2],
          ],
        },
        0.25,
        0.5,
      )?.width,
    ).toBe(0.25);
    expect(getStandardShapeGeometry({ preset: "rect" }, 0, 0.5)).toBeUndefined();
  });
  test("canonical negative-placement line controls commit through the source inverse", async () => {
    const shape = framedShape();
    shape.shapeGeometry = { preset: "line" };
    shape.shapeFrame.anchor = { mode: "fixed", x: -20, y: 100, size: { width: 120, height: 80 } };
    const f = fixture(shape);
    try {
      const selector = f.wrapper.getComponent(StandardShapeSelection);
      selector.vm.$emit("nudgeEndpoint", 1, { x: 10, y: 0 });
      await nextTick();
      const next = result(f);
      expect(f.apply.mock.calls[0]?.[1]).toBe(f.wrapper.props("drawings")[0]);
      expect(resolveShapeFrame(next.shapeFrame, f.metrics).rect.width).toBeCloseTo(130);
      expect(resolveShapeFrame(next.shapeFrame, f.metrics).rect.x).toBeCloseTo(-20);
    } finally {
      f.wrapper.unmount();
    }
  });

  test.each(["shape", "textBox"] as const)(
    "plain canonical %s keeps an explicit legacy hit surface and visible text target",
    async (kind) => {
      const shape = framedShape();
      shape.kind = kind;
      shape.text = "Visible text";
      delete shape.shapeGeometry;
      delete shape.shapeText;
      delete shape.shapeStyle;
      if (kind === "textBox") {
        shape.fill = "transparent";
        shape.strokeWidth = 0;
      }
      const f = fixture(shape);
      try {
        const text = f.wrapper
          .findAll(".drawing-content__text")
          .find((item) => item.attributes("style")?.includes("pointer-events: auto"));
        expect(text).toBeDefined();
        if (kind === "shape")
          expect(f.wrapper.get("svg[aria-hidden]").attributes("style")).toContain(
            "pointer-events: visiblePainted",
          );
        await text!.trigger("dblclick", { clientX: 150, clientY: 84 });
        expect(f.wrapper.emitted("edit")?.at(-1)?.[0]).toBe(f.wrapper.props("drawings")[0]);
      } finally {
        f.wrapper.unmount();
      }
    },
  );
});
