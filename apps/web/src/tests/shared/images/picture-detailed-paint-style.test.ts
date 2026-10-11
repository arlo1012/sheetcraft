import { expect, test } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { resolvePictureDetailedPaintStyle } from "../../../shared/images/picture-detailed-paint-style";

test("legacy pictures without typed categories keep the exact old fast path", () => {
  expect(
    resolvePictureDetailedPaintStyle(
      { shadow: "hard", border: { color: "#112233", width: 2 } },
      DEFAULT_WORKBOOK_THEME.effects,
    ),
  ).toBeUndefined();
});
test("adding a fill preserves prior own border and shadow and sparse theme outline", () => {
  const appearance = {
    detailedStyle: { fill: { kind: "none" as const } },
    shadow: "hard" as const,
    border: { color: "#112233", width: 2 },
  };
  const before = structuredClone(appearance);
  const result = resolvePictureDetailedPaintStyle(appearance, DEFAULT_WORKBOOK_THEME.effects)!;
  expect(result.style.line).toMatchObject({
    kind: "value",
    value: { widthPt: 1.5, paint: { color: { rgb: "#112233" } } },
  });
  expect(result.style.shadow).toMatchObject({
    kind: "value",
    value: { opacity: 0.35, blurPt: 0.75 },
  });
  expect(result.remainingTheme).toMatchObject({ shadow: "none", outlineWidth: 1 });
  expect(appearance).toEqual(before);
});
test("explicit typed none overrides corresponding own and inherited shadow/reflection", () => {
  const result = resolvePictureDetailedPaintStyle(
    {
      shadow: "soft",
      reflection: true,
      detailedStyle: { shadow: { kind: "none" }, reflection: { kind: "none" } },
    },
    { ...DEFAULT_WORKBOOK_THEME.effects, reflection: true },
  )!;
  expect(result.style.shadow).toEqual({ kind: "none" });
  expect(result.style.reflection).toEqual({ kind: "none" });
  expect(result.remainingTheme).toMatchObject({ shadow: "none", reflection: false });
});
test("outline suppression remains authoritative while typed line preserves theme coexistence", () => {
  const fill = { kind: "none" as const };
  const result = resolvePictureDetailedPaintStyle(
    { suppressThemeEffects: { outline: true, shadow: true }, detailedStyle: { fill } },
    DEFAULT_WORKBOOK_THEME.effects,
  )!;
  expect(result.style.shadow).toBeUndefined();
  expect(result.remainingTheme?.outlineWidth).toBe(0);
  const reflection = resolvePictureDetailedPaintStyle(
    { detailedStyle: { fill } },
    { ...DEFAULT_WORKBOOK_THEME.effects, reflection: true },
  )!;
  expect(reflection.style.reflection).toMatchObject({ kind: "value", value: { size: 1 } });
});
