// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  collectShapeGroupAssetIds,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { shapeFrameLocalToWorld, shapeFrameWorldToLocal } from "@sheetcraft/core/shape-frame";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { framedShape } from "./framed-shape-fixture";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import type {
  ShapeLeafPixelsOptions,
  ShapeLeafPixelsPlan,
  ShapeLeafPixelsResult,
} from "../../../modules/sheet-drawings/shape-leaf-pixels";
import {
  hasActiveShapeGroupShadow,
  hitShapeGroupPaint,
  planShapeGroupPaint,
  preflightShapeGroupPaint,
  prepareShapeGroupPaint,
  SHAPE_GROUP_PAINT_LIMITS,
  type ShapeGroupPaintResult,
} from "../../../modules/sheet-drawings/shape-group-paint";
import {
  getShapePresentationAllocatedBytes,
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
} from "../../../modules/sheet-drawings/shape-detailed-presentation";

const leafCalls = vi.hoisted(() => ({ plan: vi.fn(), prepare: vi.fn() }));
vi.mock("../../../modules/sheet-drawings/shape-leaf-pixels", () => ({
  getShapeLeafPixelsOwnedBytes: () => 0,
  planShapeLeafPixels: leafCalls.plan,
  prepareShapeLeafPixels: leafCalls.prepare,
}));
type Matrix = [number, number, number, number, number, number];
/** Tiny deterministic Canvas boundary. The real shared compositor owns all shadow,
 * inner-shadow and alpha composition math; leaves provide known real local pixels. */
