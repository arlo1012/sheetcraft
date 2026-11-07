// 未执行：按用户要求仅编写测试，不运行检查。
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSheet,
  type ImageAppearance,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import {
  evaluateShapePreset,
  getShapePresetFillBounds,
  isPointInShapePreset,
} from "@sheetcraft/core/shape-presets";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  getPictureSourceColorPoint,
  readPictureSourceColor,
} from "../../../modules/sheet-images/picture-color-sampling";
import { getPictureViewportFragments } from "../../../modules/sheet-images/picture-viewport-fragments";
import {
  createPictureProjectiveGeometry,
  mapPictureProjectivePoint,
} from "../../../shared/images/picture-projective-geometry";
import { framedPicture } from "./framed-picture-fixture";

afterEach(() => vi.restoreAllMocks());

function view() {
  const sheet = createSheet("Sampling", "sampling");
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 600, height: 400 },
  });
  return { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
}

function legacy(): LegacyFloatingImage {
  return {
    id: "legacy",
    assetId: "asset",
    altText: "Source",
    anchor: { row: 0, column: 0 },
    offsetX: 10,
    offsetY: 20,
    width: 200,
    height: 100,
  };
}

function frame() {
  const image = framedPicture();
  image.frame.anchor = { mode: "fixed", x: 100, y: 50, size: { width: 200, height: 100 } };
  image.frame.angleDeg = 0;
  return image;
}

function decodedImage(width = 200, height = 100) {
  const image = document.createElement("img");
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  });
  return image;
}

