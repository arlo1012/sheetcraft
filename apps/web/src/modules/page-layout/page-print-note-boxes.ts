import type { CellRange, Sheet } from "@sheetcraft/core/workbook";
import type {
  PictureAxisMetrics,
  PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { splitCellTextLines, type TextMeasurer } from "@sheetcraft/sheet-engine/text-layout";
import { DEFAULT_NOTE_BOX } from "../../shared/cell-notes/note-box";

export const PRINT_NOTE_BOX_FONT = 'SimSun, "Songti SC", serif';
export type PrintNoteBox = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  origin: { x: number; y: number };
  author: string;
  text: string;
};

/** Visibility is a captured view choice, not a mutation of the workbook notes. */
export function capturePrintNoteBoxes(options: {
  sheet: Sheet;
  metrics: PictureSheetMetrics;
  displayedKeys?: ReadonlySet<string>;
  printArea?: CellRange | null;
  anonymous: string;
}): PrintNoteBox[] {
  const { sheet, metrics, printArea } = options;
  const boxes: PrintNoteBox[] = [];
  for (const key of options.displayedKeys ?? []) {
    const note = sheet.cells.get(key)?.note;
    if (!note) continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    const range = sheet.mergedCells.find(
      (range) =>
        row >= range.start.row &&
        row <= range.end.row &&
        column >= range.start.column &&
        column <= range.end.column,
    ) ?? { start: { row, column }, end: { row, column } };
    if (
      printArea &&
      (range.end.row < printArea.start.row ||
        range.start.row > printArea.end.row ||
        range.end.column < printArea.start.column ||
        range.start.column > printArea.end.column)
    )
      continue;
    const top = metrics.rows.visiblePrefix(range.start.row);
    const right = metrics.columns.visiblePrefix(range.end.column + 1);
    if (
      metrics.rows.visiblePrefix(range.end.row + 1) <= top ||
      right <= metrics.columns.visiblePrefix(range.start.column)
    )
      continue;
    const box = note.box ?? DEFAULT_NOTE_BOX;
    boxes.push({
      key,
      x: right + box.offsetX,
      y: top + box.offsetY,
      width: box.width,
      height: box.height,
      origin: { x: right, y: top },
      author: note.author?.trim() || options.anonymous,
      text: note.text,
    });
  }
  return boxes;
}

export function getPrintNoteBoxExtent(
  boxes: readonly PrintNoteBox[],
  metrics: PictureSheetMetrics,
) {
  function count(position: number, axis: PictureAxisMetrics): number {
    let low = 0,
      high = axis.count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (axis.visiblePrefix(middle) < position) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  return boxes.reduce(
    (extent, box) => ({
      rowCount: Math.max(extent.rowCount, count(box.y + box.height, metrics.rows)),
      columnCount: Math.max(extent.columnCount, count(box.x + box.width, metrics.columns)),
    }),
    { rowCount: 0, columnCount: 0 },
  );
}

/** Match the note surface's stored box, colors, typography and clipped top content. */
export function paintPrintNoteBoxes(
  context: CanvasRenderingContext2D,
  boxes: readonly PrintNoteBox[],
  viewport: { x: number; y: number; width: number; height: number },
) {
  const measurer: TextMeasurer = {
    measure: (text, font) => {
      context.font = `${font.weight} ${font.size}px ${font.family}`;
      return context.measureText(text).width;
    },
  };
  for (const box of boxes) {
    const left = Math.min(box.x, box.origin.x),
      top = Math.min(box.y, box.origin.y);
    const right = Math.max(box.x + box.width, box.origin.x),
      bottom = Math.max(box.y + box.height, box.origin.y);
    if (
      right < viewport.x ||
      bottom < viewport.y ||
      left > viewport.x + viewport.width ||
      top > viewport.y + viewport.height
    )
      continue;
    context.save();
    context.translate(-viewport.x, -viewport.y);
    context.strokeStyle = "#20242c";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(box.origin.x, box.origin.y);
    context.lineTo(
      box.x + (box.x + box.width / 2 < box.origin.x ? box.width : 0),
      box.y + Math.min(10, box.height / 2),
    );
    context.stroke();
    context.fillStyle = "#ffffe1";
    context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
    context.beginPath();
    context.rect(box.x + 3, box.y + 2, box.width - 6, box.height - 4);
    context.clip();
    context.fillStyle = "#20242c";
    context.textBaseline = "top";
    context.textAlign = "left";
    let y = box.y + 2;
    for (const [text, weight] of [
      [`${box.author}:`, 700],
      [box.text, 400],
    ] as const) {
      const font = { family: PRINT_NOTE_BOX_FONT, size: 12, weight, italic: false };
      const lines = splitCellTextLines(text, box.width - 6, font, measurer, true);
      context.font = `${weight} 12px ${PRINT_NOTE_BOX_FONT}`;
      for (const line of lines) {
        if (y >= box.y + box.height - 2) break;
        context.fillText(line.text, box.x + 3, y);
        y += 16;
      }
      if (y >= box.y + box.height - 2) break;
    }
    context.restore();
  }
}
