// @vitest-environment node
import { expect, test } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { PictureFormat3d } from "@sheetcraft/core/picture-detailed-style";
import {
  evaluateShapePreset,
  getShapePresetFillBounds,
  isPointInShapePreset,
  type ShapePresetGeometry,
} from "@sheetcraft/core/shape-presets";
import type { PictureRasterLayer } from "../../../shared/images/picture-effect-raster";
import {
  hitPictureProjectiveFront,
  mapPictureProjectivePoint,
  type PictureProjectiveGeometry,
  type PictureProjectiveHomography,
} from "../../../shared/images/picture-projective-geometry";
import { createPictureProjectiveGeometry } from "../../../shared/images/picture-projective-geometry";
import {
  createPictureProjectiveRaster,
  getPictureProjectivePaintBounds,
  preflightPictureShapeProjectiveRaster,
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

function shapeSource(shape: ShapePresetGeometry, density = 1): PictureRasterLayer {
  const box = getShapePresetFillBounds(shape)!;
  const left = Math.floor(Math.min(0, box.left) * density),
    top = Math.floor(Math.min(0, box.top) * density);
  const width = Math.ceil(Math.max(shape.width, box.left + box.width) * density) - left;
  const height = Math.ceil(Math.max(shape.height, box.top + box.height) * density) - top;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const filled = isPointInShapePreset(shape, {
        x: (left + x + 0.5) / density,
        y: (top + y + 0.5) / density,
      });
      const index = (y * width + x) * 4;
      data[index] = filled ? 100 : 255;
      data[index + 1] = filled ? 150 : 0;
      data[index + 2] = filled ? 200 : 255;
      data[index + 3] = filled ? 255 : 0;
    }
  return { surface: { width, height, data }, left, top };
}
function pixel(layer: PictureRasterLayer, x: number, y: number): readonly number[] {
  const px = Math.floor(x - layer.left),
    py = Math.floor(y - layer.top);
  if (px < 0 || py < 0 || px >= layer.surface.width || py >= layer.surface.height)
    return [0, 0, 0, 0];
  return Array.from(
    layer.surface.data.slice(
      (py * layer.surface.width + px) * 4,
      (py * layer.surface.width + px) * 4 + 4,
    ),
  );
}
test("ellipse depth paints a curved solid, with no rectangle corner side pixels", () => {
  const shapeGeometry = evaluateShapePreset({ preset: "ellipse" }, 64, 64);
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 12,
    rotation: { ...rotation, xDeg: 45 },
  });
  const input = shapeSource(shapeGeometry),
    before = input.surface.data.slice();
  const result = createPictureProjectiveRaster({
    geometry: g,
    input,
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(pixel(result, 58, 3)[3]).toBe(0);
  expect(pixel(result, 58, 32)).toEqual([255, 0, 0, 255]);
  expect(input.surface.data).toEqual(before);
});
test("donut front/back holes stay transparent while real inner walls can be visible", () => {
  const shapeGeometry = evaluateShapePreset({ preset: "donut" }, 64, 64);
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 35, yDeg: 20 },
  });
  const result = createPictureProjectiveRaster({
    geometry: g,
    input: shapeSource(shapeGeometry),
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(pixel(result, 32, 32)[3]).toBe(0);
  let innerRed = 0;
  for (let y = 20; y < 44; y++)
    for (let x = 20; x < 44; x++) {
      const rgba = pixel(result, x, y);
      if (rgba[0] === 255 && rgba[1] === 0 && rgba[3]! > 0) innerRed++;
    }
  expect(innerRed).toBeGreaterThan(0);
  const back = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 180 },
  });
  const backResult = createPictureProjectiveRaster({
    geometry: back,
    input: shapeSource(shapeGeometry),
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(pixel(backResult, 32, 32)[3]).toBe(0);
  expect(pixel(backResult, 32, 5)).toEqual([255, 0, 0, 255]);
});
test("concave front, side and back caps preserve empty notch pixels", () => {
  const shapeGeometry: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [
      {
        filled: true,
        stroke: true,
        commands: [
          ["M", 0, 0],
          ["L", 24, 0],
          ["L", 24, 40],
          ["L", 64, 40],
          ["L", 64, 64],
          ["L", 0, 64],
          ["Z"],
        ],
      },
    ],
  };
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 35 },
  });
  const result = createPictureProjectiveRaster({
    geometry: g,
    input: shapeSource(shapeGeometry),
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(pixel(result, 60, 10)[3]).toBe(0);
  const back = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, xDeg: 180 },
  });
  const backResult = createPictureProjectiveRaster({
    geometry: back,
    input: shapeSource(shapeGeometry),
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(pixel(backResult, 12, 12)[3]).toBe(0);
  expect(pixel(backResult, 52, 12)).toEqual([255, 0, 0, 255]);
});
test("callout tails and their actual contour extend beyond the original frame at density two", () => {
  const shapeGeometry = evaluateShapePreset({ preset: "wedgeRectCallout" }, 32, 32);
  const g = createPictureProjectiveGeometry({ widthPx: 64, heightPx: 64, depthPx: 6, rotation });
  const input = shapeSource(shapeGeometry, 2);
  const result = createPictureProjectiveRaster({
    geometry: g,
    input,
    shapeGeometry,
    density: 2,
    theme: DEFAULT_WORKBOOK_THEME,
    format: { ...format(), contourPt: 1 },
  });
  expect(result.top + result.surface.height).toBeGreaterThan(64);
  let outside = 0;
  for (let y = 64; y < result.top + result.surface.height; y++)
    for (let x = result.left; x < result.left + result.surface.width; x++)
      if (pixel(result, x, y)[3]! > 0) outside++;
  expect(outside).toBeGreaterThan(0);
  expect(g.selectionBounds.bottom).toBe(64);
});
test("shape wire-frame uses curved strokes and hole rims, with no frame-corner box", () => {
  const shapeGeometry = evaluateShapePreset({ preset: "donut" }, 64, 64);
  const g = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 6,
    rotation: { ...rotation, xDeg: 35 },
  });
  const result = createPictureProjectiveRaster({
    geometry: g,
    input: shapeSource(shapeGeometry),
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: { ...format(), material: "wire-frame" },
  });
  expect(pixel(result, 32, 32)[3]).toBe(0);
  const corner = mapPictureProjectivePoint(g, { x: 0, y: 0 });
  expect(pixel(result, corner.x, corner.y)[3]).toBe(0);
  expect(result.surface.data.some((value, index) => index % 4 === 1 && value === 255)).toBe(true);
});
test("shape exact edge-on and zero-depth back views retain the established plane semantics", () => {
  const shapeGeometry = evaluateShapePreset({ preset: "ellipse" }, 40, 20),
    input = shapeSource(shapeGeometry);
  const edge = createPictureProjectiveGeometry({
    widthPx: 40,
    heightPx: 20,
    rotation: { ...rotation, xDeg: 90 },
  });
  const result = createPictureProjectiveRaster({
    geometry: edge,
    input,
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
  });
  expect(result.surface.data.every((value) => value === 0)).toBe(true);
  const back = createPictureProjectiveGeometry({
    widthPx: 40,
    heightPx: 20,
    rotation: { ...rotation, xDeg: 180 },
  });
  const backResult = createPictureProjectiveRaster({
    geometry: back,
    input,
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
  });
  expect(pixel(backResult, 20, 10)).toEqual([100, 150, 200, 255]);
  expect(pixel(backResult, 1, 1)[3]).toBe(0);
});
test("shape preflight rejects horizon, density mismatch and 4MP/side overflow", () => {
  const shape = evaluateShapePreset({ preset: "ellipse" }, 64, 64);
  const g = createPictureProjectiveGeometry({ widthPx: 64, heightPx: 64, rotation });
  expect(() =>
    getPictureProjectivePaintBounds(g, { left: 0, top: 0, right: 64, bottom: 64 }, 0, shape, 2),
  ).toThrow(/match/);
  const huge = createPictureProjectiveGeometry({ widthPx: 4096, heightPx: 4096, rotation });
  const hugeShape = evaluateShapePreset({ preset: "ellipse" }, 4096, 4096);
  expect(() =>
    createPictureProjectiveRaster({
      geometry: huge,
      input: { surface: surface(), left: 0, top: 0 },
      shapeGeometry: hugeShape,
      density: 1,
      theme: DEFAULT_WORKBOOK_THEME,
    }),
  ).toThrow(/rendering budget/);
});

