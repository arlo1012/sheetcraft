import { describe, expect, test } from "vitest";
import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import type { FloatingImageResizeDirection } from "../../floating-image-layout.js";
import type { Point } from "../../geometry.js";
import {
  moveResolvedPictureCropSourceBy,
  resizeResolvedPictureCropBy,
} from "../../picture-crop-gesture.js";
import { fixture } from "./fixture.js";

describe("crop gesture refusal is pure and uses Core representability", () => {
  test("invalid delta/direction records refuse even on an otherwise unchanged drag", () => {
    const before = fixture(37);
    const snapshot = structuredClone(before);
    let getterCalls = 0;
    const accessor = {
      get x() {
        getterCalls++;
        return 0;
      },
      y: 0,
    };
    for (const delta of [
      null,
      [],
      {},
      { x: 0 },
      { x: "0", y: 0 },
      { x: 0, y: 0, extra: true },
      { x: NaN, y: 0 },
      { x: Infinity, y: 0 },
      { x: 0, y: -Infinity },
      accessor,
    ]) {
      expect(() => resizeResolvedPictureCropBy(before, "se", delta as Point)).toThrow();
      expect(() => moveResolvedPictureCropSourceBy(before, delta as Point)).toThrow();
    }
    for (const direction of [null, "move", "", "north", 1])
      expect(() =>
        resizeResolvedPictureCropBy(before, direction as FloatingImageResizeDirection, {
          x: 0,
          y: 0,
        }),
      ).toThrow();
    expect(getterCalls).toBe(0);
    expect(before).toEqual(snapshot);
  });

  test("gross malformed crop/layout/source structures refuse without invoking accessors", () => {
    const before = fixture(37);
    let getterCalls = 0;
    const inputAccessor = {
      get layout() {
        getterCalls++;
        return before.layout;
      },
      source: before.source,
    };
    const rectAccessor = {
      ...before.layout.rect,
      get x() {
        getterCalls++;
        return 144;
      },
    };
    const sourceAccessor = {
      ...before.source,
      get widthRatio() {
        getterCalls++;
        return 1;
      },
    };
    for (const value of [
      null,
      [],
      {},
      { ...before, extra: true },
      { ...before, layout: null },
      { ...before, layout: [] },
      { ...before, source: null },
      { ...before, source: [] },
      { ...before, layout: { ...before.layout, rect: [] } },
      { ...before, layout: { ...before.layout, rect: { ...before.layout.rect, extra: true } } },
      { ...before, source: { ...before.source, extra: true } },
      inputAccessor,
      { ...before, layout: { ...before.layout, rect: rectAccessor } },
      { ...before, source: sourceAccessor },
    ]) {
      expect(() =>
        resizeResolvedPictureCropBy(value as ResolvedPictureCrop, "se", { x: 0, y: 0 }),
      ).toThrow();
      expect(() =>
        moveResolvedPictureCropSourceBy(value as ResolvedPictureCrop, { x: 0, y: 0 }),
      ).toThrow();
    }
    expect(getterCalls).toBe(0);
  });

  test("collapsed, underflowing, nonfinite and overflowing existing geometry cannot be edited", () => {
    const before = fixture(37);
    const values = [
      { ...before, layout: resolvePictureLayout({ ...before.layout.rect, width: 0 }, 37) },
      {
        ...before,
        layout: resolvePictureLayout({ x: 0, y: 0, width: Number.MIN_VALUE, height: 240 }, 0),
      },
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
      expect(() => resizeResolvedPictureCropBy(value, "se", { x: 0, y: 0 })).toThrow();
      expect(() => moveResolvedPictureCropSourceBy(value, { x: 0, y: 0 })).toThrow();
    }
  });

  test("both existing and new rotated source footprints must be representable", () => {
    const impossible = fixture(90, {
      widthRatio: 1,
      heightRatio: 1 / 240,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    impossible.layout = resolvePictureLayout({ x: 1e18, y: 0, width: 1000, height: 240 }, 90);
    expect(() => resizeResolvedPictureCropBy(impossible, "e", { x: 0, y: 0 })).toThrow(
      /world coordinates/,
    );
    expect(() => moveResolvedPictureCropSourceBy(impossible, { x: 0, y: 0 })).toThrow(
      /world coordinates/,
    );
    const before = fixture(37);
    const snapshot = structuredClone(before);
    for (const delta of [
      { x: 1e300, y: 0 },
      { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
    ])
      expect(() => moveResolvedPictureCropSourceBy(before, delta)).toThrow();
    expect(() =>
      resizeResolvedPictureCropBy(before, "se", { x: Number.MAX_VALUE, y: Number.MAX_VALUE }),
    ).toThrow();
    expect(() => moveResolvedPictureCropSourceBy(fixture(), { x: Number.MIN_VALUE, y: 0 })).toThrow(
      /underflows/,
    );
    expect(before).toEqual(snapshot);
  });

  test("edited crop resolves derived geometry while source movement leaves the frame reference intact", () => {
    const before = fixture(37);
    const stale = {
      ...before,
      layout: { ...before.layout, collapsed: true, bounds: { x: 0, y: 0, width: 0, height: 0 } },
    };
    const resized = resizeResolvedPictureCropBy(stale, "e", { x: 70, y: 0 });
    expect(resized.layout.collapsed).toBe(false);
    expect(resized.layout).toEqual(resolvePictureLayout(resized.layout.rect, 37));
    const moved = moveResolvedPictureCropSourceBy(stale, { x: 70, y: 0 });
    expect(moved.layout).toBe(stale.layout);
  });
});
