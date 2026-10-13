import { describe, expect, test } from "vitest";
import { getShapeTextCharacterSegments } from "@sheetcraft/core/shape-text-character-runs";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeChoice, ShapeLine, ShapePaint } from "@sheetcraft/core/shape-style";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { shapeRichTextSourceStyle } from "../../../modules/sheet-drawings/shape-rich-text-source-style";
import {
  createDefaultShapeText,
  drawingShapeTextBaseCharacterFormat,
  drawingShapeTextCharacterSource,
  drawingShapeTextCharacterValues,
  editDrawingShapeTextField,
  shapeTextCharacterColorValue,
} from "../../../modules/sheet-drawings/shape-text-options";

const solid = (rgb: string, opacity = 1): ShapeChoice<ShapePaint> => ({
  kind: "value",
  value: { kind: "solid", color: { kind: "rgb", rgb }, opacity },
});
function line(rgb = "#0000ff"): ShapeChoice<ShapeLine> {
  return {
    kind: "value",
    value: {
      paint: { kind: "solid", color: { kind: "rgb", rgb: rgb.toUpperCase() }, opacity: 1 },
      widthPt: 0.75,
      compound: "single",
      dash: "solid",
      cap: "butt",
      join: "round",
      miterLimit: 4,
    },
  };
}
function drawing(): SheetGraphicDrawing {
  return {
    id: "source",
    name: "Source",
    kind: "shape",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
    text: "alpha beta",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#123456",
    fontSize: 96,
    bold: true,
    italic: false,
    rotation: 0,
    shapeText: {
      ...createDefaultShapeText(),
      style: { fill: solid("#000000"), line: { kind: "none" } },
    },
  };
}

