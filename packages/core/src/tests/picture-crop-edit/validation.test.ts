import { describe, expect, test } from "vitest";
import {
  editResolvedPictureCrop,
  resetResolvedPictureCrop,
  type PictureCropEdit,
} from "../../picture-crop-edit.js";
import { resolvePictureLayout, type PictureSourceFrame } from "../../picture-frame.js";
import { fixture } from "./fixture.js";

describe("crop edit validation without silent clamping", () => {
  test.each(["crop-width", "crop-height"] as const)(
    "%s has the manual crop-frame budget",
    (field) => {
      const before = fixture();
      for (const value of [0, -1, 0.5, 10000.01, Infinity, -Infinity, NaN])
        expect(() =>
          editResolvedPictureCrop(before.layout, before.source, { field, value }),
        ).toThrow();
      for (const value of [1, 10000]) {
        const next = editResolvedPictureCrop(before.layout, before.source, { field, value });
        expect(field === "crop-width" ? next.layout.rect.width : next.layout.rect.height).toBe(
          value,
        );
      }
    },
  );
  test.each(["source-width", "source-height"] as const)(
    "%s uses positive representable source geometry without a crop-size limit",
    (field) => {
      const before = fixture();
      for (const value of [0, -1, Infinity, -Infinity, NaN, Number.MIN_VALUE])
        expect(() =>
          editResolvedPictureCrop(before.layout, before.source, { field, value }),
        ).toThrow();
      for (const value of [0.5, 10001, 1000000]) {
        const next = editResolvedPictureCrop(before.layout, before.source, { field, value });
        expect(
          field === "source-width" ? next.source.widthRatio * 360 : next.source.heightRatio * 240,
        ).toBeCloseTo(value, 8);
        expect(next.layout).toEqual(before.layout);
      }
    },
  );
  test.each(["source-offset-x", "source-offset-y"] as const)(
    "%s permits finite far signed padding and refuses unrepresentable offsets",
    (field) => {
      const before = fixture(37);
      for (const value of [Infinity, -Infinity, NaN, Number.MIN_VALUE, 1e300])
        expect(() =>
          editResolvedPictureCrop(before.layout, before.source, { field, value }),
        ).toThrow();
      for (const value of [-1000000, -10001, 10001, 1000000]) {
        const next = editResolvedPictureCrop(before.layout, before.source, { field, value });
        expect(
          field === "source-offset-x"
            ? next.source.offsetXRatio * 360
            : next.source.offsetYRatio * 240,
        ).toBeCloseTo(value, 8);
      }
    },
  );
  test.each(["crop-left", "crop-top"] as const)(
    "%s permits representable signed sheet coordinates",
    (field) => {
      const before = fixture(37);
      for (const value of [-1000000, 1000000]) {
        const next = editResolvedPictureCrop(before.layout, before.source, { field, value });
        expect(field === "crop-left" ? next.layout.rect.x : next.layout.rect.y).toBe(value);
      }
      for (const value of [Infinity, -Infinity, NaN, 1e300])
        expect(() =>
          editResolvedPictureCrop(before.layout, before.source, { field, value }),
        ).toThrow();
    },
  );
  test("unchanged large source axes survive editing only the other dimension", () => {
    const before = fixture(37, {
      widthRatio: 100000 / 360,
      heightRatio: 200000 / 240,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
    const width = editResolvedPictureCrop(before.layout, before.source, {
      field: "source-width",
      value: 500,
    });
    expect(width.source.heightRatio).toBe(before.source.heightRatio);
    const height = editResolvedPictureCrop(before.layout, before.source, {
      field: "source-height",
      value: 500,
    });
    expect(height.source.widthRatio).toBe(before.source.widthRatio);
    const crop = editResolvedPictureCrop(before.layout, before.source, {
      field: "crop-width",
      value: 200,
    });
    expect(crop.source.widthRatio * crop.layout.rect.width).toBe(100000);
    expect(() => resetResolvedPictureCrop(before.layout, before.source)).toThrow(/dimensions/);
  });
  test("Crop Reset refuses current source extents outside the crop-frame budget", () => {
    for (const widthRatio of [0.5 / 360, 10001 / 360]) {
      const before = fixture(0, { widthRatio, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 });
      expect(() => resetResolvedPictureCrop(before.layout, before.source)).toThrow(/dimensions/);
    }
  });
  test("collapsed, subnormal, nonfinite and overflowing source/layout inputs cannot be edited or reset", () => {
    const before = fixture();
    const inputs = [
      { ...before, layout: resolvePictureLayout({ ...before.layout.rect, width: 0 }, 37) },
      {
        ...before,
        layout: resolvePictureLayout({ x: 0, y: 0, width: Number.MIN_VALUE, height: 240 }, 0),
      },
      { ...before, layout: { ...before.layout, rect: { ...before.layout.rect, x: Infinity } } },
      { ...before, layout: { ...before.layout, angleDeg: NaN } },
      { ...before, source: { ...before.source, widthRatio: Number.MIN_VALUE } },
      { ...before, source: { ...before.source, widthRatio: Number.MAX_VALUE } },
      { ...before, source: { ...before.source, offsetXRatio: Number.MAX_VALUE } },
      { ...before, source: { ...before.source, offsetYRatio: Infinity } },
      { ...before, source: { ...before.source, heightRatio: 0 } },
    ];
    for (const input of inputs) {
      expect(() =>
        editResolvedPictureCrop(input.layout, input.source, { field: "crop-left", value: 500 }),
      ).toThrow();
      expect(() => resetResolvedPictureCrop(input.layout, input.source)).toThrow();
    }
  });
  test("rotated source edges must remain physically representable", () => {
    const layout = resolvePictureLayout({ x: 1e18, y: 0, width: 1000, height: 240 }, 90);
    const source = { widthRatio: 1, heightRatio: 1 / 240, offsetXRatio: 0, offsetYRatio: 0 };
    expect(() =>
      editResolvedPictureCrop(layout, source, { field: "source-offset-y", value: 10 }),
    ).toThrow(/world coordinates/);
  });
  test("invalid edit/source records fail without invoking edit accessors or mutating inputs", () => {
    const before = fixture();
    const snapshot = structuredClone(before);
    let getterCalls = 0;
    const accessor = {
      field: "crop-width",
      get value() {
        getterCalls++;
        return 400;
      },
    };
    for (const edit of [
      null,
      [],
      {},
      { field: "width", value: 400 },
      { field: "crop-width", value: "400" },
      { field: "crop-width", value: 400, extra: true },
      accessor,
    ])
      expect(() =>
        editResolvedPictureCrop(before.layout, before.source, edit as PictureCropEdit),
      ).toThrow();
    expect(getterCalls).toBe(0);
    for (const source of [
      null,
      [],
      { ...before.source, extra: true },
      { ...before.source, widthRatio: -1 },
    ])
      expect(() =>
        editResolvedPictureCrop(before.layout, source as PictureSourceFrame, {
          field: "crop-width",
          value: 400,
        }),
      ).toThrow();
    expect(before).toEqual(snapshot);
  });
});
