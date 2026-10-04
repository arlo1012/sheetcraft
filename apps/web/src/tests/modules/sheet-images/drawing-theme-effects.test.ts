import { describe, expect, test } from "vitest";
import {
  getDrawingThemeEffects,
  hasVisibleDrawingThemeEffects,
  type DrawingThemeEffects,
} from "../../../modules/sheet-images/drawing-theme-effects";

const base: DrawingThemeEffects = {
  shadow: "none",
  reflection: false,
  bevel: false,
  outlineWidth: 0,
  gradient: true,
};

describe("drawing theme effects", () => {
  test("does not treat a fill-only gradient as a raster-image effect", () => {
    expect(hasVisibleDrawingThemeEffects(base)).toBe(false);
  });

  test("retains supported object effects from the workbook theme", () => {
    const effects = { ...base, shadow: "soft" as const, reflection: true, outlineWidth: 1 };
    expect(getDrawingThemeEffects({ effects })).toBe(effects);
    expect(hasVisibleDrawingThemeEffects(effects)).toBe(true);
  });
});
