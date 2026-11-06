// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import {
  collectPrintJobPages,
  writePrintOutput,
} from "../../../modules/page-layout/page-print-job";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";

function documentWithPages(name: string, pageNumbers: readonly number[]) {
  const sheet = createSheet(name, name);
  const setup = cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP);
  setup.printArea = { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
  const document = createPrintPreviewDocument({
    sheet,
    evaluator: createSheetEvaluator(sheet),
    setup,
  });
  return {
    ...document,
    pages: pageNumbers.map((pageNumber) => ({ ...document.pages[0]!, pageNumber })),
  };
}

describe("workbook print job pages", () => {
  test("flattens worksheets in supplied order with global numbering while retaining local page objects and numbers", () => {
    const second = documentWithPages("Second worksheet", [4, 5]);
    const first = documentWithPages("First worksheet", [1, 2, 3]);
    const result = collectPrintJobPages([second, first]);

    expect(result.map(({ pageNumber }) => pageNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(result.map(({ document }) => document.sheet.name)).toEqual([
      "Second worksheet",
      "Second worksheet",
      "First worksheet",
      "First worksheet",
      "First worksheet",
    ]);
    expect(result.map(({ page }) => page.pageNumber)).toEqual([4, 5, 1, 2, 3]);
    expect(result[0]!.document).toBe(second);
    expect(result[0]!.page).toBe(second.pages[0]);
    expect(result[2]!.document).toBe(first);
    expect(result[2]!.page).toBe(first.pages[0]);
    expect(second.pages.map(({ pageNumber }) => pageNumber)).toEqual([4, 5]);
    expect(first.pages.map(({ pageNumber }) => pageNumber)).toEqual([1, 2, 3]);
  });

  test("omits empty documents without leaving gaps in job page numbers", () => {
    const empty = documentWithPages("Empty", []);
    const visible = documentWithPages("Pages", [1, 2]);
    expect(collectPrintJobPages([])).toEqual([]);
    expect(collectPrintJobPages([empty, visible]).map(({ pageNumber }) => pageNumber)).toEqual([
      1, 2,
    ]);
  });

  test("admits 10000 pages across worksheets and rejects a job that exceeds the combined limit", () => {
    const first = documentWithPages(
      "A",
      Array.from({ length: 5000 }, (_, index) => index + 1),
    );
    const second = documentWithPages(
      "B",
      Array.from({ length: 5000 }, (_, index) => index + 1),
    );
    const extra = documentWithPages("C", [1]);
    const admitted = collectPrintJobPages([first, second]);
    expect(admitted).toHaveLength(10000);
    expect(admitted.at(-1)).toMatchObject({ pageNumber: 10000, page: { pageNumber: 5000 } });
    expect(() => collectPrintJobPages([first, second, extra])).toThrow(RangeError);
    expect(first.pages).toHaveLength(5000);
    expect(second.pages).toHaveLength(5000);
    expect(extra.pages[0]!.pageNumber).toBe(1);
  });
});

describe("mixed-paper print output", () => {
  test("keeps page order and assigns physical dimensions and reusable named page rules to every image", () => {
    const target = document.implementation.createHTMLDocument();
    const close = vi.spyOn(target, "close");
    const pages = [
      { source: "data:image/png;base64,QQ==", widthMm: 210, heightMm: 297 },
      { source: "data:image/png;base64,Qg==", widthMm: 297, heightMm: 210 },
      { source: "data:image/png;base64,Qw==", widthMm: 210, heightMm: 297 },
      { source: "data:image/png;base64,RA==", widthMm: 100, heightMm: 150 },
    ];
    writePrintOutput(target, "Mixed worksheet papers", pages);

    expect(target.title).toBe("Mixed worksheet papers");
    const images = [...target.body.querySelectorAll("img")];
    expect(images.map((image) => image.src)).toEqual(pages.map(({ source }) => source));
    expect(images.map((image) => [image.style.width, image.style.height])).toEqual([
      ["210mm", "297mm"],
      ["297mm", "210mm"],
      ["210mm", "297mm"],
      ["100mm", "150mm"],
    ]);
    expect(images[0]!.style.page).toBeTruthy();
    expect(images[0]!.style.page).toBe(images[2]!.style.page);
    expect(images[0]!.style.page).not.toBe(images[1]!.style.page);
    expect(images[1]!.style.page).not.toBe(images[3]!.style.page);
    const rules = target.head.querySelector("style")!.textContent!;
    expect([...rules.matchAll(/@page\s+([\w-]+)\s*\{/g)]).toHaveLength(3);
    for (const [index, page] of pages.entries())
      expect(rules).toContain(
        `@page ${images[index]!.style.page} { size: ${page.widthMm}mm ${page.heightMm}mm;`,
      );
    expect(rules).toContain("img:last-child { break-after: auto; }");
    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  test.each([
    { widthMm: 0, heightMm: 297 },
    { widthMm: -1, heightMm: 297 },
    { widthMm: 210, heightMm: NaN },
    { widthMm: Infinity, heightMm: 297 },
  ])("rejects invalid physical paper dimensions $widthMm × $heightMm", ({ widthMm, heightMm }) => {
    const target = document.implementation.createHTMLDocument();
    expect(() =>
      writePrintOutput(target, "Invalid paper", [
        { source: "data:image/png;base64,QQ==", widthMm, heightMm },
      ]),
    ).toThrow(RangeError);
  });
});
