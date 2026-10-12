import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../shared/i18n";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { framedShape } from "./framed-shape-fixture";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import ShapeGroupDetailedContent from "../../../modules/sheet-drawings/components/ShapeGroupDetailedContent.vue";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import {
  hitShapeGroupPaint,
  type ShapeGroupPaintResult,
} from "../../../modules/sheet-drawings/shape-group-paint";
import type {
  ShapeLeafPixelsOptions,
  ShapeLeafPixelsPlan,
  ShapeLeafPixelsResult,
} from "../../../modules/sheet-drawings/shape-leaf-pixels";
import { getShapePresentationAllocatedBytes } from "../../../modules/sheet-drawings/shape-detailed-presentation";

const leafPixels = vi.hoisted(() => ({ plan: vi.fn(), prepare: vi.fn() }));
vi.mock("../../../modules/sheet-drawings/shape-leaf-pixels", async (original) => ({
  ...(await original<typeof import("../../../modules/sheet-drawings/shape-leaf-pixels")>()),
  planShapeLeafPixels: leafPixels.plan,
  prepareShapeLeafPixels: leafPixels.prepare,
}));

type Matrix = [number, number, number, number, number, number];
type Surface = { width: number; height: number; data: Uint8ClampedArray };
let surfaces = new WeakMap<HTMLCanvasElement, Surface>();
function surface(canvas: HTMLCanvasElement) {
  let value = surfaces.get(canvas);
  if (!value || value.width !== canvas.width || value.height !== canvas.height) {
    value = {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
    };
    surfaces.set(canvas, value);
  }
  return value;
}
/** Synthetic Canvas/leaf raster boundary only. Group composition, alpha masks,
 * owner identity, hit traversal and every Vue selection callback stay real. */
