import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { SheetPageSetup } from "@sheetcraft/core/page-setup";
import type { PrintPreviewDocument, PrintPreviewPage } from "./page-print-renderer";

export type PrintSheetSource = { sheet: Sheet; evaluator: SheetEvaluator; setup: SheetPageSetup };
export type PrintJobPage = {
  document: PrintPreviewDocument;
  page: PrintPreviewPage;
  /** Job-wide page number; worksheet header/footer numbering remains local. */
  pageNumber: number;
};

export function collectPrintJobPages(documents: readonly PrintPreviewDocument[]): PrintJobPage[] {
  const result: PrintJobPage[] = [];
  for (const document of documents) {
    for (const page of document.pages) {
      if (result.length >= 10_000) throw new RangeError("Print job exceeds 10,000 pages.");
      result.push({ document, page, pageNumber: result.length + 1 });
    }
  }
  return result;
}

export type PrintOutputPage = { source: string; widthMm: number; heightMm: number };

/** Named pages preserve each worksheet's physical paper size in one print job. */
export function writePrintOutput(
  target: Document,
  title: string,
  pages: readonly PrintOutputPage[],
) {
  target.open();
  target.write("<!doctype html><html><head></head><body></body></html>");
  target.title = title;
  const style = target.createElement("style");
  const sizes = new Map<string, string>();
  const rules = [
    "@page { margin: 0; } html, body { margin: 0; } img { display: block; break-after: page; } img:last-child { break-after: auto; }",
  ];
  for (const page of pages) {
    if (
      !Number.isFinite(page.widthMm) ||
      !Number.isFinite(page.heightMm) ||
      page.widthMm <= 0 ||
      page.heightMm <= 0
    )
      throw new RangeError("Invalid print paper dimensions.");
    const size = `${page.widthMm}mm ${page.heightMm}mm`;
    let name = sizes.get(size);
    if (!name) {
      name = `sheetcraft-paper-${sizes.size}`;
      sizes.set(size, name);
      rules.push(`@page ${name} { size: ${size}; margin: 0; }`);
    }
    const image = target.createElement("img");
    image.src = page.source;
    image.style.page = name;
    image.style.width = `${page.widthMm}mm`;
    image.style.height = `${page.heightMm}mm`;
    target.body.append(image);
  }
  style.textContent = rules.join("\n");
  target.head.append(style);
}
