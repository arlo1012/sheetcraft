import { describe, expect, test } from "vitest";
import {
  COLUMN_MAX_DIGIT_WIDTH,
  COLUMN_PADDING_PIXELS,
  dimensionValueToPixels,
  getDefaultDimensionUnit,
  getDimensionUnits,
  pixelsToDimensionValue,
} from "../../dimension-units.js";

describe("dimension units", () => {
  test("uses spreadsheet defaults and axis-specific units", () => {
    expect(getDefaultDimensionUnit("row")).toBe("pt");
    expect(getDefaultDimensionUnit("column")).toBe("char");
    expect(getDimensionUnits("row")).toEqual(["px", "pt", "in", "cm", "mm"]);
    expect(getDimensionUnits("column")).toEqual(["px", "pt", "in", "cm", "mm", "char"]);
  });

  test.each([
    [96, "pt", 72],
    [96, "in", 1],
    [96, "cm", 2.54],
    [96, "mm", 25.4],
  ] as const)("converts %i pixels to %s", (pixels, unit, expected) => {
    expect(pixelsToDimensionValue(pixels, unit)).toBeCloseTo(expected);
    expect(dimensionValueToPixels(expected, unit)).toBeCloseTo(pixels);
  });

  test("uses the Normal-style column character baseline", () => {
    expect(COLUMN_MAX_DIGIT_WIDTH).toBe(7);
    expect(COLUMN_PADDING_PIXELS).toBe(5);
    expect(pixelsToDimensionValue(96, "char")).toBe(13);
    expect(dimensionValueToPixels(13, "char")).toBe(96);
  });

  test("round trips every valid Core column width through displayed characters", () => {
    for (let pixels = 32; pixels <= 640; pixels += 1) {
      const characters = pixelsToDimensionValue(pixels, "char");
      expect(dimensionValueToPixels(characters, "char")).toBe(pixels);
    }
  });

  test("does not clamp values before the Core command validates their bounds", () => {
    expect(pixelsToDimensionValue(-1, "pt")).toBe(-0.75);
    expect(dimensionValueToPixels(-1, "cm")).toBeCloseTo(-37.79527559055118);
  });

  test("rejects non-finite input and invalid character baselines", () => {
    expect(() => pixelsToDimensionValue(Number.NaN, "px")).toThrow(
      "Pixels must be a finite number.",
    );
    expect(() => dimensionValueToPixels(Number.POSITIVE_INFINITY, "pt")).toThrow(
      "Dimension value must be a finite number.",
    );
    expect(() => pixelsToDimensionValue(96, "char", 0)).toThrow(
      "Maximum digit width must be a positive, finite number.",
    );
    expect(() => dimensionValueToPixels(13, "char", Number.NaN)).toThrow(
      "Maximum digit width must be a positive, finite number.",
    );
  });
});