class GroupCanvasContext {
  matrix: Matrix = [1, 0, 0, 1, 0, 0];
  stack: Matrix[] = [];
  constructor(readonly canvas: HTMLCanvasElement) {}
  save() {
    this.stack.push([...this.matrix]);
  }
  restore() {
    this.matrix = this.stack.pop() ?? this.matrix;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [aa, bb, cc, dd, ee, ff] = this.matrix;
    this.matrix = [
      aa * a + cc * b,
      bb * a + dd * b,
      aa * c + cc * d,
      bb * c + dd * d,
      aa * e + cc * f + ee,
      bb * e + dd * f + ff,
    ];
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  clearRect() {
    surface(this.canvas).data.fill(0);
  }
  drawImage(
    image: HTMLCanvasElement,
    x: number,
    y: number,
    width = image.width,
    height = image.height,
  ) {
    const [a, b, c, d, e, f] = this.matrix,
      det = a * d - b * c;
    const fromPixels = surface(image).data,
      toPixels = surface(this.canvas).data;
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f;
        const u = ((d * dx - c * dy) / det - x) / width;
        const v = ((-b * dx + a * dy) / det - y) / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const from = (Math.floor(v * image.height) * image.width + Math.floor(u * image.width)) * 4;
        const to = (py * this.canvas.width + px) * 4;
        const alpha = fromPixels[from + 3]! / 255,
          oldAlpha = toPixels[to + 3]! / 255;
        const outAlpha = alpha + oldAlpha * (1 - alpha);
        if (!outAlpha) continue;
        for (let channel = 0; channel < 3; channel++)
          toPixels[to + channel] =
            (fromPixels[from + channel]! * alpha +
              toPixels[to + channel]! * oldAlpha * (1 - alpha)) /
            outAlpha;
        toPixels[to + 3] = outAlpha * 255;
      }
  }
  getImageData() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
      data: surface(this.canvas).data.slice(),
    };
  }
  createImageData(width: number, height: number) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image: { data: Uint8ClampedArray }) {
    surface(this.canvas).data.set(image.data);
  }
}
function rasterPlan(options: ShapeLeafPixelsOptions): ShapeLeafPixelsPlan {
  const width = Math.max(1, Math.ceil(options.drawing.width * options.density));
  const height = Math.max(1, Math.ceil(options.drawing.height * options.density));
  return {
    kind: "ready",
    actualDensity: options.density,
    logicalBounds: {
      left: 0,
      top: 0,
      right: width / options.density,
      bottom: height / options.density,
    },
    widthRaster: width,
    heightRaster: height,
    estimatedPeakBytes: width * height * 8 + 4096,
    ownedBytes: width * height * 4,
    bodyPlan: { assetIds: [] },
  } as unknown as ShapeLeafPixelsPlan;
}
function raster(options: ShapeLeafPixelsOptions): ShapeLeafPixelsResult {
  const plan = rasterPlan(options);
  if (plan.kind !== "ready") return plan;
  const canvas = options.canvasFactory!();
  canvas.width = plan.widthRaster;
  canvas.height = plan.heightRaster;
  const color = options.drawing.id === "b" ? [0, 0, 255] : [255, 0, 0];
  const data = surface(canvas).data;
  for (let offset = 0; offset < data.length; offset += 4) data.set([...color, 255], offset);
  return {
    ...plan,
    canvas,
    dispose: () => {
      canvas.width = canvas.height = 0;
    },
  };
}
function shadowBoundary() {
  surfaces = new WeakMap();
  leafPixels.plan.mockReset().mockImplementation(rasterPlan);
  leafPixels.prepare.mockReset().mockImplementation(raster);
  const contexts = new WeakMap<HTMLCanvasElement, GroupCanvasContext>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      let context = contexts.get(this);
      if (!context) {
        context = new GroupCanvasContext(this);
        contexts.set(this, context);
      }
      return context as unknown as CanvasRenderingContext2D;
    },
  );
}
async function settleGroupPaint() {
  await nextTick();
  await nextTick();
  await nextTick();
  await nextTick();
}
function latestGroupPaint(wrapper: VueWrapper) {
  return wrapper.getComponent(ShapeGroupDetailedContent).emitted("paint")?.at(-1)?.[0] as
    | Extract<ShapeGroupPaintResult, { kind: "ready" }>
    | undefined;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function pointer(type: string, x: number, y: number, ctrlKey = false) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    ctrlKey,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  return event;
}
function shape(id: string, x: number, y: number, width = 120, height = 80) {
  const s = framedShape();
  s.id = id;
  s.name = id;
  s.rotation = 0;
  s.text = "";
  s.shapeGeometry = { preset: "rect" };
  s.shapeFrame.anchor = { mode: "fixed", x, y, size: { width, height } };
  return s;
}
function fixture(grouped = false, rejected = false, nested = false) {
  const workbook = reactive(createWorkbook({ id: "groups-ui", sheetId: "s" })),
    sheet = getActiveSheet(workbook),
    metrics = reactive(createPictureSheetMetrics(sheet));
  sheet.drawings = [shape("a", 80, 40), shape("b", 260, 60, 90, 60)];
  if (grouped)
    sheet.drawings = groupShapeRoots(
      sheet.drawings,
      ["a", "b"],
      { id: "g", name: "Group" },
      metrics,
    );
  if (nested)
    sheet.drawings = groupShapeRoots(
      [...sheet.drawings!, shape("c", 450, 140)],
      ["g", "c"],
      { id: "outer", name: "Outer" },
      metrics,
    );
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let revision = 0;
  let wrapper: VueWrapper;
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getRevision: () => revision,
    getGeneration: () => 0,
    getMetrics: () => metrics,
    getAddress: () => ({ row: 0, column: 0 }),
    flush: () => true,
    isBusy: () => false,
    name: (kind) => kind,
    execute: (command) => (rejected ? false : executeWorkbookCommand(session, command)),
  });
  const sync = async () => {
    revision++;
    await wrapper.setProps({ drawings: [...(sheet.drawings ?? [])], revision });
    await nextTick();
  };
  const apply = vi.fn(
    (
      next: Parameters<typeof actions.replaceCollection>[0],
      expected: Parameters<typeof actions.replaceCollection>[1],
      m = metrics,
    ) => {
      const accepted = actions.replaceCollection(next, expected, m);
      if (accepted) void sync();
      return accepted;
    },
  );
  const applyOne = vi.fn(
    (
      next: Parameters<typeof actions.update>[0],
      expected: Parameters<typeof actions.update>[1],
    ) => {
      const accepted = actions.update(next, expected);
      if (accepted) void sync();
      return accepted;
    },
  );
  wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      sheet,
      metrics,
      revision,
      scale: 1,
      readOnly: false,
      applyCollection: apply,
      applyUpdate: applyOne,
      layout: createSheetViewportLayout({
        geometry: createSheetGeometry({
          rowCount: 30,
          columnCount: 12,
          rowHeight: 24,
          columnWidth: 80,
        }),
        rows: createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 }),
        viewportSize: { width: 700, height: 500 },
      }),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const click = async (id: string, x: number, y: number, ctrl = false) => {
    wrapper
      .get(`[data-sheet-drawing-id="${id}"]`)
      .element.dispatchEvent(pointer("pointerdown", x, y, ctrl));
    window.dispatchEvent(pointer("pointerup", x, y, ctrl));
    await nextTick();
  };
  return { wrapper, workbook, sheet, metrics, session, apply, applyOne, click, sync };
}
function action(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  expect(el).not.toBeNull();
  el!.click();
}

