// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellNote,
} from "@sheetcraft/core/workbook";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  capturePrintNoteBoxes,
  getPrintNoteBoxExtent,
  paintPrintNoteBoxes,
} from "../../../modules/page-layout/page-print-note-boxes";
import { createPrintShapeMetrics } from "../../../modules/page-layout/page-print-shapes";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import { browserCellTextMeasurer } from "../../../shared/cell-text/text-metrics";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const workbook = createWorkbook({ id: "note-box-print", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.defaultColumnWidth = 100;
  sheet.defaultRowHeight = 20;
  return { workbook, sheet };
}
function capture(
  f: ReturnType<typeof fixture>,
  displayedKeys?: ReadonlySet<string>,
  printArea?: Parameters<typeof capturePrintNoteBoxes>[0]["printArea"],
) {
  const metrics = createPrintShapeMetrics(f.sheet, createSheetEvaluator(f.sheet));
  return {
    metrics,
    boxes: capturePrintNoteBoxes({
      sheet: f.sheet,
      metrics,
      displayedKeys,
      printArea,
      anonymous: "Anonymous",
    }),
  };
}

describe("displayed note print boxes", () => {
  test("captures only displayed committed notes, positioning from a merged anchor's right edge and respecting print-area intersection", () => {
    const f = fixture();
    f.sheet.columnWidths.set(0, 120);
    f.sheet.rowHeights.set(0, 30);
    f.sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
    setCellNote(
      f.sheet,
      { row: 1, column: 1 },
      { text: "Merged", author: "Mia", box: { offsetX: 10, offsetY: 5, width: 90, height: 50 } },
    );
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "Not displayed" });
    setCellNote(f.sheet, { row: 5, column: 5 }, { text: "Outside area" });
    const before = serializeWorkbook(f.workbook);
    expect(capture(f).boxes).toEqual([]);
    const { boxes } = capture(f, new Set(["1:1", "5:5", "9:9"]), {
      start: { row: 2, column: 2 },
      end: { row: 3, column: 3 },
    });
    expect(boxes).toEqual([
      {
        key: "1:1",
        origin: { x: 320, y: 30 },
        x: 330,
        y: 35,
        width: 90,
        height: 50,
        author: "Mia",
        text: "Merged",
      },
    ]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["rows", "columns"] as const)(
    "omits notes whose entire merged %s are hidden but retains partly visible areas",
    (axis) => {
      const f = fixture();
      f.sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
      setCellNote(f.sheet, { row: 1, column: 1 }, { text: "Visible remainder" });
      if (axis === "rows") f.sheet.hiddenRows = new Set([1, 2]);
      else f.sheet.hiddenColumns = new Set([1, 2]);
      expect(capture(f, new Set(["1:1"])).boxes).toEqual([]);
      if (axis === "rows") f.sheet.hiddenRows = new Set([1]);
      else f.sheet.hiddenColumns = new Set([1]);
      expect(capture(f, new Set(["1:1"])).boxes).toHaveLength(1);
    },
  );

  test("uses the anonymous label and default box without storing defaults into the note", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "Anonymous source" });
    const before = serializeWorkbook(f.workbook);
    expect(capture(f, new Set(["0:0"])).boxes).toMatchObject([
      { author: "Anonymous", text: "Anonymous source", width: 128, height: 80 },
    ]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("does not count an extra row or column when the box ends exactly on a cell boundary", () => {
    const f = fixture();
    setCellNote(
      f.sheet,
      { row: 0, column: 0 },
      { text: "Boundary", box: { offsetX: 0, offsetY: 0, width: 100, height: 40 } },
    );
    const { boxes, metrics } = capture(f, new Set(["0:0"]));
    expect(getPrintNoteBoxExtent(boxes, metrics)).toEqual({ rowCount: 2, columnCount: 2 });
    expect(getPrintNoteBoxExtent([{ ...boxes[0]!, width: 101, height: 41 }], metrics)).toEqual({
      rowCount: 3,
      columnCount: 3,
    });
    expect(getPrintNoteBoxExtent([], metrics)).toEqual({ rowCount: 0, columnCount: 0 });
  });

  test("paints the leader and pale box and clips text to its stored dimensions", () => {
    const f = fixture();
    setCellNote(
      f.sheet,
      { row: 0, column: 0 },
      {
        text: "first line\nsecond line\nthird line",
        author: "Mia",
        box: { offsetX: 10, offsetY: 0, width: 100, height: 36 },
      },
    );
    const before = serializeWorkbook(f.workbook);
    const { boxes } = capture(f, new Set(["0:0"]));
    const text: string[] = [],
      colors: unknown[] = [];
    const methods: Record<string, unknown> = {
      measureText: (value: string) => ({ width: value.length * 5 }),
      fillText: vi.fn((value: string) => {
        text.push(value);
      }),
    };
    methods.fillRect = vi.fn(() => {
      colors.push(methods.fillStyle);
    });
    const context = new Proxy(methods, {
      get(target, key: string) {
        return target[key] ?? (target[key] = vi.fn());
      },
    }) as unknown as CanvasRenderingContext2D;
    paintPrintNoteBoxes(context, boxes, { x: 0, y: 0, width: 500, height: 300 });
    expect(context.moveTo).toHaveBeenCalledWith(100, 0);
    expect(context.fillRect).toHaveBeenCalledWith(110, 0, 100, 36);
    expect(colors).toContain("#ffffe1");
    expect(context.rect).toHaveBeenCalledWith(113, 2, 94, 32);
    expect(context.clip).toHaveBeenCalled();
    expect(text).toEqual(["Mia:", "first line"]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});

describe("renderer displayed-note pagination", () => {
  test("extends automatic pagination for shown boxes, while explicit print areas and other comment modes preserve their boundaries", () => {
    const f = fixture();
    setCellNote(
      f.sheet,
      { row: 0, column: 0 },
      { text: "Printed box", box: { offsetX: 700, offsetY: 0, width: 300, height: 100 } },
    );
    vi.spyOn(browserCellTextMeasurer, "measure").mockImplementation(
      (text, font) => (text.length * font.size) / 2,
    );
    const before = serializeWorkbook(f.workbook);
    const base = cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP);
    const displayed = {
      ...base,
      printOptions: { ...base.printOptions!, cellComments: "asDisplayed" as const },
    };
    const build = (setup = displayed) =>
      createPrintPreviewDocument({
        sheet: f.sheet,
        evaluator: createSheetEvaluator(f.sheet),
        setup,
        displayedNoteKeys: new Set(["0:0"]),
      });
    const expanded = build();
    expect(expanded.noteBoxes).toHaveLength(1);
    expect(expanded.pages.length).toBeGreaterThan(1);
    const explicit = build({
      ...displayed,
      printArea: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
    });
    expect(explicit.pages).toHaveLength(1);
    expect(explicit.noteBoxes).toHaveLength(1);
    const none = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      setup: base,
      displayedNoteKeys: new Set(["0:0"]),
    });
    expect(none.noteBoxes).toEqual([]);
    expect(none.pages).toHaveLength(1);
    const atEnd = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      setup: { ...base, printOptions: { ...base.printOptions!, cellComments: "atEnd" } },
      displayedNoteKeys: new Set(["0:0"]),
    });
    expect(atEnd.noteBoxes).toEqual([]);
    expect(atEnd.pages.some(({ notes }) => !!notes)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
