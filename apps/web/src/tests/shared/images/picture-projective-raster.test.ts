// @vitest-environment node
import { expect, test } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { PictureFormat3d } from "@sheetcraft/core/picture-detailed-style";
import { createPictureProjectiveGeometry } from "../../../shared/images/picture-projective-geometry";
import {
  createPictureProjectiveRaster,
  getPictureProjectivePaintBounds,
} from "../../../shared/images/picture-projective-raster";

const rotation = {
  projection: "parallel" as const,
  xDeg: 0,
  yDeg: 0,
  zDeg: 0,
  distanceFromGroundPx: 0,
};
function surface(width = 2, height = 2) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 100;
    data[i + 1] = 150;
    data[i + 2] = 200;
    data[i + 3] = 255;
  }
  return { width, height, data };
}
function format(): PictureFormat3d {
  return {
    depthPt: 1,
    depthColor: { kind: "rgb", rgb: "#FF0000" },
    contourPt: 0,
    contourColor: { kind: "rgb", rgb: "#00FF00" },
    material: "flat",
    lighting: "flat",
    lightingAngleDeg: 0,
  };
}

test("identity reconstruction retains exact source pixels and leaves all input bytes intact", () => {
  const input = { surface: surface(), left: 0, top: 0 };
  const before = structuredClone(input);
  const geometry = createPictureProjectiveGeometry({ widthPx: 2, heightPx: 2, rotation });
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
  });
  const i = (-result.top * result.surface.width - result.left) * 4;
  expect(Array.from(result.surface.data.slice(i, i + 4))).toEqual([100, 150, 200, 255]);
  expect(input).toEqual(before);
  expect(geometry.selectionBounds).toEqual({ left: 0, top: 0, right: 2, bottom: 2 });
});
test("premultiplied projective interpolation cannot reveal RGB hidden under transparent alpha", () => {
  const input = {
    surface: { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 255, 0]) },
    left: 0,
    top: 0,
  };
  const geometry = createPictureProjectiveGeometry({
    widthPx: 2,
    heightPx: 1,
    rotation: { ...rotation, zDeg: 30 },
  });
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
  });
  for (let i = 0; i < result.surface.data.length; i += 4)
    if (result.surface.data[i + 3]) {
      expect(result.surface.data[i]).toBe(255);
      expect(result.surface.data[i + 2]).toBe(0);
    }
});
test("actual perspective produces a varying silhouette rather than a single affine rectangle", () => {
  const input = { surface: surface(40, 40), left: 0, top: 0 };
  const geometry = createPictureProjectiveGeometry({
    widthPx: 40,
    heightPx: 40,
    rotation: { ...rotation, projection: "perspective", perspectiveDeg: 45, xDeg: 45 },
  });
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
  });
  const heights: number[] = [];
  for (let x = 0; x < result.surface.width; x++) {
    let count = 0;
    for (let y = 0; y < result.surface.height; y++)
      if (result.surface.data[(y * result.surface.width + x) * 4 + 3]! > 200) count++;
    if (count > 0) heights.push(count);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(3);
});
test("depth creates real red lit side pixels and contour creates real green edges", () => {
  const input = { surface: surface(12, 12), left: 0, top: 0 };
  const geometry = createPictureProjectiveGeometry({
    widthPx: 12,
    heightPx: 12,
    depthPx: 6,
    rotation: { ...rotation, xDeg: 45 },
  });
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
    format: format(),
  });
  expect(
    Array.from(result.surface.data).some(
      (value, i) => i % 4 === 0 && value === 255 && result.surface.data[i + 1] === 0,
    ),
  ).toBe(true);
  const outlined = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
    format: { ...format(), contourPt: 1.5 },
  });
  expect(
    Array.from(outlined.surface.data).some(
      (value, i) => i % 4 === 1 && value === 255 && outlined.surface.data[i - 1] === 0,
    ),
  ).toBe(true);
});
test("zero-depth back view is explicitly double-sided and wire-frame has outline without source pixels", () => {
  const input = { surface: surface(12, 12), left: 0, top: 0 };
  const geometry = createPictureProjectiveGeometry({
    widthPx: 12,
    heightPx: 12,
    rotation: { ...rotation, xDeg: 180 },
  });
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
  });
  expect(result.surface.data.some((value, index) => index % 4 === 3 && value === 255)).toBe(true);
  const wire = createPictureProjectiveRaster({
    geometry,
    input,
    theme: DEFAULT_WORKBOOK_THEME,
    density: 1,
    format: { ...format(), material: "wire-frame", depthPt: 0 },
  });
  expect(wire.surface.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  const center =
    (Math.round(6 - wire.top) * wire.surface.width + Math.round(6 - wire.left)) * 4 + 3;
  expect(wire.surface.data[center]).toBe(0);
});
test("paint bounds include expanded outline input without changing selection", () => {
  const geometry = createPictureProjectiveGeometry({ widthPx: 12, heightPx: 12, rotation });
  const bounds = getPictureProjectivePaintBounds(
    geometry,
    { left: -4, top: -3, right: 16, bottom: 15 },
    2,
  );
  expect(bounds.left).toBeLessThan(-4);
  expect(bounds.top).toBeLessThan(-3);
  expect(geometry.selectionBounds.left).toBe(0);
});
test("invalid data, unsafe density and projected allocations reject without mutation", () => {
  const input = { surface: surface(), left: 0, top: 0 };
  const geometry = createPictureProjectiveGeometry({ widthPx: 2, heightPx: 2, rotation });
  expect(() =>
    createPictureProjectiveRaster({
      geometry,
      input,
      theme: DEFAULT_WORKBOOK_THEME,
      density: Number.NaN,
    }),
  ).toThrow();
  expect(() =>
    createPictureProjectiveRaster({
      geometry,
      input: { ...input, left: Number.NaN },
      theme: DEFAULT_WORKBOOK_THEME,
      density: 1,
    }),
  ).toThrow();
  const huge = createPictureProjectiveGeometry({ widthPx: 65536, heightPx: 65536, rotation });
  expect(() =>
    createPictureProjectiveRaster({
      geometry: huge,
      input,
      theme: DEFAULT_WORKBOOK_THEME,
      density: 1,
    }),
  ).toThrow();
});

test.each(["xDeg", "yDeg"] as const)(
  "exact edge-on %s without extrusion retains selection and paints a bounded empty surface",
  (axis) => {
    const geometry = createPictureProjectiveGeometry({
      widthPx: 40,
      heightPx: 20,
      rotation: { ...rotation, [axis]: 90 },
    });
    const result = createPictureProjectiveRaster({
      geometry,
      input: { surface: surface(40, 20), left: 0, top: 0 },
      theme: DEFAULT_WORKBOOK_THEME,
      density: 1,
    });
    expect(geometry.selectionBounds).toEqual({ left: 0, top: 0, right: 40, bottom: 20 });
    expect(result.surface.data.every((channel) => channel === 0)).toBe(true);
    expect(result.surface.width * result.surface.height).toBeLessThan(200);
  },
);