test("real multi-select toolbar groups atomically; Undo/Redo and snapshot retain owned geometry", async () => {
  const f = fixture();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(2);
  const before = serializeWorkbook(f.workbook);
  action('[data-shape-selection-action="group"]');
  await nextTick();
  expect(f.sheet.drawings).toHaveLength(1);
  const root = f.sheet.drawings![0];
  expect(isShapeGroupDrawing(root)).toBe(true);
  expect(f.wrapper.findAll("[data-shape-group-id]")).toHaveLength(1);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(0);
  const grouped = serializeWorkbook(f.workbook);
  expect(grouped.version).toBe(61);
  expect(serializeWorkbook(deserializeWorkbook(grouped))).toEqual(grouped);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(grouped);
});

test("multi body drag moves every root; side resize applies same factor about each own edge", async () => {
  const f = fixture();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .element.dispatchEvent(pointer("pointerdown", 130, 80));
  window.dispatchEvent(pointer("pointermove", 150, 95));
  window.dispatchEvent(pointer("pointerup", 150, 95));
  await nextTick();
  let a = resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect,
    b = resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect;
  expect(a.x).toBe(100);
  expect(a.y).toBe(55);
  expect(b.x).toBe(280);
  expect(b.y).toBe(75);
  f.wrapper
    .get('[data-sheet-drawing-id="a"] [data-shape-resize="e"]')
    .element.dispatchEvent(pointer("pointerdown", 220, 95));
  window.dispatchEvent(pointer("pointerup", 250, 95));
  await nextTick();
  a = resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect;
  b = resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect;
  expect(a.width).toBe(150);
  expect(b.width).toBe(112.5);
  expect(a.height).toBe(80);
  expect(b.height).toBe(60);
  expect(a.x).toBe(100);
  expect(b.x).toBe(280);
});

test("group body drag transforms container; second stationary click selects member then Delete collapses owner", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  expect(f.wrapper.find('[data-shape-group-id="g"]')).toBeDefined();
  f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .element.dispatchEvent(pointer("pointerdown", 130, 80));
  window.dispatchEvent(pointer("pointerup", 150, 95));
  await nextTick();
  let root = f.sheet.drawings![0];
  if (!isShapeGroupDrawing(root)) throw Error("not group");
  let leaves = resolveShapeGroupProjection(root, f.metrics).leaves;
  expect(leaves[0]!.layout!.rect.x).toBe(100);
  expect(leaves[1]!.layout!.rect.x).toBe(280);
  await f.click("a", 150, 95);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(1);
  f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
  await nextTick();
  expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["b"]);
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect.x).toBe(280);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(isShapeGroupDrawing(f.sheet.drawings![0])).toBe(true);
});

