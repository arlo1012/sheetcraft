// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import type {
  PictureDetailedStyle,
  PictureFormat3d,
} from "@sheetcraft/core/picture-detailed-style";
import { evaluateShapePreset, isPointInShapePreset } from "@sheetcraft/core/shape-presets";
import type { PictureRasterLayer } from "../../../shared/images/picture-effect-raster";
import {
  createPictureProjectiveGeometry,
  mapPictureProjectivePoint,
  type PictureProjectiveScene,
} from "../../../shared/images/picture-projective-geometry";
import {
  createPictureProjectiveRaster,
  getPictureProjectivePaintBounds,
} from "../../../shared/images/picture-projective-raster";
import * as compositor from "../../../shared/images/picture-detailed-compositor";
import {
  clearPictureDetailedPaintCache,
  planPictureDetailedPaint,
  preparePictureDetailedPaint,
  getPicturePaintDensity,
  getPictureRasterProjection,
} from "../../../shared/images/picture-detailed-render";

const appearance: ImageAppearance = {
  detailedStyle: {
    fill: {
      kind: "value",
      value: {
        kind: "picture",
        assetId: "paint",
        opacity: 1,
        rotateWithShape: true,
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: 1,
          heightRatio: 1,
        },
      },
    },
  },
};
afterEach(() => {
  clearPictureDetailedPaintCache();
  vi.restoreAllMocks();
});
test("pure planning validates bounds without requesting decoded assets", () => {
  const decode = vi.fn();
  const plan = planPictureDetailedPaint({
    width: 120,
    height: 80,
    density: 1,
    appearance,
    resources: { getAssetImage: decode },
  });
  expect(plan).toMatchObject({ kind: "unavailable", missingAssetIds: ["paint"] });
  expect(decode).not.toHaveBeenCalled();
});
test("invalid dimensions and metadata fail before decode or source preparation", () => {
  const decode = vi.fn(),
    sourcePainter = vi.fn();
  const options = {
    key: "invalid",
    sourceIdentity: {},
    width: NaN,
    height: 80,
    density: 1,
    appearance,
    sourcePainter,
    resources: { getAssetImage: decode },
  };
  expect(() => preparePictureDetailedPaint(options)).toThrow();
  expect(() =>
    preparePictureDetailedPaint({
      ...options,
      width: 120,
      resources: { getAssetImage: decode, getAssetSize: () => ({ width: Infinity, height: 1 }) },
    }),
  ).toThrow();
  expect(decode).not.toHaveBeenCalled();
  expect(sourcePainter).not.toHaveBeenCalled();
});
test("unknown pure metadata does not prevent an explicit post-budget decode lookup", () => {
  const image = { width: 20, height: 20 } as HTMLCanvasElement;
  const decode = vi.fn(() => image),
    sourcePainter = vi.fn();
  const kernel = vi
    .spyOn(compositor, "createDetailedPictureRaster")
    .mockImplementation((options) => {
      expect(options.getAssetImage?.("paint")).toBe(image);
      return {
        ...compositor.planDetailedPictureRaster({
          widthPx: 120,
          heightPx: 80,
          pixelDensity: 1,
          style: appearance.detailedStyle,
          getAssetSize: () => ({ width: 20, height: 20 }),
        }),
        kind: "unavailable",
        reason: "asset-pixels-unavailable",
        missingAssetIds: ["paint"],
      };
    });
  expect(
    preparePictureDetailedPaint({
      key: "source",
      sourceIdentity: {},
      width: 120,
      height: 80,
      density: 1,
      appearance,
      resources: { getAssetImage: decode },
      sourcePainter,
    })?.kind,
  ).toBe("unavailable");
  expect(decode).toHaveBeenCalledOnce();
  expect(kernel).toHaveBeenCalledOnce();
  expect(sourcePainter).not.toHaveBeenCalled();
});
test("missing assets do not paint an incomplete source or cache an unavailable result", () => {
  const kernel = vi.spyOn(compositor, "createDetailedPictureRaster"),
    sourcePainter = vi.fn(),
    decode = vi.fn();
  const options = {
    key: "missing",
    sourceIdentity: {},
    width: 120,
    height: 80,
    density: 1,
    appearance,
    sourcePainter,
    resources: { getAssetImage: decode },
  };
  expect(preparePictureDetailedPaint(options)).toMatchObject({
    kind: "unavailable",
    missingAssetIds: ["paint"],
  });
  expect(preparePictureDetailedPaint(options)).toMatchObject({ kind: "unavailable" });
  expect(decode).toHaveBeenCalledTimes(2);
  expect(kernel).not.toHaveBeenCalled();
});
test("density follows actual context scale and rejects degenerate matrices", () => {
  expect(
    getPicturePaintDensity({
      getTransform: () => ({ a: 0, b: 2, c: -3, d: 0 }),
    } as CanvasRenderingContext2D),
  ).toBe(3);
  expect(() =>
    getPicturePaintDensity({
      getTransform: () => ({ a: 0, b: 0, c: 0, d: 0 }),
    } as CanvasRenderingContext2D),
  ).toThrow();
});
test("pure projective adapter tracks density and expanded front outlines", () => {
  const projection = getPictureRasterProjection(
    {
      rotation3d: {
        kind: "value",
        value: { projection: "parallel", xDeg: 45, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
      },
    },
    DEFAULT_WORKBOOK_THEME,
  );
  const bounds = projection.projectedBounds;
  if (typeof bounds !== "function") throw new Error("Missing pure bounds adapter");
  const result = bounds(
    2,
    { left: -4, top: -4, right: 204, bottom: 124 },
    { width: 200, height: 120 },
  );
  expect(result.right - result.left).toBeLessThan(200);
  expect(result.bottom - result.top).toBeGreaterThan(120);
});

const sceneRotation = {
  projection: "parallel" as const,
  xDeg: 45,
  yDeg: 0,
  zDeg: 0,
  distanceFromGroundPt: 0,
};
const sceneStyle: PictureDetailedStyle = { rotation3d: { kind: "value", value: sceneRotation } };
const affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function sourceLayer(width: number, height: number): PictureRasterLayer {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { left: 0, top: 0, surface: { width, height, data } };
}
function alphaCenter(layer: PictureRasterLayer): { x: number; y: number } {
  let xSum = 0,
    ySum = 0,
    weight = 0;
  for (let y = 0; y < layer.surface.height; y++)
    for (let x = 0; x < layer.surface.width; x++) {
      const alpha = layer.surface.data[(y * layer.surface.width + x) * 4 + 3]!;
      xSum += (layer.left + x + 0.5) * alpha;
      ySum += (layer.top + y + 0.5) * alpha;
      weight += alpha;
    }
  expect(weight).toBeGreaterThan(0);
  return { x: xSum / weight, y: ySum / weight };
}
test.each([1, 2])(
  "common scene shifts actual member pixels about one pivot at density %s",
  (density) => {
    const shape = evaluateShapePreset({ preset: "rect" }, 40, 24);
    const centers: number[] = [];
    for (const e of [20, 180]) {
      const projection = getPictureRasterProjection(
        sceneStyle,
        DEFAULT_WORKBOOK_THEME,
        shape,
        undefined,
        {
          widthPx: 240,
          heightPx: 80,
          sourceToScene: { ...affine, e, f: 20 },
        },
      );
      if (!projection.projectSurface || typeof projection.projectedBounds !== "function")
        throw new Error("Missing scene adapter");
      const input = sourceLayer(40 * density, 24 * density);
      const saved = new Uint8ClampedArray(input.surface.data);
      const output = projection.projectSurface(input, density, {
        widthPx: 40 * density,
        heightPx: 24 * density,
      });
      const center = alphaCenter(output);
      centers.push(center.x / density + e);
      expect(Math.abs(center.x / density + e - (120 + (e + 20 - 120) / Math.sqrt(2)))).toBeLessThan(
        0.75,
      );
      expect(Math.abs(center.y / density - 12)).toBeLessThan(0.75);
      const bounds = projection.projectedBounds(
        density,
        { left: 0, top: 0, right: 40 * density, bottom: 24 * density },
        { width: 40 * density, height: 24 * density },
      );
      expect(bounds).toEqual({
        left: output.left,
        top: output.top,
        right: output.left + output.surface.width,
        bottom: output.top + output.surface.height,
      });
      expect(input.surface.data).toEqual(saved);
    }
    expect(Math.abs(centers[1]! - centers[0]! - 160 / Math.sqrt(2))).toBeLessThan(1);
  },
);

test.each([1, 2])(
  "scene frame, explicit pivot and both affine translations follow density %s exactly",
  (density) => {
    const shape = evaluateShapePreset({ preset: "rect" }, 80, 60);
    const format: PictureFormat3d = {
      depthPt: 18,
      depthColor: { kind: "rgb", rgb: "#FF0000" },
      contourPt: 0,
      contourColor: { kind: "rgb", rgb: "#00FF00" },
      material: "flat",
      lighting: "flat",
      lightingAngleDeg: 0,
    };
    const rotation = {
      projection: "perspective" as const,
      xDeg: 23,
      yDeg: 17,
      zDeg: 11,
      perspectiveDeg: 45,
      distanceFromGroundPt: 6,
    };
    const style: PictureDetailedStyle = {
      rotation3d: { kind: "value", value: rotation },
      format3d: { kind: "value", value: format },
    };
    const scene: PictureProjectiveScene = {
      widthPx: 300,
      heightPx: 140,
      pivot: { x: 90, y: 50 },
      sourceToScene: { a: 0.8, b: 0.2, c: -0.3, d: 1.1, e: 20, f: 25 },
      sceneToOutput: { a: 1.5, b: -0.2, c: 0.4, d: 0.9, e: 10, f: -7 },
    };
    const saved = JSON.stringify({ style, scene });
    const projection = getPictureRasterProjection(
      style,
      DEFAULT_WORKBOOK_THEME,
      shape,
      undefined,
      scene,
    );
    if (!projection.projectSurface || typeof projection.projectedBounds !== "function")
      throw new Error("Missing scene adapter");
    const geometry = createPictureProjectiveGeometry({
      widthPx: 80 * density,
      heightPx: 60 * density,
      depthPx: 24 * density,
      rotation: { ...rotation, distanceFromGroundPx: 8 * density },
      scene: {
        ...scene,
        widthPx: scene.widthPx * density,
        heightPx: scene.heightPx * density,
        pivot: { x: 90 * density, y: 50 * density },
        sourceToScene: { ...scene.sourceToScene, e: 20 * density, f: 25 * density },
        sceneToOutput: { ...scene.sceneToOutput!, e: 10 * density, f: -7 * density },
      },
    });
    const input = sourceLayer(80 * density, 60 * density);
    const actual = projection.projectSurface(input, density, {
      widthPx: 80 * density,
      heightPx: 60 * density,
    });
    const expected = createPictureProjectiveRaster({
      geometry,
      input,
      density,
      shapeGeometry: shape,
      theme: DEFAULT_WORKBOOK_THEME,
      format,
    });
    expect(actual).toEqual(expected);
    expect(
      projection.projectedBounds(
        density,
        { left: 0, top: 0, right: 80 * density, bottom: 60 * density },
        { width: 80 * density, height: 60 * density },
      ),
    ).toEqual(
      getPictureProjectivePaintBounds(
        geometry,
        { left: 0, top: 0, right: 80 * density, bottom: 60 * density },
        0,
        shape,
        density,
      ),
    );
    expect(JSON.stringify({ style, scene })).toBe(saved);
  },
);

test("a reflected scene renders real donut contours and keeps its hole transparent", () => {
  const shape = evaluateShapePreset({ preset: "donut" }, 64, 64);
  const format: PictureFormat3d = {
    depthPt: 6,
    depthColor: { kind: "rgb", rgb: "#FF0000" },
    contourPt: 0,
    contourColor: { kind: "rgb", rgb: "#00FF00" },
    material: "flat",
    lighting: "flat",
    lightingAngleDeg: 0,
  };
  const scene: PictureProjectiveScene = {
    widthPx: 400,
    heightPx: 160,
    sourceToScene: { ...affine, a: -1, e: 280, f: 30 },
    sceneToOutput: affine,
  };
  const rotation = { ...sceneRotation, xDeg: 30 };
  const projection = getPictureRasterProjection(
    { rotation3d: { kind: "value", value: rotation }, format3d: { kind: "value", value: format } },
    DEFAULT_WORKBOOK_THEME,
    shape,
    undefined,
    scene,
  );
  const input = sourceLayer(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      input.surface.data[(y * 64 + x) * 4 + 3] = isPointInShapePreset(shape, {
        x: x + 0.5,
        y: y + 0.5,
      })
        ? 255
        : 0;
  const output = projection.projectSurface!(input, 1, { widthPx: 64, heightPx: 64 });
  const geometry = createPictureProjectiveGeometry({
    widthPx: 64,
    heightPx: 64,
    depthPx: 8,
    rotation: { ...rotation, distanceFromGroundPx: 0 },
    scene,
  });
  const hole = mapPictureProjectivePoint(geometry, { x: 32, y: 32 });
  const index =
    (Math.floor(hole.y - output.top) * output.surface.width + Math.floor(hole.x - output.left)) *
      4 +
    3;
  expect(output.surface.data[index]).toBe(0);
  expect(output.surface.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
});

test("ordinary projection retains its exact pixel path and edge-on output never falls back", () => {
  expect(getPictureRasterProjection({}, DEFAULT_WORKBOOK_THEME)).toEqual({});
  const input = sourceLayer(40, 24);
  const projection = getPictureRasterProjection(sceneStyle, DEFAULT_WORKBOOK_THEME);
  expect(projection.projectSurface!(input, 1, { widthPx: 40, heightPx: 24 })).toEqual(
    createPictureProjectiveRaster({
      geometry: createPictureProjectiveGeometry({
        widthPx: 40,
        heightPx: 24,
        rotation: { ...sceneRotation, distanceFromGroundPx: 0 },
      }),
      input,
      density: 1,
      theme: DEFAULT_WORKBOOK_THEME,
    }),
  );
  const edge = getPictureRasterProjection(
    { rotation3d: { kind: "value", value: { ...sceneRotation, xDeg: 90 } } },
    DEFAULT_WORKBOOK_THEME,
  );
  expect(
    edge.projectSurface!(input, 1, { widthPx: 40, heightPx: 24 }).surface.data.every(
      (value) => value === 0,
    ),
  ).toBe(true);
});