class MemoryCanvas {
  private w = 0;
  private h = 0;
  data = new Uint8ClampedArray();
  readonly context = new MemoryContext(this);
  failRead = false;
  get width() {
    return this.w;
  }
  set width(value: number) {
    this.w = value;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height() {
    return this.h;
  }
  set height(value: number) {
    this.h = value;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  getContext() {
    return this.context;
  }
}
class MemoryContext {
  fillStyle = "#000000";
  matrix: Matrix = [1, 0, 0, 1, 0, 0];
  stack: Matrix[] = [];
  constructor(readonly canvas: MemoryCanvas) {}
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
  fillRect(x: number, y: number, width: number, height: number) {
    const [a, b, c, d, e, f] = this.matrix,
      determinant = a * d - b * c;
    const color = [1, 3, 5].map((offset) =>
      Number.parseInt(this.fillStyle.slice(offset, offset + 2), 16),
    );
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f;
        const localX = (d * dx - c * dy) / determinant,
          localY = (-b * dx + a * dy) / determinant;
        if (localX >= x && localX < x + width && localY >= y && localY < y + height)
          this.canvas.data.set([...color, 255], (py * this.canvas.width + px) * 4);
      }
  }
  drawImage(image: MemoryCanvas, x: number, y: number, width = image.width, height = image.height) {
    const [a, b, c, d, e, f] = this.matrix,
      det = a * d - b * c;
    for (let py = 0; py < this.canvas.height; py++)
      for (let px = 0; px < this.canvas.width; px++) {
        const dx = px + 0.5 - e,
          dy = py + 0.5 - f;
        const u = ((d * dx - c * dy) / det - x) / width;
        const v = ((-b * dx + a * dy) / det - y) / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const from = (Math.floor(v * image.height) * image.width + Math.floor(u * image.width)) * 4;
        const to = (py * this.canvas.width + px) * 4;
        const alpha = image.data[from + 3]! / 255;
        const oldAlpha = this.canvas.data[to + 3]! / 255;
        const outAlpha = alpha + oldAlpha * (1 - alpha);
        if (outAlpha === 0) continue;
        for (let channel = 0; channel < 3; channel++)
          this.canvas.data[to + channel] =
            (image.data[from + channel]! * alpha +
              this.canvas.data[to + channel]! * oldAlpha * (1 - alpha)) /
            outAlpha;
        this.canvas.data[to + 3] = outAlpha * 255;
      }
  }
  getImageData() {
    if (this.canvas.failRead) throw new Error("tainted source");
    return { width: this.canvas.width, height: this.canvas.height, data: this.canvas.data.slice() };
  }
  createImageData(width: number, height: number) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image: { data: Uint8ClampedArray }) {
    this.canvas.data.set(image.data);
  }
}
const results: ShapeGroupPaintResult[] = [];
let created: MemoryCanvas[] = [];
const factory = () => {
  const canvas = new MemoryCanvas();
  created.push(canvas);
  return canvas as unknown as HTMLCanvasElement;
};
function shadow(kind: "outer" | "inner" = "outer", distancePt = 3): ShapeDetailedStyle["shadow"] {
  return {
    kind: "value",
    value: {
      kind,
      color: { kind: "rgb", rgb: "#000000" },
      opacity: 1,
      blurPt: 0,
      distancePt,
      angleDeg: 0,
      scale: 1,
      anchor: "center",
    },
  };
}
function leaf(id: string, x = 0, y = 0, w = 0.4, h = 0.4): SheetGroupedGraphicDrawing {
  const {
    anchor: _a,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing(id, "shape", id, { row: 0, column: 0 });
  return {
    ...appearance,
    kind: "shape",
    text: "",
    rotation: 0,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: x, yRatio: y, widthRatio: w, heightRatio: h },
    },
  };
}
function group(
  members: ShapeGroupDrawing["members"] = [leaf("red")],
  width = 10,
  height = 10,
): ShapeGroupDrawing {
  return {
    kind: "shapeGroup",
    id: "root",
    name: "Root",
    rotation: 0,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 12, y: 24, size: { width, height } },
    },
    groupEffects: { shadow: shadow() },
    members,
  };
}
function options(root = group(), interactive = true) {
  return {
    root,
    metrics: createPictureSheetMetrics(createSheet("Paint", "s")),
    density: 1,
    canvasFactory: factory,
    interactive,
  };
}
function simplePlan(options: ShapeLeafPixelsOptions): ShapeLeafPixelsPlan {
  const density = options.density;
  const width = Math.max(1, Math.ceil(options.drawing.width * density));
  const height = Math.max(1, Math.ceil(options.drawing.height * density));
  const ids =
    options.drawing.shapeStyle?.fill?.kind === "value" &&
    options.drawing.shapeStyle.fill.value.kind === "picture"
      ? [options.drawing.shapeStyle.fill.value.assetId]
      : [];
  const missing = ids.filter((id) => !options.resources?.getAssetSize?.(id));
  return {
    kind: missing.length ? "unavailable" : "ready",
    ...(missing.length ? { reason: "asset-unavailable", missingAssetIds: missing } : {}),
    actualDensity: density,
    logicalBounds: { left: 0, top: 0, right: width / density, bottom: height / density },
    widthRaster: width,
    heightRaster: height,
    estimatedPeakBytes: width * height * 8 + 4096,
    ownedBytes: width * height * 4,
    bodyPlan: { assetIds: ids },
  } as unknown as ShapeLeafPixelsPlan;
}
function pixels(options: ShapeLeafPixelsOptions): ShapeLeafPixelsResult {
  const plan = simplePlan(options);
  if (plan.kind !== "ready") return plan;
  const canvas = options.canvasFactory!() as unknown as MemoryCanvas;
  canvas.width = plan.widthRaster;
  canvas.height = plan.heightRaster;
  const id = options.drawing.id;
  const color = id.includes("blue")
    ? [0, 0, 255]
    : id.includes("white") || id.includes("ring")
      ? [255, 255, 255]
      : [255, 0, 0];
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      if (id.includes("ring") && x >= 2 && y >= 2 && x < canvas.width - 2 && y < canvas.height - 2)
        continue;
      canvas.data.set([...color, 255], (y * canvas.width + x) * 4);
    }
  return {
    ...plan,
    canvas: canvas as unknown as HTMLCanvasElement,
    dispose: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
function sample(result: ShapeGroupPaintResult, x: number, y: number): number[] {
  if (result.kind !== "ready") throw new Error("Expected actual ready group pixels");
  const canvas = result.canvas as unknown as MemoryCanvas;
  const rx = Math.floor((x - result.logicalBounds.left) * result.actualDensity);
  const ry = Math.floor((y - result.logicalBounds.top) * result.actualDensity);
  return Array.from(
    canvas.data.slice((ry * canvas.width + rx) * 4, (ry * canvas.width + rx) * 4 + 4),
  );
}
function prepare(root: ShapeGroupDrawing, interactive = true) {
  const result = prepareShapeGroupPaint(options(root, interactive));
  results.push(result);
  return result;
}
beforeEach(() => {
  created = [];
  leafCalls.plan.mockReset().mockImplementation(simplePlan);
  leafCalls.prepare.mockReset().mockImplementation(pixels);
});
afterEach(() => {
  for (const result of results.splice(0)) if (result.kind === "ready") result.dispose();
  expect(created.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

describe("real recursive owned group source pixels", () => {
  test("hidden descendants retain assets and geometry but never enter leaf preflight, pixels or hits", () => {
    const hidden = leaf("blue", 0, 0, 1, 1);
    hidden.text = "Unavailable font";
    hidden.shapeStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "hidden-texture",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          },
        },
      },
    };
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "hidden-owner",
      name: "Hidden owner",
      hidden: true,
      rotation: 0,
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: 0.6, yRatio: 0, widthRatio: 0.4, heightRatio: 0.4 },
      },
      groupEffects: { shadow: shadow() },
      members: [hidden],
    };
    const root = group([leaf("red"), nested]);
    root.groupEffects = { shadow: { kind: "none" } };
    const before = structuredClone(root),
      opts = options(root),
      canonical = resolveShapeGroupProjection(root, opts.metrics),
      resources = { getAssetSize: vi.fn(), getAssetImage: vi.fn() };
    const result = prepareShapeGroupPaint({ ...opts, resources });
    results.push(result);
    expect(result).toMatchObject({ kind: "ready", visible: true, empty: false, collapsed: false });
    expect(result.layout).toEqual(canonical.layout);
    expect(canonical.leaves[1]!.layout?.collapsed).toBe(false);
    expect(leafCalls.plan.mock.calls.map(([input]) => input.drawing.id)).toEqual(["red"]);
    expect(leafCalls.prepare.mock.calls.map(([input]) => input.drawing.id)).toEqual(["red"]);
    expect(resources.getAssetSize).not.toHaveBeenCalled();
    expect(resources.getAssetImage).not.toHaveBeenCalled();
    expect(collectShapeGroupAssetIds(root)).toEqual(new Set(["hidden-texture"]));
    expect(collectShapeGroupAssetIds(result.snapshotRoot)).toEqual(new Set(["hidden-texture"]));
    expect(hasActiveShapeGroupShadow(root)).toBe(false);
    if (result.kind !== "ready") throw Error("Expected visible sibling pixels");
    expect(sample(result, 1.5, 1.5)).toEqual([255, 0, 0, 255]);
    expect(hitShapeGroupPaint(result, { x: 7.5, y: 1.5 })).toBeUndefined();
    expect(root).toEqual(before);
  });

  test.each(["root", "leaf"] as const)(
    "%s hiding leaves an empty raster without collapsing the canonical owner",
    (target) => {
      const root = group();
      if (target === "root") root.hidden = true;
      else root.members[0]!.hidden = true;
      const opts = options(root),
        canonical = resolveShapeGroupProjection(root, opts.metrics),
        result = prepareShapeGroupPaint(opts);
      results.push(result);
      expect(result).toMatchObject({
        kind: "ready",
        visible: target !== "root",
        empty: true,
        collapsed: false,
        layout: canonical.layout,
      });
      expect(leafCalls.plan).not.toHaveBeenCalled();
      expect(leafCalls.prepare).not.toHaveBeenCalled();
      if (result.kind !== "ready") throw Error("Expected empty ready raster");
      expect([result.canvas.width, result.canvas.height]).toEqual([1, 1]);
      expect(hitShapeGroupPaint(result, { x: 0.5, y: 0.5 })).toBeUndefined();
    },
  );

  test("a hidden unavailable connector is retained in the full pass and skipped before sibling paint preflight", () => {
    const connector: SheetGroupedGraphicDrawing = {
      ...leaf("hidden-connector"),
      hidden: true,
      text: "Unsupported label",
      shapeGeometry: { preset: "bentConnector3" },
      shapeConnector: {
        kind: "shape-connector-v1",
        begin: { kind: "free", xRatio: 0, yRatio: 0 },
        end: { kind: "free", xRatio: 1, yRatio: 1 },
      },
    };
    const root = group([connector, leaf("red")]),
      opts = options(root),
      pass = resolveShapeForestForRender({ drawings: [root], metrics: opts.metrics, revision: 0 });
    expect(pass.getLeaf(connector.id)!.connector?.status).toBe("unavailable");
    const result = prepareShapeGroupPaint({ ...opts, renderPass: pass });
    results.push(result);
    expect(result.kind).toBe("ready");
    expect(leafCalls.prepare.mock.calls.map(([input]) => input.drawing.id)).toEqual(["red"]);
    expect(() => planShapeGroupPaint(opts)).toThrow(/complete worksheet relation pass/);
  });

  test.each(["red", "blue", "nested", "root", "missing", undefined])(
    "active text id %s suppresses only its exact leaf through plan and pixel preparation",
    (editingTextId) => {
      const selected = leaf("red"),
        sibling = leaf("blue", 0.5, 0.5);
      selected.text = "Same saved text";
      sibling.text = "Same saved text";
      const nested: ShapeGroupedGroup = {
          kind: "shapeGroup",
          id: "nested",
          name: "Nested",
          rotation: 23,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
          },
          members: [selected],
        },
        root = group([nested, sibling], 40, 30),
        before = structuredClone(root),
        result = prepareShapeGroupPaint({ ...options(root), editingTextId });
      results.push(result);
      expect(result.kind).toBe("ready");
      const expected = [
        ["red", editingTextId === "red", "Same saved text"],
        ["blue", editingTextId === "blue", "Same saved text"],
      ];
      for (const calls of [leafCalls.plan.mock.calls, leafCalls.prepare.mock.calls])
        expect(
          calls.map(([input]) => {
            const supplied = input as ShapeLeafPixelsOptions;
            return [supplied.drawing.id, supplied.hideText, supplied.drawing.text];
          }),
        ).toEqual(expected);
      const supplied = leafCalls.prepare.mock.calls[0]![0] as ShapeLeafPixelsOptions;
      expect(supplied.sourceIdentity).toMatchObject({
        sourceRoot: root,
        sourceNode: selected,
        path: ["root", "nested", "red"],
      });
      expect(
        (
          (result.snapshotRoot.members[0] as ShapeGroupedGroup)
            .members[0] as SheetGroupedGraphicDrawing
        ).text,
      ).toBe("Same saved text");
      expect((result.snapshotRoot.members[1] as SheetGroupedGraphicDrawing).text).toBe(
        "Same saved text",
      );
      expect(root).toEqual(before);
      expect(selected.text).toBe("Same saved text");
      expect(sibling.text).toBe("Same saved text");
    },
  );
  test("whole-sheet connector paint uses actual route layout without replacing its owner carrier", () => {
    const connector = {
      ...leaf("connector", 0.1, 0.2, 0.4, 0.3),
      shapeGeometry: { preset: "bentConnector3" as const },
      shapeConnector: {
        kind: "shape-connector-v1" as const,
        begin: {
          kind: "site" as const,
          targetId: "outside",
          preset: "rect" as const,
          siteIndex: 3,
        },
        end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
      },
    };
    const root = group([connector, leaf("blue", 0.6, 0.6)], 20, 20);
    root.rotation = 37;
    const outside = {
      ...framedShape(),
      id: "outside",
      text: "",
      shapeGeometry: { preset: "rect" as const },
    };
    const opts = options(root);
    const drawings = [outside, root];
    const pass = resolveShapeForestForRender({ drawings, metrics: opts.metrics, revision: 4 });
    const resolved = pass.getLeaf("connector")!;
    if (resolved.connector?.status !== "ready") throw Error("Expected actual route");
    const { route, paintView } = resolved.connector;
    const plan = planShapeGroupPaint({ ...opts, renderPass: pass });
    expect(plan.kind).toBe("ready");
    expect(plan.renderPass).toBe(pass);
    const called = leafCalls.plan.mock.calls.find(
      ([call]) => call.drawing.id === "connector",
    )![0] as ShapeLeafPixelsOptions;
    expect(called.drawing).toBe(paintView);
    expect(called.connectorRoute).toBe(route);
    expect(called.angleDeg).toBe(route.paintLayout.angleDeg);
    expect(called.sourceIdentity).toMatchObject({
      sourceRoot: root,
      sourceNode: connector,
      path: [root.id, connector.id],
      contextIdentity: pass.contextIdentity,
    });
    expect(resolved.carrierLeaf!.view!.width).toBeCloseTo(8);
    expect(resolved.carrierLeaf!.sourceNode).toBe(connector);
    expect(called.drawing.width).not.toBeCloseTo(8);
    expect(plan.snapshotRoot.members[0]).toHaveProperty("shapeConnector", connector.shapeConnector);
    outside.rotation = 20;
    expect(() => planShapeGroupPaint({ ...opts, renderPass: pass })).toThrow(/outdated/);
    expect(created).toHaveLength(0);
  });
  test("a supplied whole-sheet pass cannot be attached to an equal-looking different owner", () => {
    const root = group(),
      opts = options(root);
    const pass = resolveShapeForestForRender({
      drawings: [root],
      metrics: opts.metrics,
      revision: 0,
    });
    expect(() =>
      planShapeGroupPaint({ ...opts, root: structuredClone(root), renderPass: pass }),
    ).toThrow(/exact owner/);
    expect(created).toHaveLength(0);
    expect(leafCalls.plan).not.toHaveBeenCalled();
  });
  test("a connector label is refused before any group leaf plan or canvas", () => {
    const connector = {
      ...leaf("connector"),
      text: "legacy label",
      shapeGeometry: { preset: "bentConnector3" as const },
      shapeConnector: {
        kind: "shape-connector-v1" as const,
        begin: { kind: "free" as const, xRatio: 0, yRatio: 0 },
        end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
      },
    };
    const root = group([connector]),
      opts = options(root);
    const pass = resolveShapeForestForRender({
      drawings: [root],
      metrics: opts.metrics,
      revision: 0,
    });
    expect(() => planShapeGroupPaint({ ...opts, renderPass: pass })).toThrow(/connector-text/);
    expect(leafCalls.plan).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
  test("composes an actual leaf adapter's CSS-body pixels with no synthetic image source", async () => {
    const actual = await vi.importActual<
      typeof import("../../../modules/sheet-drawings/shape-leaf-pixels")
    >("../../../modules/sheet-drawings/shape-leaf-pixels");
    leafCalls.plan.mockImplementation(actual.planShapeLeafPixels);
    leafCalls.prepare.mockImplementation(actual.prepareShapeLeafPixels);
    const body = leaf("css-body");
    body.kind = "textBox";
    body.fill = "#ff0000";
    body.stroke = "transparent";
    body.strokeWidth = 0;
    delete body.shapeGeometry;
    delete body.shapeText;
    const result = prepare(group([body]));
    expect(sample(result, 1.5, 1.5)).toEqual([255, 0, 0, 255]);
    expect(sample(result, 5.5, 1.5)).toEqual([0, 0, 0, 255]);
    expect(hitShapeGroupPaint(result, { x: 1.5, y: 1.5 })).toEqual({
      kind: "leaf",
      path: ["root", "css-body"],
    });
    expect(hitShapeGroupPaint(result, { x: 5.5, y: 1.5 })).toEqual({
      kind: "owner",
      path: ["root"],
    });
  });
  test("preserves transparent holes and gaps, with exact owner-only outer-shadow hits", () => {
    const root = group(
      [leaf("ring", 2 / 30, 2 / 12, 8 / 30, 8 / 12), leaf("blue", 20 / 30, 2 / 12, 4 / 30, 8 / 12)],
      30,
      12,
    );
    const result = prepare(root);
    expect(sample(result, 4.5, 5.5)[3]).toBe(0);
    expect(sample(result, 15.5, 5.5)[3]).toBe(0);
    expect(hitShapeGroupPaint(result, { x: 4.5, y: 5.5 })).toBeUndefined();
    expect(hitShapeGroupPaint(result, { x: 15.5, y: 5.5 })).toBeUndefined();
    expect(sample(result, 6.5, 5.5)).toEqual([0, 0, 0, 255]);
    expect(hitShapeGroupPaint(result, { x: 6.5, y: 5.5 })).toEqual({
      kind: "owner",
      path: ["root"],
    });
    expect(hitShapeGroupPaint(result, { x: 2.5, y: 5.5 })).toEqual({
      kind: "leaf",
      path: ["root", "ring"],
    });
  });
  test("keeps a completed nested shadow at its sibling position, including shadow occlusion", () => {
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "nested",
      name: "Nested",
      rotation: 0,
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      },
      groupEffects: { shadow: shadow() },
      members: [leaf("red")],
    };
    const root = group([nested, leaf("blue", 0.4, 0)], 10, 10);
    root.groupEffects = { shadow: { kind: "none" } };
    const result = prepare(root);
    expect(sample(result, 4.5, 1.5)).toEqual([0, 0, 255, 255]);
    expect(hitShapeGroupPaint(result, { x: 4.5, y: 1.5 })).toEqual({
      kind: "leaf",
      path: ["root", "blue"],
    });
    root.members.reverse();
    const reversed = prepare(root);
    expect(sample(reversed, 4.5, 1.5)).toEqual([0, 0, 0, 255]);
    expect(hitShapeGroupPaint(reversed, { x: 4.5, y: 1.5 })).toEqual({
      kind: "owner",
      path: ["root", "nested"],
    });
    expect(leafCalls.prepare.mock.calls.map(([o]) => o.drawing.id)).toEqual([
      "red",
      "blue",
      "blue",
      "red",
    ]);
  });
  test("inner shadow shades the completed child union without filling its transparent holes", () => {
    const root = group([leaf("ring", 0, 0, 0.8, 0.8)], 10, 10);
    root.groupEffects = { shadow: shadow("inner", 1.5) };
    const result = prepare(root);
    expect(sample(result, 3.5, 3.5)[3]).toBe(0);
    expect(hitShapeGroupPaint(result, { x: 3.5, y: 3.5 })).toBeUndefined();
    const canvas = result.kind === "ready" ? (result.canvas as unknown as MemoryCanvas) : undefined;
    expect(canvas).toBeDefined();
    const colors = [...canvas!.data].filter((_v, i) => i % 4 === 0);
    expect(colors.some((v, i) => v === 0 && canvas!.data[i * 4 + 3] === 255)).toBe(true);
    expect(colors.some((v) => v === 255)).toBe(true);
  });
  test("forwards the full world angle and transforms resolved child sizes exactly once", () => {
    const realLeaf = leaf("red", 0.2, 0.2, 0.6, 0.6);
    realLeaf.rotation = 13;
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "nested",
      name: "Nested",
      rotation: 23,
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: 0.2, yRatio: 0.1, widthRatio: 0.7, heightRatio: 0.5 },
      },
      groupEffects: { shadow: shadow() },
      members: [realLeaf],
    };
    const root = group([nested], 40, 30);
    root.rotation = 37;
    const o = options(root);
    const before = JSON.stringify(root);
    const result = prepareShapeGroupPaint(o);
    results.push(result);
    expect(leafCalls.prepare).toHaveBeenCalledTimes(1);
    const supplied = leafCalls.prepare.mock.calls[0]![0] as ShapeLeafPixelsOptions;
    expect(supplied.angleDeg).toBe(73);
    expect(supplied.drawing.width).toBeCloseTo(40 * 0.7 * 0.6);
    expect(supplied.drawing.height).toBeCloseTo(30 * 0.5 * 0.6);
    expect(supplied.sourceIdentity).toMatchObject({
      sourceRoot: root,
      sourceNode: realLeaf,
      path: ["root", "nested", "red"],
    });
    const projected = resolveShapeGroupProjection(root, o.metrics);
    const placed = projected.leaves[0]!.layout!;
    const world = shapeFrameLocalToWorld(placed.rect, placed.angleDeg, {
      x: placed.rect.width / 2,
      y: placed.rect.height / 2,
    });
    const local = shapeFrameWorldToLocal(projected.layout.rect, projected.layout.angleDeg, world);
    expect(hitShapeGroupPaint(result, local)).toEqual({
      kind: "leaf",
      path: ["root", "nested", "red"],
    });
    expect(result.sourceRoot).toBe(root);
    expect(result.metrics).toBe(o.metrics);
    expect(result.snapshotRoot).not.toBe(root);
    expect(Object.isFrozen(result.snapshotRoot)).toBe(true);
    expect(JSON.stringify(root)).toBe(before);
  });
});