test("group frame side resize updates all leaf layouts; Ungroup is one exact history command", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  f.wrapper
    .get('[data-shape-group-resize="e"]')
    .element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 404, 80));
  await nextTick();
  const root = f.sheet.drawings![0];
  if (!isShapeGroupDrawing(root)) throw Error("not group");
  const group = serializeWorkbook(f.workbook),
    leaves = resolveShapeGroupProjection(root, f.metrics).leaves;
  expect(leaves[0]!.layout!.rect.width).toBeCloseTo(144);
  expect(leaves[1]!.layout!.rect.width).toBeCloseTo(108);
  action("[data-shape-group-ungroup]");
  await nextTick();
  expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["a", "b"]);
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect).toEqual(
    leaves[0]!.layout!.rect,
  );
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(group);
});

test("rejected collection action preserves original forest/history and keeps a visible retryable selection", async () => {
  const f = fixture(false, true);
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  const before = serializeWorkbook(f.workbook);
  action('[data-shape-selection-action="group"]');
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(undoWorkbookCommand(f.session)).toBe(false);
  expect(document.querySelector("[data-shape-selection-failure]")).not.toBeNull();
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(2);
});

test("owner/revision change cancels pending group gesture and readonly blocks collection controls", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  const before = serializeWorkbook(f.workbook);
  f.wrapper
    .get('[data-shape-group-resize="e"]')
    .element.dispatchEvent(pointer("pointerdown", 350, 80));
  await f.wrapper.setProps({ revision: 9 });
  window.dispatchEvent(pointer("pointerup", 404, 80));
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  await f.wrapper.setProps({ readOnly: true });
  expect(f.wrapper.find("[data-shape-group-resize]")).toBeDefined();
  expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
});

test("owned member double-click emits the real root/path instead of editing a fake container", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  await f.wrapper
    .get('[data-sheet-drawing-id="a"]')
    .trigger("dblclick", { clientX: 130, clientY: 80 });
  const emitted = f.wrapper.emitted("editOwned");
  expect(emitted).toHaveLength(1);
  expect(emitted![0]![0]).toBe(f.sheet.drawings![0]);
  expect(emitted![0]![1]).toEqual(["g", "a"]);
});

test("keyboard focus on an unselected owner never deletes the old multi-selection", async () => {
  const f = fixture();
  const c = shape("c", 420, 40);
  f.sheet.drawings!.push(c);
  await f.sync();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  f.wrapper
    .get('[data-sheet-drawing-id="c"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
  expect(f.wrapper.emitted("delete")).toEqual([["c"]]);
  expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["a", "b", "c"]);
  expect(f.apply).not.toHaveBeenCalled();
});

test("retained member handle callbacks cannot edit a different current member selection", async () => {
  const f = fixture(true);
  await f.click("a", 130, 80);
  await f.click("a", 130, 80);
  const vnode = f.wrapper.getComponent(StandardShapeSelection).vm.$.vnode;
  const oldResize = vnode.props!.onResize as (direction: string, event: PointerEvent) => void;
  const oldNudge = vnode.props!.onNudgeRotation as (degrees: number) => void;
  await f.click("b", 300, 90);
  f.applyOne.mockClear();
  const before = serializeWorkbook(f.workbook);
  oldResize("e", pointer("pointerdown", 200, 80) as PointerEvent);
  window.dispatchEvent(pointer("pointerup", 260, 80));
  oldNudge(15);
  await nextTick();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  expect(f.applyOne).not.toHaveBeenCalled();
});

