// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  evaluateShapePreset,
  type EvaluatedShapePresetGeometry,
  type ShapePathCommand,
} from "@sheetcraft/core/shape-presets";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getShapeEndPaint } from "../../../modules/sheet-drawings/shape-line-paint";
import {
  clearShapeDetailedPaintCache,
  planShapeDetailedPaint,
  prepareShapeDetailedPaint,
  resolveShapeDetailedPaintStyle,
  ShapePaintPreflightError,
} from "../../../modules/sheet-drawings/shape-detailed-paint";
import {
  createDetailedPictureRaster,
  planDetailedPictureRaster,
} from "../../../shared/images/picture-detailed-compositor";
import * as compositor from "../../../shared/images/picture-detailed-compositor";
import type { ShapeGroupSceneProjection } from "../../../modules/sheet-drawings/shape-group-scene";
import { preparePictureShapeGeometry } from "../../../shared/images/picture-shape-mask";
function drawing(): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing("shape", "shape", "Shape", { row: 0, column: 0 }),
    width: 20,
    height: 20,
  };
}
function options(preset: Parameters<typeof evaluateShapePreset>[0] = { preset: "rect" }) {
  const source = drawing();
  source.shapeGeometry = preset;
  return { drawing: source, geometry: evaluateShapePreset(preset, 20, 20), density: 1 };
}
afterEach(() => {
  vi.restoreAllMocks();
  clearShapeDetailedPaintCache();
});
describe("actual numeric shape source", () => {
  test("TextBox retains rectangular inherited and explicit fill with dormant legacy line metadata", () => {
    const source = createGraphicDrawing("t", "textBox", "TextBox", { row: 0, column: 0 });
    source.shape = "line";
    source.fill = "#123456";
    source.shapeStyle = { shadow: { kind: "none" } };
    expect(resolveShapeDetailedPaintStyle(source).fill).toMatchObject({
      value: { color: { rgb: "#123456" } },
    });
    const plan = planShapeDetailedPaint({
      drawing: source,
      geometry: evaluateShapePreset({ preset: "rect" }, source.width, source.height),
      density: 1,
    });
    expect(plan.effectiveGeometry.paths.some((path) => path.filled)).toBe(true);
    expect(plan.effectiveStyle.fill).toMatchObject({ value: { color: { rgb: "#123456" } } });
  });
  test("sparse categories inherit real fill/line and explicit none removes them", () => {
    const source = drawing();
    source.fill = "#123456";
    source.stroke = "#abcdef";
    source.strokeWidth = 3;
    expect(resolveShapeDetailedPaintStyle(source)).toMatchObject({
      fill: { value: { color: { rgb: "#123456" } } },
      line: {
        value: { widthPt: 2.25, paint: { color: { rgb: "#ABCDEF" } }, cap: "round", join: "round" },
      },
    });
    expect(
      resolveShapeDetailedPaintStyle(source, { fill: { kind: "none" }, line: { kind: "none" } }),
    ).toEqual({ fill: { kind: "none" }, line: { kind: "none" } });
    expect(Object.keys(resolveShapeDetailedPaintStyle(source))).toEqual(["fill", "line"]);
  });
  test("holes, shaded paths, and out-of-frame callout tails remain exact source geometry", () => {
    const donut = planShapeDetailedPaint(options({ preset: "donut" }));
    expect(
      donut.effectiveGeometry.paths[0]!.commands.filter((command) => command[0] === "Z"),
    ).toHaveLength(2);
    const shaded = planShapeDetailedPaint(options({ preset: "can" }));
    expect(shaded.effectiveGeometry.paths.map((path) => path.fillMode)).toEqual(
      evaluateShapePreset({ preset: "can" }, 20, 20).paths.map((path) => path.fillMode),
    );
    expect(
      planShapeDetailedPaint(options({ preset: "wedgeRectCallout" })).logicalBounds.bottom,
    ).toBeGreaterThan(20);
  });
  test("stroke-only lines get real bounds and no filled rectangular backplate", () => {
    const plan = planShapeDetailedPaint(options({ preset: "line" }));
    expect(plan.effectiveGeometry.paths.every((path) => !path.filled)).toBe(true);
    expect(plan.frontWidthRaster).toBeGreaterThan(0);
    expect(plan.frontHeightRaster).toBeGreaterThan(0);
    expect(() =>
      preparePictureShapeGeometry(plan.effectiveGeometry, { width: 20, height: 20 }),
    ).toThrow(/filled extent/);
  });
  test("only an explicit free-path fill requests implicit fill closure; stroke stays open", () => {
    const base = options();
    delete base.drawing.shapeGeometry;
    base.drawing.shapePath = {
      tool: "freeform",
      viewBox: { width: 20, height: 20 },
      commands: [
        ["M", 0, 0],
        ["L", 20, 0],
        ["L", 20, 20],
      ],
    };
    base.geometry = {
      ...base.geometry,
      paths: [
        {
          filled: false,
          fillMode: "none",
          stroke: true,
          commands: base.drawing.shapePath.commands,
        },
      ],
    };
    expect(planShapeDetailedPaint(base).effectiveGeometry.paths[0]!.filled).toBe(false);
    const filled = planShapeDetailedPaint({
      ...base,
      style: {
        fill: {
          kind: "value",
          value: { kind: "solid", color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1 },
        },
      },
    });
    expect(filled.effectiveGeometry.paths[0]!.filled).toBe(true);
    expect(filled.effectiveGeometry.paths[0]!.commands.at(-1)![0]).toBe("L");
  });
  test("2048-command free source is scoped; picture/default preset limits stay 1024", () => {
    const base = options();
    delete base.drawing.shapeGeometry;
    const commands: ShapePathCommand[] = [
      ["M", 0, 0],
      ...Array.from({ length: 2047 }, (_, index) => ["L", index % 20, (index + 1) % 20] as const),
    ];
    base.drawing.shapePath = {
      tool: "scribble",
      viewBox: { width: 20, height: 20 },
      commands: commands as NonNullable<SheetGraphicDrawing["shapePath"]>["commands"],
    };
    base.geometry = {
      ...base.geometry,
      paths: [{ filled: false, fillMode: "none", stroke: true, commands }],
    };
    expect(planShapeDetailedPaint(base).shape!.commandCount).toBe(2048);
    expect(() =>
      planDetailedPictureRaster({
        widthPx: 20,
        heightPx: 20,
        pixelDensity: 1,
        shapeGeometry: base.geometry,
      }),
    ).toThrow(/command budget/);
    expect(() =>
      planShapeDetailedPaint({
        ...base,
        geometry: {
          ...base.geometry,
          paths: [{ ...base.geometry.paths[0]!, commands: [...commands, ["L", 0, 0]] }],
        },
      }),
    ).toThrow(ShapePaintPreflightError);
  });
  test("numeric oval marker preserves rotated ellipse within 0.01px and is bounded", () => {
    const base = options({ preset: "line" });
    base.drawing.shapeLineEnds = { end: { kind: "oval", width: "large", length: "large" } };
    base.drawing.strokeWidth = 32;
    const marker = getShapeEndPaint(base.drawing, base.geometry)[0]!;
    expect(marker.commands.length).toBeLessThanOrEqual(64);
    expect(marker.commands[0]![0]).toBe("M");
    expect(marker.commands.at(-1)![0]).toBe("Z");
    const center = { x: 20 - 80 / Math.SQRT2, y: 20 - 80 / Math.SQRT2 };
    let pen = { x: marker.commands[0]![1] as number, y: marker.commands[0]![2] as number };
    for (const command of marker.commands)
      if (command[0] === "C") {
        for (let sample = 0; sample <= 100; sample++) {
          const t = sample / 100,
            s = 1 - t;
          const x =
            s ** 3 * pen.x +
            3 * s * s * t * command[1] +
            3 * s * t * t * command[3] +
            t ** 3 * command[5];
          const y =
            s ** 3 * pen.y +
            3 * s * s * t * command[2] +
            3 * s * t * t * command[4] +
            t ** 3 * command[6];
          expect(Math.abs(Math.hypot(x - center.x, y - center.y) - 80)).toBeLessThan(0.01);
        }
        pen = { x: command[5], y: command[6] };
      }
  });
});
describe("pure resources, effects and projection", () => {
  const texture: ShapeDetailedStyle = {
    fill: {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "paint",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "tile",
          scaleX: 1,
          scaleY: 1,
          offsetXPt: 0,
          offsetYPt: 0,
          flip: "none",
          anchor: "center",
        },
      },
    },
  };
  test("missing resources are typed unavailability and do not invoke a painter/canvas", () => {
    const decode = vi.fn(),
      painter = vi.fn(),
      factory = vi.fn();
    expect(
      planShapeDetailedPaint({
        ...options(),
        style: texture,
        resources: { getAssetImage: decode },
      }),
    ).toMatchObject({ kind: "unavailable", missingAssetIds: ["paint"] });
    expect(decode).not.toHaveBeenCalled();
    expect(
      prepareShapeDetailedPaint({
        ...options(),
        style: texture,
        resources: { getAssetImage: decode },
        sourcePainter: painter,
        canvasFactory: factory,
      }),
    ).toMatchObject({ kind: "unavailable", missingAssetIds: ["paint"] });
    expect(painter).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });
  test("bad dimensions and aggregate budgets fail before resource decoding", () => {
    const decode = vi.fn();
    const base = options();
    base.drawing.width = NaN;
    expect(() =>
      prepareShapeDetailedPaint({ ...base, style: texture, resources: { getAssetImage: decode } }),
    ).toThrow(ShapePaintPreflightError);
    expect(decode).not.toHaveBeenCalled();
  });
  test("all effects and shape 3D pass bounded pure preflight on holes/tails/stroke-only paths", () => {
    const style: ShapeDetailedStyle = {
      shadow: {
        kind: "value",
        value: {
          kind: "outer",
          color: { kind: "rgb", rgb: "#000000" },
          opacity: 0.3,
          scale: 1,
          blurPt: 1,
          distancePt: 2,
          angleDeg: 45,
          anchor: "center",
        },
      },
      reflection: { kind: "value", value: { size: 0.5, opacity: 0.2, blurPt: 1, distancePt: 1 } },
      glow: {
        kind: "value",
        value: {
          color: { kind: "theme", reference: { slot: "accent1" } },
          opacity: 0.4,
          sizePt: 2,
        },
      },
      softEdges: { kind: "value", value: { sizePt: 1 } },
      format3d: {
        kind: "value",
        value: {
          depthPt: 3,
          depthColor: { kind: "rgb", rgb: "#777777" },
          contourPt: 1,
          contourColor: { kind: "rgb", rgb: "#000000" },
          material: "plastic",
          lighting: "three-point",
          lightingAngleDeg: 20,
        },
      },
      rotation3d: {
        kind: "value",
        value: { projection: "parallel", xDeg: 20, yDeg: 30, zDeg: 10, distanceFromGroundPt: 0 },
      },
    };
    for (const preset of ["donut", "wedgeRectCallout", "line"] as const) {
      const plan = planShapeDetailedPaint({ ...options({ preset }), style });
      expect(plan.kind).toBe("ready");
      expect(plan.isProjected).toBe(true);
      expect(plan.widthRaster * plan.heightRaster).toBeLessThanOrEqual(4_000_000);
      expect(plan.estimatedPeakBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    }
  });
  test("prepared compositor receives actual shape identity, geometry, style and theme", () => {
    const base = options(),
      kernel = vi.spyOn(compositor, "createDetailedPictureRaster").mockImplementation((input) => {
        expect(input.shapeSource?.kind).toBe("drawing");
        expect(input.shapeGeometry!.paths).toEqual(base.geometry.paths);
        expect(input.theme).toBe(DEFAULT_WORKBOOK_THEME);
        return {
          ...planDetailedPictureRaster(input),
          kind: "unavailable",
          reason: "asset-pixels-unavailable",
          missingAssetIds: ["paint"],
        };
      });
    expect(prepareShapeDetailedPaint(base).kind).toBe("unavailable");
    expect(kernel).toHaveBeenCalledOnce();
  });
});

