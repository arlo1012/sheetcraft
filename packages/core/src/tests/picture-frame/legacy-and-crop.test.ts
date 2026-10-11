import { describe, expect, test } from "vitest";
import { createSheet, type FloatingImage, setSheetDimensionHidden } from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import {
  anchorPictureFrameRect,
  pictureFrameFromLegacy,
  pictureFrameLocalToWorld,
  resizePictureCropFrame,
  resolvePictureFrame,
  type PictureFrame,
} from "../../picture-frame.js";
function worldSourcePoint(
  frame: PictureFrame,
  metrics: ReturnType<typeof createPictureSheetMetrics>,
  u: number,
  v: number,
) {
  const result = resolvePictureFrame(frame, metrics);
  const source = result.sourceRect!;
  return pictureFrameLocalToWorld(result.rect, result.angleDeg, {
    x: source.x - result.rect.x + (frame.flipHorizontal ? 1 - u : u) * source.width,
    y: source.y - result.rect.y + (frame.flipVertical ? 1 - v : v) * source.height,
  });
}
const cases = ([0, 90, 180, 270] as const).flatMap((angle) =>
  [false, true].flatMap((flipHorizontal) =>
    [false, true].map((flipVertical) => ({ angle, flipHorizontal, flipVertical })),
  ),
);
describe("legacy source-quarter geometry adapter", () => {
  test.each(cases)(
    "preserves asymmetric crop UV mapping for $angle/$flipHorizontal/$flipVertical",
    ({ angle, flipHorizontal, flipVertical }) => {
      const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
      const rotated = angle === 90 || angle === 270;
      const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.7 };
      const image: FloatingImage = {
        id: "legacy",
        assetId: "asset",
        altText: "Synthetic",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: rotated ? 240 : 360,
        height: rotated ? 360 : 240,
        transform: { rotation: angle, crop, flipHorizontal, flipVertical },
      };
      const before = structuredClone(image);
      const frame = pictureFrameFromLegacy(image, metrics);
      const result = resolvePictureFrame(frame, metrics);
      expect(result.rect.width).toBe(360);
      expect(result.rect.height).toBe(240);
      expect(result.bounds.x).toBeCloseTo(0, 9);
      expect(result.bounds.y).toBeCloseTo(0, 9);
      expect(result.bounds.width).toBeCloseTo(image.width, 9);
      expect(result.bounds.height).toBeCloseTo(image.height, 9);
      for (const { u, v } of [
        { u: 0.2, v: 0.3 },
        { u: 0.1, v: 0.2 },
        { u: 0.7, v: 0.9 },
      ]) {
        let a = ((u - crop.x) / crop.width) * 360;
        let b = ((v - crop.y) / crop.height) * 240;
        if (flipHorizontal) a = 360 - a;
        if (flipVertical) b = 240 - b;
        const old =
          angle === 0
            ? { x: a, y: b }
            : angle === 90
              ? { x: 240 - b, y: a }
              : angle === 180
                ? { x: 360 - a, y: 240 - b }
                : { x: b, y: 360 - a };
        const next = worldSourcePoint(frame, metrics, u, v);
        expect(next.x).toBeCloseTo(old.x, 8);
        expect(next.y).toBeCloseTo(old.y, 8);
      }
      expect(image).toEqual(before);
    },
  );
  test("quarter-turn promotion geometry retains a negative local origin at the sheet edge", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const frame = pictureFrameFromLegacy(
      {
        id: "legacy",
        assetId: "asset",
        altText: "",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 240,
        height: 360,
        transform: { rotation: 90 },
      },
      metrics,
    );
    expect(resolvePictureFrame(frame, metrics).rect).toEqual({
      x: -60,
      y: 60,
      width: 360,
      height: 240,
    });
    expect(frame.anchor.mode === "move-only" && frame.anchor.origin.column).toEqual({
      index: 0,
      offset: -60,
    });
  });
  test("legacy offsets exceeding their anchor cell are not truncated on adaptation", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const frame = pictureFrameFromLegacy(
      {
        id: "legacy",
        assetId: "asset",
        altText: "",
        anchor: { row: 1, column: 1 },
        offsetX: 400,
        offsetY: 500,
        width: 200,
        height: 100,
      },
      metrics,
    );
    expect(resolvePictureFrame(frame, metrics).rect).toEqual({
      x: 496,
      y: 524,
      width: 200,
      height: 100,
    });
  });
});
describe("source-preserving local crop geometry", () => {
  function fixture(mode: "fixed" | "move-only" | "move-and-size" = "fixed", angleDeg = 0) {
    const sheet = createSheet("Synthetic", "s");
    const metrics = createPictureSheetMetrics(sheet);
    const frame: PictureFrame = {
      kind: "object-frame-v1",
      anchor: anchorPictureFrameRect(mode, { x: 100, y: 200, width: 360, height: 240 }, metrics),
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg,
    };
    return { sheet, metrics, frame };
  }
  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "zero-angle %s crop shrink keeps frame left/top and source placement",
    (mode) => {
      const { metrics, frame } = fixture(mode);
      const next = resizePictureCropFrame(frame, { width: 264, height: 144 }, metrics);
      expect(next.anchor.mode).toBe(mode);
      const result = resolvePictureFrame(next, metrics);
      expect(result.rect).toEqual({ x: 100, y: 200, width: 264, height: 144 });
      expect(result.sourceRect).toEqual({ x: 100, y: 200, width: 360, height: 240 });
      expect(next.source.offsetXRatio * result.rect.width).toBe(48);
      expect(next.source.offsetYRatio * result.rect.height).toBe(48);
    },
  );
  test("changing crop left/top shifts the frame but compensates source center offsets", () => {
    const { metrics, frame } = fixture();
    const next = resizePictureCropFrame(frame, { width: 360, height: 240 }, metrics, {
      x: 48,
      y: 24,
    });
    const result = resolvePictureFrame(next, metrics);
    expect(result.rect).toEqual({ x: 148, y: 224, width: 360, height: 240 });
    expect(result.sourceRect).toEqual({ x: 100, y: 200, width: 360, height: 240 });
  });
  test.each([15, 37, 90, 180, 270, 323])(
    "angle %s crop preserves world-space source points and the selected rotated edge",
    (angle) => {
      const { metrics, frame } = fixture("fixed", angle);
      const inset = { x: 30, y: 10 };
      const expectedCorner = pictureFrameLocalToWorld(
        resolvePictureFrame(frame, metrics).rect,
        angle,
        inset,
      );
      const next = resizePictureCropFrame(frame, { width: 264, height: 192 }, metrics, inset);
      const result = resolvePictureFrame(next, metrics);
      expect(result.corners[0].x).toBeCloseTo(expectedCorner.x, 9);
      expect(result.corners[0].y).toBeCloseTo(expectedCorner.y, 9);
      for (const { u, v } of [
        { u: 0, v: 0 },
        { u: 0.3, v: 0.4 },
        { u: 1, v: 1 },
      ]) {
        const old = worldSourcePoint(frame, metrics, u, v);
        const current = worldSourcePoint(next, metrics, u, v);
        expect(current.x).toBeCloseTo(old.x, 8);
        expect(current.y).toBeCloseTo(old.y, 8);
      }
    },
  );
  test("15-degree size change produces the desktop-observed rounded crop left/top", () => {
    const { metrics, frame } = fixture("fixed", 15);
    frame.anchor = {
      mode: "fixed",
      x: 1.84 * 96,
      y: 0.84 * 96,
      size: { width: 4.5 * 96, height: 3 * 96 },
    };
    const next = resizePictureCropFrame(frame, { width: 3.5 * 96, height: 2.5 * 96 }, metrics);
    const result = resolvePictureFrame(next, metrics);
    expect((result.rect.x / 96).toFixed(2)).toBe("1.92");
    expect((result.rect.y / 96).toFixed(2)).toBe("0.72");
    expect((next.source.offsetXRatio * result.rect.width) / 96).toBeCloseTo(0.5, 10);
    expect((next.source.offsetYRatio * result.rect.height) / 96).toBeCloseTo(0.25, 10);
  });
  test("a collapsed move-size frame cannot be silently guessed into a one-pixel crop", () => {
    const { sheet, frame } = fixture("move-and-size");
    for (let row = 8; row <= 18; row++) setSheetDimensionHidden(sheet, "row", row, true);
    expect(() =>
      resizePictureCropFrame(frame, { width: 100, height: 100 }, createPictureSheetMetrics(sheet)),
    ).toThrow(/collapsed/);
  });
});

describe("crop preserves hidden logical owner identity", () => {
  test.each([360, 264])(
    "horizontal crop width %s retains an untouched hidden row inset",
    (width) => {
      const sheet = createSheet("Synthetic", "s");
      const before = createPictureSheetMetrics(sheet);
      const frame: PictureFrame = {
        kind: "object-frame-v1",
        anchor: anchorPictureFrameRect(
          "move-only",
          { x: 194, y: 98, width: 360, height: 240 },
          before,
        ),
        source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        angleDeg: 0,
      };
      setSheetDimensionHidden(sheet, "row", 4, true);
      const hidden = createPictureSheetMetrics(sheet);
      const cropped = resizePictureCropFrame(frame, { width, height: 240 }, hidden);
      expect(cropped.anchor.mode === "move-only" && cropped.anchor.origin.row).toEqual({
        index: 4,
        offset: 2,
      });
      setSheetDimensionHidden(sheet, "row", 4, false);
      expect(resolvePictureFrame(cropped, createPictureSheetMetrics(sheet)).rect.y).toBe(98);
    },
  );
});
