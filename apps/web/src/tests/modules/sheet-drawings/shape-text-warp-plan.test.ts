// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { TEXT_WARP_PRESET_NAMES, evaluateTextWarp } from "@sheetcraft/core/text-warps";
import {
  layoutShapeText,
  type ShapeTextFont,
  type ShapeTextLayoutInput,
  type ShapeTextMeasurementMetrics,
} from "../../../modules/sheet-drawings/shape-text-layout";
import {
  SHAPE_TEXT_WARP_LINE_POLICY,
  SHAPE_TEXT_WARP_PLAN_LIMITS,
  ShapeTextWarpPlanError,
  allocateShapeTextWarpLines,
  prepareShapeTextWarpPlan,
  type ShapeTextWarpPlanInput,
  type ShapeTextWarpPlanGroup,
} from "../../../modules/sheet-drawings/shape-text-warp-plan";
import { rasterizeTextWarpAlpha } from "../../../modules/sheet-drawings/text-warp-mesh";

const font: ShapeTextFont = { family: "Native test", size: 20, weight: 400, italic: false };
const normal = { ascent: 15, descent: 5, lineAdvance: 25 };
const textRect = { x: 30, y: 40, width: 160, height: 80 };
function native(text: string): ShapeTextMeasurementMetrics {
  const ink = /\S/u.test(text);
  return {
    width: text.length * 10,
    ascent: ink ? 13 : 0,
    descent: ink ? 4 : 0,
    inkLeft: ink ? -2 : 0,
    inkRight: ink ? text.length * 10 + 3 : 0,
  };
}
function fixture(text = "AB", options: Partial<ShapeTextLayoutInput> = {}) {
  const metrics = vi.fn(native),
    measurer = { measure: (value: string) => metrics(value).width, measureMetrics: metrics };
  const source: ShapeTextLayoutInput = {
    text,
    textRect,
    font,
    normalLineMetrics: normal,
    measurer,
    layout: {
      direction: "horizontal",
      blockAlignment: "start",
      lineOrder: "rtl",
      marginsPt: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 },
      wrap: false,
      overflow: true,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: { alignment: "left", beforePt: 0, afterPt: 0, lineSpacing: { kind: "normal" } },
    ...options,
  };
  const layout = layoutShapeText(source);
  metrics.mockClear();
  const input: ShapeTextWarpPlanInput = {
    warp: { preset: "textPlain" },
    textRect: source.textRect!,
    layout,
    rasterDensity: 1,
    sourceText: text,
    font: source.font,
    normalLineMetrics: source.normalLineMetrics,
    measurer,
  };
  return { input, metrics };
}
function envelopes(groups: readonly ShapeTextWarpPlanGroup[]) {
  return groups.filter(
    (group): group is Extract<ShapeTextWarpPlanGroup, { kind: "envelope" }> =>
      group.kind === "envelope",
  );
}
function failure(action: () => unknown, code: ShapeTextWarpPlanError["code"]) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ShapeTextWarpPlanError);
    expect((error as ShapeTextWarpPlanError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

describe("numeric native WordArt planning", () => {
  test("allocates only complete ordered lines, including the first upper Button role", () => {
    expect(allocateShapeTextWarpLines(0, 3)).toEqual([]);
    expect(allocateShapeTextWarpLines(1, 3)).toEqual([[0]]);
    expect(allocateShapeTextWarpLines(2, 3)).toEqual([[0], [1]]);
    expect(allocateShapeTextWarpLines(3, 3)).toEqual([[0], [1], [2]]);
    expect(allocateShapeTextWarpLines(5, 3)).toEqual([[0, 1], [2, 3], [4]]);
    expect(allocateShapeTextWarpLines(5, 2)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(allocateShapeTextWarpLines(3, 1)).toEqual([[0, 1, 2]]);
    expect(() => allocateShapeTextWarpLines(1, 4)).toThrow(ShapeTextWarpPlanError);
  });

  test.each(["alpha", "alpha\nbeta", "alpha\nbeta\ngamma"])(
    "Button envelopes assign %j once",
    (text) => {
      const { input } = fixture(text);
      const result = prepareShapeTextWarpPlan({ ...input, warp: { preset: "textButtonPour" } });
      expect(result.groups.length).toBe(input.layout.lines.length);
      expect(result.groups.map((group) => group.lineIndices)).toEqual(
        input.layout.lines.map((_, index) => [index]),
      );
      expect(result.groups.flatMap((group) => group.runIndices)).toEqual(
        input.layout.runs.map((_, index) => index),
      );
      expect(result.groups.map((group) => group.roleIndex)).toEqual(
        input.layout.lines.map((_, index) => index),
      );
      const meshes = envelopes(result.groups).map((group) => group.mesh);
      expect(meshes.length).toBe(result.groups.length);
      for (const mesh of meshes) expect(mesh.destination).toEqual(result.destinationRasterRect);
    },
  );

  test("four-plus Button lines have a declared contiguous partition with no paragraph duplication", () => {
    const { input } = fixture("A\nB\nC\nD\nE");
    const result = prepareShapeTextWarpPlan({ ...input, warp: { preset: "textButtonPour" } });
    expect(result.linePolicy).toBe(SHAPE_TEXT_WARP_LINE_POLICY);
    expect(result.groups.map((group) => group.lineIndices)).toEqual([[0, 1], [2, 3], [4]]);
    expect(result.groups.flatMap((group) => group.runIndices)).toEqual([0, 1, 2, 3, 4]);
    expect(
      result.groups.map((group) =>
        group.runIndices.map((index) => input.layout.runs[index]!.text).join("|"),
      ),
    ).toEqual(["A|B", "C|D", "E"]);
  });

  test("evaluates actual textRect dimensions/origin and settled density", () => {
    const { input } = fixture();
    const first = prepareShapeTextWarpPlan(input);
    const shifted = prepareShapeTextWarpPlan({
      ...input,
      textRect: { ...input.textRect, x: 130, y: 240 },
    });
    expect(shifted.destinationBounds!.x - first.destinationBounds!.x).toBeCloseTo(100);
    expect(shifted.destinationBounds!.y - first.destinationBounds!.y).toBeCloseTo(200);
    const double = prepareShapeTextWarpPlan({ ...input, rasterDensity: 2 });
    expect(double.rasterDensity).toBe(2);
    expect(double.destinationRasterRect!.width).toBeGreaterThan(first.destinationRasterRect!.width);
    expect(double.destinationBounds!.width).toBeGreaterThanOrEqual(textRect.width);
    expect(double.destinationBounds!.width).toBeLessThan(textRect.width * 1.3);
  });

  test("all 36 envelope presets prepare whole native runs without per-glyph reshaping", () => {
    const { input, metrics } = fixture("ffi A");
    const envelopePresets = TEXT_WARP_PRESET_NAMES.filter(
      (preset) =>
        evaluateTextWarp({ preset }, textRect.width, textRect.height).family === "envelope",
    );
    expect(envelopePresets.length).toBe(36);
    for (const preset of envelopePresets) {
      const result = prepareShapeTextWarpPlan({
        ...input,
        warp: { preset },
        rasterDensity: 0.5,
        toleranceRasterPx: 0.5,
      });
      expect(result.family).toBe("envelope");
      expect(result.placements).toEqual([]);
      expect(result.groups.flatMap((group) => group.runIndices)).toEqual([0]);
      expect(result.proof.vertices).toBeGreaterThanOrEqual(4);
      expect(result.proof.work).toBeLessThanOrEqual(SHAPE_TEXT_WARP_PLAN_LIMITS.work);
    }
    expect(metrics).not.toHaveBeenCalled();
  });

  test("normalization remains independent of clipping, no-fill and native decoration support", () => {
    const { input } = fixture();
    const before = prepareShapeTextWarpPlan(input),
      expected = before.groups[0]!.normalizationRect;
    input.layout.clipRect = { x: 0, y: 0, width: 1, height: 1 };
    input.layout.contentRect = { x: 9, y: 9, width: 1, height: 1 };
    input.layout.visibleInkBounds = null;
    input.layout.inkBounds = null;
    input.layout.runs[0]!.fill = { kind: "none" };
    const nativeRun = input.layout.runs[0]!;
    const decorated = prepareShapeTextWarpPlan({
      ...input,
      decorations: [
        {
          sourceRunIndex: 0,
          bounds: {
            x: nativeRun.x,
            y: nativeRun.y + 5,
            width: nativeRun.inlineAdvancePx,
            height: 2,
          },
        },
      ],
    });
    expect(decorated.groups[0]!.normalizationRect).toEqual(expected);
    const afterGroup = envelopes(decorated.groups)[0]!,
      beforeGroup = envelopes(before.groups)[0]!;
    expect(afterGroup.sourceRasterRect.height).toBeGreaterThan(beforeGroup.sourceRasterRect.height);
    expect(afterGroup.extrapolation.verticalAfter).toBeGreaterThan(
      beforeGroup.extrapolation.verticalAfter!,
    );
    expect(decorated.destinationBounds!.height).toBeGreaterThan(before.destinationBounds!.height);
  });

  test.each(["", "   ", "\n \n"])(
    "unadorned %j stays transparent without fake native glyph geometry",
    (text) => {
      const { input } = fixture(text);
      const result = prepareShapeTextWarpPlan(input);
      expect(result.groups.every((group) => group.kind === "whitespace")).toBe(true);
      expect(
        result.groups.every(
          (group) => group.nativeSource.kind === "whitespace" && group.normalizationRect === null,
        ),
      ).toBe(true);
      expect(result.destinationBounds).toBeNull();
      expect(result.destinationRasterRect).toBeNull();
      expect(result.proof.sourceRasterBytes).toBe(0);
      expect(result.proof.destinationAlphaBytes).toBe(0);
      expect(result.proof.mappingEvaluations).toBe(0);
    },
  );

  test("real underline on spaces receives native advance normalization without manufactured glyph ink", () => {
    const { input } = fixture("   "),
      run = input.layout.runs[0]!;
    const result = prepareShapeTextWarpPlan({
      ...input,
      decorations: [
        {
          sourceRunIndex: 0,
          bounds: { x: run.x, y: run.y + 2, width: run.inlineAdvancePx, height: 1 },
        },
      ],
    });
    const group = envelopes(result.groups)[0]!;
    expect(group.nativeSource.kind).toBe("whitespace");
    expect(group.normalizationRect).toEqual({
      left: run.x,
      top: run.y - normal.ascent,
      width: 30,
      height: 20,
    });
    const transparent = rasterizeTextWarpAlpha({
      mesh: group.mesh,
      budget: group.meshBudget,
      source: {
        width: group.sourcePixelWidth,
        height: group.sourcePixelHeight,
        data: new Uint8ClampedArray(group.sourcePixelWidth * group.sourcePixelHeight),
      },
    });
    expect(transparent.data.every((value) => value === 0)).toBe(true);
  });

  test("zero-area native decoration bounds cannot turn blank source into visible content", () => {
    const { input } = fixture("   "),
      run = input.layout.runs[0]!;
    for (const preset of ["textPlain", "textArchUp"] as const) {
      const result = prepareShapeTextWarpPlan({
        ...input,
        warp: { preset },
        decorations: [
          {
            sourceRunIndex: 0,
            bounds: { x: run.x, y: run.y + 2, width: run.inlineAdvancePx, height: 0 },
          },
        ],
      });
      expect(result.groups[0]!.kind).toBe("whitespace");
      expect(result.groups[0]!.normalizationRect).toBeNull();
      expect(result.destinationBounds).toBeNull();
      expect(result.decorationQuads).toEqual([]);
    }
  });

  test("complete line groups cannot repeat or omit a native run identity", () => {
    const repeated = fixture("A\nB").input;
    repeated.layout.lines[1]!.runs = [repeated.layout.runs[0]!];
    failure(
      () => prepareShapeTextWarpPlan({ ...repeated, warp: { preset: "textButtonPour" } }),
      "invalid",
    );
    const orphan = fixture().input;
    orphan.layout.runs.push({ ...orphan.layout.runs[0]! });
    failure(() => prepareShapeTextWarpPlan(orphan), "invalid");
  });

  test("logical bitmap texel-center contract is separate from native normalization", () => {
    const { input } = fixture("AB", { textRect: { x: 30.3, y: 40.2, width: 160, height: 80 } });
    const result = prepareShapeTextWarpPlan({ ...input, rasterDensity: 1.25 });
    const group = envelopes(result.groups)[0]!;
    expect(group.mesh.sourceRect).toEqual(group.sourceRasterRect);
    expect(group.sourceRasterRect.width * result.rasterDensity).toBeCloseTo(group.sourcePixelWidth);
    expect(group.sourceRasterRect.height * result.rasterDensity).toBeCloseTo(
      group.sourcePixelHeight,
    );
    expect(group.sourceRasterRect.left).toBeLessThan(group.normalizationRect!.left);
    expect(group.sourceRasterRect.top).toBeLessThan(group.normalizationRect!.top);
    expect(group.sourceRasterRect).not.toEqual(group.normalizationRect);
  });

  test("envelope H/V flips reflect mapped glyph alpha exactly once about actual textRect", () => {
    const { input } = fixture();
    function raster(horizontalFlip: boolean, verticalFlip: boolean) {
      const result = prepareShapeTextWarpPlan({ ...input, horizontalFlip, verticalFlip }),
        group = envelopes(result.groups)[0]!;
      const source = new Uint8ClampedArray(group.sourcePixelWidth * group.sourcePixelHeight);
      for (let y = 2; y < group.sourcePixelHeight - 2; y++)
        for (let x = 2; x < group.sourcePixelWidth / 2; x++)
          source[y * group.sourcePixelWidth + x] = 200;
      return rasterizeTextWarpAlpha({
        mesh: group.mesh,
        budget: group.meshBudget,
        source: { width: group.sourcePixelWidth, height: group.sourcePixelHeight, data: source },
      });
    }
    const source = raster(false, false),
      h = raster(true, false),
      v = raster(false, true),
      both = raster(true, true);
    expect(h.width).toBe(source.width);
    expect(h.height).toBe(source.height);
    for (let y = 0; y < source.height; y++)
      for (let x = 0; x < source.width; x++) {
        const alpha = source.data[y * source.width + x]!;
        expect(
          Math.abs(h.data[y * source.width + source.width - 1 - x]! - alpha),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(v.data[(source.height - 1 - y) * source.width + x]! - alpha),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(
            both.data[(source.height - 1 - y) * source.width + source.width - 1 - x]! - alpha,
          ),
        ).toBeLessThanOrEqual(1);
      }
  });

  test("rigid Button exposes independent native placements and reflected glyph axes", () => {
    const { input, metrics } = fixture("AB\nCD\nEF");
    const result = prepareShapeTextWarpPlan({
      ...input,
      warp: { preset: "textButton" },
      horizontalFlip: true,
    });
    expect(result.family).toBe("follow-path");
    expect(result.groups.map((group) => group.lineIndices)).toEqual([[0], [1], [2]]);
    expect(result.groups.every((group) => group.kind === "follow-path")).toBe(true);
    expect(metrics.mock.calls.map(([text]) => text)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(result.placements.map((placement) => placement.trackIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(result.proof.vertices).toBe(0);
    for (let index = 0; index < result.placements.length; index++) {
      const original = result.followPath!.placements[index]!,
        reflected = result.placements[index]!;
      expect(reflected.x).toBeCloseTo(2 * textRect.x + textRect.width - original.x);
      expect(reflected.y).toBeCloseTo(original.y);
      expect(reflected.inlineAxis.x).toBeCloseTo(-original.tangent.x);
      const determinant =
        reflected.inlineAxis.x * reflected.blockAxis.y -
        reflected.inlineAxis.y * reflected.blockAxis.x;
      expect(determinant).toBeCloseTo(-1);
    }
  });

  test.each(["textPlain", "textArchUp"] as const)(
    "%s reflects an asymmetric text domain around its body carrier",
    (preset) => {
      const { input } = fixture();
      const carrier = { x: 0, y: 0, width: 260, height: 180 };
      const plain = prepareShapeTextWarpPlan({
        ...input,
        warp: { preset },
        reflectionRect: carrier,
      });
      const flipped = prepareShapeTextWarpPlan({
        ...input,
        warp: { preset },
        reflectionRect: carrier,
        horizontalFlip: true,
        verticalFlip: true,
      });
      const a = plain.destinationBounds!,
        b = flipped.destinationBounds!;
      expect(b.x).toBeCloseTo(carrier.width - a.x - a.width);
      expect(b.y).toBeCloseTo(carrier.height - a.y - a.height);
      expect(b.width).toBeCloseTo(a.width);
      expect(b.height).toBeCloseTo(a.height);
      expect(plain.groups.map((group) => group.normalizationRect)).toEqual(
        flipped.groups.map((group) => group.normalizationRect),
      );
    },
  );

  test("rigid space underline uses each independent advance and native block offset", () => {
    const { input } = fixture(" A "),
      run = input.layout.runs[0]!;
    const result = prepareShapeTextWarpPlan({
      ...input,
      warp: { preset: "textArchUp" },
      verticalFlip: true,
      decorations: [
        {
          sourceRunIndex: 0,
          bounds: { x: run.x, y: run.y + 2, width: run.inlineAdvancePx, height: 1 },
        },
      ],
    });
    expect(result.decorationQuads.length).toBe(3);
    expect(result.placements[0]!.inkBounds).toBeNull();
    for (let index = 0; index < 3; index++) {
      const quad = result.decorationQuads[index]!,
        p = result.placements[index]!;
      expect(quad.points[0].x).toBeCloseTo(p.x + p.blockAxis.x * 2);
      expect(quad.points[0].y).toBeCloseTo(p.y + p.blockAxis.y * 2);
      expect(
        Math.hypot(quad.points[1].x - quad.points[0].x, quad.points[1].y - quad.points[0].y),
      ).toBeCloseTo(p.nativeAdvancePx);
    }
  });

  test("rigid decorated-only whitespace produces decoration bounds while glyphs stay blank", () => {
    const { input } = fixture("   "),
      run = input.layout.runs[0]!;
    const result = prepareShapeTextWarpPlan({
      ...input,
      warp: { preset: "textArchUp" },
      decorations: [
        {
          sourceRunIndex: 0,
          bounds: { x: run.x, y: run.y + 2, width: run.inlineAdvancePx, height: 1 },
        },
      ],
    });
    expect(result.placements.every((p) => p.inkBounds === null)).toBe(true);
    expect(result.decorationQuads.length).toBe(3);
    expect(result.destinationBounds!.width).toBeGreaterThan(0);
    expect(result.destinationRasterRect!.height).toBeGreaterThan(0);
  });

  test("aggregate proof shares samples, numeric preparation, RGBA/readback and group alpha", () => {
    const { input } = fixture("A\nB\nC");
    const result = prepareShapeTextWarpPlan({
      ...input,
      warp: { preset: "textButtonPour" },
      budget: { reservedBytes: 1_234 },
    });
    const all = envelopes(result.groups);
    expect(result.proof.sourceRasterBytes).toBe(
      all.reduce((sum, group) => sum + group.sourcePixelWidth * group.sourcePixelHeight * 8, 0),
    );
    expect(result.proof.destinationAlphaBytes).toBe(
      all.length * result.destinationRasterRect!.width * result.destinationRasterRect!.height,
    );
    expect(result.proof.peakBytes).toBe(
      1_234 +
        result.proof.preparationAllocatedNumericBytes +
        result.proof.sourceRasterBytes +
        result.proof.destinationAlphaBytes,
    );
    expect(result.proof.estimatedPeakBytes).toBe(result.proof.peakBytes - 1_234);
    expect(result.proof.work).toBe(result.proof.preparationWork + result.proof.rasterWork);
    expect(result.proof.preparationAllocatedNumericBytes).toBeGreaterThanOrEqual(
      result.proof.retainedNumericBytes,
    );
    expect(result.proof.mappingAllocatedNumericBytes).toBe(result.proof.mappingEvaluations * 1_024);
    expect(result.proof.mappingLookupWork).toBeGreaterThan(result.proof.mappingEvaluations * 512);
    for (const group of all) {
      expect(
        group.meshBudget.reservedBytes! +
          group.mesh.proof.preparationAllocatedNumericBytes +
          group.meshBudget.sourceBytes! +
          group.mesh.proof.outputBytes,
      ).toBe(result.proof.peakBytes);
    }
  });

  test("tight budgets reject total groups, source/destination density and invalid enlargement", () => {
    const { input } = fixture("A\nB\nC"),
      warped = { ...input, warp: { preset: "textButtonPour" as const } };
    failure(() => prepareShapeTextWarpPlan({ ...warped, budget: { maxBytes: 100_000 } }), "budget");
    failure(
      () =>
        prepareShapeTextWarpPlan({
          ...warped,
          budget: { reservedBytes: SHAPE_TEXT_WARP_PLAN_LIMITS.bytes - 1 },
        }),
      "budget",
    );
    failure(
      () => prepareShapeTextWarpPlan({ ...warped, budget: { maxVertices: 4, maxTriangles: 2 } }),
      "budget",
    );
    failure(() => prepareShapeTextWarpPlan({ ...warped, budget: { maxWork: 100 } }), "budget");
    failure(() => prepareShapeTextWarpPlan({ ...input, rasterDensity: 64 }), "budget");
    failure(
      () =>
        prepareShapeTextWarpPlan({
          ...input,
          budget: { maxBytes: SHAPE_TEXT_WARP_PLAN_LIMITS.bytes + 1 },
        }),
      "invalid",
    );
    failure(() => prepareShapeTextWarpPlan({ ...input, budget: { sourceBytes: 4 } }), "invalid");
    failure(
      () => prepareShapeTextWarpPlan({ ...input, textRect: { ...textRect, width: 0 } }),
      "invalid",
    );
  });
});
