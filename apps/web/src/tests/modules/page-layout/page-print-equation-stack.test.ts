import { afterEach, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  createPrintPreviewDocument,
  createPrintPreviewRenderer,
} from "../../../modules/page-layout/page-print-renderer";
import * as mathPixels from "../../../modules/page-layout/page-print-equation-pixels";
import * as shapePaint from "../../../modules/page-layout/page-print-shapes";
import * as scenePaint from "../../../modules/sheet-grid/canvas/scene-painter";
import * as borders from "../../../modules/sheet-grid/canvas/border-painter";

afterEach(() => vi.restoreAllMocks());
test("mixed mathematical and shape roots print in actual worksheet order", async () => {
  const sheet = createSheet("Mixed math", "sheet"),
    order: string[] = [];
  sheet.drawings = ["equation", "shape", "equation", "shape", "equation"].map((kind, index) =>
    createGraphicDrawing(String(index), kind === "shape" ? "shape" : "equation", "Drawing", {
      row: 0,
      column: 0,
    }),
  );
  const preview = createPrintPreviewDocument({
    sheet,
    evaluator: createSheetEvaluator(sheet),
    nativeEquationConsumer: true,
  });
  let ready = false;
  const paint = vi.fn<ReturnType<typeof mathPixels.createPrintEquationPixels>["paint"]>(
    (_context, _pass, entry) => {
      order.push(entry.root.id);
    },
  );
  vi.spyOn(mathPixels, "createPrintEquationPixels").mockReturnValue({
    prepare: vi.fn(async () => {
      ready = true;
    }),
    paint,
    isReady: vi.fn(() => ready),
    clear: vi.fn(),
    dispose: vi.fn(),
  });
  vi.spyOn(scenePaint, "paintSheetScene").mockImplementation(() => {});
  vi.spyOn(borders, "paintSheetBorders").mockImplementation(() => {});
  vi.spyOn(shapePaint, "paintPrintShapes").mockImplementation((_context, options) => {
    for (const root of shapePaint.getPrintableShapeRoots(options.sheet)) {
      options.beforeRoot?.(root);
      order.push(root.id);
    }
  });
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const renderer = createPrintPreviewRenderer();
  const initialWidth = canvas.width;
  expect(() =>
    renderer.render({ canvas, document: preview, page: preview.pages[0]!, density: 2 }),
  ).toThrow(/not ready/);
  expect(canvas.width).toBe(initialWidth);
  await renderer.prepareEquations(preview, { isCurrent: () => true });
  renderer.render({ canvas, document: preview, page: preview.pages[0]!, density: 2 });
  expect(order).toEqual(["0", "1", "2", "3", "4"]);
  expect(paint).toHaveBeenCalledTimes(3);
  renderer.dispose();
});
test("an equation-only sheet contributes rotated extent before pagination", () => {
  const sheet = createSheet("Equation at the edge", "sheet");
  sheet.drawings = [
    {
      ...createGraphicDrawing("math", "equation", "Equation", { row: 80, column: 12 }),
      rotation: 37,
    },
  ];
  const preview = createPrintPreviewDocument({
    sheet,
    evaluator: createSheetEvaluator(sheet),
    nativeEquationConsumer: true,
  });
  const bounds = preview.equationPrintPass!.entries[0]!.bounds;
  expect(preview.geometry.rowCount).toBeGreaterThan(80);
  expect(preview.geometry.columnCount).toBeGreaterThan(12);
  expect(preview.pages.length).toBeGreaterThan(1);
  expect(bounds.bottom).toBeGreaterThan(80 * 24);
  expect(preview.equationPrintPass!.entries[0]!.input.sourceIdentity).toBe(sheet.drawings[0]);
});
test("title rows and columns capture the same real equation owner in every fragment", async () => {
  const sheet = createSheet("Repeated math", "sheet");
  sheet.drawings = [createGraphicDrawing("math", "equation", "Equation", { row: 0, column: 0 })];
  const preview = createPrintPreviewDocument({
    sheet,
    evaluator: createSheetEvaluator(sheet),
    nativeEquationConsumer: true,
    setup: {
      ...DEFAULT_SHEET_PAGE_SETUP,
      printArea: { start: { row: 3, column: 3 }, end: { row: 5, column: 5 } },
      printTitles: { rows: { start: 0, end: 0 }, columns: { start: 0, end: 0 }, bottomRows: null },
    },
  });
  const paint = vi.fn<ReturnType<typeof mathPixels.createPrintEquationPixels>["paint"]>();
  vi.spyOn(mathPixels, "createPrintEquationPixels").mockReturnValue({
    prepare: vi.fn(async () => {}),
    paint,
    isReady: vi.fn(() => true),
    clear: vi.fn(),
    dispose: vi.fn(),
  });
  vi.spyOn(scenePaint, "paintSheetScene").mockImplementation(() => {});
  vi.spyOn(borders, "paintSheetBorders").mockImplementation(() => {});
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const renderer = createPrintPreviewRenderer();
  renderer.render({ canvas, document: preview, page: preview.pages[0]!, density: 2 });
  expect(paint).toHaveBeenCalledTimes(4);
  expect(paint.mock.calls.every((call) => call[2].root === sheet.drawings![0])).toBe(true);
  const left = preview.geometry.getColumnOffset(3),
    top = preview.rows.getBoundaryOffset(3)!;
  expect(paint.mock.calls.map((call) => [call[3].x, call[3].y])).toEqual([
    [0, 0],
    [left, 0],
    [0, top],
    [left, top],
  ]);
  expect(context.clip).toHaveBeenCalledTimes(8);
  renderer.dispose();
});
