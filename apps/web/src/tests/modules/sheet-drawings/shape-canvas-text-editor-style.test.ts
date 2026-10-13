import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { layoutDrawingShapeText } from "../../../modules/sheet-drawings/shape-text-runtime";
import {
  shapeCanvasTextBlockStyle,
  shapeCanvasTextEditorStyle,
} from "../../../modules/sheet-drawings/shape-canvas-text-editor-style";

function drawing(changes: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    id: "text-shape",
    name: "Text shape",
    kind: "textBox",
    anchor: { row: 3, column: 4 },
    offsetX: 7,
    offsetY: 11,
    width: 100,
    height: 100,
    text: "abc",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#123456",
    fontSize: 20,
    bold: false,
    italic: false,
    rotation: 0,
    ...changes,
  };
}

describe("shape canvas uniform text editing style", () => {
  test("projects the existing model without modifying text, options or placement", () => {
    const shapeText = createDefaultShapeText();
    shapeText.fontFamily = "Custom Face";
    shapeText.underline = true;
    shapeText.strike = true;
    shapeText.paragraph.alignment = "justify";
    shapeText.paragraph.lineSpacing = { kind: "exact", pt: 15 };
    shapeText.paragraph.beforePt = 9;
    shapeText.paragraph.afterPt = 4;
    shapeText.layout.marginsPt = { leftPt: 3, rightPt: 6, topPt: 9, bottomPt: 12 };
    shapeText.layout.wrap = false;
    const source = drawing({ shapeText, bold: true, italic: true });
    const saved = structuredClone(source);
    expect(shapeCanvasTextEditorStyle(source, 1.5)).toMatchObject({
      fontFamily: "Custom Face",
      fontSize: "30px",
      fontWeight: 700,
      fontStyle: "italic",
      color: "#123456",
      textDecoration: "underline line-through",
      textAlign: "justify",
      lineHeight: "30px",
      paddingLeft: "6px",
      paddingRight: "12px",
      paddingTop: "18px",
      paddingBottom: "24px",
      whiteSpace: "pre",
      overflowWrap: "normal",
      writingMode: "horizontal-tb",
    });
    expect(source).toEqual(saved);
  });
  test.each([
    ["vertical-rl", "rtl", "vertical-rl", "mixed"],
    ["vertical-lr", "rtl", "vertical-lr", "mixed"],
    ["rotate-90", "rtl", "sideways-rl", "mixed"],
    ["rotate-270", "rtl", "sideways-lr", "mixed"],
    ["stacked", "rtl", "vertical-rl", "upright"],
    ["stacked", "ltr", "vertical-lr", "upright"],
  ] as const)("retains %s direction and %s line order", (direction, order, mode, orientation) => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.direction = direction;
    shapeText.layout.lineOrder = order;
    expect(shapeCanvasTextEditorStyle(drawing({ shapeText }))).toMatchObject({
      writingMode: mode,
      textOrientation: orientation,
      whiteSpace: "pre-wrap",
    });
  });
  test("legacy text-box defaults are transient and keep their six-pixel margins", () => {
    const source = drawing({ textDirection: "vertical" });
    expect(shapeCanvasTextEditorStyle(source)).toMatchObject({
      fontSize: "20px",
      lineHeight: "normal",
      textAlign: "center",
      paddingTop: "6px",
      paddingRight: "6px",
      paddingBottom: "6px",
      paddingLeft: "6px",
      writingMode: "vertical-rl",
    });
    expect(source.shapeText).toBeUndefined();
    expect(source.textDirection).toBe("vertical");
  });
  test.each([0, -1, Infinity, NaN])("rejects an invalid projection scale %s", (scale) => {
    expect(() => shapeCanvasTextEditorStyle(drawing(), scale)).toThrow(RangeError);
  });
});

describe("native layout block origin during editing", () => {
  test.each(["start", "center", "end"] as const)(
    "retains horizontal %s block origin from genuine layout",
    (alignment) => {
      const shapeText = createDefaultShapeText();
      shapeText.layout.blockAlignment = alignment;
      const source = drawing({ shapeText, text: "one\ntwo" }),
        before = structuredClone(source);
      const layout = layoutDrawingShapeText(source, nativeMetrics);
      const style = shapeCanvasTextBlockStyle(source, layout, 1.5);
      expect(parseFloat(String(style.paddingTop))).toBeCloseTo(
        shapeText.layout.marginsPt.topPt * 2 + Math.max(0, layout.lines[0]!.blockStart) * 1.5,
        10,
      );
      expect(style.lineHeight).toBe(`${layout.lines[0]!.blockAdvance * 1.5}px`);
      expect(source).toEqual(before);
    },
  );
  test.each([
    ["vertical-rl", "rtl", "paddingRight"],
    ["vertical-lr", "rtl", "paddingLeft"],
    ["rotate-90", "rtl", "paddingRight"],
    ["rotate-270", "rtl", "paddingLeft"],
    ["stacked", "rtl", "paddingRight"],
    ["stacked", "ltr", "paddingLeft"],
  ] as const)("retains %s/%s centered block origin", (direction, order, property) => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.direction = direction;
    shapeText.layout.lineOrder = order;
    shapeText.layout.blockAlignment = "center";
    const source = drawing({ shapeText, text: "ab\ncd" }),
      layout = layoutDrawingShapeText(source, nativeMetrics);
    const margin =
      property === "paddingRight"
        ? shapeText.layout.marginsPt.rightPt
        : shapeText.layout.marginsPt.leftPt;
    expect(shapeCanvasTextBlockStyle(source, layout)[property]).toBe(
      `${(margin * 96) / 72 + Math.max(0, layout.lines[0]!.blockStart)}px`,
    );
  });
});
const nativeMetrics = {
  measurer: { measure: (text: string) => Array.from(text).length * 10 },
  normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
};
