// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import { createSheet, createSheetEvaluator, setCellContent } from "@sheetcraft/core/workbook";
import type { SheetAttachmentDrawing, SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createPrintShapeMetrics } from "../../../modules/page-layout/page-print-shapes";
import {
  capturePrintWidgets,
  getPrintWidgetExtent,
} from "../../../modules/page-layout/page-print-widgets";
import { controlDrawing } from "../form-controls/fixture";

function camera(): SheetCameraDrawing {
  return {
    ...createGraphicDrawing("camera", "icon", "Camera", { row: 0, column: 0 }),
    kind: "camera",
    shape: "rectangle",
    camera: {
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      gridLines: true,
    },
  };
}
function attachment(): SheetAttachmentDrawing {
  return {
    ...createGraphicDrawing("attachment", "icon", "Attachment", { row: 0, column: 0 }),
    kind: "attachment",
    shape: "rectangle",
    attachment: {
      filename: "report.txt",
      mimeType: "text/plain",
      size: 3,
      data: "YWJj",
      display: "document",
    },
  };
}

describe("print widgets capture", () => {
  test("includes icons, cameras, attachments, controls and legacy WordArt in their source drawing order", () => {
    const sheet = createSheet("Widgets", "sheet");
    sheet.drawings = [
      createGraphicDrawing("icon", "icon", "Icon", { row: 0, column: 0 }),
      createGraphicDrawing("ordinary-shape", "shape", "Shape", { row: 0, column: 0 }),
      camera(),
      attachment(),
      controlDrawing(),
      createGraphicDrawing("word-art", "wordArt", "Legacy WordArt", { row: 0, column: 0 }),
      createGraphicDrawing("text-box", "textBox", "Text box", { row: 0, column: 0 }),
    ];
    const before = JSON.stringify(sheet.drawings);
    const evaluator = createSheetEvaluator(sheet);
    const metrics = createPrintShapeMetrics(sheet, evaluator);

    const entries = capturePrintWidgets(sheet, evaluator, metrics);

    expect(entries.map(({ drawing, order }) => [drawing.id, drawing.kind, order])).toEqual([
      ["icon", "icon", 0],
      ["camera", "camera", 2],
      ["attachment", "attachment", 3],
      ["control", "control", 4],
      ["word-art", "wordArt", 5],
    ]);
    expect(
      entries.every((entry) => entry.layout.bounds.width > 0 && entry.layout.bounds.height > 0),
    ).toBe(true);
    expect(JSON.stringify(sheet.drawings)).toBe(before);
  });

  test.each([
    { rotation: 0, rowCount: 5, columnCount: 4 },
    { rotation: 90, rowCount: 7, columnCount: 3 },
  ])(
    "uses rotated widget bounds and actual sheet dimensions for extent at $rotation degrees",
    ({ rotation, rowCount, columnCount }) => {
      const sheet = createSheet("Geometry", "sheet");
      sheet.defaultColumnWidth = 50;
      sheet.defaultRowHeight = 20;
      sheet.columnWidths.set(0, 80);
      sheet.rowHeights.set(0, 30);
      sheet.drawings = [
        {
          ...createGraphicDrawing("sized-icon", "icon", "Icon", { row: 1, column: 1 }),
          offsetX: 10,
          offsetY: 30,
          width: 120,
          height: 40,
          rotation,
        },
      ];
      const evaluator = createSheetEvaluator(sheet);
      const metrics = createPrintShapeMetrics(sheet, evaluator);
      const entries = capturePrintWidgets(sheet, evaluator, metrics);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.layout.rect).toMatchObject({ x: 90, y: 60, width: 120, height: 40 });
      expect(getPrintWidgetExtent(entries, metrics)).toEqual({ rowCount, columnCount });
    },
  );

  test("captures a control's linked value and resolved source items independently of later sheet edits", () => {
    const sheet = createSheet("Control snapshot", "sheet");
    const drawing = controlDrawing("combo");
    drawing.control.source = { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } };
    sheet.drawings = [drawing];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "First" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 17 });
    const evaluator = createSheetEvaluator(sheet);
    const metrics = createPrintShapeMetrics(sheet, evaluator);
    const entry = capturePrintWidgets(sheet, evaluator, metrics)[0]!;
    expect(entry).toMatchObject({ value: 2, items: ["First", "17"] });

    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Changed" });
    drawing.control.label = "New label";
    drawing.control.source.start.row = 1;
    const current = createSheetEvaluator(sheet);
    const updated = capturePrintWidgets(
      sheet,
      current,
      createPrintShapeMetrics(sheet, current),
    )[0]!;

    expect(updated).toMatchObject({ value: 1, items: ["17"] });
    expect(entry).toMatchObject({
      value: 2,
      items: ["First", "17"],
      drawing: {
        control: {
          label: "Choose",
          source: { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } },
        },
      },
    });
  });

  test("copies manual control items when no cell source is present", () => {
    const sheet = createSheet("Manual control", "sheet");
    const drawing = controlDrawing("list");
    sheet.drawings = [drawing];
    const evaluator = createSheetEvaluator(sheet);
    const entry = capturePrintWidgets(
      sheet,
      evaluator,
      createPrintShapeMetrics(sheet, evaluator),
    )[0]!;
    drawing.control.items.push("Later");
    expect(entry.items).toEqual(["One", "Two"]);
    expect(entry.drawing).toMatchObject({ control: { items: ["One", "Two"] } });
  });

  test("reports no widget extent when the sheet has no widgets", () => {
    const sheet = createSheet("Empty", "sheet");
    const evaluator = createSheetEvaluator(sheet);
    const metrics = createPrintShapeMetrics(sheet, evaluator);
    expect(getPrintWidgetExtent(capturePrintWidgets(sheet, evaluator, metrics), metrics)).toEqual({
      rowCount: 0,
      columnCount: 0,
    });
  });
});
