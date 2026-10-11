import { describe, expect, test } from "vitest";
import {
  createSheet,
  setSheetDimensionHidden,
  setRowHeight,
  setColumnWidth,
} from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import {
  anchorPictureFrameRect,
  arePictureFramesEqual,
  clonePictureFrame,
  normalizePictureFrame,
  pictureFrameContainsPoint,
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  resolvePictureFrame,
  type PictureFrame,
} from "../../picture-frame.js";
const source = { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
function fixed(): PictureFrame {
  return {
    kind: "object-frame-v1",
    anchor: { mode: "fixed", x: 100, y: 200, size: { width: 360, height: 240 } },
    source: { ...source },
    angleDeg: 0,
  };
}
describe("explicit picture frame geometry", () => {
  test.each([
    [-37, 323],
    [397, 37],
    [720, 0],
    [-0, 0],
    [1e-14, 1e-14],
  ])("normalizes angle %s to %s without integer rounding", (angle, normalized) => {
    expect(normalizePictureFrame({ ...fixed(), angleDeg: angle }).angleDeg).toBe(normalized);
  });
  test("normalization and clone detach every nested source and logical point", () => {
    const sheet = createSheet("Synthetic", "s");
    const metrics = createPictureSheetMetrics(sheet);
    const original: PictureFrame = {
      ...fixed(),
      anchor: anchorPictureFrameRect(
        "move-and-size",
        { x: 194, y: 98, width: 360, height: 240 },
        metrics,
      ),
      flipHorizontal: true,
    };
    const copied = clonePictureFrame(original);
    copied.source.offsetXRatio = 0.5;
    if (copied.anchor.mode === "move-and-size") copied.anchor.start.column.offset = 0;
    expect(original.source.offsetXRatio).toBe(0);
    if (original.anchor.mode === "move-and-size")
      expect(original.anchor.start.column.offset).toBe(2);
    expect(arePictureFramesEqual(original, clonePictureFrame(original))).toBe(true);
    expect(arePictureFramesEqual(original, copied)).toBe(false);
  });
  test.each([
    "unknown-tag",
    "legacy-field",
    "bad-mode",
    "bad-source",
    "negative-size",
    "point-field",
    "zero-logical-span",
    "nan-angle",
    "bad-flip",
  ])("rejects incompatible %s payload before use", (kind) => {
    const value = fixed() as unknown as Record<string, unknown>;
    if (kind === "unknown-tag") value.kind = "v99";
    if (kind === "legacy-field") value.rotation = 90;
    if (kind === "bad-mode") value.anchor = { mode: "guess", size: { width: 1, height: 1 } };
    if (kind === "bad-source") value.source = { ...source, widthRatio: 0 };
    if (kind === "negative-size")
      value.anchor = { mode: "fixed", x: 0, y: 0, size: { width: -1, height: 100 } };
    if (kind === "point-field")
      value.anchor = {
        mode: "move-only",
        origin: { column: { index: 0, offset: 0, ignored: 1 }, row: { index: 0, offset: 0 } },
        size: { width: 10, height: 10 },
      };
    if (kind === "zero-logical-span")
      value.anchor = {
        mode: "move-and-size",
        start: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
      };
    if (kind === "nan-angle") value.angleDeg = NaN;
    if (kind === "bad-flip") value.flipHorizontal = "yes";
    expect(() => normalizePictureFrame(value as unknown as PictureFrame)).toThrow();
  });
  test("source may be smaller than the crop frame, offset outside it or independently stretched", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const result = resolvePictureFrame(
      {
        ...fixed(),
        source: { widthRatio: 0.5, heightRatio: 2, offsetXRatio: -1, offsetYRatio: 0.25 },
      },
      metrics,
    );
    expect(result.sourceRect).toEqual({ x: -170, y: 140, width: 180, height: 480 });
  });
  test("local dimensions and center remain stable under arbitrary rotation", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const result = resolvePictureFrame({ ...fixed(), angleDeg: 37 }, metrics);
    expect(result.rect).toEqual({ x: 100, y: 200, width: 360, height: 240 });
    expect(result.bounds.width).toBeCloseTo(
      360 * Math.cos((37 * Math.PI) / 180) + 240 * Math.sin((37 * Math.PI) / 180),
      9,
    );
    for (const point of result.corners) expect(pictureFrameContainsPoint(result, point)).toBe(true);
    expect(pictureFrameContainsPoint(result, { x: result.bounds.x, y: result.bounds.y })).toBe(
      false,
    );
    expect(pictureFrameContainsPoint(result, { x: 280, y: 320 })).toBe(true);
    const local = { x: 33, y: 77 };
    const world = pictureFrameLocalToWorld(result.rect, 37, local);
    expect(pictureFrameWorldToLocal(result.rect, 37, world).x).toBeCloseTo(local.x, 10);
    expect(pictureFrameWorldToLocal(result.rect, 37, world).y).toBeCloseTo(local.y, 10);
  });
  test("finite enormous logical extents hit without area overflow", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const result = resolvePictureFrame(
      {
        ...fixed(),
        anchor: {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
          end: {
            column: { index: metrics.columns.count, offset: 1e200 },
            row: { index: metrics.rows.count, offset: 1e200 },
          },
        },
      },
      metrics,
    );
    expect(pictureFrameContainsPoint(result, { x: 5e199, y: 5e199 })).toBe(true);
    for (const corner of result.corners)
      expect(pictureFrameContainsPoint(result, corner)).toBe(true);
    expect(pictureFrameContainsPoint(result, { x: 2e200, y: 5e199 })).toBe(false);
  });
  test("move-only follows preceding rows while keeping local size; fixed does neither", () => {
    const sheet = createSheet("Synthetic", "s");
    const initial = createPictureSheetMetrics(sheet);
    const moving: PictureFrame = {
      ...fixed(),
      anchor: anchorPictureFrameRect(
        "move-only",
        { x: 194, y: 98, width: 360, height: 240 },
        initial,
      ),
    };
    setRowHeight(sheet, 0, 64);
    setColumnWidth(sheet, 0, 136);
    const next = createPictureSheetMetrics(sheet);
    expect(resolvePictureFrame(moving, next).rect).toEqual({
      x: 234,
      y: 138,
      width: 360,
      height: 240,
    });
    expect(resolvePictureFrame(fixed(), next).rect).toEqual({
      x: 100,
      y: 200,
      width: 360,
      height: 240,
    });
    setSheetDimensionHidden(sheet, "row", 4, true);
    expect(resolvePictureFrame(moving, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 234,
      y: 136,
      width: 360,
      height: 240,
    });
  });
  test("durable move-size endpoints expand per axis even with a stable source ratio", () => {
    const sheet = createSheet("Synthetic", "s");
    const initial = createPictureSheetMetrics(sheet);
    const frame: PictureFrame = {
      ...fixed(),
      anchor: anchorPictureFrameRect(
        "move-and-size",
        { x: 194, y: 98, width: 360, height: 240 },
        initial,
      ),
    };
    setRowHeight(sheet, 4, 64);
    setColumnWidth(sheet, 2, 136);
    const next = resolvePictureFrame(frame, createPictureSheetMetrics(sheet));
    expect(next.rect).toEqual({ x: 194, y: 98, width: 400, height: 280 });
    expect(frame.anchor).toEqual(
      anchorPictureFrameRect("move-and-size", { x: 194, y: 98, width: 360, height: 240 }, initial),
    );
  });
  test("full hiding yields a retained zero-span frame; showing restores its original endpoints", () => {
    const sheet = createSheet("Synthetic", "s");
    const initial = createPictureSheetMetrics(sheet);
    const frame: PictureFrame = {
      ...fixed(),
      anchor: anchorPictureFrameRect(
        "move-and-size",
        { x: 194, y: 98, width: 360, height: 240 },
        initial,
      ),
    };
    for (let row = 4; row <= 14; row++) setSheetDimensionHidden(sheet, "row", row, true);
    const collapsed = resolvePictureFrame(frame, createPictureSheetMetrics(sheet));
    expect(collapsed.rect.height).toBe(0);
    expect(collapsed.sourceRect).toBeNull();
    expect(collapsed.collapsed).toBe(true);
    expect(pictureFrameContainsPoint(collapsed, { x: 194, y: 96 })).toBe(false);
    for (let row = 4; row <= 14; row++) setSheetDimensionHidden(sheet, "row", row, false);
    expect(resolvePictureFrame(frame, createPictureSheetMetrics(sheet)).rect).toEqual({
      x: 194,
      y: 98,
      width: 360,
      height: 240,
    });
  });
  test("logical endpoints tolerate structural size growth above manual frame limits", () => {
    const sheet = createSheet("Synthetic", "s");
    const frame: PictureFrame = {
      ...fixed(),
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 100, offset: 0 }, row: { index: 100, offset: 0 } },
      },
    };
    for (let column = 0; column < 100; column++) setColumnWidth(sheet, column, 200);
    expect(resolvePictureFrame(frame, createPictureSheetMetrics(sheet)).rect.width).toBe(20000);
    expect(() =>
      normalizePictureFrame({
        ...fixed(),
        anchor: { mode: "fixed", x: 0, y: 0, size: { width: 20000, height: 100 } },
      }),
    ).toThrow();
  });
  test("rejects arithmetic overflow or unrepresentable extents without raster allocation", () => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    expect(() =>
      resolvePictureFrame(
        { ...fixed(), source: { ...source, widthRatio: Number.MAX_VALUE } },
        metrics,
      ),
    ).toThrow();
    expect(() =>
      resolvePictureFrame(
        {
          ...fixed(),
          anchor: { mode: "fixed", x: Number.MAX_VALUE, y: 0, size: { width: 100, height: 100 } },
        },
        metrics,
      ),
    ).toThrow();
  });
});

test.each([0, 37, 45, 90])(
  "projected polygon hit at an extreme origin stays consistent at angle %s",
  (angleDeg) => {
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
    const resolved = resolvePictureFrame(
      {
        ...fixed(),
        angleDeg,
        anchor: { mode: "fixed", x: 1e15, y: 0, size: { width: 1, height: 1 } },
      },
      metrics,
    );
    expect(pictureFrameContainsPoint(resolved, { x: 1e15 + 4, y: 0.5 })).toBe(false);
    expect(pictureFrameContainsPoint(resolved, { x: 1e15 + 0.5, y: 0.5 })).toBe(true);
    for (const corner of resolved.corners)
      expect(pictureFrameContainsPoint(resolved, corner)).toBe(true);
  },
);
