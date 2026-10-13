import { expect, test } from "vitest";
import { requireLegacySheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import {
  applyWordArtStylePreset,
  clearWordArtEffects,
  getAppliedWordArtStyleId,
  isWordArtStyleTarget,
} from "../../../modules/sheet-drawings/wordart-style-application";
import {
  WORDART_STYLE_PRESETS,
  materializeWordArtStylePreset,
} from "../../../modules/sheet-drawings/wordart-style-presets";

function fixture() {
  const drawing = requireLegacySheetDrawing(
    createGraphicDrawing("modern", "shape", "WordArt", { row: 2, column: 3 }),
  );
  if (drawing.kind !== "shape") throw Error("shape");
  drawing.wordArt = true;
  drawing.text = "alpha beta";
  drawing.rotation = 37;
  drawing.bold = true;
  drawing.shapeFlipX = true;
  drawing.shapeFlipY = true;
  drawing.shapeText = {
    ...createDefaultShapeText(),
    fontFamily: "Noto Sans",
    warp: { preset: "textButtonPour", adjustments: { adj2: 70000 } },
    style: materializeWordArtStylePreset("black-soft-shadow"),
    characterRuns: [
      {
        start: 0,
        end: 6,
        fontFamily: "Noto Serif",
        fontSize: 64,
        bold: false,
        italic: true,
        underline: true,
        color: "#FF0000",
        fill: { kind: "none" },
        line: { kind: "none" },
      },
    ],
  };
  return drawing;
}
test.each(WORDART_STYLE_PRESETS)(
  "object reapply $id replaces only complete glyph appearance",
  (preset) => {
    const original = fixture(),
      before = structuredClone(original);
    const next = applyWordArtStylePreset(original, preset.id);
    expect(original).toEqual(before);
    expect(next.shapeText!.style).toEqual(materializeWordArtStylePreset(preset.id));
    expect(next.shapeText!.characterRuns).toEqual([
      {
        start: 0,
        end: 6,
        fontFamily: "Noto Serif",
        fontSize: 64,
        bold: false,
        italic: true,
        underline: true,
      },
    ]);
    expect({ ...next, shapeText: original.shapeText }).toEqual(original);
    expect({
      ...next.shapeText,
      style: original.shapeText!.style,
      characterRuns: original.shapeText!.characterRuns,
    }).toEqual(original.shapeText);
    expect(getAppliedWordArtStyleId(next)).toBe(preset.id);
    next.shapeText!.style!.fill = { kind: "none" };
    expect(preset.style).toEqual(materializeWordArtStylePreset(preset.id));
  },
);
test("clear preserves authored typography and layout while removing warp and every glyph effect", () => {
  const original = fixture(),
    before = structuredClone(original);
  original.shapeText!.layout.autoFit = "resize-shape";
  const next = clearWordArtEffects(original);
  expect(next.text).toBe("alpha beta");
  expect(next.bold).toBe(true);
  expect(next.shapeText!.characterRuns![0]).toMatchObject({
    fontFamily: "Noto Serif",
    fontSize: 64,
    bold: false,
    italic: true,
    underline: true,
  });
  expect(next.shapeText).not.toHaveProperty("warp");
  expect(next.shapeText!.layout).toEqual(original.shapeText!.layout);
  expect(next.shapeText!.style!.fill).toMatchObject({
    kind: "value",
    value: { kind: "solid", color: { kind: "rgb", rgb: "#000000" }, opacity: 1 },
  });
  for (const category of [
    "line",
    "shadow",
    "reflection",
    "glow",
    "softEdges",
    "format3d",
    "rotation3d",
  ] as const)
    expect(next.shapeText!.style![category]).toEqual({ kind: "none" });
  expect({ ...next, shapeText: original.shapeText }).toEqual(original);
  expect(getAppliedWordArtStyleId(next)).toBeUndefined();
  expect(before.shapeText!.warp).toEqual(original.shapeText!.warp);
});
test("ordinary retained warp, legacy kind and forged preset do not opt in or mutate", () => {
  const source = fixture();
  delete source.wordArt;
  const before = structuredClone(source);
  expect(isWordArtStyleTarget(source)).toBe(false);
  expect(() => applyWordArtStylePreset(source, "accent3-solid")).toThrow();
  expect(() => clearWordArtEffects(source)).toThrow();
  expect(source).toEqual(before);
  expect(
    isWordArtStyleTarget(createGraphicDrawing("old", "wordArt", "Old", { row: 0, column: 0 })),
  ).toBe(false);
  expect(() => applyWordArtStylePreset(fixture(), "unknown")).toThrow();
});
