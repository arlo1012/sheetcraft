import { describe, expect, test, vi } from "vitest";
import { resizePictureCropFrame, type PictureFrame } from "@sheetcraft/core/picture-frame";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  encodeNativePictureGeometry,
  decodeNativePictureGeometry,
  parseNativeCropPercentage,
  parseNativeRotation,
  assertNativePictureGeometryPrecision,
} from "../../picture-frame-geometry.js";
import { isSupportedNativePictureFrame } from "../../picture-capabilities.js";

function frame(): PictureFrame {
  return {
    kind: "object-frame-v1",
    anchor: { mode: "fixed", x: 20, y: 30, size: { width: 120, height: 80 } },
    source: { widthRatio: 2, heightRatio: 4, offsetXRatio: 0.25, offsetYRatio: -0.5 },
    angleDeg: 37.5,
  };
}
describe("native rectangular picture geometry", () => {
  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])("asymmetric crop roundtrips with H=%s V=%s", (h, v) => {
    const input = { ...frame(), flipHorizontal: h, flipVertical: v };
    const encoded = encodeNativePictureGeometry(input);
    expect(encoded.crop).toEqual({
      left: h ? 37500 : 12500,
      right: h ? 12500 : 37500,
      top: v ? 25000 : 50000,
      bottom: v ? 50000 : 25000,
    });
    expect(encoded.rotation).toBe(2250000);
    expect(decodeNativePictureGeometry(encoded)).toEqual({
      source: input.source,
      angleDeg: 37.5,
      ...(h ? { flipHorizontal: true } : {}),
      ...(v ? { flipVertical: true } : {}),
    });
    expect(
      assertNativePictureGeometryPrecision(
        input,
        { width: 120, height: 80 },
        { width: 4096, height: 2048 },
      ),
    ).toEqual(encoded);
  });
  test.each([
    [
      { width: 120, height: 96 },
      { x: 0, y: 0 },
      { left: 0, right: 25000, top: 0, bottom: 0 },
    ],
    [
      { width: 120, height: 96 },
      { x: 40, y: 0 },
      { left: 25000, right: 0, top: 0, bottom: 0 },
    ],
    [
      { width: 160, height: 72 },
      { x: 0, y: 0 },
      { left: 0, right: 0, top: 0, bottom: 25000 },
    ],
    [
      { width: 160, height: 72 },
      { x: 0, y: 24 },
      { left: 0, right: 0, top: 25000, bottom: 0 },
    ],
  ])(
    "preserves mathematical zero edges from actual Core one-sided resize %j %j",
    (size, inset, expected) => {
      const original: PictureFrame = {
        ...frame(),
        anchor: { mode: "fixed", x: 20, y: 30, size: { width: 160, height: 96 } },
        source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        angleDeg: 0,
      };
      const cropped = resizePictureCropFrame(
        original,
        size,
        createPictureSheetMetrics(createSheet("Crop", "s")),
        inset,
      );
      expect(
        assertNativePictureGeometryPrecision(cropped, size, { width: 160, height: 96 }).crop,
      ).toEqual(expected);
    },
  );
  test.each(["left", "right", "top", "bottom"] as const)(
    "rejects %s padding beyond the operand roundoff bound",
    (edge) => {
      const source = { widthRatio: 4 / 3, heightRatio: 4 / 3, offsetXRatio: 0, offsetYRatio: 0 };
      const outside = (source.widthRatio - 1) / 2 + 32 * Number.EPSILON;
      if (edge === "left" || edge === "right")
        source.offsetXRatio = edge === "left" ? outside : -outside;
      else source.offsetYRatio = edge === "top" ? outside : -outside;
      expect(() => encodeNativePictureGeometry({ ...frame(), source })).toThrow(/padding/);
    },
  );
  test.each([0, 90, 180, 270, 360, -90, 397.5])("normalizes rotation %s", (angle) => {
    expect(
      decodeNativePictureGeometry(encodeNativePictureGeometry({ ...frame(), angleDeg: angle }))
        .angleDeg,
    ).toBe(((angle % 360) + 360) % 360);
  });
  test.each([
    ["25%", 25000],
    ["25", 25],
    [".125%", 125],
    ["+0", 0],
    ["12.3456%", 12345.6],
  ])("crop lexical %s", (text, value) => {
    expect(parseNativeCropPercentage(String(text))).toBeCloseTo(Number(value), 8);
  });
  test.each(["-1", "-1%", "100000", "100%", "1e2", "1px", " 0", "0 ", "", "NaN", "1.5"])(
    "rejects crop lexical %s",
    (text) => expect(() => parseNativeCropPercentage(text)).toThrow(),
  );
  test.each(["1.5", "1e2", " 0", "2147483648", "-2147483649"])("rejects angle lexical %s", (text) =>
    expect(() => parseNativeRotation(text)).toThrow(),
  );
  test("angle signed32 normalization", () => {
    expect(parseNativeRotation("-5400000")).toBe(16200000);
    expect(parseNativeRotation("21600000")).toBe(0);
  });
  test.each([
    { widthRatio: 0.5, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
    { widthRatio: 1, heightRatio: 1, offsetXRatio: 0.01, offsetYRatio: 0 },
    { widthRatio: 1e10, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
  ])("rejects padding and quantized-empty source", (source) =>
    expect(() => encodeNativePictureGeometry({ ...frame(), source })).toThrow(),
  );
  test("rejects precision overflow instead of silently approximating", () => {
    const input = { ...frame(), source: { ...frame().source, widthRatio: 3.1415926 } };
    expect(() => assertNativePictureGeometryPrecision(input, { width: 1e6, height: 80 })).toThrow(
      /0.01/,
    );
    expect(() =>
      assertNativePictureGeometryPrecision(
        input,
        { width: 120, height: 80 },
        { width: 1e9, height: 32 },
      ),
    ).toThrow(/0.5/);
  });
  test("guard rejects dormant effects, extra fields, accessors without evaluation", () => {
    const picture = { id: "p", assetId: "a", altText: "", frame: frame() };
    expect(isSupportedNativePictureFrame(picture)).toBe(true);
    const getter = vi.fn(() => true);
    const unsafe = { ...picture, frame: { ...picture.frame } };
    Object.defineProperty(unsafe.frame, "flipHorizontal", { get: getter, enumerable: true });
    expect(isSupportedNativePictureFrame(unsafe)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(
      isSupportedNativePictureFrame({
        ...picture,
        transform: { appearance: { detailedStyle: { shadow: { kind: "none" } } } },
      }),
    ).toBe(false);
    expect(
      isSupportedNativePictureFrame({
        ...picture,
        transform: { appearance: { suppressThemeEffects: { shadow: true } } },
      }),
    ).toBe(false);
  });
});