test("multi floating equal dimensions uses last selected owner and one reversible collection transaction", async () => {
  const f = fixture();
  await f.click("a", 130, 80);
  await f.click("b", 300, 90, true);
  const before = serializeWorkbook(f.workbook);
  action('[data-shape-selection-action="equal-width"]');
  await nextTick();
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect.width).toBe(90);
  expect(resolveShapeDrawing(f.sheet.drawings![0]!, f.metrics).rect.height).toBe(80);
  expect(resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect.width).toBe(90);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
});
test("nested container is directly selectable, moves only its subtree, and one-level Ungroup preserves all world leaves", async () => {
  const f = fixture(true, false, true);
  await f.click("a", 130, 80);
  const beforeRoot = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(beforeRoot)) throw Error("group");
  const before = resolveShapeGroupProjection(beforeRoot, f.metrics).leaves;
  const border = f.wrapper.get('[data-shape-group-id="g"] [data-shape-group-move]');
  border.element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 350, 80));
  await nextTick();
  expect(
    f.wrapper.get('[data-shape-group-id="g"]').findAll("[data-shape-group-resize]"),
  ).toHaveLength(8);
  expect(
    f.wrapper.get('[data-shape-group-id="outer"]').findAll("[data-shape-group-resize]"),
  ).toHaveLength(0);
  border.element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 390, 100));
  await nextTick();
  const movedRoot = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(movedRoot)) throw Error("group");
  const moved = resolveShapeGroupProjection(movedRoot, f.metrics).leaves;
  expect(moved[0]!.layout!.rect.x).toBeCloseTo(before[0]!.layout!.rect.x + 40);
  expect(moved[1]!.layout!.rect.y).toBeCloseTo(before[1]!.layout!.rect.y + 20);
  expect(moved[2]!.layout!.rect).toEqual(before[2]!.layout!.rect);
  f.wrapper
    .get('[data-shape-group-id="g"]')
    .element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }),
    );
  expect(f.wrapper.emitted("formatGroup")!.at(-1)!).toEqual([movedRoot, ["outer", "g"]]);
  action("[data-shape-group-ungroup]");
  await nextTick();
  const result = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(result)) throw Error("group");
  expect(result.members.map((n) => n.id)).toEqual(["a", "b", "c"]);
  const after = resolveShapeGroupProjection(result, f.metrics).leaves;
  expect(after.map((l) => l.layout!.rect)).toEqual(moved.map((l) => l.layout!.rect));
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(f.sheet.drawings![0]).toEqual(movedRoot);
});

test("dragging a selected root group frame preserves and transforms every multi-selected root", async () => {
  const f = fixture(true);
  f.sheet.drawings = [...f.sheet.drawings!, shape("c", 450, 140)];
  await f.sync();
  await f.click("a", 130, 80);
  await f.click("c", 500, 180, true);
  const before = serializeWorkbook(f.workbook);
  f.wrapper
    .get('[data-shape-group-id="g"] [data-shape-group-move]')
    .element.dispatchEvent(pointer("pointerdown", 350, 80));
  window.dispatchEvent(pointer("pointerup", 380, 100));
  await nextTick();
  const root = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(root)) throw Error("group");
  const leaves = resolveShapeGroupProjection(root, f.metrics).leaves;
  expect(leaves[0]!.layout!.rect.x).toBe(110);
  expect(leaves[1]!.layout!.rect.y).toBe(80);
  expect(resolveShapeDrawing(f.sheet.drawings![1]!, f.metrics).rect).toMatchObject({
    x: 480,
    y: 160,
  });
  expect(document.querySelectorAll('[data-shape-selection-action="group"]')).toHaveLength(1);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  await f.sync();
  expect(serializeWorkbook(f.workbook)).toEqual(before);
});