/** Small numeric polygon Canvas boundary: these tests verify compositor pixels, not browser AA. */
class PolygonCanvas {
  width = 0;
  height = 0;
  data: Uint8ClampedArray | undefined;
  readonly context = new PolygonContext(this);
  getContext() {
    return this.context;
  }
  pixels() {
    return (this.data ??= new Uint8ClampedArray(this.width * this.height * 4));
  }
}
class PolygonContext {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  fillStyle = "#ffffff";
  sx = 1;
  sy = 1;
  tx = 0;
  ty = 0;
  contours: { x: number; y: number }[][] = [];
  stack: number[][] = [];
  constructor(readonly canvas: PolygonCanvas) {}
  save() {
    this.stack.push([this.sx, this.sy, this.tx, this.ty]);
  }
  restore() {
    const state = this.stack.pop()!;
    [this.sx, this.sy, this.tx, this.ty] = state as [number, number, number, number];
  }
  translate(x: number, y: number) {
    this.tx += x * this.sx;
    this.ty += y * this.sy;
  }
  scale(x: number, y: number) {
    this.sx *= x;
    this.sy *= y;
  }
  beginPath() {
    this.contours = [];
  }
  moveTo(x: number, y: number) {
    this.contours.push([{ x: x * this.sx + this.tx, y: y * this.sy + this.ty }]);
  }
  lineTo(x: number, y: number) {
    this.contours.at(-1)!.push({ x: x * this.sx + this.tx, y: y * this.sy + this.ty });
  }
  closePath() {}
  fill() {
    const data = this.canvas.pixels();
    for (let y = 0; y < this.canvas.height; y++)
      for (let x = 0; x < this.canvas.width; x++) {
        let winding = 0;
        for (const points of this.contours)
          for (let index = 0; index < points.length; index++) {
            const a = points[index]!,
              b = points[(index + 1) % points.length]!,
              px = x + 0.5,
              py = y + 0.5;
            const cross = (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y);
            if (a.y <= py && b.y > py && cross > 0) winding++;
            else if (a.y > py && b.y <= py && cross < 0) winding--;
          }
        if (winding) data.set([255, 255, 255, 255], (y * this.canvas.width + x) * 4);
      }
  }
  getImageData() {
    return { data: new Uint8ClampedArray(this.canvas.pixels()) };
  }
  createImageData(width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image: { data: Uint8ClampedArray }) {
    this.canvas.data = new Uint8ClampedArray(image.data);
  }
}
function rectangle(left: number, right: number): readonly ShapePathCommand[] {
  return [["M", left, 0], ["L", right, 0], ["L", right, 2], ["L", left, 2], ["Z"]];
}
test("detailed source fill modes shade each native path in order, skip none, and retain nonzero holes", () => {
  const base = options();
  base.drawing.width = 4;
  base.drawing.height = 2;
  base.drawing.fill = "#646464";
  const geometry: EvaluatedShapePresetGeometry = {
    ...evaluateShapePreset({ preset: "rect" }, 4, 2),
    paths: [
      { filled: true, fillMode: "norm", stroke: false, commands: rectangle(0, 4) },
      { filled: true, fillMode: "lighten", stroke: false, commands: rectangle(2, 4) },
      { filled: true, fillMode: "none", stroke: false, commands: rectangle(0, 4) },
    ],
  };
  const result = prepareShapeDetailedPaint({
    ...base,
    geometry,
    style: { line: { kind: "none" } },
    canvasFactory: () => new PolygonCanvas() as unknown as HTMLCanvasElement,
  });
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") return;
  expect(Array.from((result.canvas as unknown as PolygonCanvas).pixels().slice(0, 16))).toEqual([
    100, 100, 100, 255, 100, 100, 100, 255, 162, 162, 162, 255, 162, 162, 162, 255,
  ]);
  const hole: EvaluatedShapePresetGeometry = {
    ...geometry,
    paths: [
      {
        filled: true,
        fillMode: "darkenLess",
        stroke: false,
        commands: [...rectangle(0, 4), ["M", 1, 0], ["L", 1, 2], ["L", 3, 2], ["L", 3, 0], ["Z"]],
      },
    ],
  };
  const donut = createDetailedPictureRaster({
    widthPx: 4,
    heightPx: 2,
    pixelDensity: 1,
    style: resolveShapeDetailedPaintStyle(base.drawing, { line: { kind: "none" } }),
    theme: DEFAULT_WORKBOOK_THEME,
    shapeGeometry: hole,
    shapeSource: { kind: "drawing" },
    sourcePainter: () => {},
    canvasFactory: () => new PolygonCanvas() as unknown as HTMLCanvasElement,
  });
  expect(donut.kind).toBe("ready");
  if (donut.kind === "ready")
    expect(Array.from((donut.canvas as unknown as PolygonCanvas).pixels().slice(0, 16))).toEqual([
      80, 80, 80, 255, 0, 0, 0, 0, 0, 0, 0, 0, 80, 80, 80, 255,
    ]);
});

