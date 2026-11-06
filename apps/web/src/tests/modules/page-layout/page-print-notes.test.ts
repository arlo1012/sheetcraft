// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheetEvaluator,
  getActiveSheet,
  setCellNote,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  MAX_CELL_TEXT_LAYOUT_LINES,
  type TextMeasurer,
} from "@sheetcraft/sheet-engine/text-layout";
import { createPrintNotePages } from "../../../modules/page-layout/page-print-notes";
import {
  createPrintPreviewDocument,
  createPrintPreviewRenderer,
} from "../../../modules/page-layout/page-print-renderer";
import { browserCellTextMeasurer } from "../../../shared/cell-text/text-metrics";

const measurer: TextMeasurer = {
  measure: (text, font) => (Array.from(text).length * font.size) / 2,
};
const range: CellRange = { start: { row: 0, column: 0 }, end: { row: 3, column: 3 } };
beforeEach(() => {
  vi.spyOn(browserCellTextMeasurer, "measure").mockImplementation(measurer.measure);
});
afterEach(() => vi.restoreAllMocks());

function fixture() {
  const workbook = createWorkbook({ id: "print-notes", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.name = "Notes sheet";
  return { workbook, sheet };
}
function options(sheet: ReturnType<typeof fixture>["sheet"]) {
  return {
    sheet,
    range,
    width: 600,
    height: 900,
    printScale: 1,
    locale: "en-US",
    measurer,
    maxPages: 100,
  };
}
function setup(cellComments: "none" | "atEnd") {
  const result = cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP);
  result.printArea = structuredClone(range);
  result.printOptions = { ...result.printOptions!, cellComments };
  return result;
}

describe("print note appendix layout", () => {
  test("captures only notes in range in row/column order, retaining authors without changing source notes or boxes", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 3, column: 2 }, { text: "Third note", author: "Wen" });
    setCellNote(f.sheet, { row: 1, column: 1 }, { text: "Second note" });
    setCellNote(
      f.sheet,
      { row: 1, column: 0 },
      {
        text: "First note",
        author: "Mia",
        box: { offsetX: 12, offsetY: -8, width: 260, height: 140 },
      },
    );
    setCellNote(
      f.sheet,
      { row: 0, column: 0 },
      { text: "Outside the selected range", author: "Excluded" },
    );
    const before = serializeWorkbook(f.workbook);
    const pages = createPrintNotePages({
      ...options(f.sheet),
      range: { start: { row: 1, column: 0 }, end: { row: 3, column: 2 } },
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]!.title).toBe("Notes sheet · Notes");
    expect(pages[0]!.lines.filter(({ bold }) => bold).map(({ text }) => text)).toEqual([
      "A2 · Mia",
      "B2",
      "C4 · Wen",
    ]);
    expect(pages[0]!.lines.filter(({ bold }) => !bold).map(({ text }) => text)).toEqual([
      "First note",
      "Second note",
      "Third note",
    ]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["en-US", "zh-CN"])(
    "keeps every paragraph, CJK character and long-word character across continuation pages in %s",
    (locale) => {
      const f = fixture();
      const text =
        "第一段中文不应丢失，继续逐字保留。\r\n\r\nSUPERCALIFRAGILISTICEXPIALIDOCIOUSWITHOUTSPACES\n最后一段保留全部内容。";
      setCellNote(f.sheet, { row: 0, column: 0 }, { text, author: "张三\n李四" });
      const before = serializeWorkbook(f.workbook);
      const pages = createPrintNotePages({ ...options(f.sheet), width: 140, height: 110, locale });

      expect(pages.length).toBeGreaterThan(1);
      const bodies = pages.flatMap(({ lines }) =>
        lines.filter(({ bold }) => !bold).map(({ text }) => text),
      );
      expect(bodies.join("")).toBe(text.replace(/\r\n?/gu, "\n").replaceAll("\n", ""));
      expect(bodies).toContain("");
      expect(pages[0]!.lines.filter(({ bold }) => bold).map(({ text }) => text)).toEqual([
        "A1 · 张三",
        "李四",
      ]);
      for (const page of pages.slice(1)) {
        expect(
          page.lines.some(
            ({ text, bold }) =>
              bold && text.includes("A1") && text.includes(locale === "zh-CN" ? "续" : "continued"),
          ),
        ).toBe(true);
        expect(page.lines.every(({ y }) => y >= 0 && y + 20 <= 110)).toBe(true);
      }
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("retains the same physical typography and wrapping when worksheet print scale changes", () => {
    const f = fixture();
    setCellNote(
      f.sheet,
      { row: 0, column: 0 },
      { text: "中文内容与LongContinuousEnglishWord分段保真\nSecond paragraph", author: "Mia" },
    );
    const baseline = createPrintNotePages({ ...options(f.sheet), width: 140, height: 150 });
    for (const printScale of [0.5, 1, 2]) {
      const pages = createPrintNotePages({
        ...options(f.sheet),
        width: 140 / printScale,
        height: 150 / printScale,
        printScale,
      });
      expect(pages).toHaveLength(baseline.length);
      for (const [index, page] of pages.entries()) {
        expect(page.fontSize * printScale).toBeCloseTo(14);
        expect(page.titleSize * printScale).toBeCloseTo(17);
        expect(page.lines.map(({ text, bold, y }) => ({ text, bold, y: y * printScale }))).toEqual(
          baseline[index]!.lines,
        );
      }
    }
  });

  test("admits the required note page count exactly and rejects any lower budget instead of dropping text", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "LongNoteWithoutSpaces".repeat(10) });
    const parameters = { ...options(f.sheet), width: 140, height: 110 };
    const pages = createPrintNotePages(parameters);
    expect(pages.length).toBeGreaterThan(1);
    expect(createPrintNotePages({ ...parameters, maxPages: pages.length })).toEqual(pages);
    expect(() => createPrintNotePages({ ...parameters, maxPages: pages.length - 1 })).toThrow(
      RangeError,
    );
    expect(() => createPrintNotePages({ ...parameters, maxPages: 0 })).toThrow(RangeError);
  });

  test("rejects text exceeding the shared layout line limit instead of printing a truncated appendix", () => {
    const f = fixture();
    setCellNote(
      f.sheet,
      { row: 0, column: 0 },
      { text: "x".repeat(MAX_CELL_TEXT_LAYOUT_LINES + 1) },
    );
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      createPrintNotePages({ ...options(f.sheet), width: 7, height: 900, maxPages: 10000 }),
    ).toThrow(RangeError);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("returns no note pages for an empty range even when the remaining page budget is zero", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 5, column: 0 }, { text: "Outside" });
    expect(createPrintNotePages({ ...options(f.sheet), maxPages: 0 })).toEqual([]);
  });
});

