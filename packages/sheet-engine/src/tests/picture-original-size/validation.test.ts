import { describe, expect, test } from "vitest";
import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  resetResolvedPictureToOriginalSize,
  scaleResolvedPictureCropBy,
} from "../../picture-original-size.js";
import { fixture } from "./fixture.js";

const identity = { widthFactor: 1, heightFactor: 1 };
const original = { width: 360, height: 240 };

describe("picture original-size strict own-data validation and atomic refusal", () => {
  test("factor and original-size records reject missing, extra, inherited, accessor and nonfinite values", () => {
    const before = fixture();
    const snapshot = structuredClone(before);
    let getterCalls = 0;
    const factorAccessor = {
      get widthFactor() {
        getterCalls++;
        return 1;
      },
      heightFactor: 1,
    };
    const sizeAccessor = {
      get width() {
        getterCalls++;
        return 360;
      },
      height: 240,
    };
    for (const value of [
      null,
      [],
      {},
      { widthFactor: 1 },
      { ...identity, unknown: true },
      { ...identity, [Symbol("extra")]: 1 },
      Object.create(identity),
      factorAccessor,
    ])
      expect(() => scaleResolvedPictureCropBy(before, value as typeof identity)).toThrow();
    for (const value of [
      null,
      [],
      {},
      { width: 360 },
      { ...original, unknown: true },
      { ...original, [Symbol("extra")]: 1 },
      Object.create(original),
      sizeAccessor,
    ])
      expect(() => resetResolvedPictureToOriginalSize(before, value as typeof original)).toThrow();
    for (const bad of ["1", undefined, NaN, Infinity, -Infinity, 0, -0, -1]) {
      expect(() =>
        scaleResolvedPictureCropBy(before, { widthFactor: bad as number, heightFactor: 1 }),
      ).toThrow();
      expect(() =>
        scaleResolvedPictureCropBy(before, { widthFactor: 1, heightFactor: bad as number }),
      ).toThrow();
    }
    for (const bad of [
      "360",
      undefined,
      NaN,
      Infinity,
      -Infinity,
      0,
      -1,
      0.5,
      10000.01,
      Number.MIN_VALUE,
      Number.MAX_VALUE,
    ]) {
      expect(() =>
        resetResolvedPictureToOriginalSize(before, { width: bad as number, height: 240 }),
      ).toThrow();
      expect(() =>
        resetResolvedPictureToOriginalSize(before, { width: 360, height: bad as number }),
      ).toThrow();
    }
    expect(getterCalls).toBe(0);
    expect(before).toEqual(snapshot);
  });

  test("unknown/accessor/inherited resolved geometry never invokes user getters, including derived metadata", () => {
    const before = fixture();
    let getterCalls = 0;
    const getter = {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls++;
        return 0;
      },
    };
    const rectAccessor = { ...before.layout.rect };
    Object.defineProperty(rectAccessor, "x", getter);
    const sourceAccessor = { ...before.source };
    Object.defineProperty(sourceAccessor, "widthRatio", getter);
    const angleAccessor = { ...before.layout };
    Object.defineProperty(angleAccessor, "angleDeg", getter);
    const inputAccessor = { ...before };
    Object.defineProperty(inputAccessor, "layout", getter);
    const boundsAccessor = { ...before.layout.bounds };
    Object.defineProperty(boundsAccessor, "width", getter);
    const cornerAccessor = { ...before.layout.corners[0] };
    Object.defineProperty(cornerAccessor, "x", getter);
    const cornerIndexAccessor = [...before.layout.corners];
    Object.defineProperty(cornerIndexAccessor, "0", getter);
    const sparseCorners: unknown[] = [];
    sparseCorners.length = 4;
    const extraCorners = [...before.layout.corners];
    Object.defineProperty(extraCorners, "extra", { value: 1 });
    const values = [
      null,
      [],
      {},
      { ...before, extra: true },
      { ...before, [Symbol("extra")]: 1 },
      Object.create(before),
      { ...before, layout: null },
      { ...before, layout: [] },
      { ...before, source: null },
      { ...before, source: [] },
      { ...before, layout: Object.create(before.layout) },
      { ...before, source: Object.create(before.source) },
      { ...before, layout: { ...before.layout, rect: Object.create(before.layout.rect) } },
      { ...before, layout: { ...before.layout, extra: true } },
      { ...before, layout: { ...before.layout, rect: { ...before.layout.rect, extra: true } } },
      { ...before, source: { ...before.source, extra: true } },
      { ...before, layout: { ...before.layout, bounds: { ...before.layout.bounds, extra: true } } },
      {
        ...before,
        layout: {
          ...before.layout,
          corners: [
            { ...before.layout.corners[0], extra: true },
            ...before.layout.corners.slice(1),
          ],
        },
      },
      { ...before, layout: { ...before.layout, collapsed: 0 } },
      { ...before, layout: { ...before.layout, bounds: { ...before.layout.bounds, width: -1 } } },
      { ...before, layout: { ...before.layout, bounds: { ...before.layout.bounds, x: NaN } } },
      { ...before, layout: { ...before.layout, corners: null } },
      { ...before, layout: { ...before.layout, corners: sparseCorners } },
      { ...before, layout: { ...before.layout, corners: extraCorners } },
      inputAccessor,
      { ...before, layout: angleAccessor },
      { ...before, layout: { ...before.layout, rect: rectAccessor } },
      { ...before, source: sourceAccessor },
      { ...before, layout: { ...before.layout, bounds: boundsAccessor } },
      {
        ...before,
        layout: { ...before.layout, corners: [cornerAccessor, ...before.layout.corners.slice(1)] },
      },
      { ...before, layout: { ...before.layout, corners: cornerIndexAccessor } },
    ];
    for (const value of values) {
      expect(() => scaleResolvedPictureCropBy(value as ResolvedPictureCrop, identity)).toThrow();
      expect(() =>
        resetResolvedPictureToOriginalSize(value as ResolvedPictureCrop, original),
      ).toThrow();
    }
    expect(getterCalls).toBe(0);
  });

  test("non-enumerable own data is valid and source-free resolved layouts need no sourceRect", () => {
    const before = fixture();
    for (const record of [before, before.layout, before.layout.rect, before.source])
      for (const key of Object.keys(record))
        Object.defineProperty(record, key, {
          ...Object.getOwnPropertyDescriptor(record, key),
          enumerable: false,
        });
    const factors = Object.defineProperties(
      {},
      {
        widthFactor: { value: 1.25 },
        heightFactor: { value: 1 },
      },
    ) as typeof identity;
    const size = Object.defineProperties(
      {},
      {
        width: { value: 180 },
        height: { value: 360 },
      },
    ) as typeof original;
    const scaled = scaleResolvedPictureCropBy(before, factors);
    expect(scaled.layout.rect.width).toBe(240);
    expect(scaled.layout.rect.height).toBe(144);
    expect(scaled.source).toBe(before.source);
    expect(scaleResolvedPictureCropBy(before, identity)).toBe(before);
    expect(resetResolvedPictureToOriginalSize(before, size).layout.rect).toEqual({
      x: 144,
      y: 144,
      width: 180,
      height: 360,
    });
  });

  test("rect/angle are authoritative and changing geometry re-resolves stale own-data derivatives", () => {
    const before = fixture();
    const stale = {
      ...before,
      layout: { ...before.layout, collapsed: true, bounds: { x: 0, y: 0, width: 0, height: 0 } },
    };
    expect(scaleResolvedPictureCropBy(stale, identity)).toBe(stale);
    const after = scaleResolvedPictureCropBy(stale, { widthFactor: 1.2, heightFactor: 1 });
    expect(after.layout).toEqual(resolvePictureLayout(after.layout.rect, 37));
    expect(after.layout.collapsed).toBe(false);
  });

  test("existing collapsed, negative, underflowing and overflowing source geometry refuses even on no-op", () => {
    const before = fixture();
    const values = [
      { ...before, layout: resolvePictureLayout({ ...before.layout.rect, width: 0 }, 37) },
      {
        ...before,
        layout: resolvePictureLayout({ x: 0, y: 0, width: Number.MIN_VALUE, height: 144 }, 0),
      },
      { ...before, layout: { ...before.layout, rect: { ...before.layout.rect, height: -1 } } },
      { ...before, layout: { ...before.layout, angleDeg: NaN } },
      { ...before, layout: { ...before.layout, rect: { ...before.layout.rect, x: Infinity } } },
      { ...before, source: { ...before.source, widthRatio: 0 } },
      { ...before, source: { ...before.source, heightRatio: -1 } },
      { ...before, source: { ...before.source, widthRatio: Number.MIN_VALUE } },
      { ...before, source: { ...before.source, widthRatio: Number.MAX_VALUE } },
      { ...before, source: { ...before.source, offsetXRatio: Number.MAX_VALUE } },
      { ...before, source: { ...before.source, offsetYRatio: NaN } },
    ];
    for (const value of values) {
      expect(() => scaleResolvedPictureCropBy(value, identity)).toThrow();
      expect(() => resetResolvedPictureToOriginalSize(value, original)).toThrow();
    }
  });

  test("existing rotated source footprint is checked before both scale and reset", () => {
    const before = fixture(90, {
      widthRatio: 1,
      heightRatio: 1 / 144,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    before.layout = resolvePictureLayout({ x: 1e18, y: 0, width: 1000, height: 144 }, 90);
    expect(() => scaleResolvedPictureCropBy(before, identity)).toThrow(/world coordinates/);
    expect(() => resetResolvedPictureToOriginalSize(before, original)).toThrow(/world coordinates/);
  });

  test("new source products must remain finite and representable before scale can return", () => {
    const overflow = fixture(0, {
      widthRatio: 2e304,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    const snapshot = structuredClone(overflow);
    expect(() =>
      scaleResolvedPictureCropBy(overflow, { widthFactor: 10000 / 192, heightFactor: 1 }),
    ).toThrow();
    expect(overflow).toEqual(snapshot);
    const underflow = fixture(0, {
      widthRatio: 0.001,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    underflow.layout = resolvePictureLayout({ x: 1e14, y: 0, width: 192, height: 144 }, 0);
    expect(() =>
      scaleResolvedPictureCropBy(underflow, { widthFactor: 1 / 192, heightFactor: 1 }),
    ).toThrow();
  });

  test("reset's new natural frame is rejected when it cannot be represented at retained x/y", () => {
    const before = fixture(0);
    before.layout = resolvePictureLayout({ x: 1e18, y: 0, width: 1000, height: 144 }, 0);
    const snapshot = structuredClone(before);
    expect(() => resetResolvedPictureToOriginalSize(before, { width: 1, height: 240 })).toThrow(
      /represented/,
    );
    expect(before).toEqual(snapshot);
  });
});
