import type { CellRange, Sheet } from "@sheetcraft/core/workbook";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import {
  splitCellTextLines,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "@sheetcraft/sheet-engine/text-layout";

export type PrintNoteLine = { text: string; y: number; bold: boolean };
export type PrintNotePage = {
  title: string;
  lines: PrintNoteLine[];
  fontSize: number;
  titleSize: number;
};
export const PRINT_NOTE_FONT = 'Arial, "Microsoft YaHei", sans-serif';

/** Appendix text is captured from committed notes and never changes their boxes or visibility. */
export function createPrintNotePages(options: {
  sheet: Sheet;
  range: CellRange;
  width: number;
  height: number;
  printScale: number;
  locale: string;
  measurer: TextMeasurer;
  maxPages: number;
}): PrintNotePage[] {
  const { sheet, range, measurer } = options;
  const notes = [...sheet.cells.entries()]
    .flatMap(([key, cell]) => {
      if (!cell.note) return [];
      const [row, column] = key.split(":").map(Number) as [number, number];
      if (
        row < range.start.row ||
        row > range.end.row ||
        column < range.start.column ||
        column > range.end.column
      )
        return [];
      return [{ row, column, text: cell.note.text, author: cell.note.author?.trim() ?? "" }];
    })
    .sort((a, b) => a.row - b.row || a.column - b.column);
  if (!notes.length) return [];
  const scale = options.printScale;
  const fontSize = 14 / scale,
    titleSize = 17 / scale,
    lineHeight = 20 / scale;
  const titleHeight = 30 / scale,
    gap = 10 / scale;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(options.width) ||
    options.width <= 0 ||
    !Number.isFinite(options.height) ||
    options.height < titleHeight + lineHeight * 2
  )
    throw new RangeError("The print margins leave insufficient room for notes.");
  const chinese = options.locale.toLowerCase().startsWith("zh");
  const font: AutoRowHeightFont = {
    family: PRINT_NOTE_FONT,
    size: fontSize,
    weight: 400,
    italic: false,
  };
  function wrap(text: string, bold: boolean): string[] {
    const normalized = text.replace(/\r\n?/gu, "\n");
    const lines = splitCellTextLines(
      normalized,
      options.width,
      { ...font, weight: bold ? 700 : 400 },
      measurer,
      true,
    );
    // The shared cell layout is bounded. Never silently truncate a printed note.
    const reconstructed = lines
      .map((line) => line.text + (line.paragraphEnd ? "\n" : ""))
      .join("")
      .replace(/\n$/u, "");
    if (reconstructed !== normalized || lines.some((line) => line.width > options.width))
      throw new RangeError("A note cannot fit within the printable text layout limits.");
    return lines.map((line) => line.text);
  }
  const result: PrintNotePage[] = [];
  let current: PrintNotePage | undefined;
  let y = titleHeight;
  function nextPage(): PrintNotePage {
    if (result.length >= options.maxPages)
      throw new RangeError("Print preview exceeds 10000 pages including notes.");
    current = {
      title: `${sheet.name} · ${chinese ? "批注" : "Notes"}`,
      lines: [],
      fontSize,
      titleSize,
    };
    result.push(current);
    y = titleHeight;
    return current;
  }
  for (const note of notes) {
    const address = formatCellAddress(note);
    const heading = wrap(note.author ? `${address} · ${note.author}` : address, true);
    const body = wrap(note.text, false);
    if (
      !current ||
      (current.lines.length && y + Math.min(heading.length + 1, 3) * lineHeight > options.height)
    )
      nextPage();
    for (const [index, text] of [...heading, ...body].entries()) {
      if (y + lineHeight > options.height) {
        nextPage();
        // Keep the cell address on every continuation page, including long notes.
        for (const continuation of wrap(`${address} (${chinese ? "续" : "continued"})`, true)) {
          if (y + lineHeight * 2 > options.height)
            throw new RangeError("The print area is too narrow for note continuations.");
          current!.lines.push({ text: continuation, y, bold: true });
          y += lineHeight;
        }
      }
      current!.lines.push({ text, y, bold: index < heading.length });
      y += lineHeight;
    }
    y += gap;
  }
  return result;
}

export function paintPrintNotePage(
  context: CanvasRenderingContext2D,
  page: PrintNotePage,
  width: number,
  height: number,
): void {
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.fillStyle = "#202124";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `700 ${page.titleSize}px ${PRINT_NOTE_FONT}`;
  context.fillText(page.title, 0, 0, width);
  for (const line of page.lines) {
    context.font = `${line.bold ? 700 : 400} ${page.fontSize}px ${PRINT_NOTE_FONT}`;
    context.fillText(line.text, 0, line.y);
  }
  context.restore();
}
