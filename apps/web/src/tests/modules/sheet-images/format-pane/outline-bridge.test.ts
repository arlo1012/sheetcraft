import { expect, test } from "vitest";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import { createPictureGradientPaint } from "../../../../modules/sheet-images/picture-paint-edit";
import {
  pictureOutlineWidthPatch,
  pictureOutlineColorPatch,
} from "../../../../modules/sheet-images/picture-outline-edit";
import {
  editPictureOwnAppearance,
  patchPictureAppearance,
} from "../../../../modules/sheet-images/picture-appearance-edit";
function appearance(): ImageAppearance {
  return {
    brightness: 0.8,
    suppressThemeEffects: { reflection: true, outline: true },
    detailedStyle: {
      fill: { kind: "value", value: createPictureGradientPaint() },
      line: {
        kind: "value",
        value: {
          paint: createPictureGradientPaint(),
          widthPt: 4,
          compound: "double",
          dash: "long-dash-dot",
          cap: "round",
          join: "bevel",
          miterLimit: 4,
        },
      },
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#123456" }, sizePt: 3, opacity: 0.5 },
      },
    },
  };
}
test("ribbon width preserves the genuine gradient line, its structure and other effects", () => {
  const before = appearance(),
    expected = structuredClone(before);
  const next = patchPictureAppearance(before, pictureOutlineWidthPatch(before, 8))!;
  expect(next.detailedStyle?.line).toMatchObject({
    kind: "value",
    value: {
      paint: createPictureGradientPaint(),
      widthPt: 6,
      compound: "double",
      dash: "long-dash-dot",
      cap: "round",
      join: "bevel",
    },
  });
  expect(next.detailedStyle?.fill).toEqual(before.detailedStyle?.fill);
  expect(next.detailedStyle?.glow).toEqual(before.detailedStyle?.glow);
  expect(before).toEqual(expected);
});
test("one palette color explicitly becomes solid but keeps width, alpha and the full line contract", () => {
  const before = appearance();
  const next = patchPictureAppearance(
    before,
    pictureOutlineColorPatch(before, { kind: "theme", reference: { slot: "accent2", tint: 0.5 } }),
  )!;
  expect(next.detailedStyle?.line).toMatchObject({
    kind: "value",
    value: {
      paint: {
        kind: "solid",
        color: { kind: "theme", reference: { slot: "accent2", tint: 0.5 } },
        opacity: 1,
      },
      widthPt: 4,
      compound: "double",
      dash: "long-dash-dot",
    },
  });
});
test("existing explicit ribbon presets replace masked categories but preserve unrelated detailed effects", () => {
  const before = appearance();
  const next = patchPictureAppearance(before, {
    border: { color: "#FFFFFF", width: 6 },
    shadow: "soft",
    reflection: undefined,
  })!;
  expect(next.detailedStyle?.line).toBeUndefined();
  expect(next.detailedStyle?.fill).toEqual(before.detailedStyle?.fill);
  expect(next.detailedStyle?.glow).toEqual(before.detailedStyle?.glow);
  expect(next.border).toEqual({ color: "#FFFFFF", width: 6 });
  expect(next.shadow).toBe("soft");
  expect(next.suppressThemeEffects?.reflection).toBe(true);
});
test("zero width is an explicit typed None, and later width creates a real local line", () => {
  const before = appearance(),
    none = patchPictureAppearance(before, pictureOutlineWidthPatch(before, 0))!;
  expect(none.detailedStyle?.line).toEqual({ kind: "none" });
  expect(none.suppressThemeEffects?.outline).toBe(true);
  const next = patchPictureAppearance(none, pictureOutlineWidthPatch(none, 2))!;
  expect(next.detailedStyle?.line).toMatchObject({
    kind: "value",
    value: { widthPt: 1.5, paint: { kind: "solid", color: { kind: "automatic" } } },
  });
});
test("old images retain their ordinary local line representation", () => {
  const before: ImageAppearance = { border: { color: "#123456", width: 3 }, opacity: 0.7 };
  expect(patchPictureAppearance(before, pictureOutlineWidthPatch(before, 6))).toEqual({
    ...before,
    border: { color: "#123456", width: 6 },
  });
  expect(
    patchPictureAppearance(
      before,
      pictureOutlineColorPatch(before, { kind: "rgb", rgb: "#ABCDEF" }),
    ),
  ).toEqual({ ...before, border: { color: "#ABCDEF", width: 3 } });
  expect(() => pictureOutlineWidthPatch(before, Infinity)).toThrow();
});

test("existing field callbacks cannot leave typed None masking a request to inherit", () => {
  const before = appearance();
  const inherited = editPictureOwnAppearance(before, { field: "lineMode", value: "inherit" })!;
  expect(inherited.detailedStyle?.line).toBeUndefined();
  expect(inherited.suppressThemeEffects?.outline).toBeUndefined();
  expect(inherited.detailedStyle?.fill).toEqual(before.detailedStyle?.fill);
  const next = editPictureOwnAppearance(before, { field: "lineWidthPt", value: 3 })!;
  expect(next.detailedStyle?.line).toMatchObject({
    kind: "value",
    value: { widthPt: 3, compound: "double", paint: createPictureGradientPaint() },
  });
});
