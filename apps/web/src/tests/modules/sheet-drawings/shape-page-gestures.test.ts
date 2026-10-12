import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getActiveSheet } from "@sheetcraft/core/workbook";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { expect, test, vi } from "vitest";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { resolveShapeFrame } from "@sheetcraft/core/shape-frame";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import {
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  isFramedShapeDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getStandardShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { listFreeShapePoints } from "../../../modules/sheet-drawings/free-shape-point-layout";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "./framed-shape-fixture";
import { shapePageFixture } from "./shape-page-fixture";

function fixture(
  options: {
    rotation?: number;
    geometry?: "rect" | "roundRect" | "line";
    legacy?: boolean;
    free?: boolean;
    history?: boolean;
    whiteSpace?: boolean;
  } = {},
) {
  const page = shapePageFixture(options.whiteSpace ?? true),
    first = page.projection.getPage(0, 0)!;
  const rect = {
    x: 80,
    y: first.sheetRect.y + first.sheetRect.height - 80,
    width: 120,
    height: 60,
  };
  const framed = framedShape();
  framed.shapeFrame.anchor = {
    mode: "fixed",
    x: rect.x,
    y: rect.y,
    size: { width: rect.width, height: rect.height },
  };
  framed.shapeGeometry = { preset: options.geometry ?? "rect" };
  framed.rotation = options.rotation ?? 0;
  if (options.free) {
    delete framed.shapeGeometry;
    framed.shapePath = {
      tool: "freeform",
      viewBox: { width: 120, height: 60 },
      commands: [
        ["M", 0, 0],
        ["L", 120, 60],
        ["L", 0, 60],
      ],
    };
  }
  const source: SheetDrawing = options.legacy
    ? {
        ...createGraphicDrawing("shape", "shape", "Old", {
          row: Math.floor(rect.y / 24),
          column: 1,
        }),
        offsetY: rect.y % 24,
        offsetX: 0,
        width: 120,
        height: 60,
        rotation: framed.rotation,
        shapeGeometry: framed.shapeGeometry,
      }
    : framed;
  page.sheet.drawings = [source];
  const session = createWorkbookSession({
    workbook: page.workbook,
    idFactory: createSequentialIdFactory(),
  });
  const apply = vi.fn((next: SheetDrawing, _expected: SheetDrawing) =>
    options.history
      ? executeWorkbookCommand(session, createSetSheetDrawingsCommand(page.sheet.id, [next]))
      : true,
  );
  const wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: page.sheet.drawings,
      sheet: page.sheet,
      metrics: page.metrics,
      pageProjection: page.projection,
      layout: page.viewport,
      scale: 2,
      revision: 0,
      readOnly: false,
      selectedDrawingId: source.id,
      applyUpdate: apply,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  const pointer = (type: string, sheetPoint: { x: number; y: number }, project = true) => {
    const p = project ? page.project(sheetPoint) : sheetPoint;
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: p.x * 2,
      clientY: p.y * 2,
    });
    Object.defineProperty(event, "pointerId", { value: 3 });
    return event;
  };
  const result = () => {
    const next = apply.mock.calls.at(-1)?.[0];
    expect(next).toBeDefined();
    return next!;
  };
  const gesture = async (
    selector: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    project = true,
  ) => {
    wrapper.get(selector).element.dispatchEvent(pointer("pointerdown", from));
    window.dispatchEvent(pointer("pointermove", to, project));
    await nextTick();
    window.dispatchEvent(pointer("pointerup", to, project));
    await nextTick();
  };
  return { ...page, source, rect, session, wrapper, apply, pointer, result, gesture };
}

test.each([true, false])(
  "paged move crosses row/column whitespace in sheet coordinates, history and snapshot preserve placement (%s)",
  async (whiteSpace) => {
    const f = fixture({ history: true, whiteSpace }),
      first = f.projection.getPage(0, 0)!,
      second = f.projection.getPage(1, 1)!;
    const from = { x: f.rect.x + 60, y: f.rect.y + 30 },
      to = { x: second.sheetRect.x + 40, y: second.sheetRect.y + 40 };
    const before = serializeWorkbook(f.workbook);
    try {
      await f.gesture("[data-sheet-drawing-id]", from, to);
      expect(f.apply).toHaveBeenCalledTimes(1);
      expect(f.apply.mock.calls[0]![1]).toBe(f.wrapper.props("drawings")[0]);
      const next = f.result();
      expect(isFramedShapeDrawing(next)).toBe(true);
      const rect = resolveShapeFrame(
        (next as SheetFramedGraphicDrawing).shapeFrame,
        f.metrics,
      ).rect;
      expect(rect.x).toBeCloseTo(f.rect.x + to.x - from.x);
      expect(rect.y).toBeCloseTo(f.rect.y + to.y - from.y);
      expect(rect.y - f.rect.y).toBeLessThan(second.contentRect.y - first.contentRect.y);
      const after = serializeWorkbook(f.workbook);
      expect(after.version).toBe(60);
      expect(getActiveSheet(deserializeWorkbook(after)).drawings?.[0]).toEqual(next);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
    } finally {
      f.wrapper.unmount();
    }
  },
);

