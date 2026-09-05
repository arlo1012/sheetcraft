import { describe, expect, test } from "vitest";
import { excelColumnWidthToPixels, pixelsToExcelColumnWidth } from "../../column-width.js";

describe("Excel column widths", () => {
  test("uses the Calibri 11 MDW 7 reference conversion", () => {
    expect(pixelsToExcelColumnWidth(61)).toBe(8.7109375);
    expect(excelColumnWidthToPixels(8.7109375)).toBe(61);
  });

  test.each([
    [32, 4.57421875],
    [96, 13.7109375],
    [200, 28.57421875],
    [640, 91.421875],
  ])("round trips %i pixels through stored width %f", (pixels, width) => {
    expect(pixelsToExcelColumnWidth(pixels)).toBe(width);
    expect(excelColumnWidthToPixels(width)).toBe(pixels);
  });

  test("round trips every valid integer Core column width", () => {
    for (let pixels = 32; pixels <= 640; pixels += 1)
      expect(excelColumnWidthToPixels(pixelsToExcelColumnWidth(pixels))).toBe(pixels);
  });
});
