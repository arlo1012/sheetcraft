// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  PICTURE_RASTER_LIMITS,
  blurPictureAlphaMask,
  blurPictureRgbaSurface,
  colorizePictureAlphaMask,
  compositePictureSourceOver,
  createPictureAlphaMask,
  createPictureGlowLayer,
  createPictureReflectionLayer,
  createPictureRgbaSurface,
  createPictureShadowLayer,
  fillPictureGradientSurface,
  fillPictureSolidSurface,
  pictureAlphaMaskFromSurface,
  resamplePictureAlphaMask,
  resamplePictureRgbaSurface,
  samplePictureGradient,
  softenPictureEdges,
  type PictureAlphaMask,
  type PictureResolvedGradient,
  type PictureRgbaSurface,
} from "../../../shared/images/picture-effect-raster";
import {
  PICTURE_EFFECT_IDENTITY,
  createPictureShadowAffine,
  expandPictureEffectBounds,
  getPictureLineCompoundBands,
  getPictureLineDashIntervals,
  getPictureLineDashPattern,
  getPictureReflectionBounds,
  getPictureShadowBounds,
  invertPictureEffectAffine,
  pictureLineCornerContainsPoint,
  pictureLineDashContainsPoint,
  transformPictureEffectBounds,
  unionPictureEffectBounds,
  type PictureShadowGeometry,
} from "../../../shared/images/picture-effect-geometry";

function pixel(surface: PictureRgbaSurface, x: number, y: number): number[] {
  return Array.from(
    surface.data.slice((y * surface.width + x) * 4, (y * surface.width + x + 1) * 4),
  );
}
function fullMask(width: number, height: number): PictureAlphaMask {
  const mask = createPictureAlphaMask(width, height);
  mask.data.fill(1);
  return mask;
}
function shadow(overrides: Partial<PictureShadowGeometry> = {}): PictureShadowGeometry {
  return {
    kind: "outer",
    scale: 1,
    blurRadiusPx: 0,
    distancePx: 0,
    angleDeg: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    ...overrides,
  };
}
const black = [0, 0, 0] as const;
const red = [255, 0, 0] as const;
const blue = [0, 0, 255] as const;
function gradient(): PictureResolvedGradient {
  return {
    kind: "linear",
    angleDeg: 0,
    opacity: 1,
    stops: [
      { offset: 0, color: red, opacity: 0, brightness: 0 },
      { offset: 1, color: blue, opacity: 1, brightness: 0 },
    ],
  };
}

describe("bounded picture raster ownership", () => {
  test.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [NaN, 1],
    [Infinity, 1],
    [4097, 1],
    [1, 4097],
  ])("rejects invalid dimensions %s×%s without an allocation", (width, height) => {
    expect(() => createPictureRgbaSurface(width, height)).toThrow(RangeError);
    expect(() => createPictureAlphaMask(width, height)).toThrow(RangeError);
  });
  test("requires exact typed-array layout and finite alpha fractions", () => {
    expect(() =>
      pictureAlphaMaskFromSurface({ width: 2, height: 2, data: new Uint8ClampedArray(15) }),
    ).toThrow(TypeError);
    expect(() =>
      blurPictureAlphaMask({ width: 2, height: 2, data: new Float32Array(3) }, 1),
    ).toThrow(TypeError);
    const mask = fullMask(2, 2);
    for (const alpha of [NaN, Infinity, -1, 2]) {
      mask.data[0] = alpha;
      expect(() => blurPictureAlphaMask(mask, 0)).toThrow(RangeError);
    }
  });
  test("radius and RGBA operation scratch budgets are checked before allocating", () => {
    const surface = createPictureRgbaSurface(1, 1);
    for (const radius of [-1, NaN, Infinity, 257])
      expect(() => blurPictureRgbaSurface(surface, radius)).toThrow(RangeError);
    // Fake exact-length input is rejected before any pixel traversal/allocation.
    const dimensions = { width: 4096, height: 4096 };
    const data = new Uint8ClampedArray(PICTURE_RASTER_LIMITS.pixels * 4);
    expect(() => blurPictureRgbaSurface({ ...dimensions, data }, 1)).toThrow(/buffer budget/);
  });
  test("zero radius is an exact, dedicated no-op including transparent RGB", () => {
    const source = createPictureRgbaSurface(1, 1);
    source.data.set([123, 234, 45, 0]);
    for (const result of [blurPictureRgbaSurface(source, 0), softenPictureEdges(source, 0)]) {
      expect(result.data).toEqual(source.data);
      expect(result.data).not.toBe(source.data);
    }
    const mask = fullMask(2, 2),
      result = blurPictureAlphaMask(mask, 0);
    expect(result.data).toEqual(mask.data);
    expect(result.data).not.toBe(mask.data);
  });
});