describe("same-model shape rich source appearance", () => {
  test("measured alpha fill and outline stay local while beta inherits black and None", () => {
    const shape = drawing();
    shape.shapeText!.characterRuns = [{ start: 0, end: 6, fill: solid("#ff0000"), line: line() }];
    const segments = getShapeTextCharacterSegments(
      drawingShapeTextCharacterSource(shape),
      drawingShapeTextBaseCharacterFormat(shape),
    );
    const alpha = shapeRichTextSourceStyle(segments[0]!),
      beta = shapeRichTextSourceStyle(segments[1]!);
    expect(alpha.style.color).toBe("rgba(255, 0, 0, 1)");
    expect(alpha.style.WebkitTextStrokeColor).toBe("rgba(0, 0, 255, 1)");
    expect(alpha.style.WebkitTextStrokeWidth).toBe("1px");
    expect(beta.style.color).toBe("rgba(0, 0, 0, 1)");
    expect(beta.style.WebkitTextStrokeWidth).toBe("0px");
    expect(alpha.previewDiffers || beta.previewDiffers).toBe(false);
  });
  test("local None excludes fallback color and local authored color remains strongest", () => {
    const segments = getShapeTextCharacterSegments(
      {
        text: "ab",
        characterRuns: [
          { start: 0, end: 1, fill: { kind: "none" } },
          { start: 1, end: 2, fill: solid("#ff0000"), color: "#00ff00" },
        ],
      },
      { color: "#000000", line: line() },
    );
    expect(segments[0]!.color).toBeUndefined();
    expect(shapeRichTextSourceStyle(segments[0]!).style.WebkitTextFillColor).toBe("transparent");
    expect(shapeTextCharacterColorValue(segments[0]!)).toBe("transparent");
    expect(shapeRichTextSourceStyle(segments[1]!).style.color).toBe("#00ff00");
    expect(shapeTextCharacterColorValue(segments[1]!)).toBe("#00ff00");
  });
  test("source solid alpha and point-width scale preserve fill and outline independently", () => {
    const style = shapeRichTextSourceStyle(
      { fill: solid("#ff0000", 0.25), line: line() },
      undefined,
      2,
    );
    expect(style.style.color).toBe("rgba(255, 0, 0, 0.25)");
    expect(style.style.WebkitTextStrokeWidth).toBe("2px");
    expect(style.style.WebkitTextStrokeColor).toBe("rgba(0, 0, 255, 1)");
    expect(() => shapeRichTextSourceStyle({}, undefined, 0)).toThrow(/scale/);
  });
  test("live theme readback and projection are derived without replacing references", () => {
    const theme = {
      ...DEFAULT_WORKBOOK_THEME,
      accentColors: [
        "#abcdef",
        ...DEFAULT_WORKBOOK_THEME.accentColors.slice(1),
      ] as typeof DEFAULT_WORKBOOK_THEME.accentColors,
    };
    const format = {
      fill: {
        kind: "value",
        value: {
          kind: "solid",
          color: { kind: "theme", reference: { slot: "accent1" } },
          opacity: 1,
        },
      },
    } as const;
    expect(shapeTextCharacterColorValue(format, theme)).toBe("#abcdef");
    expect(shapeRichTextSourceStyle(format, theme).style.color).toBe("rgba(171, 205, 239, 1)");
    expect(format.fill.value.color.kind).toBe("theme");
  });
  test("advanced fill and line previews disclose differences and leave source data intact", () => {
    const fill: ShapeChoice<ShapePaint> = {
      kind: "value",
      value: {
        kind: "linear",
        angleDeg: 45,
        opacity: 0.5,
        rotateWithShape: false,
        stops: [
          { offset: 0, color: { kind: "rgb", rgb: "#ff0000" }, opacity: 1, brightness: 0 },
          { offset: 1, color: { kind: "rgb", rgb: "#0000ff" }, opacity: 1, brightness: 0 },
        ],
      },
    };
    const before = JSON.stringify(fill);
    const gradient = shapeRichTextSourceStyle({ fill });
    expect(gradient.previewDiffers).toBe(true);
    expect(gradient.style.backgroundImage).toContain("linear-gradient(135deg");
    expect(gradient.style.WebkitTextFillColor).toBe("transparent");
    expect(shapeTextCharacterColorValue({ fill })).toBe("");
    const outline = line();
    if (outline.kind !== "value") throw Error("line");
    outline.value.compound = "double";
    outline.value.dash = "dash";
    expect(shapeRichTextSourceStyle({ line: outline }).previewDiffers).toBe(true);
    const image = shapeRichTextSourceStyle({
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "asset",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          },
        },
      },
    });
    expect(image.previewDiffers).toBe(true);
    expect(image.style.backgroundImage).toBeUndefined();
    expect(JSON.stringify(fill)).toBe(before);
  });
  test("uniform base appearance is detached and swatches read actual solid fill", () => {
    const shape = drawing();
    shape.shapeText!.style!.line = line();
    const base = drawingShapeTextBaseCharacterFormat(shape);
    expect(base.color).toBeUndefined();
    expect(drawingShapeTextCharacterValues(shape).values.textColor).toBe("#000000");
    expect(drawingShapeTextCharacterValues(shape).mixedFields).not.toContain("textColor");
    if (
      base.fill?.kind !== "value" ||
      base.fill.value.kind !== "solid" ||
      base.fill.value.color.kind !== "rgb" ||
      base.line?.kind !== "value"
    )
      throw Error("solid");
    base.fill.value.color.rgb = "#ffffff";
    base.line.value.widthPt = 3;
    expect(shape.shapeText!.style!.fill).toEqual(solid("#000000"));
    expect(shape.shapeText!.style!.line).toEqual(line());
  });
  test("whole-object color strips competing local fill and color while retaining local outline", () => {
    const shape = drawing();
    shape.shapeText!.characterRuns = [
      { start: 0, end: 6, fill: solid("#ff0000"), color: "#ffff00", line: line(), italic: true },
    ];
    const changed = editDrawingShapeTextField(shape, "textColor", "#00ff00")!;
    expect(changed.shapeText!.characterRuns).toEqual([
      { start: 0, end: 6, italic: true, line: line() },
    ]);
    expect(drawingShapeTextCharacterValues(changed).values.textColor).toBe("#00ff00");
    expect(shape.shapeText!.characterRuns[0]!.fill).toEqual(solid("#ff0000"));
  });
});