test("body 3D preflight is independent of the separately rendered glyph layer", () => {
  const o = options();
  o.drawing.shapeStyle = {
    rotation3d: {
      kind: "value",
      value: { projection: "parallel", xDeg: 37, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
    },
  };
  expect(() => planShapeDetailedPaint(o)).not.toThrow();
  o.drawing.text = "existing label";
  const before = JSON.stringify(o.drawing);
  expect(() => planShapeDetailedPaint(o)).not.toThrow();
  expect(JSON.stringify(o.drawing)).toBe(before);
  o.drawing.shapeStyle.rotation3d = { kind: "none" };
  expect(() => planShapeDetailedPaint(o)).not.toThrow();
});

test("common scene cache identity includes camera owner and complete placement without mutating own style", () => {
  const o = options();
  o.drawing.shapeStyle = {
    rotation3d: {
      kind: "value",
      value: { projection: "parallel", xDeg: 10, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
    },
  };
  const before = structuredClone(o.drawing),
    groupScene: ShapeGroupSceneProjection = {
      ownerPath: ["camera-owner"],
      rotation3d: { projection: "parallel", xDeg: 45, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
      scene: {
        widthPx: 200,
        heightPx: 100,
        pivot: { x: 100, y: 50 },
        sourceToScene: { a: 1, b: 0, c: 0, d: 1, e: 10, f: 10 },
      },
    };
  const kernel = vi.spyOn(compositor, "createDetailedPictureRaster").mockImplementation((input) => {
    const plan = planDetailedPictureRaster(input),
      canvas = new PolygonCanvas();
    canvas.width = plan.widthRaster;
    canvas.height = plan.heightRaster;
    return { ...plan, kind: "ready", canvas: canvas as unknown as HTMLCanvasElement };
  });
  const first = prepareShapeDetailedPaint({ ...o, groupScene }),
    same = prepareShapeDetailedPaint({ ...o, groupScene: structuredClone(groupScene) });
  expect(first.kind).toBe("ready");
  expect(same).toBe(first);
  expect(first.effectiveStyle.rotation3d).toEqual({ kind: "value", value: groupScene.rotation3d });
  expect(kernel).toHaveBeenCalledOnce();
  const moved = prepareShapeDetailedPaint({
    ...o,
    groupScene: {
      ...groupScene,
      scene: { ...groupScene.scene, sourceToScene: { ...groupScene.scene.sourceToScene, e: 60 } },
    },
  });
  expect(moved).not.toBe(first);
  expect(kernel).toHaveBeenCalledTimes(2);
  const reowned = prepareShapeDetailedPaint({
    ...o,
    groupScene: { ...groupScene, ownerPath: ["other-camera"] },
  });
  expect(reowned).not.toBe(first);
  expect(kernel).toHaveBeenCalledTimes(3);
  expect(o.drawing).toEqual(before);
});
