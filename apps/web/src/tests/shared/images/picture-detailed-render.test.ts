import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
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
