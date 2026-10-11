import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame, pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { FloatingImageResizeDirection } from "../../floating-image-layout.js";
import { resizeFramedPictureBy, rotateFramedPictureBy } from "../../picture-frame-layout.js";
const metrics = () => createPictureSheetMetrics(createSheet("Synthetic", "s"));
function image(angleDeg = 37): FramedFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Synthetic",
    lockAspectRatio: true,
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 180, y: 140, size: { width: 360, height: 240 } },
      source: { widthRatio: 1.2, heightRatio: 1, offsetXRatio: 0.5, offsetYRatio: 0.25 },
      angleDeg,
    },
  };
}
function rotateVector(x: number, y: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}
const directions: FloatingImageResizeDirection[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
describe("prepared rotated picture resizing", () => {
  test.each([0, 37, 90].flatMap((angle) => directions.map((direction) => ({ angle, direction }))))(
    "$angle degrees $direction fixes the opposite edge or corner",
    ({ angle, direction }) => {
      const m = metrics(),
        original = image(angle),
        before = structuredClone(original);
      const horizontal = direction === "e" || direction === "w";
      const vertical = direction === "n" || direction === "s";
      const west = direction.includes("w"),
        north = direction.includes("n");
      const delta = rotateVector(
        vertical ? 0 : west ? -72 : 72,
        horizontal ? 0 : north ? -24 : 24,
        angle,
      );
      const next = resizeFramedPictureBy(original, direction, delta, m)!;
      const oldRect = resolvePictureFrame(original.frame, m).rect;
      const rect = resolvePictureFrame(next.frame, m).rect;
      expect(rect.width).toBeCloseTo(vertical ? 360 : 432, 8);
      expect(rect.height).toBeCloseTo(horizontal ? 240 : vertical ? 264 : 288, 8);
      const oldFixed = {
        x: vertical ? oldRect.width / 2 : west ? oldRect.width : 0,
        y: horizontal ? oldRect.height / 2 : north ? oldRect.height : 0,
      };
      const newFixed = {
        x: vertical ? rect.width / 2 : west ? rect.width : 0,
        y: horizontal ? rect.height / 2 : north ? rect.height : 0,
      };
      const beforePoint = pictureFrameLocalToWorld(oldRect, angle, oldFixed);
      const afterPoint = pictureFrameLocalToWorld(rect, angle, newFixed);
      expect(afterPoint.x).toBeCloseTo(beforePoint.x, 8);
      expect(afterPoint.y).toBeCloseTo(beforePoint.y, 8);
      expect(next.frame.source).toEqual(before.frame.source);
      expect(original).toEqual(before);
    },
  );
  test("matches the measured 37-degree unequal corner delta and rounded frame position", () => {
    const m = metrics(),
      original = image();
    const next = resizeFramedPictureBy(original, "se", { x: 43, y: 48 }, m)!;
    const rect = resolvePictureFrame(next.frame, m).rect;
    expect(Number((rect.width / 96).toFixed(2))).toBe(4.41);
    expect(Number((rect.height / 96).toFixed(2))).toBe(2.94);
    expect(Number((rect.x / 96).toFixed(2))).toBe(1.68);
    expect(Number((rect.y / 96).toFixed(2))).toBe(1.61);
  });
  test("an explicitly unlocked corner changes axes independently", () => {
    const m = metrics(),
      original = image(0);
    original.lockAspectRatio = false;
    const next = resizeFramedPictureBy(original, "se", { x: 72, y: 24 }, m)!;
    expect(resolvePictureFrame(next.frame, m).rect).toEqual({
      x: 180,
      y: 140,
      width: 432,
      height: 264,
    });
  });
  test("an explicit corner policy can override the stored lock without changing it", () => {
    const m = metrics(),
      original = image(0);
    original.lockAspectRatio = false;
    const next = resizeFramedPictureBy(original, "se", { x: 72, y: 24 }, m, {
      preserveCornerRatio: true,
    })!;
    expect(resolvePictureFrame(next.frame, m).rect.height).toBe(288);
    expect(next.lockAspectRatio).toBe(false);
  });
  test("no-op deltas preserve exact normalized geometry", () => {
    const original = image();
    expect(resizeFramedPictureBy(original, "se", { x: 0, y: 0 }, metrics())).toEqual(original);
  });
  test("shrinks a derived oversized stretch gradually instead of jumping to the edit limit", () => {
    const m = metrics(),
      original = image(0);
    original.frame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 200, offset: 0 }, row: { index: 600, offset: 0 } },
    };
    const old = resolvePictureFrame(original.frame, m).rect;
    const next = resizeFramedPictureBy(original, "e", { x: -10, y: 0 }, m)!;
    expect(resolvePictureFrame(next.frame, m).rect).toEqual({ ...old, width: old.width - 10 });
  });
  test("minimum and maximum sizes preserve the opposite edge", () => {
    const m = metrics(),
      original = image(0);
    const next = resizeFramedPictureBy(original, "w", { x: 10000, y: 0 }, m, { minSize: 24 })!;
    expect(resolvePictureFrame(next.frame, m).rect).toEqual({
      x: 516,
      y: 140,
      width: 24,
      height: 240,
    });
  });
  test("ratio resizing lands on the minimum even when reciprocal multiplication rounds down", () => {
    const m = metrics(),
      original = image(0);
    original.frame.anchor = { mode: "fixed", x: 180, y: 140, size: { width: 360, height: 49 } };
    const next = resizeFramedPictureBy(original, "se", { x: -1000, y: -1000 }, m)!;
    const rect = resolvePictureFrame(next.frame, m).rect;
    expect(rect.height).toBe(1);
    expect(rect.width / rect.height).toBeCloseTo(360 / 49, 12);
    expect(rect.x).toBe(180);
    expect(rect.y).toBe(140);
  });
  test("quarter and arbitrary rotation keep local dimensions and center", () => {
    const m = metrics(),
      original = image();
    const next = rotateFramedPictureBy(original, 90, m);
    expect(next.frame.angleDeg).toBe(127);
    expect(resolvePictureFrame(next.frame, m).rect).toEqual(
      resolvePictureFrame(original.frame, m).rect,
    );
    expect(next.frame.source).toEqual(original.frame.source);
    expect(rotateFramedPictureBy(original, -37, m).frame.angleDeg).toBe(0);
    expect(rotateFramedPictureBy(original, 1e20, m).frame.angleDeg).toBe(317);
    expect(() => rotateFramedPictureBy(original, NaN, m)).toThrow();
  });
  test.each([
    { minSize: 0 },
    { maxSize: Infinity },
    { minSize: 100, maxSize: 24 },
    { maxSize: 10001 },
  ])("rejects invalid budget %j without modifying the object", (options) => {
    const original = image(),
      before = structuredClone(original);
    expect(() =>
      resizeFramedPictureBy(original, "e", { x: 10, y: 0 }, metrics(), options),
    ).toThrow();
    expect(original).toEqual(before);
  });
});