async function shadowFixture(nested = false) {
  shadowBoundary();
  const f = fixture(true, false, nested);
  const root = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(root)) throw new Error("Expected group owner.");
  const owner = nested ? root.members[0]! : root;
  if (owner.kind !== "shapeGroup") throw new Error("Expected nested owner.");
  owner.groupEffects = {
    shadow: {
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 1,
        blurPt: 0,
        distancePt: 3,
        angleDeg: 0,
        scale: 1,
        anchor: "center",
      },
    },
  };
  await f.sync();
  await settleGroupPaint();
  expect(latestGroupPaint(f.wrapper)).toBeDefined();
  return f;
}
async function clickGroupPixels(wrapper: VueWrapper, x: number, y: number, ctrl = false) {
  wrapper
    .get("[data-shape-group-paint] canvas")
    .element.dispatchEvent(pointer("pointerdown", x, y, ctrl));
  window.dispatchEvent(pointer("pointerup", x, y, ctrl));
  await settleGroupPaint();
}

test.each(["readonly", "protected", "without collection callback"] as const)(
  "owner-only Shadow pixels remain selected through document bubbling when %s blocks editing",
  async (mode) => {
    const f = await shadowFixture();
    if (mode === "readonly") await f.wrapper.setProps({ readOnly: true });
    else if (mode === "protected") {
      f.sheet.properties.protected = true;
      await f.sync();
    } else await f.wrapper.setProps({ applyCollection: undefined });
    await settleGroupPaint();
    const before = serializeWorkbook(f.workbook),
      result = latestGroupPaint(f.wrapper)!;
    expect(hitShapeGroupPaint(result, { x: 122, y: 40 })).toEqual({ kind: "owner", path: ["g"] });
    expect(f.wrapper.get('[data-shape-group-paint="g"]').attributes("data-sheet-drawing-id")).toBe(
      "g",
    );
    await clickGroupPixels(f.wrapper, 202, 80);
    expect(f.wrapper.emitted("selectionChange")!.at(-1)).toEqual(["g"]);
    expect(f.wrapper.emitted("groupSelectionChange")!.at(-1)).toEqual(["g", ["g"]]);
    expect(f.wrapper.find('[data-shape-group-id="g"]').exists()).toBe(true);
    expect(f.wrapper.emitted("backgroundPointer")).toBeUndefined();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.applyOne).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  },
);

test("real composed leaf alpha chooses the exact member while hidden legacy visuals retain selection handles", async () => {
  const f = await shadowFixture(),
    result = latestGroupPaint(f.wrapper)!;
  expect(hitShapeGroupPaint(result, { x: 50, y: 40 })).toEqual({ kind: "leaf", path: ["g", "a"] });
  expect(hitShapeGroupPaint(result, { x: 220, y: 50 })).toEqual({ kind: "leaf", path: ["g", "b"] });
  expect(f.wrapper.findAllComponents(DrawingContent)).toHaveLength(0);
  expect(f.wrapper.get('[data-sheet-drawing-id="a"]').classes()).toContain(
    "is-composed-group-leaf",
  );
  await clickGroupPixels(f.wrapper, 130, 80);
  await clickGroupPixels(f.wrapper, 130, 80);
  expect(f.wrapper.findAll("[data-standard-shape-selection]")).toHaveLength(1);
  expect(f.wrapper.get('[data-sheet-drawing-id="a"]').find("[data-shape-resize]").exists()).toBe(
    true,
  );
  expect(f.wrapper.emitted("groupSelectionChange")!.at(-1)).toEqual(["g", ["g", "a"]]);
  await f.wrapper
    .get('[data-shape-group-paint="g"] canvas')
    .trigger("dblclick", { clientX: 300, clientY: 90 });
  expect(f.wrapper.emitted("editOwned")!.at(-1)).toEqual([f.sheet.drawings![0], ["g", "b"]]);
  await f.wrapper
    .get('[data-shape-group-paint="g"] canvas')
    .trigger("dblclick", { clientX: 202, clientY: 80 });
  expect(f.wrapper.emitted("formatGroup")!.at(-1)).toEqual([f.sheet.drawings![0], ["g"]]);
});

