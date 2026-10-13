// @vitest-environment node
import { expect, test } from "vitest";
import { normalizeShapeStyle } from "@sheetcraft/core/shape-style";
import { DEFAULT_WORKBOOK_THEME, resolveThemeColor } from "@sheetcraft/core/workbook-theme";
import {
  WORDART_STYLE_PRESET_COUNT,
  WORDART_STYLE_PRESETS,
  getWordArtStylePreset,
  materializeWordArtStylePreset,
} from "../../../modules/sheet-drawings/wordart-style-presets";

const categories = [
  "fill",
  "line",
  "shadow",
  "reflection",
  "glow",
  "softEdges",
  "format3d",
  "rotation3d",
];

test("25 distinct bilingual choices distinguish the measured first style from product recipes", () => {
  expect(WORDART_STYLE_PRESET_COUNT).toBe(25);
  expect(WORDART_STYLE_PRESETS).toHaveLength(25);
  expect(new Set(WORDART_STYLE_PRESETS.map((choice) => choice.id)).size).toBe(25);
  expect(new Set(WORDART_STYLE_PRESETS.map((choice) => JSON.stringify(choice.style))).size).toBe(
    25,
  );
  expect(WORDART_STYLE_PRESETS.map((choice) => choice.provenance)).toEqual([
    "measured-first-style",
    ...Array.from({ length: 24 }, () => "product-owned"),
  ]);
  for (const choice of WORDART_STYLE_PRESETS) {
    expect(choice.label["en-US"]).toMatch(/[A-Za-z]/u);
    expect(choice.label["zh-CN"]).toMatch(/[\u4e00-\u9fff]/u);
    expect(getWordArtStylePreset(choice.id)).toBe(choice);
    expect(Object.keys(choice.style).sort()).toEqual([...categories].sort());
    expect(normalizeShapeStyle(choice.style)).toEqual(choice.style);
    expect(choice).not.toHaveProperty("fontSize");
    expect(choice).not.toHaveProperty("text");
    expect(choice).not.toHaveProperty("geometry");
  }
});

test("first style materializes measured solid black/no outline and exact soft shadow", () => {
  expect(materializeWordArtStylePreset("black-soft-shadow")).toEqual({
    fill: {
      kind: "value",
      value: { kind: "solid", color: { kind: "rgb", rgb: "#000000" }, opacity: 1 },
    },
    line: { kind: "none" },
    shadow: {
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 0.4,
        scale: 1,
        blurPt: 3,
        distancePt: 1.5,
        angleDeg: 45,
        anchor: "center",
      },
    },
    reflection: { kind: "none" },
    glow: { kind: "none" },
    softEdges: { kind: "none" },
    format3d: { kind: "none" },
    rotation3d: { kind: "none" },
  });
});

test("materialization gives detached complete recipes, including explicit no-fill and effect removal", () => {
  const first = WORDART_STYLE_PRESETS[0]!;
  const style = materializeWordArtStylePreset(first);
  expect(style).not.toBe(first.style);
  expect(style.fill).not.toBe(first.style.fill);
  if (style.shadow.kind === "value") style.shadow.value.blurPt = 99;
  expect(materializeWordArtStylePreset(first).shadow).toMatchObject({ value: { blurPt: 3 } });
  expect(Object.isFrozen(first.style)).toBe(true);
  expect(Object.isFrozen(first.style.shadow)).toBe(true);
  const outlined = materializeWordArtStylePreset("accent5-outline");
  expect(outlined.fill).toEqual({ kind: "none" });
  expect(outlined.line).toMatchObject({ kind: "value", value: { widthPt: 1.25 } });
  expect(outlined.shadow).toEqual({ kind: "none" });
  expect(outlined.reflection).toEqual({ kind: "none" });
  expect(getWordArtStylePreset("unknown")).toBeUndefined();
  expect(() => materializeWordArtStylePreset("unknown")).toThrow(RangeError);
});

test("theme accent bindings remain live rather than baking preview colors into the recipe", () => {
  const style = materializeWordArtStylePreset("accent3-solid");
  if (style.fill.kind !== "value" || style.fill.value.kind !== "solid")
    throw new Error("Expected a solid theme fill.");
  const color = style.fill.value.color;
  if (color.kind !== "theme") throw new Error("Expected a live theme reference.");
  const changedTheme = {
    ...DEFAULT_WORKBOOK_THEME,
    accentColors: [
      ...DEFAULT_WORKBOOK_THEME.accentColors,
    ] as typeof DEFAULT_WORKBOOK_THEME.accentColors,
  };
  changedTheme.accentColors[2] = "#123456";
  expect(resolveThemeColor(changedTheme, color.reference)).toBe("#123456");
  expect(color).toEqual({ kind: "theme", reference: { slot: "accent3" } });
});
