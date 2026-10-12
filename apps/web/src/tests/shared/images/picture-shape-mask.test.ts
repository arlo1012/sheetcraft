// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  evaluateShapePreset,
  getShapePresetFillBounds,
  SHAPE_PRESET_NAMES,
  type ShapePresetGeometry,
  type ShapePresetPath,
} from "@sheetcraft/core/shape-presets";
import type { PictureLine } from "@sheetcraft/core/picture-detailed-style";
import { createPictureRgbaSurface } from "../../../shared/images/picture-effect-raster";
import {
  applyPictureShapeAlphaMask,
  createPictureShapeAlphaMask,
  getPictureShapeOutlineIntervalCount,
  getPictureShapeStrokeBounds,
  paintPictureShapeFillMask,
  preparePictureShapeGeometry,
  strokePictureShapeOutline,
  tracePictureShapePath,
} from "../../../shared/images/picture-shape-mask";

class ShapeContext {
  readonly calls: unknown[][] = [];
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  miterLimit = 10;
  lineDashOffset = 0;
  failRead = false;
  save() {
    this.calls.push(["save"]);
  }
  restore() {
    this.calls.push(["restore"]);
  }
  translate(...args: number[]) {
    this.calls.push(["translate", ...args]);
  }
  scale(...args: number[]) {
    this.calls.push(["scale", ...args]);
  }
  beginPath() {
    this.calls.push(["begin"]);
  }
  moveTo(...args: number[]) {
    this.calls.push(["M", ...args]);
  }
  lineTo(...args: number[]) {
    this.calls.push(["L", ...args]);
  }
  quadraticCurveTo(...args: number[]) {
    this.calls.push(["Q", ...args]);
  }
  bezierCurveTo(...args: number[]) {
    this.calls.push(["C", ...args]);
  }
  ellipse(...args: (number | boolean)[]) {
    this.calls.push(["A", ...args]);
  }
  arc(...args: number[]) {
    this.calls.push(["dot", ...args]);
  }
  closePath() {
    this.calls.push(["Z"]);
  }
  fill(rule?: string) {
    this.calls.push(["fill", rule]);
  }
  stroke() {
    this.calls.push(["stroke", this.lineWidth, this.lineCap, this.lineJoin, this.miterLimit]);
  }
  setLineDash(pattern: number[]) {
    this.calls.push(["dash", ...pattern]);
  }
  getImageData(_x: number, _y: number, width: number, height: number) {
    if (this.failRead) throw new Error("unreadable mask");
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < data.length; index += 4)
      data.set([255, 255, 255, [255, 128, 64, 0][(index / 4) % 4]!], index);
    return { data };
  }
  asCanvasContext() {
    return this as unknown as CanvasRenderingContext2D;
  }
}
function line(extra: Partial<PictureLine> = {}): PictureLine {
  return {
    paint: { kind: "solid", color: { kind: "rgb", rgb: "#000000" }, opacity: 1 },
    widthPt: 1.5,
    compound: "single",
    dash: "solid",
    cap: "round",
    join: "miter",
    miterLimit: 10,
    ...extra,
  };
}
function prepared(preset: Parameters<typeof evaluateShapePreset>[0] = { preset: "ellipse" }) {
  return preparePictureShapeGeometry(evaluateShapePreset(preset, 20, 20), {
    width: 20,
    height: 20,
  });
}
function canvas(context = new ShapeContext()) {
  const result = { width: 0, height: 0, getContext: () => context };
  return { context, result, canvasFactory: () => result as unknown as HTMLCanvasElement };
}