describe("premultiplied picture pixels", () => {
  test("source-over has correct alpha/color and never changes either input", () => {
    const destination = fillPictureSolidSurface(1, 1, blue, 0.5);
    const source = fillPictureSolidSurface(1, 1, red, 0.5);
    const before = new Uint8ClampedArray(destination.data);
    expect(pixel(compositePictureSourceOver(destination, source), 0, 0)).toEqual([170, 0, 85, 192]);
    expect(destination.data).toEqual(before);
    expect(pixel(source, 0, 0)).toEqual([255, 0, 0, 128]);
  });
  test("source-over clips offsets, honors independent opacity and clears zero-alpha color", () => {
    const destination = createPictureRgbaSurface(2, 1),
      source = fillPictureSolidSurface(1, 1, red);
    expect(pixel(compositePictureSourceOver(destination, source, 1, 0, 0.25), 1, 0)).toEqual([
      255, 0, 0, 64,
    ]);
    expect(compositePictureSourceOver(destination, source, 3).data).toEqual(destination.data);
    destination.data.set([0, 255, 0, 0]);
    const transparent = createPictureRgbaSurface(1, 1);
    transparent.data.set([255, 0, 0, 0]);
    expect(pixel(compositePictureSourceOver(destination, transparent), 0, 0)).toEqual([0, 0, 0, 0]);
    expect(() => compositePictureSourceOver(destination, source, 0.5)).toThrow(RangeError);
    expect(() => compositePictureSourceOver(destination, source, 0, 0, NaN)).toThrow(RangeError);
  });
  test("mask follows alpha, never luminance; blur has no transparent RGB fringe", () => {
    const source = createPictureRgbaSurface(7, 1);
    source.data.fill(255);
    for (let x = 0; x < 7; x++) source.data[x * 4 + 3] = 0;
    source.data.set([200, 50, 25, 255], 12);
    const mask = pictureAlphaMaskFromSurface(source);
    expect(Array.from(mask.data)).toEqual([0, 0, 0, 1, 0, 0, 0]);
    const before = new Uint8ClampedArray(source.data),
      blurred = blurPictureRgbaSurface(source, 3);
    for (let x = 0; x < 7; x++)
      if (pixel(blurred, x, 0)[3]! > 0)
        expect(pixel(blurred, x, 0).slice(0, 3)).toEqual([200, 50, 25]);
    expect(source.data).toEqual(before);
  });
  test("finite blur support is symmetric; very small positive radii remain finite", () => {
    const mask = createPictureAlphaMask(31, 1);
    mask.data[15] = 1;
    for (const radius of [1, 3, 4, 9, Number.MIN_VALUE]) {
      const blurred = blurPictureAlphaMask(mask, radius);
      for (let x = 0; x < 15; x++) expect(blurred.data[x]).toBeCloseTo(blurred.data[30 - x]!, 7);
      expect(Array.from(blurred.data).every(Number.isFinite)).toBe(true);
      expect(blurred.data[0]).toBe(0);
    }
  });
  test("bilinear affine sampling uses premultiplied color and permits mirrors", () => {
    const source = createPictureRgbaSurface(2, 1);
    source.data.set([255, 0, 0, 0, 0, 0, 255, 255]);
    const shifted = resamplePictureRgbaSurface(
      source,
      { ...PICTURE_EFFECT_IDENTITY, e: 0.5 },
      { left: 0, top: 0, right: 3, bottom: 1 },
    );
    expect(pixel(shifted, 1, 0)).toEqual([0, 0, 255, 128]);
    const mirrored = resamplePictureRgbaSurface(
      source,
      { a: -1, b: 0, c: 0, d: 1, e: 2, f: 0 },
      { left: 0, top: 0, right: 2, bottom: 1 },
    );
    expect(pixel(mirrored, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(mirrored, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(() =>
      resamplePictureRgbaSurface(
        source,
        { ...PICTURE_EFFECT_IDENTITY, a: NaN },
        { left: 0, top: 0, right: 2, bottom: 1 },
      ),
    ).toThrow(RangeError);
  });
});

describe("distinct picture mask effects", () => {
  test("cast origin remains independent of uniform-scale anchor", () => {
    const bounds = { left: 0, top: 0, right: 10, bottom: 8 };
    const cast = createPictureShadowAffine(
      bounds,
      shadow({
        kind: "perspective",
        scale: 2,
        anchorX: 0,
        anchorY: 0,
        cast: { scaleX: 0.5, scaleY: 0.25, skewX: 0.5, originX: 1, originY: 1 },
      }),
    );
    expect(cast).toEqual({ a: 1, b: 0, c: 1, d: 0.5, e: 1, f: 6 });
    const defaultOrigin = createPictureShadowAffine(
      bounds,
      shadow({
        kind: "perspective",
        scale: 2,
        anchorX: 0,
        anchorY: 0,
        cast: { scaleX: 0.5, scaleY: 0.25, skewX: 0.5 },
      }),
    );
    expect(defaultOrigin.e).toBe(0);
    expect(defaultOrigin.f).toBe(0);
    expect(() =>
      createPictureShadowAffine(
        bounds,
        shadow({ kind: "perspective", cast: { scaleX: 1, scaleY: 1, skewX: 0, originX: NaN } }),
      ),
    ).toThrow(RangeError);
  });
  test("shadow scale preserves the selected anchor and angle changes only translation", () => {
    const bounds = { left: 0, top: 0, right: 10, bottom: 8 };
    const matrix = createPictureShadowAffine(
      bounds,
      shadow({ scale: 2, anchorX: 0, anchorY: 1, distancePx: 3, angleDeg: 90 }),
    );
    expect(matrix.a).toBe(2);
    expect(matrix.d).toBe(2);
    expect(matrix.e).toBeCloseTo(0);
    expect(matrix.f).toBeCloseTo(-5);
    expect(getPictureShadowBounds(bounds, shadow({ scale: 0 }))).toBeNull();
  });
  test("outer and inner shadow differ; inner complement exterior remains one", () => {
    const mask = fullMask(9, 9),
      before = new Float32Array(mask.data);
    const outer = createPictureShadowLayer(mask, {
      ...shadow({ distancePx: 2 }),
      color: black,
      opacity: 1,
    })!;
    const inner = createPictureShadowLayer(mask, {
      ...shadow({ kind: "inner", distancePx: 2 }),
      color: black,
      opacity: 1,
    })!;
    expect(outer.left).toBe(1);
    expect(inner.left).toBe(0);
    expect(inner.surface.width).toBe(9);
    expect(pixel(inner.surface, 0, 4)[3]).toBe(255);
    expect(pixel(inner.surface, 4, 4)[3]).toBe(0);
    const feathered = createPictureShadowLayer(mask, {
      ...shadow({ kind: "inner", blurRadiusPx: 3 }),
      color: black,
      opacity: 1,
    })!;
    expect(pixel(feathered.surface, 0, 4)[3]!).toBeGreaterThan(pixel(feathered.surface, 4, 4)[3]!);
    expect(mask.data).toEqual(before);
  });
  test("perspective shadow genuinely flattens/shears alpha rather than aliasing outer", () => {
    const mask = fullMask(12, 12);
    const options = shadow({
      kind: "perspective",
      anchorX: 0.5,
      anchorY: 1,
      cast: { scaleX: 1, scaleY: 0.25, skewX: 0.5 },
    });
    const cast = createPictureShadowLayer(mask, { ...options, color: black, opacity: 1 })!;
    const outer = createPictureShadowLayer(mask, { ...shadow(), color: black, opacity: 1 })!;
    expect(cast.surface.height).toBe(5);
    expect(outer.surface.height).toBe(14);
    expect(cast.surface.width).toBe(20);
    expect(cast.top).toBe(8);
    expect(() =>
      createPictureShadowLayer(mask, {
        ...shadow({ kind: "perspective" }),
        color: black,
        opacity: 1,
      }),
    ).toThrow(TypeError);
    expect(
      createPictureShadowLayer(mask, {
        ...options,
        cast: { scaleX: 1, scaleY: 0, skewX: 0.5 },
        color: black,
        opacity: 1,
      }),
    ).toBeNull();
  });
  test("reflection is coverage of a mirrored sprite, with gap and quadratic fade", () => {
    const source = createPictureRgbaSurface(1, 4);
    for (let y = 0; y < 4; y++) source.data.set([(y + 1) * 10, 0, 0, 255], y * 4);
    const reflection = createPictureReflectionLayer(source, {
      coverage: 0.5,
      opacity: 1,
      gapPx: 1,
      blurRadiusPx: 0,
    })!;
    expect(reflection.top).toBe(5);
    expect(reflection.surface.height).toBe(2);
    expect(pixel(reflection.surface, 0, 0)).toEqual([40, 0, 0, 143]);
    expect(pixel(reflection.surface, 0, 1)).toEqual([30, 0, 0, 16]);
    expect(pixel(source, 0, 0)).toEqual([10, 0, 0, 255]);
    expect(
      createPictureReflectionLayer(source, { coverage: 0, opacity: 1, gapPx: 0, blurRadiusPx: 0 }),
    ).toBeNull();
    expect(() =>
      createPictureReflectionLayer(source, {
        coverage: 1.01,
        opacity: 1,
        gapPx: 0,
        blurRadiusPx: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createPictureReflectionLayer(source, {
        coverage: 0,
        opacity: NaN,
        gapPx: 0,
        blurRadiusPx: 0,
      }),
    ).toThrow(RangeError);
  });
  test("blurred reflection preserves source hue and includes the finite halo", () => {
    const source = fillPictureSolidSurface(3, 3, [200, 50, 25]);
    const reflection = createPictureReflectionLayer(source, {
      coverage: 1,
      opacity: 0.8,
      gapPx: 2,
      blurRadiusPx: 3,
    })!;
    expect(reflection.left).toBe(-3);
    expect(reflection.top).toBe(2);
    expect(reflection.surface.width).toBe(9);
    expect(reflection.surface.height).toBe(9);
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++)
        if (pixel(reflection.surface, x, y)[3]! > 0)
          expect(pixel(reflection.surface, x, y).slice(0, 3)).toEqual([200, 50, 25]);
  });
  test("glow is centered and bounded and follows holes, not source RGB", () => {
    const mask = createPictureAlphaMask(3, 3);
    mask.data[4] = 1;
    const glow = createPictureGlowLayer(mask, { color: red, opacity: 0.5, radiusPx: 3 })!;
    expect(glow.left).toBe(-3);
    expect(glow.top).toBe(-3);
    expect(pixel(glow.surface, 4, 4)[3]).toBe(0);
    expect(pixel(glow.surface, 3, 4)).toEqual(pixel(glow.surface, 5, 4));
    expect(pixel(glow.surface, 4, 3)).toEqual(pixel(glow.surface, 4, 5));
    expect(pixel(glow.surface, 1, 4)[3]).toBe(0);
    expect(pixel(glow.surface, 3, 4)[0]).toBe(255);
    const hole = fullMask(5, 5);
    hole.data[12] = 0;
    expect(
      pixel(
        createPictureGlowLayer(hole, { color: blue, opacity: 1, radiusPx: 2 })!.surface,
        4,
        4,
      )[3]!,
    ).toBeGreaterThan(0);
  });
  test("soft edges feather inward to true zero with no expanded halo or RGB tint", () => {
    const source = fillPictureSolidSurface(7, 7, [200, 50, 25]);
    const softened = softenPictureEdges(source, 2);
    expect(softened.width).toBe(7);
    expect(softened.height).toBe(7);
    expect(pixel(softened, 0, 3)).toEqual([0, 0, 0, 0]);
    expect(pixel(softened, 1, 3)).toEqual([200, 50, 25, 128]);
    expect(pixel(softened, 3, 3)).toEqual([200, 50, 25, 255]);
    source.data[3 * 7 * 4 + 3 * 4 + 3] = 0;
    const hole = softenPictureEdges(source, 2);
    expect(pixel(hole, 3, 3)[3]).toBe(0);
    expect(pixel(hole, 2, 3)[3]).toBe(0);
    expect(pixel(source, 0, 3)[3]).toBe(255);
    expect(softenPictureEdges(fillPictureSolidSurface(1, 1, red), 100).data).toEqual(
      new Uint8ClampedArray(4),
    );
  });
  test("invalid colors and effect parameters reject even a zero-opacity effect", () => {
    const mask = fullMask(1, 1);
    expect(() =>
      createPictureGlowLayer(mask, { color: [NaN, 0, 0], opacity: 0, radiusPx: 0 }),
    ).toThrow(RangeError);
    expect(() => colorizePictureAlphaMask(mask, [256, 0, 0])).toThrow(RangeError);
    expect(() =>
      createPictureShadowLayer(mask, {
        ...shadow({ angleDeg: Infinity }),
        color: black,
        opacity: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("resolved picture paints and line geometry", () => {
  test("stop interpolation is premultiplied with signed brightness and global opacity", () => {
    expect(samplePictureGradient(gradient(), 0.5)).toEqual([0, 0, 255, 128]);
    expect(samplePictureGradient(gradient(), 0)).toEqual([0, 0, 0, 0]);
    const tinted: PictureResolvedGradient = {
      kind: "linear",
      angleDeg: 0,
      opacity: 0.5,
      stops: [
        { offset: 0, color: [100, 100, 100], brightness: 0.5, opacity: 1 },
        { offset: 1, color: [100, 100, 100], brightness: -1, opacity: 1 },
      ],
    };
    expect(samplePictureGradient(tinted, 0)).toEqual([178, 178, 178, 128]);
    expect(samplePictureGradient(tinted, 1)).toEqual([0, 0, 0, 128]);
  });
  test("duplicate offsets have deterministic right-continuous hard steps", () => {
    const hard: PictureResolvedGradient = {
      kind: "linear",
      angleDeg: 0,
      opacity: 1,
      stops: [
        { offset: 0, color: red, opacity: 1, brightness: 0 },
        { offset: 0.5, color: red, opacity: 1, brightness: 0 },
        { offset: 0.5, color: blue, opacity: 1, brightness: 0 },
        { offset: 1, color: blue, opacity: 1, brightness: 0 },
      ],
    };
    expect(samplePictureGradient(hard, 0.4999)).toEqual([255, 0, 0, 255]);
    expect(samplePictureGradient(hard, 0.5)).toEqual([0, 0, 255, 255]);
    expect(() =>
      samplePictureGradient({ ...hard, stops: [hard.stops[2]!, hard.stops[0]!] }, 0.5),
    ).toThrow(RangeError);
    expect(() =>
      samplePictureGradient({ ...hard, stops: Array(17).fill(hard.stops[0]!) }, 0.5),
    ).toThrow(RangeError);
  });
  test("linear, elliptical radial and rectangular styles sample their actual geometry", () => {
    const stops = [
      { offset: 0, color: black, opacity: 1, brightness: 0 },
      { offset: 1, color: red, opacity: 1, brightness: 0 },
    ];
    const line = fillPictureGradientSurface(3, 3, {
      kind: "linear",
      angleDeg: 0,
      opacity: 1,
      stops,
    });
    expect(pixel(line, 1, 1)[0]).toBe(128);
    expect(pixel(line, 0, 1)[0]!).toBeLessThan(pixel(line, 2, 1)[0]!);
    const radial = fillPictureGradientSurface(3, 3, {
      kind: "radial",
      opacity: 1,
      centerX: 0.5,
      centerY: 0.5,
      radiusX: 0.5,
      radiusY: 0.5,
      stops,
    });
    const rectangle = fillPictureGradientSurface(3, 3, {
      kind: "rectangular",
      opacity: 1,
      centerX: 0.5,
      centerY: 0.5,
      radiusX: 0.5,
      radiusY: 0.5,
      stops,
    });
    expect(pixel(radial, 1, 1)[0]).toBe(0);
    expect(pixel(rectangle, 1, 1)[0]).toBe(0);
    expect(pixel(radial, 0, 0)[0]!).toBeGreaterThan(pixel(rectangle, 0, 0)[0]!);
    const flippedCoordinates = fillPictureGradientSurface(
      3,
      3,
      { kind: "linear", angleDeg: 0, opacity: 1, stops },
      { a: -1, b: 0, c: 0, d: 1, e: 3, f: 0 },
    );
    expect(pixel(flippedCoordinates, 0, 1)).toEqual(pixel(line, 2, 1));
  });
  test("all five compound profiles contain real gaps and are immutable", () => {
    expect(getPictureLineCompoundBands("single")).toEqual([[-0.5, 0.5]]);
    expect(getPictureLineCompoundBands("double")).toEqual([
      [-0.5, -1 / 6],
      [1 / 6, 0.5],
    ]);
    expect(getPictureLineCompoundBands("triple")).toHaveLength(3);
    expect(getPictureLineCompoundBands("thick-thin")[0]).toEqual([-0.5, 0.1]);
    expect(getPictureLineCompoundBands("thin-thick")[1]).toEqual([-0.1, 0.5]);
    expect(Object.isFrozen(getPictureLineCompoundBands("double")[0])).toBe(true);
  });
  test("all eight dash patterns dispatch, phase stays continuous, and tiny widths are bounded", () => {
    const ids = [
      "solid",
      "round-dot",
      "square-dot",
      "dash",
      "short-dash",
      "long-dash",
      "long-dash-dot",
      "long-dash-dot-dot",
    ] as const;
    expect(ids.map(getPictureLineDashPattern)).toEqual([
      [],
      [0, 2],
      [1, 2],
      [4, 3],
      [2, 2],
      [8, 3],
      [8, 3, 1, 3],
      [8, 3, 1, 3, 1, 3],
    ]);
    expect(getPictureLineDashIntervals(20, 1, "dash", 2).slice(0, 2)).toEqual([
      { start: -2, end: 2, dot: null },
      { start: 5, end: 9, dot: null },
    ]);
    expect(getPictureLineDashIntervals(5, 1, "round-dot")[0]).toEqual({
      start: 0,
      end: 0,
      dot: "round",
    });
    expect(() => getPictureLineDashIntervals(100, 0.000001, "dash")).toThrow(/budget/);
  });
  test("caps and rectangular corner joins have genuinely distinct coverage", () => {
    expect(pictureLineDashContainsPoint(-0.5, 0, 0, 4, 1, "butt")).toBe(false);
    expect(pictureLineDashContainsPoint(-0.5, 0, 0, 4, 1, "round")).toBe(true);
    expect(pictureLineDashContainsPoint(-0.9, 0.9, 0, 4, 1, "round")).toBe(false);
    expect(pictureLineDashContainsPoint(-0.9, 0.9, 0, 4, 1, "square")).toBe(true);
    expect(pictureLineDashContainsPoint(0.9, 0.9, 0, 0, 1, "butt", true)).toBe(false);
    expect(pictureLineCornerContainsPoint(0.8, 0.8, 1, "miter")).toBe(true);
    expect(pictureLineCornerContainsPoint(0.8, 0.8, 1, "round")).toBe(false);
    expect(pictureLineCornerContainsPoint(0.6, 0.6, 1, "round")).toBe(true);
    expect(pictureLineCornerContainsPoint(0.6, 0.6, 1, "bevel")).toBe(false);
    expect(pictureLineCornerContainsPoint(0.8, 0.8, 1, "miter", 1)).toBe(false);
  });
  test("paint bounds expand separately, singular maps are safe, inner bounds remain the body", () => {
    const bounds = { left: 0, top: 0, right: 10, bottom: 8 };
    expect(getPictureReflectionBounds(bounds, 0.5, 3, 2)).toEqual({
      left: -2,
      top: 9,
      right: 12,
      bottom: 17,
    });
    expect(getPictureShadowBounds(bounds, shadow({ kind: "inner", blurRadiusPx: 3 }))).toEqual(
      bounds,
    );
    expect(unionPictureEffectBounds(bounds, expandPictureEffectBounds(bounds, 4))).toEqual({
      left: -4,
      top: -4,
      right: 14,
      bottom: 12,
    });
    expect(transformPictureEffectBounds(bounds, { a: -1, b: 0, c: 0.5, d: 1, e: 0, f: 0 })).toEqual(
      { left: -10, top: 0, right: 4, bottom: 8 },
    );
    expect(invertPictureEffectAffine({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toBeNull();
    const mask = fullMask(2, 2);
    expect(
      resamplePictureAlphaMask(mask, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, bounds).data.every(
        (alpha) => alpha === 0,
      ),
    ).toBe(true);
  });
});