test("release in page whitespace rejects the whole gesture after a valid preview", async () => {
  const f = fixture({ history: true }),
    first = f.projection.getPage(0, 0)!,
    second = f.projection.getPage(1, 0)!,
    before = serializeWorkbook(f.workbook);
  try {
    const from = { x: f.rect.x + 60, y: f.rect.y + 30 };
    f.wrapper.get("[data-sheet-drawing-id]").element.dispatchEvent(f.pointer("pointerdown", from));
    window.dispatchEvent(f.pointer("pointermove", { x: from.x + 10, y: from.y + 5 }));
    await nextTick();
    const gap = {
      x: first.contentRect.x + 100,
      y: (first.contentRect.y + first.sheetRect.height + second.contentRect.y) / 2,
    };
    window.dispatchEvent(f.pointer("pointerup", gap, false));
    await nextTick();
    expect(f.apply).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(undoWorkbookCommand(f.session)).toBe(false);
  } finally {
    f.wrapper.unmount();
  }
});

test("37 degree side resize and rotation use continuous local geometry and content-owned handles", async () => {
  const f = fixture({ rotation: 37 });
  try {
    const from = pictureFrameLocalToWorld(f.rect, 37, { x: 120, y: 30 }),
      to = pictureFrameLocalToWorld(f.rect, 37, { x: 160, y: 30 });
    await f.gesture('[data-shape-resize="e"]', from, to);
    const next = f.result() as SheetFramedGraphicDrawing,
      rect = resolveShapeFrame(next.shapeFrame, f.metrics).rect;
    expect(rect.width).toBeCloseTo(160);
    expect(rect.height).toBeCloseTo(60);
    const pinnedBefore = pictureFrameLocalToWorld(f.rect, 37, { x: 0, y: 30 }),
      pinnedAfter = pictureFrameLocalToWorld(rect, 37, { x: 0, y: 30 });
    expect(pinnedAfter.x).toBeCloseTo(pinnedBefore.x);
    expect(pinnedAfter.y).toBeCloseTo(pinnedBefore.y);
    expect(f.wrapper.get("[data-sheet-drawing-id]").attributes("style")).toContain(
      "clip-path: polygon",
    );
    f.apply.mockClear();
    const center = { x: f.rect.x + 60, y: f.rect.y + 30 },
      start = pictureFrameLocalToWorld(f.rect, 37, { x: 60, y: -24 });
    const target = { x: center.x - (start.y - center.y), y: center.y + (start.x - center.x) };
    await f.gesture("[data-shape-rotate]", start, target);
    expect(f.result().rotation).toBeCloseTo(127);
  } finally {
    f.wrapper.unmount();
  }
});

test("round rectangle adjustment uses rotated sheet-space frame without paper translation", async () => {
  const f = fixture({ geometry: "roundRect", rotation: 37 });
  try {
    const handle = getStandardShapeGeometry({ preset: "roundRect" }, 120, 60)!.handles[0]!.position;
    await f.gesture(
      '[data-shape-adjustment="0"]',
      pictureFrameLocalToWorld(f.rect, 37, handle),
      pictureFrameLocalToWorld(f.rect, 37, { x: 25, y: 0 }),
    );
    const next = f.result() as SheetFramedGraphicDrawing;
    expect(next.shapeGeometry?.adjustments?.adj).toBeGreaterThan(20000);
    expect(next.shapeFrame).toEqual((f.source as SheetFramedGraphicDrawing).shapeFrame);
    expect(next.rotation).toBe(37);
  } finally {
    f.wrapper.unmount();
  }
});

test("line endpoint crosses page content without adding paper margins to path coordinates", async () => {
  const f = fixture({ geometry: "line" }),
    second = f.projection.getPage(1, 0)!;
  try {
    const from = { x: f.rect.x + 120, y: f.rect.y + 60 },
      to = { x: from.x + 20, y: second.sheetRect.y + 30 };
    await f.gesture('[data-shape-endpoint="1"]', from, to);
    const rect = resolveShapeFrame(
      (f.result() as SheetFramedGraphicDrawing).shapeFrame,
      f.metrics,
    ).rect;
    expect(rect.x).toBeCloseTo(f.rect.x);
    expect(rect.y).toBeCloseTo(f.rect.y);
    expect(rect.width).toBeCloseTo(140);
    expect(rect.height).toBeCloseTo(to.y - f.rect.y);
  } finally {
    f.wrapper.unmount();
  }
});