test("overlapping ordered leaf pixels select the top ink or underlying leaf through its transparent hole", async () => {
  const f = await shadowFixture(),
    root = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(root)) throw new Error("Expected group.");
  const a = root.members[0]!,
    b = root.members[1]!;
  b.groupFrame = JSON.parse(JSON.stringify(a.groupFrame)) as typeof b.groupFrame;
  leafPixels.prepare.mockImplementation((options: ShapeLeafPixelsOptions) => {
    const ready = raster(options);
    if (ready.kind === "ready" && options.drawing.id === "b") {
      const { canvas } = ready,
        data = surface(canvas).data;
      for (let y = Math.floor(canvas.height / 3); y < Math.ceil((canvas.height * 2) / 3); y++)
        for (let x = Math.floor(canvas.width / 3); x < Math.ceil((canvas.width * 2) / 3); x++)
          data.fill(0, (y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4);
    }
    return ready;
  });
  await f.sync();
  await settleGroupPaint();
  const result = latestGroupPaint(f.wrapper)!;
  expect(hitShapeGroupPaint(result, { x: 10, y: 10 })).toEqual({ kind: "leaf", path: ["g", "b"] });
  expect(hitShapeGroupPaint(result, { x: 60, y: 40 })).toEqual({ kind: "leaf", path: ["g", "a"] });
  await f.wrapper
    .get('[data-shape-group-paint="g"] canvas')
    .trigger("dblclick", { clientX: 90, clientY: 50 });
  expect(f.wrapper.emitted("editOwned")!.at(-1)).toEqual([root, ["g", "b"]]);
  await f.wrapper
    .get('[data-shape-group-paint="g"] canvas')
    .trigger("dblclick", { clientX: 140, clientY: 80 });
  expect(f.wrapper.emitted("editOwned")!.at(-1)).toEqual([root, ["g", "a"]]);
  expect(f.wrapper.emitted("backgroundPointer")).toBeUndefined();
});

test("root collection order owns composed pixels, hidden leaf hit surfaces, and group selection stacking", async () => {
  const f = await shadowFixture();
  const group = f.sheet.drawings![0]!;
  f.sheet.drawings = [shape("before", 400, 40), group, shape("after", 480, 160)];
  await f.sync();
  await settleGroupPaint();
  await clickGroupPixels(f.wrapper, 202, 80);
  expect(
    (f.wrapper.get('[data-sheet-drawing-id="before"]').element as HTMLElement).style.zIndex,
  ).toBe("1");
  expect((f.wrapper.get('[data-shape-group-paint="g"]').element as HTMLElement).style.zIndex).toBe(
    "3",
  );
  expect((f.wrapper.get('[data-sheet-drawing-id="a"]').element as HTMLElement).style.zIndex).toBe(
    "4",
  );
  expect((f.wrapper.get('[data-shape-group-id="g"]').element as HTMLElement).style.zIndex).toBe(
    "5",
  );
  expect(
    (f.wrapper.get('[data-sheet-drawing-id="after"]').element as HTMLElement).style.zIndex,
  ).toBe("7");
  f.sheet.drawings = [f.sheet.drawings![2]!, f.sheet.drawings![0]!, f.sheet.drawings![1]!];
  await f.sync();
  await settleGroupPaint();
  expect((f.wrapper.get('[data-shape-group-paint="g"]').element as HTMLElement).style.zIndex).toBe(
    "6",
  );
  expect((f.wrapper.get('[data-sheet-drawing-id="a"]').element as HTMLElement).style.zIndex).toBe(
    "7",
  );
  expect((f.wrapper.get('[data-shape-group-id="g"]').element as HTMLElement).style.zIndex).toBe(
    "8",
  );
});