describe("complete group budgets, resources and ownership", () => {
  test("includes unrelated retained presentation pixels in the combined peak budget", () => {
    const root = group([leaf("red", 0, 0, 1, 1)], 1000, 1000);
    const o = { ...options(root), density: 64 };
    const before = planShapeGroupPaint(o);
    const external = factory();
    resizeShapePresentationCanvas(external, 2000, 2000);
    try {
      const withExternal = planShapeGroupPaint(o);
      expect(getShapePresentationAllocatedBytes()).toBe(16_000_000);
      expect(withExternal.actualDensity).toBeLessThan(before.actualDensity);
      expect(withExternal.estimatedPeakBytes + 16_000_000).toBeLessThanOrEqual(
        SHAPE_GROUP_PAINT_LIMITS.memoryBytes,
      );
    } finally {
      releaseShapePresentationCanvas(external);
    }
    expect(getShapePresentationAllocatedBytes()).toBe(0);
  });
  test("counts retained group root pixels exactly once alongside their compact masks", () => {
    const first = prepare(group());
    if (first.kind !== "ready") throw new Error("Expected retained group pixels");
    const next = planShapeGroupPaint({
      ...options(group([leaf("red", 0, 0, 1, 1)], 1000, 1000)),
      density: 64,
    });
    expect(getShapePresentationAllocatedBytes()).toBe(first.canvas.width * first.canvas.height * 4);
    expect(next.estimatedPeakBytes + first.ownedBytes).toBeLessThanOrEqual(
      SHAPE_GROUP_PAINT_LIMITS.memoryBytes,
    );
    first.dispose();
    expect(getShapePresentationAllocatedBytes()).toBe(0);
  });
  test("negotiates the whole tree density and includes retained canvases plus every alpha mask", () => {
    const root = group([leaf("red", 0, 0, 1, 1), leaf("blue", 0, 0, 1, 1)], 1000, 1000);
    const plan = planShapeGroupPaint({ ...options(root), density: 64 });
    expect(plan.actualDensity).toBeLessThan(1);
    expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(SHAPE_GROUP_PAINT_LIMITS.memoryBytes);
    expect(plan.widthRaster).toBeLessThanOrEqual(4096);
    expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(4_000_000);
    expect(created).toHaveLength(0);
    const lastLeafOptions = leafCalls.plan.mock.calls
      .slice(-2)
      .map(([o]) => o as ShapeLeafPixelsOptions);
    expect(lastLeafOptions.every((o) => Math.abs(o.density - plan.actualDensity) < 1e-9)).toBe(
      true,
    );
    const leafPixels = lastLeafOptions.reduce(
      (total, o) => total + simplePlan(o).widthRaster * simplePlan(o).heightRaster,
      0,
    );
    expect(plan.ownedBytes).toBe(plan.widthRaster * plan.heightRaster * 5 + leafPixels);
  });
  test("print owns only its root canvas and idempotent disposal releases every temporary", () => {
    const root = group([leaf("red"), leaf("blue", 0.5, 0.5)]);
    const result = prepare(root, false);
    if (result.kind !== "ready") throw new Error("Expected print-ready pixels");
    expect(result.ownedBytes).toBe(result.canvas.width * result.canvas.height * 4);
    expect(hitShapeGroupPaint(result, { x: 1.5, y: 1.5 })).toBeUndefined();
    expect(created.filter((c) => c.width > 0)).toHaveLength(1);
    result.dispose();
    result.dispose();
    expect(created.every((c) => c.width === 0)).toBe(true);
  });
  test("all metadata and all loaded-image checks precede source pixels or any canvas", () => {
    const root = group([leaf("red"), leaf("blue")]);
    const target = root.members[1] as SheetGroupedGraphicDrawing;
    target.shapeStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "missing",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          },
        },
      },
    };
    const result = prepareShapeGroupPaint({
      ...options(root),
      resources: { getAssetSize: () => ({ width: 4, height: 4 }), getAssetImage: () => undefined },
    });
    expect(result).toMatchObject({ kind: "unavailable", missingAssetIds: ["missing"] });
    expect(leafCalls.plan).toHaveBeenCalledTimes(2);
    expect(leafCalls.prepare).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
  test("validates every collapsed descendant, but does not request dormant fonts or images", () => {
    const root = group();
    root.shapeFrame = {
      kind: "shape-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
      },
    };
    const sheet = createSheet("Collapsed", "s");
    sheet.hiddenColumns = new Set([0]);
    const o = {
      ...options(root),
      metrics: createPictureSheetMetrics(sheet),
      resources: { getAssetSize: vi.fn(), getAssetImage: vi.fn() },
    };
    const ready = prepareShapeGroupPaint(o);
    results.push(ready);
    expect(ready.collapsed).toBe(true);
    expect(leafCalls.plan).not.toHaveBeenCalled();
    expect(o.resources.getAssetSize).not.toHaveBeenCalled();
    expect(o.resources.getAssetImage).not.toHaveBeenCalled();
    (root.members[0] as SheetGroupedGraphicDrawing).shapeStyle = { shadow: shadow() };
    (
      (root.members[0] as SheetGroupedGraphicDrawing).shapeStyle!.shadow as Extract<
        NonNullable<ShapeDetailedStyle["shadow"]>,
        { kind: "value" }
      >
    ).value.blurPt = NaN;
    expect(() => planShapeGroupPaint(o)).toThrow();
  });
  test("rejects malformed late siblings before any early leaf pixels and cleans up late pixel errors", () => {
    const root = group([leaf("red"), leaf("blue")]);
    (root.members[1] as SheetGroupedGraphicDrawing).strokeWidth = NaN;
    expect(() => prepareShapeGroupPaint(options(root))).toThrow();
    expect(created).toHaveLength(0);
    (root.members[1] as SheetGroupedGraphicDrawing).strokeWidth = 1;
    leafCalls.prepare.mockImplementationOnce(pixels).mockImplementationOnce(() => {
      throw new Error("late glyph proof");
    });
    expect(() => prepareShapeGroupPaint(options(root))).toThrow("late glyph proof");
    expect(created.every((c) => c.width === 0)).toBe(true);
  });
  test("recomputes ancestor source bounds from actual ready child ink before owner allocation", () => {
    const root = group([leaf("red")]);
    root.groupEffects = { shadow: { kind: "none" } };
    leafCalls.prepare.mockImplementation((o: ShapeLeafPixelsOptions) => {
      const result = pixels(o);
      if (result.kind !== "ready") return result;
      return { ...result, logicalBounds: { left: -12, top: 0, right: -8, bottom: 4 } };
    });
    const result = prepare(root);
    expect(result.logicalBounds.left).toBeLessThanOrEqual(-13);
    expect(sample(result, -10.5, 1.5)).toEqual([255, 0, 0, 255]);
    expect(hitShapeGroupPaint(result, { x: -10.5, y: 1.5 })).toEqual({
      kind: "leaf",
      path: ["root", "red"],
    });
  });
  test("native lower-density fallback disposes prior siblings and replans every descendant", () => {
    const root = group([leaf("red"), leaf("blue")]);
    root.groupEffects = { shadow: { kind: "none" } };
    leafCalls.prepare
      .mockImplementationOnce(pixels)
      .mockImplementationOnce((o: ShapeLeafPixelsOptions) => pixels({ ...o, density: 1 }));
    const result = prepareShapeGroupPaint({ ...options(root), density: 2 });
    results.push(result);
    expect(result.actualDensity).toBe(1);
    expect(leafCalls.prepare.mock.calls.map(([o]) => [o.drawing.id, o.density])).toEqual([
      ["red", 2],
      ["blue", 2],
      ["red", 1],
      ["blue", 1],
    ]);
    expect(created[0]!.width).toBe(0);
    expect(created[1]!.width).toBe(0);
    expect(hitShapeGroupPaint(result, { x: 1.5, y: 1.5 })).toEqual({
      kind: "leaf",
      path: ["root", "blue"],
    });
  });
  test("a late actual-memory rejection leaves no canvases live across bounded retries", () => {
    const root = group([leaf("red")]);
    leafCalls.prepare.mockImplementation((o: ShapeLeafPixelsOptions) => {
      const result = pixels(o);
      return { ...result, estimatedPeakBytes: SHAPE_GROUP_PAINT_LIMITS.memoryBytes * 2 };
    });
    expect(() => prepareShapeGroupPaint(options(root))).toThrow(/bounded paint schedule/);
    expect(leafCalls.prepare).toHaveBeenCalledTimes(SHAPE_GROUP_PAINT_LIMITS.replans);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((c) => c.width === 0 && c.height === 0)).toBe(true);
  });
  test("actual preflight prepares native source pixels then disposes its entire proof", () => {
    const root = group();
    const proof = preflightShapeGroupPaint(options(root));
    expect(proof.kind).toBe("ready");
    expect(proof.interactive).toBe(false);
    expect(proof).not.toHaveProperty("canvas");
    expect(leafCalls.prepare).toHaveBeenCalledTimes(1);
    expect(created.every((c) => c.width === 0)).toBe(true);
  });
  test("active shadow dispatch validates the real tree and recognizes nested value versus none", () => {
    const root = group();
    root.groupEffects = undefined;
    expect(hasActiveShapeGroupShadow(root)).toBe(false);
    root.groupEffects = { shadow: { kind: "none" } };
    expect(hasActiveShapeGroupShadow(root)).toBe(false);
    root.groupEffects = { shadow: shadow() };
    expect(hasActiveShapeGroupShadow(root)).toBe(true);
    (root.members[0] as SheetGroupedGraphicDrawing).strokeWidth = NaN;
    expect(() => hasActiveShapeGroupShadow(root)).toThrow();
  });
});
