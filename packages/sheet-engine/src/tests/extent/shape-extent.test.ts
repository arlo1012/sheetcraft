import { expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { getSheetContentExtent } from "../../extent.js";
function shape(): SheetFramedGraphicDrawing {
  return normalizeSheetDrawing({
    id: "shape",
    kind: "shape",
    name: "shape",
    text: "",
    shape: "rectangle",
    fill: "#abcdef",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 20,
    bold: false,
    italic: false,
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 8000, y: 2400, size: { width: 240, height: 120 } },
    },
  });
}
test("source-free shape-only placement remains reachable past the blank surface", () => {
  const sheet = createSheet("shape", "sheet");
  sheet.drawings = [shape()];
  const extent = getSheetContentExtent(sheet);
  expect(extent.rowCount).toBeGreaterThan(100);
  expect(extent.columnCount).toBeGreaterThan(26);
});
test("hidden endpoint markers remain reachable without changing their source", () => {
  const sheet = createSheet("shape", "sheet"),
    drawing = shape();
  drawing.shapeFrame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 3, offset: 0 }, row: { index: 200, offset: 0 } },
    end: { column: { index: 5, offset: 0 }, row: { index: 220, offset: 0 } },
  };
  sheet.drawings = [drawing];
  sheet.hiddenRows = new Set(Array.from({ length: 21 }, (_, i) => 200 + i));
  const before = JSON.stringify(drawing),
    extent = getSheetContentExtent(sheet);
  expect(extent.rowCount).toBeGreaterThanOrEqual(221);
  expect(JSON.stringify(drawing)).toBe(before);
});
test("terminal and negative rails remain finite and bounded", () => {
  const sheet = createSheet("shape", "sheet"),
    drawing = shape();
  drawing.shapeFrame.anchor = { mode: "fixed", x: -100, y: -50, size: { width: 120, height: 80 } };
  sheet.drawings = [drawing];
  const extent = getSheetContentExtent(sheet);
  expect(extent.rowCount).toBeGreaterThan(0);
  expect(extent.columnCount).toBeGreaterThan(0);
});