test("free vertex uses continuous page inverse while active point edit identity remains owned", async () => {
  const f = fixture({ free: true }),
    second = f.projection.getPage(1, 0)!;
  try {
    f.wrapper
      .get("[data-sheet-drawing-id]")
      .element.dispatchEvent(f.pointer("dblclick", { x: f.rect.x + 60, y: f.rect.y + 30 }));
    await nextTick();
    const handle = f.wrapper
      .findAll("[data-free-shape-vertex]")
      .find((item) => item.attributes("data-free-shape-vertex") === "1");
    expect(handle).toBeDefined();
    const from = { x: f.rect.x + 120, y: f.rect.y + 60 },
      to = { x: from.x + 20, y: second.sheetRect.y + 30 };
    handle!.element.dispatchEvent(f.pointer("pointerdown", from));
    window.dispatchEvent(f.pointer("pointerup", to));
    await nextTick();
    const next = f.result(),
      resolved = resolveShapeDrawing(next, f.metrics);
    const point = listFreeShapePoints(
      resolved.view as Parameters<typeof listFreeShapePoints>[0],
    ).find((point) => point.commandIndex === 1 && point.role === "vertex")!;
    expect(resolved.rect.x + point.position.x).toBeCloseTo(to.x);
    expect(resolved.rect.y + point.position.y).toBeCloseTo(to.y);
  } finally {
    f.wrapper.unmount();
  }
});

test.each(["projection", "metrics", "layout", "scale", "revision", "owner", "readOnly"] as const)(
  "paged capture is cancelled after %s replacement",
  async (change) => {
    const f = fixture();
    try {
      const from = { x: f.rect.x + 60, y: f.rect.y + 30 },
        to = { x: from.x + 10, y: from.y + 5 };
      f.wrapper
        .get("[data-sheet-drawing-id]")
        .element.dispatchEvent(f.pointer("pointerdown", from));
      window.dispatchEvent(f.pointer("pointermove", to));
      await nextTick();
      if (change === "projection")
        await f.wrapper.setProps({ pageProjection: { ...f.projection } });
      else if (change === "metrics")
        await f.wrapper.setProps({ metrics: createPictureSheetMetrics(f.sheet) });
      else if (change === "layout") await f.wrapper.setProps({ layout: f.layout() });
      else if (change === "scale") await f.wrapper.setProps({ scale: 1.5 });
      else if (change === "revision") await f.wrapper.setProps({ revision: 1 });
      else if (change === "owner") await f.wrapper.setProps({ drawings: [{ ...f.source }] });
      else await f.wrapper.setProps({ readOnly: true });
      window.dispatchEvent(f.pointer("pointerup", to));
      await nextTick();
      expect(f.apply).not.toHaveBeenCalled();
    } finally {
      f.wrapper.unmount();
    }
  },
);

test("legacy page graphics retain legacy placement and data, not paper-space offsets or automatic migration", async () => {
  const f = fixture({ legacy: true }),
    second = f.projection.getPage(1, 0)!;
  try {
    const before = JSON.stringify(f.source),
      from = { x: f.rect.x + 60, y: f.rect.y + 30 },
      to = { x: from.x + 10, y: second.sheetRect.y + 20 };
    await f.gesture("[data-sheet-drawing-id]", from, to);
    const next = f.result(),
      resolved = resolveShapeDrawing(next, f.metrics);
    expect(isFramedShapeDrawing(next)).toBe(false);
    expect(resolved.rect.y).toBeCloseTo(f.rect.y + to.y - from.y);
    expect(resolved.rect.x).toBeCloseTo(f.rect.x + 10);
    expect(JSON.stringify(f.source)).toBe(before);
  } finally {
    f.wrapper.unmount();
  }
});

test("paged pointer capture survives replacement of its first paper fragment", async () => {
  const f = fixture();
  try {
    const first = f.wrapper.get("[data-sheet-drawing-id]");
    const root = f.wrapper.get(".sheet-drawing-layer");
    const capture = vi.fn();
    Object.defineProperty(root.element, "setPointerCapture", {
      value: capture,
      configurable: true,
    });
    const from = { x: f.rect.x + 60, y: f.rect.y + 30 };
    const second = f.projection.getPage(1, 0)!;
    const to = { x: from.x + 20, y: second.sheetRect.y + 200 };
    first.element.dispatchEvent(f.pointer("pointerdown", from));
    expect(capture).toHaveBeenCalledWith(3);
    window.dispatchEvent(f.pointer("pointermove", to));
    await nextTick();
    expect(first.element.isConnected).toBe(false);
    // Removing a captured source fragment would cancel a browser pointer session.
    // The source no longer owns capture, so its stale event cannot cancel the layer's lease.
    first.element.dispatchEvent(f.pointer("lostpointercapture", to));
    window.dispatchEvent(f.pointer("pointerup", to));
    await nextTick();
    expect(f.apply).toHaveBeenCalledTimes(1);
  } finally {
    f.wrapper.unmount();
  }
});