describe("picture source color coordinates", () => {
  test.each([
    { rotation: 0 as const, horizontal: false, vertical: false, x: 0.25, y: 0.575 },
    { rotation: 90 as const, horizontal: false, vertical: false, x: 0.55, y: 0.575 },
    { rotation: 180 as const, horizontal: false, vertical: false, x: 0.55, y: 0.325 },
    { rotation: 270 as const, horizontal: false, vertical: false, x: 0.25, y: 0.325 },
    { rotation: 0 as const, horizontal: true, vertical: false, x: 0.55, y: 0.575 },
    { rotation: 0 as const, horizontal: false, vertical: true, x: 0.25, y: 0.325 },
    { rotation: 90 as const, horizontal: true, vertical: true, x: 0.25, y: 0.325 },
  ])(
    "undoes ordinary crop/rotation=$rotation/flips=$horizontal,$vertical before sampling",
    ({ rotation, horizontal, vertical, x, y }) => {
      const context = view(),
        image = legacy();
      image.transform = {
        rotation,
        flipHorizontal: horizontal,
        flipVertical: vertical,
        crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
      };
      const before = structuredClone(image);
      const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
      if (fragment.kind !== "legacy") throw new Error("Expected legacy source.");
      const actual = getPictureSourceColorPoint(fragment, {
        x: fragment.rect.x + fragment.rect.width / 4,
        y: fragment.rect.y + fragment.rect.height * 0.75,
      });
      expect(actual?.x).toBeCloseTo(x, 10);
      expect(actual?.y).toBeCloseTo(y, 10);
      expect(image).toEqual(before);
    },
  );

  test("rejects ordinary frame edges, nonfinite points and the reflection-only area", () => {
    const context = view(),
      image = legacy();
    image.height = 125;
    image.transform = { appearance: { reflection: true } };
    const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
    expect(getPictureSourceColorPoint(fragment, { x: 110, y: 70 })).toEqual({ x: 0.5, y: 0.5 });
    expect(getPictureSourceColorPoint(fragment, { x: 110, y: 132 })).toBeNull();
    expect(getPictureSourceColorPoint(fragment, { x: 210, y: 70 })).toBeNull();
    expect(getPictureSourceColorPoint(fragment, { x: NaN, y: 70 })).toBeNull();
  });

  test("maps an offset, zoomed, flipped and rotated frame into the original source", () => {
    const context = view(),
      image = frame();
    image.frame.angleDeg = 90;
    image.frame.flipHorizontal = true;
    image.frame.flipVertical = true;
    image.frame.source = {
      widthRatio: 2,
      heightRatio: 1.5,
      offsetXRatio: 0.25,
      offsetYRatio: -0.25,
    };
    const before = structuredClone(image);
    const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
    // World (240,50) is local (50,10); the source spans (-50,-50)..(350,100).
    const actual = getPictureSourceColorPoint(fragment, { x: 240, y: 50 });
    expect(actual?.x).toBeCloseTo(0.75, 10);
    expect(actual?.y).toBeCloseTo(0.6, 10);
    expect(image).toEqual(before);
  });

  test("rejects source-free frame padding and rotated bounding-box corners", () => {
    const context = view(),
      image = frame();
    image.frame.source = { widthRatio: 0.5, heightRatio: 0.5, offsetXRatio: 0, offsetYRatio: 0 };
    const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
    expect(getPictureSourceColorPoint(fragment, { x: 125, y: 100 })).toBeNull();
    expect(getPictureSourceColorPoint(fragment, { x: 175, y: 87.5 })).toEqual({ x: 0.25, y: 0.25 });
    image.frame.angleDeg = 37;
    const rotated = getPictureViewportFragments([image], context.layout, context)[0]!;
    if (rotated.kind !== "framed") throw new Error("Expected framed source.");
    expect(
      getPictureSourceColorPoint(rotated, {
        x: rotated.geometry.bounds.x + 0.5,
        y: rotated.geometry.bounds.y + 0.5,
      }),
    ).toBeNull();
  });

  test("excludes a donut hole and outside-shape pixels while retaining its source-bearing ring", () => {
    const context = view(),
      image = frame();
    image.frame.cropShape = { preset: "donut" };
    const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
    expect(getPictureSourceColorPoint(fragment, { x: 200, y: 100 })).toBeNull();
    expect(getPictureSourceColorPoint(fragment, { x: 101, y: 51 })).toBeNull();
    const ring = getPictureSourceColorPoint(fragment, { x: 270, y: 100 });
    expect(ring?.x).toBeCloseTo(0.85, 10);
    expect(ring?.y).toBeCloseTo(0.5, 10);
  });

  test.each(["legacy", "framed"] as const)(
    "undoes the actual projective front plane for a %s source",
    (kind) => {
      const context = view();
      const rotation = {
        projection: "perspective" as const,
        xDeg: 30,
        yDeg: 15,
        zDeg: 10,
        perspectiveDeg: 45,
        distanceFromGroundPt: 0,
      };
      const appearance: ImageAppearance = {
        detailedStyle: { rotation3d: { kind: "value", value: rotation } },
      };
      const image = kind === "legacy" ? legacy() : frame();
      image.transform = { appearance };
      if (isFramedPictureObject(image)) image.frame.angleDeg = 37;
      const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
      const projected = mapPictureProjectivePoint(
        createPictureProjectiveGeometry({
          widthPx: 200,
          heightPx: 100,
          rotation: { ...rotation, distanceFromGroundPx: 0 },
        }),
        { x: 50, y: 30 },
      );
      const point =
        fragment.kind === "legacy"
          ? { x: fragment.rect.x + projected.x, y: fragment.rect.y + projected.y }
          : pictureFrameLocalToWorld(fragment.geometry.rect, fragment.geometry.angleDeg, projected);
      const actual = getPictureSourceColorPoint(fragment, point);
      expect(actual?.x).toBeCloseTo(0.25, 8);
      expect(actual?.y).toBeCloseTo(0.3, 8);
    },
  );

  test.each([90, 180])("rejects an edge-on or back-facing projected source at yaw %s", (xDeg) => {
    const context = view(),
      image = frame();
    image.transform = {
      appearance: {
        detailedStyle: {
          rotation3d: {
            kind: "value",
            value: { projection: "parallel", xDeg, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
          },
        },
      },
    };
    const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
    expect(getPictureSourceColorPoint(fragment, { x: 200, y: 100 })).toBeNull();
  });

  test("never samples wire-frame material as if it had source pixels", () => {
    const context = view(),
      image = frame();
    image.transform = {
      appearance: {
        detailedStyle: {
          format3d: {
            kind: "value",
            value: {
              depthPt: 0,
              depthColor: { kind: "rgb", rgb: "#FF0000" },
              contourPt: 0,
              contourColor: { kind: "rgb", rgb: "#00FF00" },
              material: "wire-frame",
              lighting: "flat",
              lightingAngleDeg: 0,
            },
          },
        },
      },
    };
    expect(
      getPictureSourceColorPoint(
        getPictureViewportFragments([image], context.layout, context)[0]!,
        { x: 200, y: 100 },
      ),
    ).toBeNull();
  });
});

test("samples a projected callout tail beyond the original frame using the filled shape's source extent", () => {
  const context = view(),
    image = frame();
  const cropShape = {
    preset: "wedgeRectCallout" as const,
    adjustments: { adj1: -20833, adj2: 62500 },
  };
  image.frame.cropShape = cropShape;
  image.frame.angleDeg = 37;
  const rotation = {
    projection: "perspective" as const,
    xDeg: 30,
    yDeg: 15,
    zDeg: 10,
    perspectiveDeg: 45,
    distanceFromGroundPt: 0,
  };
  image.transform = {
    appearance: { detailedStyle: { rotation3d: { kind: "value", value: rotation } } },
  };
  const shape = evaluateShapePreset(cropShape, 200, 100);
  const tail = { x: 60, y: 110 };
  expect(tail.y).toBeGreaterThan(100);
  expect(isPointInShapePreset(shape, tail)).toBe(true);
  expect(getShapePresetFillBounds(shape)).toEqual({ left: 0, top: 0, width: 200, height: 112.5 });
  const fragment = getPictureViewportFragments([image], context.layout, context)[0]!;
  if (fragment.kind !== "framed") throw new Error("Expected framed source.");
  const projected = mapPictureProjectivePoint(
    createPictureProjectiveGeometry({
      widthPx: 200,
      heightPx: 100,
      rotation: { ...rotation, distanceFromGroundPx: 0 },
    }),
    tail,
  );
  const point = pictureFrameLocalToWorld(
    fragment.geometry.rect,
    fragment.geometry.angleDeg,
    projected,
  );
  const actual = getPictureSourceColorPoint(fragment, point);

  expect(actual?.x).toBeCloseTo(0.3, 8);
  expect(actual?.y).toBeCloseTo(44 / 45, 8);
});

describe("decoded source RGB sampling", () => {
  test("reads one source pixel as uppercase RGB and clamps the far source boundary", () => {
    const image = decodedImage();
    const drawImage = vi.fn(),
      getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([18, 171, 205, 255]) }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as CanvasRenderingContext2D);
    expect(readPictureSourceColor(image, { x: 0.25, y: 0.5 })).toBe("#12ABCD");
    expect(drawImage).toHaveBeenLastCalledWith(image, -50, -50, 200, 100);
    expect(getImageData).toHaveBeenLastCalledWith(0, 0, 1, 1);
    expect(readPictureSourceColor(image, { x: 1, y: 1 })).toBe("#12ABCD");
    expect(drawImage).toHaveBeenLastCalledWith(image, -199, -99, 200, 100);
  });

  test("samples the same bounded 4096-pixel source raster used for picture appearance", () => {
    const image = decodedImage(8192, 4096),
      drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
    } as unknown as CanvasRenderingContext2D);
    expect(readPictureSourceColor(image, { x: 0.75, y: 0.25 })).toBe("#010203");
    expect(drawImage).toHaveBeenCalledWith(image, -3072, -512, 4096, 2048);
  });

  test("returns no color for undecoded images or a fully transparent pixel", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 0]) }),
    } as unknown as CanvasRenderingContext2D);
    expect(readPictureSourceColor(decodedImage(0, 0), { x: 0.5, y: 0.5 })).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(readPictureSourceColor(decodedImage(), { x: 0.5, y: 0.5 })).toBeNull();
  });
});
