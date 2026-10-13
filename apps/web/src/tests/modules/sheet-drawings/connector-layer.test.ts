import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { markRaw, nextTick, reactive, toRaw } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import ShapeGroupSelection from "../../../modules/sheet-drawings/components/ShapeGroupSelection.vue";
import { createPictureRotation3d } from "../../../modules/sheet-images/picture-effect-edit";
import { anchorShapeFrameRect, shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "./framed-shape-fixture";
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
});
function fixture(options: { group?: boolean; scale?: number } = {}) {
  const workbook = reactive(createWorkbook({ id: "workbook", sheetId: "sheet" })),
    sheet = getActiveSheet(workbook);
  const target: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "target",
    name: "Target",
    text: "",
    shapeGeometry: { preset: "rect" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 160, y: 120, size: { width: 80, height: 60 } },
    },
  };
  const other: SheetFramedGraphicDrawing = {
    ...target,
    id: "other",
    name: "Other",
    shapeGeometry: { preset: "ellipse" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 420, y: 260, size: { width: 100, height: 80 } },
    },
  };
  const connector: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "connector",
    name: "Connector",
    text: "",
    shapeGeometry: { preset: "bentConnector3" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 40, y: 50, size: { width: 120, height: 90 } },
    },
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
      end: { kind: "site", targetId: "other", preset: "ellipse", siteIndex: 0 },
    },
    shapeLineEnds: { end: { kind: "triangle" } },
  };
  const metrics = markRaw(createPictureSheetMetrics(sheet));
  sheet.drawings = normalizeSheetDrawings([target, other, connector]);
  if (options.group)
    sheet.drawings = groupShapeRoots(
      sheet.drawings,
      ["target", "connector"],
      { id: "group", name: "Group" },
      metrics,
    );
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 40,
      columnCount: 20,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 40, defaultRowHeight: 24 }),
    viewportSize: { width: 800, height: 600 },
    freeze: { rows: 1, columns: 1 },
    bodyScrollPosition: { x: 80, y: 48 },
  });
  const apply = vi.fn(
    (
      _next: readonly SheetDrawing[],
      _expected: readonly SheetDrawing[],
      _metrics: unknown,
      guard?: () => boolean,
    ) => guard?.() !== false,
  );
  const applyOne = vi.fn(() => true);
  const scale = options.scale ?? 2;
  const w = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      selectedDrawingId: options.group ? "group" : "connector",
      metrics,
      sheet,
      revision: 1,
      layout,
      scale,
      readOnly: false,
      applyCollection: apply,
      applyUpdate: applyOne,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(w);
  const pass = () =>
    resolveShapeForestForRender({ drawings: sheet.drawings!, metrics, revision: 1 });
  const route = () => {
    const value = pass().getLeaf("connector")!.connector!;
    if (value.status !== "ready") throw Error("Expected ready connector");
    return value.route;
  };
  const viewport = (point: { x: number; y: number }) => {
    const translation = getPicturePaneTranslation("body", layout);
    return { x: point.x + translation.x, y: point.y + translation.y };
  };
  const pointer = (type: string, point: { x: number; y: number }) => {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: point.x * scale,
      clientY: point.y * scale,
    });
    Object.defineProperty(e, "pointerId", { value: 17 });
    return e;
  };
  const dragEnd = async (index: 0 | 1, point: { x: number; y: number }, grab = { x: 0, y: 0 }) => {
    const tip = viewport(index ? route().end : route().begin),
      start = { x: tip.x + grab.x, y: tip.y + grab.y };
    w.get(`[data-shape-endpoint="${index}"]`).element.dispatchEvent(pointer("pointerdown", start));
    window.dispatchEvent(pointer("pointermove", { x: point.x + grab.x, y: point.y + grab.y }));
    await nextTick();
    window.dispatchEvent(pointer("pointerup", { x: point.x + grab.x, y: point.y + grab.y }));
    await nextTick();
  };
  return {
    workbook,
    sheet,
    metrics,
    layout,
    w,
    apply,
    applyOne,
    pass,
    route,
    viewport,
    pointer,
    dragEnd,
  };
}
function proposed(f: ReturnType<typeof fixture>) {
  return f.apply.mock.calls.at(-1)![0];
}
function nextConnector(f: ReturnType<typeof fixture>) {
  return resolveShapeForestForRender({
    drawings: proposed(f),
    metrics: f.metrics,
    revision: 1,
  }).getLeaf("connector")!.connector!;
}
describe("exact connector layer consumer and atomic gestures", () => {
  test("canonical carrier paints the exact route and keeps source identity", async () => {
    const f = fixture();
    await nextTick();
    const content = f.w
      .findAllComponents(DrawingContent)
      .find((c) => c.props("drawing").id === "connector")!;
    const selection = f.w.getComponent(StandardShapeSelection);
    expect(content.props("connectorRoute")).toBe(selection.props("connectorRoute"));
    expect(content.props("drawing").width).toBe(f.route().geometry.width);
    expect(content.props("drawing").height).toBe(f.route().geometry.height);
    expect(content.props("drawing")).not.toHaveProperty("shapeConnector");
    expect(selection.props("boundEndpoints")).toEqual([true, true]);
    expect(f.w.findAll('[data-shape-endpoint-bound="true"]')).toHaveLength(2);
    expect(f.applyOne).not.toHaveBeenCalled();
  });
  test("endpoint free drag keeps grab offset and other binding, atomic collection only", async () => {
    const f = fixture();
    await nextTick();
    const original = f.route();
    const target = { x: original.begin.x + 70, y: original.begin.y - 40 };
    await f.dragEnd(0, f.viewport(target), { x: 3, y: -2 });
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.applyOne).not.toHaveBeenCalled();
    expect(f.w.emitted("update")).toBeUndefined();
    const next = nextConnector(f);
    if (next.status !== "ready") throw Error("Expected route");
    expect(next.route.begin.x).toBeCloseTo(target.x, 9);
    expect(next.route.begin.y).toBeCloseTo(target.y, 9);
    expect(next.route.end).toEqual(original.end);
    expect(next.connection.begin.kind).toBe("free");
    expect(next.connection.end.kind).toBe("site");
    expect(proposed(f)[0]).toEqual(f.sheet.drawings![0]);
  });
  test("exact nearby port rebinds to another site and shows current target ports", async () => {
    const f = fixture();
    await nextTick();
    const site = f.pass().connections!.getTarget("target")!.sites[0]!;
    const old = f.viewport(f.route().begin),
      target = f.viewport(site.position);
    f.w.get('[data-shape-endpoint="0"]').element.dispatchEvent(f.pointer("pointerdown", old));
    window.dispatchEvent(f.pointer("pointermove", target));
    await nextTick();
    expect(f.w.findAll('[data-shape-connector-target="target"]')).toHaveLength(1);
    expect(f.apply).not.toHaveBeenCalled();
    window.dispatchEvent(f.pointer("pointerup", target));
    await nextTick();
    const next = nextConnector(f);
    if (next.status !== "ready") throw Error("Expected route");
    expect(next.connection.begin).toMatchObject({
      kind: "site",
      targetId: "target",
      identity: site.identity,
    });
    expect(next.route.begin).toEqual(site.position);
    expect(f.w.findAll("[data-shape-connector-target]")).toHaveLength(0);
  });
  test("body drag detaches both bound ends at old ordered positions plus delta", async () => {
    const f = fixture();
    await nextTick();
    const original = f.route(),
      delta = { x: 30, y: 25 };
    // The bend midpoint belongs to the route's actual first segment, not carrier pixels.
    const commands = original.geometry.paths[0]!.commands;
    const a = commands[0]!,
      b = commands[1]!;
    if (a[0] !== "M" || b[0] !== "L") throw Error("Expected elbow first segment");
    const local = { x: (a[1]! + b[1]!) / 2, y: (a[2]! + b[2]!) / 2 };
    const start = f.viewport(
      shapeFrameLocalToWorld(original.paintLayout.rect, original.paintLayout.angleDeg, local),
    );
    f.w
      .get('[data-sheet-drawing-id="connector"]')
      .element.dispatchEvent(f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointerup", { x: start.x + delta.x, y: start.y + delta.y }));
    await nextTick();
    expect(f.apply).toHaveBeenCalledTimes(1);
    const next = nextConnector(f);
    if (next.status !== "ready") throw Error("Expected route");
    expect(next.connection.begin.kind).toBe("free");
    expect(next.connection.end.kind).toBe("free");
    expect(next.route.begin.x).toBeCloseTo(original.begin.x + delta.x, 9);
    expect(next.route.begin.y).toBeCloseTo(original.begin.y + delta.y, 9);
    expect(next.route.end.x).toBeCloseTo(original.end.x + delta.x, 9);
    expect(next.route.end.y).toBeCloseTo(original.end.y + delta.y, 9);
  });
  test.each([
    "revision",
    "root-replacement",
    "metrics",
    "selection",
    "read-only",
    "same-array-target-replacement",
    "in-place-target-change",
    "escape",
  ])("%s invalidates captured endpoint gesture", async (change) => {
    const f = fixture();
    await nextTick();
    const start = f.viewport(f.route().begin),
      finish = { x: start.x + 50, y: start.y - 40 };
    f.w.get('[data-shape-endpoint="0"]').element.dispatchEvent(f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointermove", finish));
    await nextTick();
    if (change === "revision") await f.w.setProps({ revision: 2 });
    else if (change === "root-replacement")
      await f.w.setProps({ drawings: structuredClone(toRaw(f.sheet.drawings!)) });
    else if (change === "metrics")
      await f.w.setProps({ metrics: createPictureSheetMetrics(f.sheet) });
    else if (change === "selection") await f.w.setProps({ selectedDrawingId: "target" });
    else if (change === "read-only") await f.w.setProps({ readOnly: true });
    else if (change === "same-array-target-replacement")
      f.sheet.drawings![0] = structuredClone(toRaw(f.sheet.drawings![0]!));
    else if (change === "in-place-target-change")
      (f.sheet.drawings![0] as SheetFramedGraphicDrawing).rotation = 23;
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(f.pointer("pointerup", finish));
    await nextTick();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.applyOne).not.toHaveBeenCalled();
  });
  test("stale endpoint callback cannot cross a selection owner change", async () => {
    const f = fixture();
    await nextTick();
    const handler = f.w.getComponent(StandardShapeSelection).vm.$.vnode.props!.onEndpoint as (
      i: 0 | 1,
      e: PointerEvent,
    ) => void;
    const start = f.viewport(f.route().begin);
    await f.w.setProps({ selectedDrawingId: "target" });
    handler(0, f.pointer("pointerdown", start) as PointerEvent);
    window.dispatchEvent(f.pointer("pointerup", { x: start.x + 40, y: start.y - 40 }));
    await nextTick();
    expect(f.apply).not.toHaveBeenCalled();
  });
  test("target preview follows derived connector before release and never changes its binding model", async () => {
    const f = fixture();
    await f.w.setProps({ selectedDrawingId: "target" });
    await nextTick();
    const before = f.route(),
      start = f.viewport({ x: 200, y: 150 });
    f.w
      .get('[data-sheet-drawing-id="target"]')
      .element.dispatchEvent(f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointermove", { x: start.x + 40, y: start.y + 20 }));
    await nextTick();
    const content = f.w
      .findAllComponents(DrawingContent)
      .find((c) => c.props("drawing").id === "connector")!;
    expect(content.props("connectorRoute")!.begin.x).toBeCloseTo(before.begin.x + 40, 9);
    expect(content.props("connectorRoute")!.begin.y).toBeCloseTo(before.begin.y + 20, 9);
    expect(f.applyOne).not.toHaveBeenCalled();
    window.dispatchEvent(f.pointer("pointerup", { x: start.x + 40, y: start.y + 20 }));
    await nextTick();
    expect(f.applyOne).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.sheet.drawings![2]).toHaveProperty("shapeConnector", {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
      end: { kind: "site", targetId: "other", preset: "ellipse", siteIndex: 0 },
    });
  });
  test("group preview uses the entire forest including the external target", async () => {
    const f = fixture({ group: true });
    await nextTick();
    const before = f.route();
    const group = f.w.findAllComponents(ShapeGroupSelection).find((g) => g.props("showHandles"))!;
    const start = f.viewport({ x: 200, y: 150 });
    group.vm.$emit("move", f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointermove", { x: start.x + 30, y: start.y + 15 }));
    await nextTick();
    const content = f.w
      .findAllComponents(DrawingContent)
      .find((c) => c.props("drawing").id === "connector")!;
    expect(content.props("connectorRoute")!.begin.x).toBeCloseTo(before.begin.x + 30, 9);
    expect(content.props("connectorRoute")!.begin.y).toBeCloseTo(before.begin.y + 15, 9);
    expect(content.props("connectorRoute")!.end).toEqual(before.end);
    window.dispatchEvent(f.pointer("pointerup", { x: start.x + 30, y: start.y + 15 }));
    await nextTick();
    expect(f.apply).toHaveBeenCalledTimes(1);
  });
  test("owned connector endpoint uses its exact source path while an external target remains present", async () => {
    const f = fixture({ group: true });
    await nextTick();
    const original = f.route();
    const commands = original.geometry.paths[0]!.commands,
      a = commands[0]!,
      b = commands[1]!;
    if (a[0] !== "M" || b[0] !== "L") throw Error("Expected first segment");
    const start = f.viewport(
      shapeFrameLocalToWorld(original.paintLayout.rect, original.paintLayout.angleDeg, {
        x: (a[1] + b[1]) / 2,
        y: (a[2] + b[2]) / 2,
      }),
    );
    f.w
      .get('[data-sheet-drawing-id="connector"]')
      .element.dispatchEvent(f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointerup", start));
    await nextTick();
    expect(f.w.findAll("[data-shape-endpoint]")).toHaveLength(2);
    f.apply.mockClear();
    await f.dragEnd(0, f.viewport({ x: original.begin.x + 70, y: original.begin.y - 40 }));
    expect(f.apply).toHaveBeenCalledTimes(1);
    const next = nextConnector(f);
    if (next.status !== "ready") throw Error("Expected route");
    expect(next.connection.path).toEqual(["group", "connector"]);
    expect(next.connection.begin.kind).toBe("free");
    expect(next.connection.end.kind).toBe("site");
    expect(next.route.end).toEqual(original.end);
    expect(proposed(f).find((root) => root.id === "other")).toEqual(
      f.sheet.drawings!.find((root) => root.id === "other"),
    );
  });
  test("owned ordinary target preview follows its connector with real immediate-owner inverse", async () => {
    const f = fixture({ group: true });
    await nextTick();
    const before = f.route(),
      start = f.viewport({ x: 200, y: 150 });
    f.w
      .get('[data-sheet-drawing-id="target"]')
      .element.dispatchEvent(f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointerup", start));
    await nextTick();
    f.apply.mockClear();
    f.w
      .get('[data-sheet-drawing-id="target"]')
      .element.dispatchEvent(f.pointer("pointerdown", start));
    window.dispatchEvent(f.pointer("pointermove", { x: start.x + 40, y: start.y + 20 }));
    await nextTick();
    const content = f.w
      .findAllComponents(DrawingContent)
      .find((c) => c.props("drawing").id === "connector")!;
    expect(content.props("connectorRoute")!.begin.x).toBeCloseTo(before.begin.x + 40, 9);
    expect(content.props("connectorRoute")!.begin.y).toBeCloseTo(before.begin.y + 20, 9);
    expect(content.props("connectorRoute")!.end).toEqual(before.end);
    window.dispatchEvent(f.pointer("pointerup", { x: start.x + 40, y: start.y + 20 }));
    await nextTick();
    expect(f.applyOne).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
  });
  test("root rotation retains exact transformed member sites and fixed external binding", async () => {
    const f = fixture({ group: true });
    await nextTick();
    const before = f.route();
    const group = f.w.findAllComponents(ShapeGroupSelection).find((g) => g.props("showHandles"))!;
    group.vm.$emit("nudgeRotation", 37);
    await nextTick();
    expect(f.apply).toHaveBeenCalledTimes(1);
    const pass = resolveShapeForestForRender({
      drawings: proposed(f),
      metrics: f.metrics,
      revision: 1,
    });
    const next = pass.getLeaf("connector")!.connector!;
    if (next.status !== "ready") throw Error("Expected route");
    const target = pass.connections!.getTarget("target")!.sites[3]!;
    expect(next.route.begin).toEqual(target.position);
    expect(next.route.end).toEqual(before.end);
    expect(next.connection.begin.kind).toBe("site");
    expect(next.connection.end.kind).toBe("site");
  });
  test.each(["connector-text", "connector-3d", "degenerate"])(
    "%s yields explicit status with no fabricated object pixels",
    async (kind) => {
      const f = fixture();
      const node = f.sheet.drawings![2] as SheetFramedGraphicDrawing;
      if (kind === "connector-text") node.text = "Stored label";
      else if (kind === "connector-3d")
        node.shapeStyle = {
          rotation3d: { kind: "value", value: createPictureRotation3d("parallel") },
        };
      else
        node.shapeConnector = {
          kind: "shape-connector-v1",
          begin: { kind: "free", xRatio: 0, yRatio: 0 },
          end: { kind: "free", xRatio: 0, yRatio: 0 },
        };
      await f.w.setProps({ drawings: [...f.sheet.drawings!], revision: 2 });
      await nextTick();
      expect(f.w.find('[data-sheet-drawing-id="connector"]').exists()).toBe(false);
      expect(
        f.w.get('[data-shape-connector-id="connector"]').attributes("data-shape-connector-status"),
      ).toBe(kind === "degenerate" ? "degenerate" : "unavailable");
      if (kind !== "degenerate")
        expect(
          f.w
            .get('[data-shape-connector-id="connector"]')
            .attributes("data-shape-connector-unavailable-reason"),
        ).toBe(kind);
    },
  );
  test("collapsed target suspends the connector without carrier fallback pixels", async () => {
    const f = fixture();
    const target = f.sheet.drawings![0] as SheetFramedGraphicDrawing;
    target.shapeFrame.anchor = anchorShapeFrameRect(
      "move-and-size",
      { x: 160, y: 120, width: 80, height: 60 },
      f.metrics,
    );
    f.sheet.hiddenColumns = new Set(Array.from({ length: 11 }, (_, i) => i));
    f.sheet.hiddenRows = new Set(Array.from({ length: 11 }, (_, i) => i));
    await f.w.setProps({
      drawings: [...f.sheet.drawings!],
      metrics: createPictureSheetMetrics(f.sheet),
      revision: 2,
    });
    await nextTick();
    expect(f.w.find('[data-sheet-drawing-id="connector"]').exists()).toBe(false);
    expect(
      f.w.get('[data-shape-connector-id="connector"]').attributes("data-shape-connector-status"),
    ).toBe("suspended");
  });
  test("endpoint keyboard nudge detaches only its chosen end through the collection callback", async () => {
    const f = fixture();
    await nextTick();
    const before = f.route();
    await f.w.get('[data-shape-endpoint="0"]').trigger("keydown", { key: "ArrowRight" });
    expect(f.apply).toHaveBeenCalledTimes(1);
    const next = nextConnector(f);
    if (next.status !== "ready") throw Error("Expected route");
    expect(next.route.begin.x).toBeCloseTo(before.begin.x + 1, 9);
    expect(next.route.begin.y).toBeCloseTo(before.begin.y, 9);
    expect(next.connection.begin.kind).toBe("free");
    expect(next.connection.end.kind).toBe("site");
    expect(next.route.end).toEqual(before.end);
  });
  test("rejected collection and missing atomic callback retain all original connector data", async () => {
    const f = fixture();
    await nextTick();
    const before = structuredClone(toRaw(f.sheet.drawings!));
    f.apply.mockReturnValue(false);
    const start = f.route().begin;
    await f.dragEnd(0, f.viewport({ x: start.x + 70, y: start.y - 40 }));
    expect(f.w.find("[data-shape-collection-rejected]").exists()).toBe(true);
    expect(f.sheet.drawings).toEqual(before);
    await f.w.setProps({ applyCollection: undefined });
    await f.dragEnd(0, f.viewport({ x: start.x + 70, y: start.y - 40 }));
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.applyOne).not.toHaveBeenCalled();
    expect(f.sheet.drawings).toEqual(before);
    expect(f.w.find("[data-shape-connector-operation-unavailable]").exists()).toBe(true);
  });
  test("generic connector angle/resize refuse while format opens the exact canonical owner", async () => {
    const f = fixture();
    await nextTick();
    const selection = f.w.getComponent(StandardShapeSelection);
    selection.vm.$emit("nudgeRotation", 15);
    await nextTick();
    selection.vm.$emit("resize", "e", f.pointer("pointerdown", f.viewport(f.route().end)));
    await nextTick();
    await f.w.get("[data-shape-format-trigger]").trigger("click");
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.applyOne).not.toHaveBeenCalled();
    expect(f.w.emitted("format")?.[0]).toEqual([
      f.sheet.drawings!.find((d) => d.id === "connector"),
    ]);
    expect(f.w.find("[data-shape-connector-operation-unavailable]").exists()).toBe(false);
  });
  test("yellow route gesture preserves both exact tips, bindings and grab offset", async () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook),
      original = f.route();
    const handle = shapeFrameLocalToWorld(
      original.paintLayout.rect,
      original.paintLayout.angleDeg,
      original.geometry.handles[0]!.position,
    );
    const at = f.viewport(handle),
      grab = { x: 3, y: -2 },
      target = { x: at.x + 40, y: at.y + 25 };
    f.w
      .get('[data-shape-adjustment="0"]')
      .element.dispatchEvent(f.pointer("pointerdown", { x: at.x + grab.x, y: at.y + grab.y }));
    window.dispatchEvent(f.pointer("pointermove", { x: target.x + grab.x, y: target.y + grab.y }));
    await nextTick();
    expect(f.apply).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    window.dispatchEvent(f.pointer("pointerup", { x: target.x + grab.x, y: target.y + grab.y }));
    await nextTick();
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.applyOne).not.toHaveBeenCalled();
    const next = nextConnector(f);
    if (next.status !== "ready") throw Error("Expected route");
    expect(next.route.begin).toEqual(original.begin);
    expect(next.route.end).toEqual(original.end);
    expect(next.connection.begin.kind).toBe("site");
    expect(next.connection.end.kind).toBe("site");
    expect(next.route.geometry.paths).not.toEqual(original.geometry.paths);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("real Core endpoint edit restores complete bindings in Undo and Redo", async () => {
    const f = fixture();
    const session = createWorkbookSession({
      workbook: f.workbook,
      idFactory: createSequentialIdFactory(),
    });
    const actions = useDrawingActions({
      getWorkbook: () => f.workbook,
      getSheet: () => f.sheet,
      getAddress: () => ({ row: 0, column: 0 }),
      getMetrics: () => f.metrics,
      flush: () => true,
      execute: (command) => executeWorkbookCommand(session, command),
      isBusy: () => false,
      name: () => "Shape",
    });
    const apply = vi.fn(
      (
        next: readonly SheetDrawing[],
        expected: readonly SheetDrawing[],
        metrics?: typeof f.metrics,
        guard?: () => boolean,
      ) => {
        expect(guard?.()).toBe(true);
        expect(metrics).toBe(f.metrics);
        expect(expected.every((drawing, i) => drawing === f.sheet.drawings![i])).toBe(true);
        expect(f.workbook.sheets.get(f.sheet.id)).toBe(f.sheet);
        return actions.replaceCollection(next, expected, metrics, guard);
      },
    );
    await f.w.setProps({ applyCollection: apply });
    const before = serializeWorkbook(f.workbook),
      start = f.route().begin;
    await f.dragEnd(0, f.viewport({ x: start.x + 70, y: start.y - 40 }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.results[0]!.value).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });
});

test("effective metric failure refuses the whole route pass visibly without source-carrier fallback and can recover", async () => {
  const f = fixture();
  const target = f.sheet.drawings![0]!;
  if (target.kind !== "shape" || !("shapeFrame" in target)) throw Error("Expected framed target");
  target.shapeFrame.anchor = {
    mode: "move-only",
    origin: { column: { index: 30, offset: 0 }, row: { index: 5, offset: 0 } },
    size: { width: 80, height: 60 },
  };
  await f.w.setProps({ revision: 2, drawings: f.sheet.drawings });
  await nextTick();
  expect(f.w.find("[data-shape-connector-layout-unavailable]").exists()).toBe(false);
  const before = serializeWorkbook(f.workbook);
  const shadow = { ...toRaw(f.sheet), defaultColumnWidth: 640 };
  await f.w.setProps({ metrics: markRaw(createPictureSheetMetrics(shadow)) });
  await nextTick();
  expect(f.w.get("[data-shape-connector-layout-unavailable]").text()).toContain(
    "data is preserved",
  );
  expect(f.w.findAll("[data-sheet-drawing-id]")).toHaveLength(0);
  expect(f.w.findComponent(DrawingContent).exists()).toBe(false);
  expect(f.apply).not.toHaveBeenCalled();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  await f.w.setProps({ metrics: f.metrics });
  await nextTick();
  expect(f.w.find("[data-shape-connector-layout-unavailable]").exists()).toBe(false);
  expect(f.w.findAll("[data-sheet-drawing-id]").length).toBeGreaterThan(0);
});
