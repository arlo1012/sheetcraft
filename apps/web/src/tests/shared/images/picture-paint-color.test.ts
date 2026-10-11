import { describe, expect, test } from "vitest";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  brightenPictureColor,
  resolvePictureColor,
  resolvePicturePaintStops,
} from "../../../shared/images/picture-paint-color";

describe("picture paint colors", () => {
  test("resolves actual RGB and explicit automatic defaults", () => {
    expect(resolvePictureColor({ kind: "rgb", rgb: "#12aBef" }, DEFAULT_WORKBOOK_THEME)).toEqual([
      18, 171, 239,
    ]);
    expect(resolvePictureColor({ kind: "automatic" }, DEFAULT_WORKBOOK_THEME)).toEqual([0, 0, 0]);
    expect(resolvePictureColor({ kind: "automatic" }, DEFAULT_WORKBOOK_THEME, "#ffffff")).toEqual([
      255, 255, 255,
    ]);
    expect(() =>
      resolvePictureColor({ kind: "automatic" }, DEFAULT_WORKBOOK_THEME, "red"),
    ).toThrow();
  });
  test("live theme references survive theme changes without modifying stored data", () => {
    const color = { kind: "theme" as const, reference: { slot: "accent1" as const } };
    const saved = JSON.stringify(color);
    expect(resolvePictureColor(color, DEFAULT_WORKBOOK_THEME)).toEqual([79, 129, 189]);
    const next: WorkbookTheme = {
      ...DEFAULT_WORKBOOK_THEME,
      accentColors: [
        "#ff0000",
        ...DEFAULT_WORKBOOK_THEME.accentColors.slice(1),
      ] as WorkbookTheme["accentColors"],
    };
    expect(resolvePictureColor(color, next)).toEqual([255, 0, 0]);
    expect(JSON.stringify(color)).toBe(saved);
  });
  test("brightness has independent signed color and opacity semantics", () => {
    expect(brightenPictureColor([100, 150, 200], -1)).toEqual([0, 0, 0]);
    expect(brightenPictureColor([100, 150, 200], 1)).toEqual([255, 255, 255]);
    expect(brightenPictureColor([100, 150, 200], -0.5)).toEqual([50, 75, 100]);
    const stops = [
      {
        offset: 0.5,
        color: { kind: "rgb" as const, rgb: "#646464" },
        brightness: 0.5,
        opacity: 0.25,
      },
    ];
    const before = JSON.stringify(stops);
    expect(resolvePicturePaintStops(stops, DEFAULT_WORKBOOK_THEME)).toEqual([
      { offset: 0.5, color: [177.5, 177.5, 177.5], opacity: 0.25 },
    ]);
    expect(JSON.stringify(stops)).toBe(before);
  });
  test.each([-2, 2, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid brightness %s",
    (value) => {
      expect(() => brightenPictureColor([0, 0, 0], value)).toThrow();
    },
  );
});