test("pure bounds rejects contour edge-work before a source/Canvas callback can run", () => {
  // 1000-logical-pixel ellipse, 1pt depth, 1000pt contour, density 0.75:
  // expanded output fits 4096/4MP, but hundreds of curve-edge boxes exceed 128M.
  const density = 0.75,
    shape = evaluateShapePreset({ preset: "ellipse" }, 1000, 1000);
  const g = createPictureProjectiveGeometry({ widthPx: 750, heightPx: 750, depthPx: 1, rotation });
  const sourceBounds = { left: 0, top: 0, right: 750, bottom: 750 };
  let sourceOrCanvasCalled = false;
  expect(() => {
    getPictureProjectivePaintBounds(g, sourceBounds, 1000, shape, density);
    sourceOrCanvasCalled = true;
  }).toThrow(/pixel\/edge work budget/);
  expect(sourceOrCanvasCalled).toBe(false);
  expect(() =>
    preflightPictureShapeProjectiveRaster(g, sourceBounds, 1000, shape, density),
  ).toThrow(/pixel\/edge work budget/);
});
test("pure bounds preflights final-density curve precision and aggregate point limits", () => {
  const shape = evaluateShapePreset({ preset: "ellipse" }, 64, 64);
  const magnified = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 1,
    rotation: {
      ...rotation,
      projection: "perspective",
      perspectiveDeg: 120,
      distanceFromGroundPx: 70,
    },
  });
  expect(() =>
    getPictureProjectivePaintBounds(
      magnified,
      { left: 0, top: 0, right: 64, bottom: 64 },
      0,
      shape,
      1,
    ),
  ).toThrow(/subdivision precision/);
  const largeShape = evaluateShapePreset({ preset: "ellipse" }, 3500, 1000);
  const repeated = { ...largeShape, paths: Array.from({ length: 16 }, () => largeShape.paths[0]!) };
  const g = createPictureProjectiveGeometry({
    widthPx: 3500,
    heightPx: 1000,
    depthPx: 1,
    rotation,
  });
  expect(() =>
    getPictureProjectivePaintBounds(
      g,
      { left: 0, top: 0, right: 3500, bottom: 1000 },
      0,
      repeated,
      1,
    ),
  ).toThrow(/aggregate flattened point budget/);
});
test("pure bounds preflights actual union intersections before asset work", () => {
  const commands: ShapePresetGeometry["paths"][number]["commands"][number][] = [];
  for (let index = 0; index < 997; index++) {
    const angle = (((index * 499) % 997) / 997) * 2 * Math.PI;
    commands.push([index === 0 ? "M" : "L", 32 + 30 * Math.cos(angle), 32 + 30 * Math.sin(angle)]);
  }
  commands.push(["Z"]);
  const shape: ShapePresetGeometry = {
    width: 64,
    height: 64,
    handles: [],
    adjustments: {},
    paths: [{ filled: true, stroke: true, commands }],
  };
  const g = createPictureProjectiveGeometry({ widthPx: 64, heightPx: 64, depthPx: 4, rotation });
  expect(() =>
    getPictureProjectivePaintBounds(g, { left: 0, top: 0, right: 64, bottom: 64 }, 0, shape, 1),
  ).toThrow(/intersection split budget/);
});

