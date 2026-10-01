import type { Point, Rect, Size } from "@idea10/sheet-engine/geometry";
import type { PageViewPaintState } from "../page-view-types";

const BREAK_COLOR = "#2672d9";

function translated(rect: Rect, scroll: Point): Rect {
  return { ...rect, x: rect.x - scroll.x, y: rect.y - scroll.y };
}

export function clipPageContents(
  context: CanvasRenderingContext2D,
  state: PageViewPaintState,
  scroll: Point,
): void {
  context.beginPath();
  for (const page of state.pages) {
    const rect = translated(page.contentRect, scroll);
    context.rect(rect.x, rect.y, rect.width, rect.height);
  }
  context.clip();
}

/** Paints the paper before cells, using the same projection as hit testing. */
export function paintPageLayoutBackground(
  context: CanvasRenderingContext2D,
  state: PageViewPaintState,
  scroll: Point,
  viewport: Size,
  paperColor: string,
): void {
  context.fillStyle = "#e5e7eb";
  context.fillRect(0, 0, viewport.width, viewport.height);
  for (const page of state.pages) {
    const paper = translated(page.paperRect, scroll);
    const content = translated(page.contentRect, scroll);
    context.fillStyle = "rgba(0,0,0,0.10)";
    context.fillRect(paper.x + 2, paper.y + 2, paper.width, paper.height);
    context.fillStyle = paperColor;
    context.fillRect(paper.x, paper.y, paper.width, paper.height);
    context.strokeStyle = "#b8bdc6";
    context.lineWidth = 1;
    context.strokeRect(paper.x, paper.y, paper.width, paper.height);
    context.save();
    context.setLineDash([2, 3]);
    context.strokeStyle = "#d5d9e0";
    context.strokeRect(content.x, content.y, content.width, content.height);
    context.restore();
    paintRulers(context, paper, content, state.millimetresPerUnit);
  }
}

function paintRulers(
  context: CanvasRenderingContext2D,
  paper: Rect,
  content: Rect,
  millimetresPerUnit: number,
): void {
  const step = 5 / millimetresPerUnit;
  context.save();
  context.strokeStyle = "#b2b8c2";
  context.fillStyle = "#818896";
  context.lineWidth = 0.5;
  context.font = "10px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.beginPath();
  for (let index = 0; index * step <= content.width; index += 1) {
    const x = content.x + index * step;
    const major = index % 2 === 0;
    context.moveTo(x, paper.y + 5);
    context.lineTo(x, paper.y + (major ? 12 : 9));
    if (major) context.fillText(String(index * 5), x, paper.y + 25);
  }
  for (let index = 0; index * step <= content.height; index += 1) {
    const y = content.y + index * step;
    context.moveTo(paper.x + 5, y);
    context.lineTo(paper.x + (index % 2 === 0 ? 12 : 9), y);
  }
  context.stroke();
  context.restore();
}

/** Page-break preview keeps the continuous grid and marks its printable part. */
export function paintPageBreakPreview(
  context: CanvasRenderingContext2D,
  state: PageViewPaintState,
  scroll: Point,
  viewport: Size,
): void {
  const area = translated(state.printRect, scroll);
  const left = Math.max(0, area.x);
  const top = Math.max(0, area.y);
  const right = Math.min(viewport.width, area.x + area.width);
  const bottom = Math.min(viewport.height, area.y + area.height);
  context.save();
  context.fillStyle = "rgba(96,104,118,0.28)";
  context.fillRect(0, 0, viewport.width, Math.max(0, top));
  context.fillRect(0, Math.max(0, bottom), viewport.width, Math.max(0, viewport.height - bottom));
  context.fillRect(0, top, Math.max(0, left), Math.max(0, bottom - top));
  context.fillRect(
    Math.max(0, right),
    top,
    Math.max(0, viewport.width - right),
    Math.max(0, bottom - top),
  );
  context.fillStyle = "rgba(95,105,121,0.28)";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const page of state.pages) {
    const rect = translated(page.sheetRect, scroll);
    if (
      !page.pageNumber ||
      rect.x + rect.width < 0 ||
      rect.y + rect.height < 0 ||
      rect.x > viewport.width ||
      rect.y > viewport.height
    )
      continue;
    const size = Math.max(20, Math.min(64, rect.width / 5, rect.height / 3));
    context.font = `600 ${size}px sans-serif`;
    context.fillText(
      state.pageLabel(page.pageNumber),
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      Math.max(0, rect.width - 12),
    );
  }
  context.strokeStyle = BREAK_COLOR;
  context.lineWidth = 2;
  context.setLineDash([]);
  context.strokeRect(area.x, area.y, area.width, area.height);
  for (const line of state.rowBreaks) {
    context.setLineDash(line.kind === "automatic" ? [6, 4] : []);
    context.beginPath();
    context.moveTo(area.x, line.offset - scroll.y);
    context.lineTo(area.x + area.width, line.offset - scroll.y);
    context.stroke();
  }
  for (const line of state.columnBreaks) {
    context.setLineDash(line.kind === "automatic" ? [6, 4] : []);
    context.beginPath();
    context.moveTo(line.offset - scroll.x, area.y);
    context.lineTo(line.offset - scroll.x, area.y + area.height);
    context.stroke();
  }
  context.restore();
}