describe("print renderer note pages", () => {
  test("adds no appendix for cellComments=none, including sheets containing notes", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "Not requested" });
    const before = serializeWorkbook(f.workbook);
    const document = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      setup: setup("none"),
    });
    expect(document.pages).toHaveLength(1);
    expect(document.pages.every(({ notes }) => notes === undefined)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("adds no appendix when atEnd has no notes within the print area", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 5, column: 0 }, { text: "Outside the print area" });
    const before = serializeWorkbook(f.workbook);
    const document = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      setup: setup("atEnd"),
    });
    expect(document.pages).toHaveLength(1);
    expect(document.pages[0]!.notes).toBeUndefined();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("appends notes after worksheet pages and preserves physical note font sizes at different print scales", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "Printable note", author: "Mia" });
    const before = serializeWorkbook(f.workbook);
    for (const scale of [50, 100, 200]) {
      const document = createPrintPreviewDocument({
        sheet: f.sheet,
        evaluator: createSheetEvaluator(f.sheet),
        setup: {
          ...setup("atEnd"),
          scale,
          printArea: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        },
      });
      expect(document.pages).toHaveLength(2);
      expect(document.pages.map(({ pageNumber }) => pageNumber)).toEqual([1, 2]);
      expect(document.pages[0]!.notes).toBeUndefined();
      const appendix = document.pages[1]!.notes!;
      expect(appendix.lines.map(({ text }) => text)).toEqual(["A1 · Mia", "Printable note"]);
      expect(appendix.fontSize * document.pagination.printScale).toBeCloseTo(14);
      expect(appendix.titleSize * document.pagination.printScale).toBeCloseTo(17);
    }
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("counts worksheet and note pages together at the 10000-page limit", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "Final appendix page" });
    const parameters = setup("atEnd");
    parameters.printArea = { start: { row: 0, column: 0 }, end: { row: 9998, column: 0 } };
    parameters.rowBreaks = Array.from({ length: 9998 }, (_, index) => index + 1);
    const before = serializeWorkbook(f.workbook);
    const admitted = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      setup: parameters,
    });
    expect(admitted.pages).toHaveLength(10000);
    expect(admitted.pages.at(-1)?.notes).toBeDefined();
    expect(() =>
      createPrintPreviewDocument({
        sheet: f.sheet,
        evaluator: createSheetEvaluator(f.sheet),
        setup: {
          ...parameters,
          printArea: { start: { row: 0, column: 0 }, end: { row: 9999, column: 0 } },
          rowBreaks: Array.from({ length: 9999 }, (_, index) => index + 1),
        },
      }),
    ).toThrow(RangeError);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("paints the appendix and includes its page in header/footer page counts without changing notes", () => {
    const f = fixture();
    setCellNote(f.sheet, { row: 0, column: 0 }, { text: "Printable note", author: "Mia" });
    const parameters = setup("atEnd");
    parameters.header.center = "Page &P of &N";
    parameters.footer.center = "Total &N";
    const document = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      setup: parameters,
    });
    const before = serializeWorkbook(f.workbook);
    const text: string[] = [];
    const methods: Record<string, unknown> = {
      measureText: (value: string) => ({
        width: value.length * 7,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 3,
      }),
      fillText: vi.fn((value: string) => {
        text.push(value);
      }),
    };
    const context = new Proxy(methods, {
      get(target, key: string) {
        return target[key] ?? (target[key] = vi.fn());
      },
    }) as unknown as CanvasRenderingContext2D;
    const canvas = globalThis.document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(context);
    const renderer = createPrintPreviewRenderer();
    try {
      renderer.render({ canvas, document, page: document.pages[1]!, scale: 1, density: 1 });
      expect(text.join("")).toContain("Page 2 of 2");
      expect(text.join("")).toContain("Total 2");
      expect(text).toContain("Notes sheet · Notes");
      expect(text).toContain("A1 · Mia");
      expect(text).toContain("Printable note");
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      renderer.dispose();
    }
  });
});