describe("strict numeric shape preparation", () => {
  test.each(SHAPE_PRESET_NAMES)(
    "%s yields bounded fill paths or an explicit nonfillable result",
    (preset) => {
      const geometry = evaluateShapePreset({ preset }, 80, 60),
        bounds = getShapePresetFillBounds(geometry);
      if (!bounds) {
        expect(() => preparePictureShapeGeometry(geometry, { width: 80, height: 60 })).toThrow(
          /filled extent/,
        );
        return;
      }
      const result = preparePictureShapeGeometry(geometry, { width: 80, height: 60 });
      expect(result.commandCount).toBeLessThanOrEqual(1024);
      expect(result.pointCount).toBeLessThanOrEqual(16_384);
      expect(result.fillBounds.right).toBeGreaterThan(result.fillBounds.left);
      expect(result.fillBounds.bottom).toBeGreaterThan(result.fillBounds.top);
    },
  );
  test("detaches and deeply freezes paths before a source callback can change geometry", () => {
    const geometry = structuredClone(evaluateShapePreset({ preset: "rect" }, 20, 20));
    const shape = preparePictureShapeGeometry(geometry, { width: 20, height: 20 });
    (geometry.paths[0]!.commands[0] as unknown as (string | number)[])[1] = 999;
    expect(shape.geometry.paths[0]!.commands[0]![1]).toBe(0);
    expect(Object.isFrozen(shape)).toBe(true);
    expect(Object.isFrozen(shape.geometry.paths[0]!.commands[0])).toBe(true);
  });
  test("malformed numbers, commands, arcs, empty fill and aggregate paths never fall back", () => {
    const base = evaluateShapePreset({ preset: "rect" }, 20, 20);
    for (const commands of [
      [["M", NaN, 0]],
      [["execute", 0, 0]],
      [
        ["M", 0, 0],
        ["A", 1, 1, 0, 0, 0, 30],
      ],
    ] as unknown as ShapePresetPath["commands"][]) {
      expect(() =>
        preparePictureShapeGeometry(
          { ...base, paths: [{ filled: true, stroke: true, commands }] },
          { width: 20, height: 20 },
        ),
      ).toThrow();
    }
    expect(() =>
      preparePictureShapeGeometry(
        { ...base, paths: Array.from({ length: 17 }, () => base.paths[0]!) },
        { width: 20, height: 20 },
      ),
    ).toThrow(/path budget/);
    expect(() =>
      preparePictureShapeGeometry({ ...base, paths: [] }, { width: 20, height: 20 }),
    ).toThrow();
    expect(() => preparePictureShapeGeometry(base, { width: 19, height: 20 })).toThrow(/match/);
  });
  test("Arc/brace fill and callout tail use exact practical bounds without floating-point extra rows", () => {
    expect(prepared({ preset: "arc" }).fillBounds).toEqual({
      left: 10,
      top: 0,
      right: 20,
      bottom: 10,
    });
    expect(prepared({ preset: "ellipse" }).fillBounds).toEqual({
      left: 0,
      top: 0,
      right: 20,
      bottom: 20,
    });
    expect(prepared({ preset: "leftBrace" }).fillBounds.right).toBe(20);
    expect(prepared({ preset: "wedgeRectCallout" }).fillBounds.bottom).toBe(22.5);
  });
});

describe("native numeric paths and independent nonzero unions", () => {
  test("same-path holes remain one nonzero fill; independent filled paths are separate union paints", () => {
    const donut = prepared({ preset: "donut" }),
      context = new ShapeContext();
    paintPictureShapeFillMask(context.asCanvasContext(), donut);
    expect(context.calls.filter((call) => call[0] === "fill")).toEqual([["fill", "nonzero"]]);
    expect(context.calls.filter((call) => call[0] === "Z")).toHaveLength(2);
    const geometry: ShapePresetGeometry = {
      ...donut.geometry,
      paths: [...donut.geometry.paths, ...evaluateShapePreset({ preset: "rect" }, 20, 20).paths],
    };
    const union = new ShapeContext();
    paintPictureShapeFillMask(
      union.asCanvasContext(),
      preparePictureShapeGeometry(geometry, { width: 20, height: 20 }),
    );
    expect(union.calls.filter((call) => call[0] === "fill")).toEqual([
      ["fill", "nonzero"],
      ["fill", "nonzero"],
    ]);
  });
  test("Arc closes only its fill while the independent open arc is the sole outline path", () => {
    const shape = prepared({ preset: "arc" }),
      fill = new ShapeContext(),
      stroke = new ShapeContext();
    paintPictureShapeFillMask(fill.asCanvasContext(), shape);
    strokePictureShapeOutline(stroke.asCanvasContext(), shape, line(), 1);
    expect(fill.calls.filter((call) => call[0] === "Z")).toHaveLength(1);
    expect(stroke.calls.filter((call) => call[0] === "Z")).toHaveLength(0);
    expect(stroke.calls.filter((call) => call[0] === "stroke")).toHaveLength(1);
  });
  test("all numeric command kinds retain native curves with no arbitrary string execution", () => {
    const context = new ShapeContext();
    tracePictureShapePath(context.asCanvasContext(), {
      filled: true,
      stroke: true,
      commands: [
        ["M", 0, 0],
        ["L", 2, 0],
        ["Q", 3, 1, 4, 2],
        ["C", 5, 3, 6, 4, 7, 5],
        ["A", 2, 3, 5, 5, 0, -Math.PI / 2],
        ["Z"],
      ],
    });
    expect(context.calls.map((call) => call[0])).toEqual(["M", "L", "Q", "C", "A", "Z"]);
    expect(context.calls[4]!.at(-1)).toBe(true);
  });
  test.each(["single", "double", "thick-thin", "thin-thick", "triple"] as const)(
    "%s handles all dash/cap/join controls on real paths",
    (compound) => {
      for (const dash of [
        "solid",
        "round-dot",
        "square-dot",
        "dash",
        "short-dash",
        "long-dash",
        "long-dash-dot",
        "long-dash-dot-dot",
      ] as const) {
        const context = new ShapeContext(),
          style = line({ compound, dash, cap: "square", join: "bevel", miterLimit: 1.1 });
        strokePictureShapeOutline(context.asCanvasContext(), prepared(), style, 2);
        expect(context.calls.some((call) => call[0] === "stroke" || call[0] === "dot")).toBe(true);
        expect(
          context.calls.some((call) => call[0] === "A" || call[0] === "L" || call[0] === "dot"),
        ).toBe(true);
        expect(
          context.calls
            .filter((call) => call[0] === "stroke")
            .every(
              (call) =>
                call[2] === (dash === "round-dot" ? "round" : "square") &&
                call[3] === "bevel" &&
                call[4] === 1.1,
            ),
        ).toBe(true);
      }
    },
  );
  test("path/dash work is rejected before any canvas, and opaque branded preparation cannot be forged", () => {
    expect(() =>
      getPictureShapeOutlineIntervalCount(
        prepared(),
        line({ widthPt: 1e-8, dash: "round-dot" }),
        1,
      ),
    ).toThrow(/interval budget/);
    expect(() =>
      paintPictureShapeFillMask(new ShapeContext().asCanvasContext(), { ...prepared() }),
    ).toThrow(/preflight/);
    expect(getPictureShapeStrokeBounds(prepared(), line())!.left).toBeLessThan(0);
  });
});

