import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolveShapeAnchorRect } from "@sheetcraft/core/shape-frame";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createModernWordArtDrawing } from "../../../modules/sheet-drawings/modern-wordart-insertion";
import {
  materializeWordArtStylePreset,
  WORDART_STYLE_PRESETS,
} from "../../../modules/sheet-drawings/wordart-style-presets";

function fixture() {
  const sheet = getActiveSheet(createWorkbook({ id: "book", sheetId: "sheet" }));
  return { sheet, metrics: createPictureSheetMetrics(sheet) };
}
describe("modern WordArt insertion factory", () => {
  test("owns source-editable modern defaults and move-only canonical placement", () => {
    const f = fixture();
    const drawing = createModernWordArtDrawing({
      id: "new",
      name: "艺术字",
      placeholder: "请输入文字",
      address: { row: 2, column: 3 },
      metrics: f.metrics,
      choice: WORDART_STYLE_PRESETS[0]!,
    });
    expect(drawing).toMatchObject({
      kind: "shape",
      wordArt: true,
      text: "请输入文字",
      shapeGeometry: { preset: "rect" },
      fontSize: 96,
      bold: true,
      italic: false,
      rotation: 0,
      shapeStyle: { fill: { kind: "none" }, line: { kind: "none" } },
      shapeFrame: { kind: "shape-frame-v1", anchor: { mode: "move-only" } },
      shapeText: {
        layout: {
          blockAlignment: "start",
          direction: "horizontal",
          wrap: false,
          overflow: true,
          autoFit: "resize-shape",
          keepFlat: false,
          marginsPt: { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 },
        },
        paragraph: { alignment: "left", beforePt: 0, afterPt: 0, lineSpacing: { kind: "normal" } },
      },
    });
    expect(getShapeObjectProperties(drawing.shapeProperties)).toMatchObject({
      lockAspectRatio: false,
      locked: true,
      printObject: true,
    });
    for (const field of ["anchor", "offsetX", "offsetY", "width", "height", "textDirection"])
      expect(Object.hasOwn(drawing, field)).toBe(false);
    expect(drawing.shapeText?.fontFamily).toBeUndefined();
    expect(resolveShapeAnchorRect(drawing.shapeFrame.anchor, f.metrics)).toEqual({
      x: f.metrics.columns.visiblePrefix(3) + 8,
      y: f.metrics.rows.visiblePrefix(2) + 8,
      width: 240,
      height: 120,
    });
  });
  test.each(WORDART_STYLE_PRESETS)("materializes detached complete glyph preset $id", (choice) => {
    const f = fixture();
    const address = { row: 0, column: 0 };
    const options = {
      id: "new",
      name: "WordArt",
      placeholder: "Your text here",
      address,
      metrics: f.metrics,
      choice,
      fontFamily: "Aptos",
    };
    const first = createModernWordArtDrawing(options),
      second = createModernWordArtDrawing(options);
    expect(first.shapeText?.style).toEqual(materializeWordArtStylePreset(choice));
    expect(first.shapeText?.style).not.toBe(choice.style);
    expect(first.shapeText?.style).not.toBe(second.shapeText?.style);
    expect(first.shapeText?.fontFamily).toBe("Aptos");
    first.shapeText!.layout.marginsPt.leftPt = 12;
    first.shapeText!.style!.fill = { kind: "none" };
    address.row = 4;
    expect(second.shapeText!.layout.marginsPt.leftPt).toBe(7.2);
    expect(second.shapeText!.style).toEqual(materializeWordArtStylePreset(choice));
    expect(resolveShapeAnchorRect(second.shapeFrame.anchor, f.metrics).y).toBe(8);
  });
  test("rejects unknown styles and invalid worksheet addresses", () => {
    const f = fixture();
    const base = { id: "new", name: "WordArt", placeholder: "Text", metrics: f.metrics };
    expect(() =>
      createModernWordArtDrawing({ ...base, address: { row: 0, column: 0 }, choice: "unknown" }),
    ).toThrow();
    expect(() =>
      createModernWordArtDrawing({
        ...base,
        address: { row: -1, column: 0 },
        choice: WORDART_STYLE_PRESETS[0]!,
      }),
    ).toThrow();
  });
  test("retains the separate legacy kind=wordArt contract without migration", () => {
    const legacy = createGraphicDrawing("old", "wordArt", "Old WordArt", { row: 0, column: 0 });
    expect(normalizeSheetDrawing(legacy)).toEqual(legacy);
    expect(legacy).toMatchObject({
      kind: "wordArt",
      text: "Old WordArt",
      fontSize: 36,
      bold: true,
    });
    for (const field of ["wordArt", "shapeFrame", "shapeText", "shapeGeometry"])
      expect(Object.hasOwn(legacy, field)).toBe(false);
  });
});