test("nested owner-only Shadow alpha selects the exact container path rather than the root or a rectangle leaf", async () => {
  const f = await shadowFixture(true),
    result = latestGroupPaint(f.wrapper)!;
  expect(hitShapeGroupPaint(result, { x: 122, y: 40 })).toEqual({
    kind: "owner",
    path: ["outer", "g"],
  });
  await clickGroupPixels(f.wrapper, 202, 80);
  expect(f.wrapper.emitted("groupSelectionChange")!.at(-1)).toEqual(["outer", ["outer", "g"]]);
  expect(
    f.wrapper.get('[data-shape-group-id="g"]').findAll("[data-shape-group-resize]"),
  ).toHaveLength(8);
  expect(
    f.wrapper.get('[data-shape-group-id="outer"]').findAll("[data-shape-group-resize]"),
  ).toHaveLength(0);
});

test("retained old-owner paint callbacks cannot replace or delete the current same-ID owner presentation", async () => {
  const f = await shadowFixture(),
    component = f.wrapper.getComponent(ShapeGroupDetailedContent);
  const oldPaint = component.vm.$.vnode.props!.onPaint as (
    result: Extract<ShapeGroupPaintResult, { kind: "ready" }> | undefined,
  ) => void;
  const oldResult = latestGroupPaint(f.wrapper)!;
  const source = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(source)) throw new Error("Expected group.");
  const next = structuredClone(JSON.parse(JSON.stringify(source))) as typeof source;
  next.name = "Replacement group";
  f.sheet.drawings = [next];
  await f.sync();
  await settleGroupPaint();
  const current = latestGroupPaint(f.wrapper)!;
  expect(current.sourceRoot).not.toBe(oldResult.sourceRoot);
  oldPaint(oldResult);
  await clickGroupPixels(f.wrapper, 202, 80);
  expect(f.wrapper.emitted("groupSelectionChange")!.at(-1)).toEqual(["g", ["g"]]);
  expect(f.wrapper.emitted("backgroundPointer")).toBeUndefined();
  oldPaint(undefined);
  await f.wrapper
    .get('[data-shape-group-paint="g"] canvas')
    .trigger("dblclick", { clientX: 300, clientY: 90 });
  expect(f.wrapper.emitted("editOwned")!.at(-1)).toEqual([f.sheet.drawings![0], ["g", "b"]]);
});

test("partial group raster failure keeps one owner status and no per-leaf visual fallback, then teardown releases every canvas", async () => {
  const allocated = getShapePresentationAllocatedBytes(),
    f = await shadowFixture();
  const result = latestGroupPaint(f.wrapper)!,
    copies = f.wrapper
      .findAll("[data-shape-group-paint] canvas")
      .map((node) => node.element as HTMLCanvasElement);
  leafPixels.prepare.mockImplementationOnce((options: ShapeLeafPixelsOptions) => ({
    ...rasterPlan(options),
    kind: "unavailable",
    reason: "asset-pixels-unavailable",
    missingAssetIds: ["late-leaf"],
  }));
  const root = f.sheet.drawings![0]!;
  if (!isShapeGroupDrawing(root)) throw new Error("Expected group.");
  root.members[1]!.rotation = 19;
  await f.sync();
  await settleGroupPaint();
  expect(latestGroupPaint(f.wrapper)).toBeUndefined();
  expect(f.wrapper.get('[data-shape-group-paint] [role="status"]').text()).toContain(
    "This group cannot be fully displayed",
  );
  expect(f.wrapper.findAllComponents(DrawingContent)).toHaveLength(0);
  expect([result.canvas.width, result.canvas.height]).toEqual([0, 0]);
  expect(copies.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  f.wrapper.unmount();
  mounted.splice(mounted.indexOf(f.wrapper), 1);
  expect(getShapePresentationAllocatedBytes()).toBe(allocated);
});