describe("bounded reusable alpha-mask surface boundary", () => {
  test("reads real RGBA alpha and releases its temporary canvas", () => {
    const temporary = canvas();
    const mask = createPictureShapeAlphaMask({
      ...temporary,
      shape: prepared({ preset: "rect" }),
      density: 1,
      boundsRaster: { left: 0, top: 0, right: 4, bottom: 1 },
    });
    expect(Array.from(mask.data)).toEqual([
      1,
      expect.closeTo(128 / 255, 6),
      expect.closeTo(64 / 255, 6),
      0,
    ]);
    expect(temporary.result.width).toBe(0);
    expect(temporary.result.height).toBe(0);
    const surface = createPictureRgbaSurface(4, 1);
    for (let index = 0; index < 4; index++) surface.data.set([200, 100, 50, 128], index * 4);
    applyPictureShapeAlphaMask(surface, mask);
    expect(Array.from(surface.data)).toEqual([
      200, 100, 50, 128, 200, 100, 50, 64, 200, 100, 50, 32, 0, 0, 0, 0,
    ]);
  });
  test("all dimensions/density/budget failures precede the factory", () => {
    let factories = 0;
    for (const [right, bottom, density] of [
      [4097, 1, 1],
      [3000, 3000, 1],
      [1, 1, NaN],
      [0, 1, 1],
      [1.5, 1, 1],
    ]) {
      expect(() =>
        createPictureShapeAlphaMask({
          shape: prepared(),
          density: density!,
          boundsRaster: { left: 0, top: 0, right: right!, bottom: bottom! },
          canvasFactory: () => {
            factories++;
            return canvas().result as unknown as HTMLCanvasElement;
          },
        }),
      ).toThrow();
    }
    expect(factories).toBe(0);
  });
  test("read/interface failures release the owned canvas without a rectangle fallback", () => {
    const temporary = canvas();
    temporary.context.failRead = true;
    expect(() =>
      createPictureShapeAlphaMask({
        ...temporary,
        shape: prepared(),
        density: 1,
        boundsRaster: { left: 0, top: 0, right: 20, bottom: 20 },
      }),
    ).toThrow("unreadable mask");
    expect(temporary.result.width).toBe(0);
    expect(temporary.result.height).toBe(0);
    const unavailable = { width: 0, height: 0, getContext: () => null };
    expect(() =>
      createPictureShapeAlphaMask({
        shape: prepared(),
        density: 1,
        boundsRaster: { left: 0, top: 0, right: 20, bottom: 20 },
        canvasFactory: () => unavailable as unknown as HTMLCanvasElement,
      }),
    ).toThrow(/unavailable/);
    expect(unavailable.width).toBe(0);
    expect(unavailable.height).toBe(0);
  });
  test("invalid alpha never partially mutates a source surface", () => {
    const surface = createPictureRgbaSurface(2, 1);
    surface.data.fill(123);
    const before = new Uint8ClampedArray(surface.data);
    expect(() =>
      applyPictureShapeAlphaMask(surface, {
        width: 2,
        height: 1,
        data: new Float32Array([1, NaN]),
      }),
    ).toThrow();
    expect(surface.data).toEqual(before);
  });
});