function lowDenominatorScene(
  ground: number,
  depth: number,
  source: { x: number; y: number; z: number },
  target = { x: 8.5, y: -7.5 },
): PictureProjectiveGeometry {
  const input = {
    widthPx: 65_536,
    heightPx: 65_536,
    depthPx: depth,
    rotation: {
      projection: "perspective" as const,
      xDeg: -45,
      yDeg: 0,
      zDeg: 45,
      perspectiveDeg: 120,
      distanceFromGroundPx: ground,
    },
    scene: {
      widthPx: 1e-6,
      heightPx: 1e-6,
      pivot: { x: 0, y: 0 },
      sourceToScene: { a: 1, b: 0, c: 0, d: 1, e: 9_000_000, f: 0 },
      sceneToOutput: { a: 10_000_000, b: 0, c: 0, d: 10_000_000, e: 0, f: 0 },
    },
  };
  const initial = createPictureProjectiveGeometry(input),
    m = initial.sourceToScreenMatrix;
  const w = m[12] * source.x + m[13] * source.y + m[14] * source.z + m[15];
  const q = {
    x: (m[0] * source.x + m[1] * source.y + m[2] * source.z + m[3]) / w,
    y: (m[4] * source.x + m[5] * source.y + m[6] * source.z + m[7]) / w,
  };
  return createPictureProjectiveGeometry({
    ...input,
    scene: {
      ...input.scene,
      sceneToOutput: { ...input.scene.sceneToOutput, e: target.x - q.x, f: target.y - q.y },
    },
  });
}
function positiveSmallDenominator(
  inverse: PictureProjectiveHomography,
  target: { x: number; y: number },
): void {
  const w = inverse[6] * target.x + inverse[7] * target.y + inverse[8];
  expect(w).toBeGreaterThan(0);
  expect(w).toBeLessThan(1e-12);
}
function sourcePatch(): PictureRasterLayer {
  return {
    left: 32_768,
    top: 32_768,
    surface: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) },
  };
}
function largeSourceRectangle(): ShapePresetGeometry {
  return {
    width: 65_536,
    height: 65_536,
    handles: [],
    adjustments: {},
    paths: [
      {
        filled: true,
        stroke: false,
        commands: [["M", 0, 0], ["L", 65_536, 0], ["L", 65_536, 65_536], ["L", 0, 65_536], ["Z"]],
      },
    ],
  };
}
test("scene front texture samples a positive low inverse denominator using a one-pixel source patch", () => {
  const source = { x: 32_768.5, y: 32_768.5, z: 0 },
    target = { x: 8.5, y: -7.5 };
  const geometry = lowDenominatorScene(-65_536, 0, source, target);
  positiveSmallDenominator(geometry.front.inverseHomography!, target);
  const hit = hitPictureProjectiveFront(geometry, target)!;
  expect(Math.abs(hit.x - source.x)).toBeLessThan(1 / 1024);
  expect(Math.abs(hit.y - source.y)).toBeLessThan(1 / 1024);
  const input = sourcePatch();
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(result.surface.width * result.surface.height).toBeLessThan(25);
  expect(pixel(result, target.x, target.y)[3]).toBeGreaterThan(0);
  expect(Array.from(input.surface.data)).toEqual([255, 255, 255, 255]);
});
test("scene shape back caps sample finite positive inverse denominators below the ordinary cutoff", () => {
  const target = { x: 8.5, y: -7.5 };
  const geometry = lowDenominatorScene(65_536, 8, { x: 32_768.5, y: 32_768.5, z: -8 }, target);
  expect(geometry.front.facing).toBe("back");
  expect(geometry.back!.facing).toBe("front");
  positiveSmallDenominator(geometry.back!.inverseHomography!, target);
  const result = createPictureProjectiveRaster({
    geometry,
    input: sourcePatch(),
    shapeGeometry: largeSourceRectangle(),
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(result.surface.width * result.surface.height).toBeLessThan(25);
  expect(pixel(result, target.x, target.y)).toEqual([255, 0, 0, 255]);
});
test("scene contour sides retain low-denominator quarter-pixel coverage without large source allocation", () => {
  const target = { x: 8.25, y: -7.75 };
  const geometry = lowDenominatorScene(-65_536, 65_536, { x: 0, y: 32_768, z: -32_768 }, target);
  const shapeGeometry = largeSourceRectangle(),
    input = sourcePatch();
  const plan = preflightPictureShapeProjectiveRaster(
    geometry,
    { left: input.left, top: input.top, right: input.left + 1, bottom: input.top + 1 },
    0,
    shapeGeometry,
    1,
  );
  expect(plan.shape.sides).toHaveLength(1);
  positiveSmallDenominator(plan.shape.sides[0]!.inverse, target);
  const result = createPictureProjectiveRaster({
    geometry,
    input,
    shapeGeometry,
    density: 1,
    theme: DEFAULT_WORKBOOK_THEME,
    format: format(),
  });
  expect(result.surface.width * result.surface.height).toBeLessThan(25);
  expect(pixel(result, 8.5, -7.5)[3]).toBeGreaterThan(0);
  expect(pixel(result, 8.5, -7.5).slice(0, 3)).toEqual([255, 0, 0]);
});
