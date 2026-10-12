import { expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { collectWorkbookImageAssetIds } from "../../../modules/image-assets/useImageAssetUrls";

test("shape fill and line textures are document-owned, de-duplicated and read without mutating drawings", () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s" });
  const drawing = createGraphicDrawing("d", "shape", "shape", {
    row: 0,
    column: 0,
  });
  const paint = {
    kind: "picture" as const,
    assetId: "texture",
    opacity: 1,
    rotateWithShape: true,
    layout: {
      kind: "tile" as const,
      scaleX: 1,
      scaleY: 1,
      offsetXPt: 0,
      offsetYPt: 0,
      flip: "none" as const,
      anchor: "center" as const,
    },
  };
  drawing.shapeStyle = {
    fill: { kind: "value", value: paint },
    line: {
      kind: "value",
      value: {
        paint,
        widthPt: 1,
        compound: "single",
        dash: "solid",
        cap: "butt",
        join: "miter",
        miterLimit: 4,
      },
    },
  };
  getActiveSheet(workbook).drawings = [drawing];
  const before = structuredClone(workbook);
  expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set(["texture"]));
  expect(workbook).toEqual(before);
  if (drawing.shapeStyle.line?.kind === "value") {
    drawing.shapeStyle.line.value.paint = { ...paint, assetId: "line" };
  }
  expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set(["texture", "line"]));
});

test("ordinary shapes and empty drawing collections need no image resources", () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s" });
  expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set());
  getActiveSheet(workbook).drawings = [
    createGraphicDrawing("d", "shape", "shape", { row: 0, column: 0 }),
  ];
  expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set());
});

test.each(["shape", "textBox"] as const)(
  "%s text fill/line assets are durable independent sources without duplicate loads",
  (kind) => {
    const workbook = createWorkbook({ id: "w", sheetId: "s" });
    const drawing = createGraphicDrawing("d", kind, "", { row: 0, column: 0 });
    const paint = {
      kind: "picture" as const,
      assetId: "text-fill",
      opacity: 1,
      rotateWithShape: true,
      layout: {
        kind: "stretch" as const,
        offsetXRatio: 0,
        offsetYRatio: 0,
        widthRatio: 1,
        heightRatio: 1,
      },
    };
    drawing.shapeText!.style = {
      fill: { kind: "value", value: paint },
      line: {
        kind: "value",
        value: {
          paint: { ...paint, assetId: "text-line" },
          widthPt: 1,
          compound: "single",
          dash: "solid",
          cap: "butt",
          join: "miter",
          miterLimit: 4,
        },
      },
    };
    getActiveSheet(workbook).drawings = [drawing];
    const before = structuredClone(workbook);
    expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set(["text-fill", "text-line"]));
    expect(workbook).toEqual(before);
  },
);
