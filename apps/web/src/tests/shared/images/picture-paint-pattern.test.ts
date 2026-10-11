// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  PICTURE_PATTERN_PRESETS,
  type PicturePatternPreset,
} from "@sheetcraft/core/picture-detailed-style";
import {
  createPicturePatternSampler,
  getPicturePatternTileSize,
  type PicturePatternSampler,
  type PicturePatternSamplingOptions,
} from "../../../shared/images/picture-paint-pattern";

function tileMean(sampler: PicturePatternSampler): number {
  let sum = 0;
  for (let y = 0; y < sampler.height; y++)
    for (let x = 0; x < sampler.width; x++) sum += sampler.sample(x, y);
  return sum / (sampler.width * sampler.height);
}

function signature(sampler: PicturePatternSampler): string {
  let result = "";
  // Common raster region, rather than tile metadata, catches aliased motifs.
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) result += sampler.sample(x, y).toFixed(3) + ",";
  return result;
}

describe("product-owned DrawingML picture pattern coverage", () => {
  test("implements all 54 canonical identifiers with distinct useful coverage", () => {
    expect(PICTURE_PATTERN_PRESETS).toHaveLength(54);
    const signatures = new Set<string>();
    for (const preset of PICTURE_PATTERN_PRESETS) {
      const sampler = createPicturePatternSampler(preset, { antialias: false });
      const mean = tileMean(sampler);
      expect(mean, preset).toBeGreaterThan(0);
      expect(mean, preset).toBeLessThan(1);
      const raster = signature(sampler);
      expect(signatures.has(raster), `duplicate motif: ${preset}`).toBe(false);
      signatures.add(raster);
    }
  });

  test.each(PICTURE_PATTERN_PRESETS)(
    "%s repeats in both axes and at negative coordinates",
    (preset) => {
      const sampler = createPicturePatternSampler(preset, { scale: 1.375, seed: 123 });
      expect(Number.isInteger(sampler.width)).toBe(true);
      expect(Number.isInteger(sampler.height)).toBe(true);
      expect(getPicturePatternTileSize(preset, 1.375)).toEqual({
        width: sampler.width,
        height: sampler.height,
      });
      const coordinates = [-33, -1, 0, 1, 3, 7, 19, 32];
      for (const x of coordinates)
        for (const y of coordinates) {
          const value = sampler.sample(x, y);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
          expect(sampler.sample(x + sampler.width * 3, y - sampler.height * 2)).toBe(value);
          expect(sampler.sample(x - sampler.width, y + sampler.height)).toBe(value);
        }
    },
  );

  test("percent patterns have exact named density and nested foreground pixels", () => {
    const percentages = [5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90];
    let previous: PicturePatternSampler | undefined;
    for (const percentage of percentages) {
      const sampler = createPicturePatternSampler(`pct${percentage}` as PicturePatternPreset);
      expect(sampler.width * sampler.height).toBe(400);
      expect(tileMean(sampler)).toBe(percentage / 100);
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 20; x++) {
          const value = sampler.sample(x, y);
          expect(value === 0 || value === 1).toBe(true);
          if (previous) expect(value).toBeGreaterThanOrEqual(previous.sample(x, y));
        }
      previous = sampler;
    }
  });

  test.each([
    ["horz", "vert"],
    ["ltHorz", "ltVert"],
    ["dkHorz", "dkVert"],
    ["narHorz", "narVert"],
    ["dashHorz", "dashVert"],
  ] as const)("%s and %s are exact transposed direction variants", (horizontal, vertical) => {
    const h = createPicturePatternSampler(horizontal),
      v = createPicturePatternSampler(vertical);
    expect(h.width).toBe(v.height);
    expect(h.height).toBe(v.width);
    for (let y = 0; y < h.height; y++)
      for (let x = 0; x < h.width; x++) expect(h.sample(x, y)).toBe(v.sample(y, x));
  });

  test("line weights, narrow spacing and dashed gaps have separate semantics", () => {
    const light = createPicturePatternSampler("ltHorz");
    const ordinary = createPicturePatternSampler("horz");
    const dark = createPicturePatternSampler("dkHorz");
    expect(tileMean(light)).toBe(0.125);
    expect(tileMean(ordinary)).toBe(0.25);
    expect(tileMean(dark)).toBe(0.5);
    const narrow = createPicturePatternSampler("narHorz");
    expect(narrow.height).toBe(4);
    expect(narrow.sample(0, 4)).toBe(1);
    expect(light.sample(0, 4)).toBe(0);
    const dashed = createPicturePatternSampler("dashHorz");
    expect(dashed.sample(2, 0)).toBe(1);
    expect(dashed.sample(9, 0)).toBe(0);
    expect(dashed.sample(2, 4)).toBe(0);
  });

  test("diagonal slopes, weights, wide spacing, dash breaks and crosses are geometry", () => {
    const down = createPicturePatternSampler("dnDiag", { antialias: false });
    const up = createPicturePatternSampler("upDiag", { antialias: false });
    expect(down.sample(3, 3)).toBe(1);
    expect(up.sample(3, 3)).toBe(0);
    expect(down.sample(3, 4)).toBe(1);
    expect(createPicturePatternSampler("ltDnDiag", { antialias: false }).sample(3, 4)).toBe(0);
    expect(createPicturePatternSampler("dkDnDiag", { antialias: false }).sample(3, 6)).toBe(1);
    expect(createPicturePatternSampler("wdDnDiag").width).toBe(12);
    const dashed = createPicturePatternSampler("dashDnDiag", { antialias: false });
    expect(dashed.sample(1, 1)).toBe(1);
    expect(dashed.sample(4, 4)).toBe(0);
    const cross = createPicturePatternSampler("cross", { antialias: false });
    expect(cross.sample(0, 5)).toBe(1);
    expect(cross.sample(5, 0)).toBe(1);
    expect(cross.sample(5, 5)).toBe(0);
    const diagonalCross = createPicturePatternSampler("diagCross", { antialias: false });
    expect(diagonalCross.sample(3, 3)).toBe(1);
    expect(diagonalCross.sample(3, 4)).toBe(1);
    expect(diagonalCross.sample(3, 6)).toBe(0);
  });

  test("checks change square size; grids draw edges; dotted grid draws round intersections", () => {
    const small = createPicturePatternSampler("smCheck", { antialias: false });
    const large = createPicturePatternSampler("lgCheck", { antialias: false });
    expect(small.sample(0, 0)).toBe(1);
    expect(small.sample(2, 0)).toBe(0);
    expect(small.sample(2, 2)).toBe(1);
    expect(large.sample(2, 0)).toBe(1);
    expect(large.sample(6, 0)).toBe(0);
    const grid = createPicturePatternSampler("smGrid", { antialias: false });
    expect(grid.sample(0, 2)).toBe(1);
    expect(grid.sample(2, 0)).toBe(1);
    expect(grid.sample(2, 2)).toBe(0);
    const dots = createPicturePatternSampler("dotGrid", { antialias: false });
    expect(dots.sample(0, 0)).toBe(1);
    expect(dots.sample(0, 4)).toBe(0);
    expect(dots.sample(4, 0)).toBe(0);
  });

  test.each(["smConfetti", "lgConfetti"] as const)(
    "%s is repeatable with a seed and has bounded chips",
    (preset) => {
      const a = createPicturePatternSampler(preset, { seed: 0 });
      const b = createPicturePatternSampler(preset, { seed: 0 });
      const c = createPicturePatternSampler(preset, { seed: 0xffffffff });
      expect(signature(a)).toBe(signature(b));
      expect(signature(a)).not.toBe(signature(c));
      const cell = preset === "lgConfetti" ? 8 : 6;
      for (let y = 0; y < a.height; y += cell)
        for (let x = 0; x < a.width; x += cell) {
          expect(a.sample(x, y)).toBe(0);
          expect(a.sample(x + cell - 1, y + cell - 1)).toBe(0);
        }
    },
  );

  test("large confetti uses larger chips and ordinary patterns ignore confetti seed", () => {
    expect(getPicturePatternTileSize("smConfetti")).toEqual({ width: 24, height: 24 });
    expect(getPicturePatternTileSize("lgConfetti")).toEqual({ width: 32, height: 32 });
    const small = createPicturePatternSampler("smConfetti");
    const large = createPicturePatternSampler("lgConfetti");
    expect(tileMean(large) * 64).toBeGreaterThan(tileMean(small) * 36);
    expect(signature(createPicturePatternSampler("pct20", { seed: 1 }))).toBe(
      signature(createPicturePatternSampler("pct20", { seed: 2 })),
    );
  });

  test("brick courses alternate vertical joints, including the diagonal form", () => {
    const horizontal = createPicturePatternSampler("horzBrick", { antialias: false });
    expect(horizontal.sample(0, 4)).toBe(1);
    expect(horizontal.sample(0, 12)).toBe(0);
    expect(horizontal.sample(8, 12)).toBe(1);
    expect(horizontal.sample(8, 0)).toBe(1);
    const diagonal = createPicturePatternSampler("diagBrick", { antialias: false });
    // In diagonal coordinates, (x+y, y-x) supplies the same staggered courses.
    expect(diagonal.sample(2, 2)).toBe(1);
    expect(diagonal.sample(2, 6)).toBe(0);
    expect(diagonal.sample(10, 14)).toBe(0);
    expect(signature(horizontal)).not.toBe(signature(diagonal));
  });

  test("solid, open and dotted diamonds preserve different interiors and outlines", () => {
    const solid = createPicturePatternSampler("solidDmnd", { antialias: false });
    const open = createPicturePatternSampler("openDmnd", { antialias: false });
    const dotted = createPicturePatternSampler("dotDmnd", { antialias: false });
    expect(solid.sample(6, 6)).toBe(1);
    expect(open.sample(6, 6)).toBe(0);
    expect(dotted.sample(6, 6)).toBe(0);
    expect(open.sample(9, 7)).toBe(1);
    expect(dotted.sample(8, 3)).toBe(1);
    expect(dotted.sample(7, 2)).toBe(0);
    expect(solid.sample(0, 0)).toBe(0);
  });

  test("plaid and weave have independent crossing strips and intentional foreground tones", () => {
    const plaid = createPicturePatternSampler("plaid", { antialias: false });
    expect(plaid.sample(3, 3)).toBe(0.85);
    expect(plaid.sample(8, 3)).toBe(0.5);
    expect(plaid.sample(8, 8)).toBe(0);
    expect(plaid.sample(0, 8)).toBe(1);
    const weave = createPicturePatternSampler("weave", { antialias: false });
    // The top ribbon swaps orientation at the next crossing.
    expect(weave.sample(0, 1)).toBe(0.4);
    expect(weave.sample(8, 1)).toBe(0.95);
    expect(weave.sample(5, 5)).toBe(0);
  });

  test("sphere is a lit disk with empty corners and a directional foreground shade", () => {
    const sphere = createPicturePatternSampler("sphere", { antialias: false });
    expect(sphere.sample(0, 0)).toBe(0);
    expect(sphere.sample(8, 8)).toBeGreaterThan(0);
    expect(sphere.sample(8, 8)).toBeLessThan(1);
    expect(sphere.sample(5, 5)).toBeLessThan(sphere.sample(10, 10));
  });

  test("divots, overlapping shingle arcs, smooth waves, trellis rails and zigzags remain distinct", () => {
    const divot = createPicturePatternSampler("divot", { antialias: false });
    expect(divot.sample(3, 4)).toBe(1);
    expect(divot.sample(3, 0)).toBe(0);
    const shingle = createPicturePatternSampler("shingle", { antialias: false });
    expect(shingle.sample(8, 7)).toBe(1);
    expect(shingle.sample(8, 3)).toBe(0);
    const wave = createPicturePatternSampler("wave", { antialias: false });
    const zigzag = createPicturePatternSampler("zigZag", { antialias: false });
    expect(wave.sample(0, 4)).toBe(1);
    expect(zigzag.sample(0, 4)).toBe(0);
    const trellis = createPicturePatternSampler("trellis", { antialias: false });
    expect(trellis.sample(4, 4)).toBe(0);
    expect(trellis.sample(2, 3)).toBe(1);
    expect(trellis.sample(0, 0)).toBe(0.75);
  });

  test("scaling expands pattern geometry instead of just changing repeat metadata", () => {
    const original = createPicturePatternSampler("horz");
    const doubled = createPicturePatternSampler("horz", { scale: 2 });
    expect(doubled.width).toBe(original.width * 2);
    expect(doubled.height).toBe(original.height * 2);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        expect(doubled.sample(x * 2, y * 2)).toBe(original.sample(x, y));
        expect(doubled.sample(x * 2 + 1, y * 2 + 1)).toBe(original.sample(x, y));
      }
    expect(getPicturePatternTileSize("wave", 0.7)).toEqual({ width: 11, height: 6 });
    expect(getPicturePatternTileSize("lgConfetti", Number.MIN_VALUE)).toEqual({
      width: 1,
      height: 1,
    });
    expect(getPicturePatternTileSize("lgConfetti", 64)).toEqual({ width: 2048, height: 2048 });
  });

  test("antialias samples pixel area with partial diagonal coverage, not blurry colors", () => {
    const smooth = createPicturePatternSampler("ltDnDiag");
    const sharp = createPicturePatternSampler("ltDnDiag", { antialias: false });
    expect(sharp.sample(0, 0)).toBe(1);
    expect(smooth.sample(0, 0)).toBeGreaterThan(0);
    expect(smooth.sample(0, 0)).toBeLessThan(1);
    expect(tileMean(smooth)).toBe(0.125);
    expect(smooth.sample(0, 4)).toBe(0);
  });

  test("very large safe raster coordinates are reduced before floating point scaling", () => {
    const sampler = createPicturePatternSampler("smConfetti", { scale: 1.3 });
    const x = Number.MAX_SAFE_INTEGER,
      y = Number.MIN_SAFE_INTEGER;
    const reducedY = ((y % sampler.height) + sampler.height) % sampler.height;
    expect(sampler.sample(x, y)).toBe(sampler.sample(x % sampler.width, reducedY));
    expect(Object.isFrozen(sampler)).toBe(true);
    expect(Object.isFrozen(getPicturePatternTileSize("wave"))).toBe(true);
  });

  test.each(["", "bogus", "Pct5", "sphere ", null, undefined, 5])(
    "rejects invalid preset %s before sampling",
    (value) => {
      expect(() => createPicturePatternSampler(value as PicturePatternPreset)).toThrow(TypeError);
      expect(() => getPicturePatternTileSize(value as PicturePatternPreset)).toThrow(TypeError);
    },
  );

  test.each([0, -1, 65, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, "2"])(
    "rejects invalid scale %s",
    (value) => {
      const scale = value as number;
      expect(() => createPicturePatternSampler("horz", { scale })).toThrow(RangeError);
      expect(() => getPicturePatternTileSize("horz", scale)).toThrow(RangeError);
    },
  );

  test.each([-1, 1.5, 0x100000000, Number.NaN, Number.POSITIVE_INFINITY, null, "2"])(
    "rejects invalid seed %s",
    (value) => {
      expect(() => createPicturePatternSampler("smConfetti", { seed: value as number })).toThrow(
        RangeError,
      );
    },
  );

  test.each([null, 1, "true"])("rejects invalid antialias %s", (value) => {
    expect(() =>
      createPicturePatternSampler("horz", { antialias: value as unknown as boolean }),
    ).toThrow(TypeError);
  });

  test.each([null, false, 2, "options", []])("rejects invalid options object %s", (value) => {
    expect(() =>
      createPicturePatternSampler("horz", value as PicturePatternSamplingOptions),
    ).toThrow(TypeError);
  });

  test.each([
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    null,
    "1",
  ])("rejects invalid raster coordinate %s", (value) => {
    const sampler = createPicturePatternSampler("horz");
    expect(() => sampler.sample(value as number, 0)).toThrow(RangeError);
    expect(() => sampler.sample(0, value as number)).toThrow(RangeError);
  });
});
