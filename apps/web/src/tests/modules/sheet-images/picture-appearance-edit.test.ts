import { describe, expect, test } from "vitest";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import {
  editPictureOwnAppearance,
  patchPictureAppearance,
  resetPictureAppearance,
} from "../../../modules/sheet-images/picture-appearance-edit";
import { resolvePictureThemeEffects } from "../../../modules/sheet-images/drawing-theme-effects";

const effects = {
  shadow: "soft",
  reflection: true,
  bevel: true,
  outlineWidth: 2,
  gradient: true,
} as const;

describe("explicit per-picture appearance choices", () => {
  test("Reset clears own appearance and suppresses only real inherited effects without touching the theme", () => {
    const reset = resetPictureAppearance();
    expect(reset).toEqual({
      suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true },
    });
    expect(resolvePictureThemeEffects(reset, effects)).toEqual({
      shadow: "none",
      reflection: false,
      bevel: false,
      outlineWidth: 0,
      gradient: true,
    });
    expect(effects).toEqual({
      shadow: "soft",
      reflection: true,
      bevel: true,
      outlineWidth: 2,
      gradient: true,
    });
    reset.suppressThemeEffects!.shadow = undefined;
    expect(resetPictureAppearance().suppressThemeEffects!.shadow).toBe(true);
  });
  test("ordinary pixel patches preserve sparse inheritance choices and independent records", () => {
    const before: ImageAppearance = {
      opacity: 0.4,
      border: { color: "#123456", width: 4 },
      suppressThemeEffects: { bevel: true },
    };
    const next = patchPictureAppearance(before, {
      brightness: 0.5,
      suppressThemeEffects: { reflection: true },
    })!;
    expect(next).toEqual({
      ...before,
      brightness: 0.5,
      suppressThemeEffects: { reflection: true, bevel: true },
    });
    next.suppressThemeEffects!.outline = true;
    next.border!.width = 1;
    expect(before).toEqual({
      opacity: 0.4,
      border: { color: "#123456", width: 4 },
      suppressThemeEffects: { bevel: true },
    });
  });
  test.each([{ border: undefined }, { border: { color: "#123456", width: 0 } }])(
    "No Line suppresses inherited outlines for %j",
    (patch) => {
      expect(patchPictureAppearance({ border: { color: "#FFFFFF", width: 1 } }, patch)).toEqual({
        suppressThemeEffects: { outline: true },
      });
    },
  );
  test("None and inherit are distinct, and local solid is never copied from the translucent theme", () => {
    const none = editPictureOwnAppearance(undefined, { field: "lineMode", value: "none" });
    expect(none).toEqual({ suppressThemeEffects: { outline: true } });
    const solid = editPictureOwnAppearance(none, { field: "lineMode", value: "solid" });
    expect(solid).toEqual({
      border: { color: "#000000", width: 1 },
      suppressThemeEffects: { outline: true },
    });
    expect(
      editPictureOwnAppearance(solid, { field: "lineMode", value: "inherit" }),
    ).toBeUndefined();
    expect(resolvePictureThemeEffects(undefined, effects)).toBe(effects);
  });
  test("existing own and theme line layers remain separate through color/width edits", () => {
    const before: ImageAppearance = {
      border: { color: "#ABCDEF", width: 2 },
      suppressThemeEffects: { shadow: true },
    };
    const solid = editPictureOwnAppearance(before, { field: "lineMode", value: "solid" });
    expect(solid).toEqual(before);
    const color = editPictureOwnAppearance(solid, { field: "lineColor", value: "#123abc" });
    const width = editPictureOwnAppearance(color, { field: "lineWidthPt", value: 2.25 });
    expect(width).toEqual({
      border: { color: "#123ABC", width: 3 },
      suppressThemeEffects: { shadow: true },
    });
    expect(resolvePictureThemeEffects(width, effects)?.outlineWidth).toBe(2);
    expect(editPictureOwnAppearance(width, { field: "lineWidthPt", value: 0 })).toEqual({
      suppressThemeEffects: { shadow: true, outline: true },
    });
    expect(before.border).toEqual({ color: "#ABCDEF", width: 2 });
  });
  test("shadow inherit, None and local presets retain independent suppression choices", () => {
    const none = editPictureOwnAppearance(
      { suppressThemeEffects: { reflection: true } },
      { field: "shadowPreset", value: "none" },
    );
    expect(none).toEqual({ suppressThemeEffects: { shadow: true, reflection: true } });
    const hard = editPictureOwnAppearance(none, { field: "shadowPreset", value: "hard" });
    expect(hard).toEqual({
      shadow: "hard",
      suppressThemeEffects: { shadow: true, reflection: true },
    });
    expect(editPictureOwnAppearance(hard, { field: "shadowPreset", value: "inherit" })).toEqual({
      suppressThemeEffects: { reflection: true },
    });
  });
  test.each([-1, 15.01, NaN, Infinity])(
    "invalid point width %s is rejected without changing its input",
    (value) => {
      const before: ImageAppearance = { border: { color: "#ABCDEF", width: 2 } };
      expect(() => editPictureOwnAppearance(before, { field: "lineWidthPt", value })).toThrow();
      expect(before).toEqual({ border: { color: "#ABCDEF", width: 2 } });
    },
  );
  test("line edits require a real local line and validate actual color and enum values", () => {
    expect(() =>
      editPictureOwnAppearance(undefined, { field: "lineColor", value: "#000000" }),
    ).toThrow();
    const own = { border: { color: "#000000", width: 1 } };
    expect(() =>
      editPictureOwnAppearance(own, { field: "lineColor", value: "rgba(0,0,0,1)" }),
    ).toThrow();
    expect(() =>
      editPictureOwnAppearance(own, { field: "lineMode", value: "gradient" } as never),
    ).toThrow();
    expect(() =>
      editPictureOwnAppearance(own, { field: "shadowPreset", value: "unknown" } as never),
    ).toThrow();
  });
});
