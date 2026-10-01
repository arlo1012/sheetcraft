import type { Point, Rect, Size } from "@idea10/sheet-engine/geometry";
import type { PageViewPaintState } from "../page-view-types";

const BREAK_COLOR = "#2672d9";

function translated(rect: Rect, scroll: Point): Rect {
  return { ...rect, x: rect.x - scroll.x, y: rect.y - scroll.y };
}

function intersection(left: Rect, right: Rect): Rect | undefined {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.min(left.x + left.width, right.x + right.width) - x;
  const height = Math.min(left.y + left.height, right.y + right.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/** The printable rectangle in body viewport coordinates, if it is visible. */
export function getPageBreakPreviewPrintRect(
  state: PageViewPaintState,
  scroll: Point,
  viewport: Size,
): Rect | undefined {
  return intersection(translated(state.printRect, scroll), {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  });
}

/** Paints the WPS-style gray non-print surface before cell content. */
export function paintPageBreakPreviewBackground(
  context: CanvasRenderingContext2D,
  state: PageViewPaintState,
  scroll: Point,
  viewport: Size,
  paperColor: string,
): Rect | undefined {
  context.fillStyle = "#c4c4c4";
  context.fillRect(0, 0, viewport.width, viewport.height);
  const printed = getPageBreakPreviewPrintRect(state, scroll, viewport);
  if (printed) {
    context.fillStyle = paperColor;
    context.fillRect(printed.x, printed.y, printed.width, printed.height);
  }
  return printed;
}

/** Clips to the visible print rectangle. Returns false when it is offscreen. */
export function clipPageBreakPreviewPrintArea(
  context: CanvasRenderingContext2D,
  printed: Rect | undefined,
): boolean {
  if (!printed) return false;
  context.beginPath();
  context.rect(printed.x, printed.y, printed.width, printed.height);
  context.clip();
  return true;
}

/** Clips to visible non-printing cells without generating negative rectangles. */
export function clipPageBreakPreviewOutside(
  context: CanvasRenderingContext2D,
  printed: Rect | undefined,
  viewport: Size,
): void {
  context.beginPath();
  context.rect(0, 0, viewport.width, viewport.height);
  if (printed) context.rect(printed.x, printed.y, printed.width, printed.height);
  context.clip(printed ? "evenodd" : "nonzero");
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
  }
}

/** Page-break preview keeps the continuous grid and marks its printable part. */
export function paintPageBreakPreview(
  context: CanvasRenderingContext2D,
  state: PageViewPaintState,
  scroll: Point,
  viewport: Size,
): void {
  const area = translated(state.printRect, scroll);
  context.save();
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
  const dragBoundary = state.dragBoundary;
  if (dragBoundary) {
    const offset =
      dragBoundary.axis === "row" ? dragBoundary.offset - scroll.y : dragBoundary.offset - scroll.x;
    const inPrintArea =
      dragBoundary.axis === "row"
        ? offset >= area.y && offset <= area.y + area.height
        : offset >= area.x && offset <= area.x + area.width;
    const inViewport =
      dragBoundary.axis === "row"
        ? offset >= 0 && offset <= viewport.height
        : offset >= 0 && offset <= viewport.width;
    const hasVisibleSpan =
      dragBoundary.axis === "row"
        ? area.x < viewport.width && area.x + area.width > 0
        : area.y < viewport.height && area.y + area.height > 0;
    if (inViewport && hasVisibleSpan && (inPrintArea || dragBoundary.removing)) {
      context.strokeStyle = dragBoundary.removing ? "#b45454" : BREAK_COLOR;
      context.lineWidth = 3;
      context.setLineDash(dragBoundary.removing ? [5, 3] : []);
      context.beginPath();
      if (dragBoundary.axis === "row") {
        context.moveTo(area.x, offset);
        context.lineTo(area.x + area.width, offset);
      } else {
        context.moveTo(offset, area.y);
        context.lineTo(offset, area.y + area.height);
      }
      context.stroke();
    }
  }
  const dragCorner = state.dragCorner;
  if (dragCorner) {
    const x = dragCorner.x - scroll.x;
    const y = dragCorner.y - scroll.y;
    const radius = 4;
    if (
      x + radius >= 0 &&
      x - radius <= viewport.width &&
      y + radius >= 0 &&
      y - radius <= viewport.height
    ) {
      context.strokeStyle = BREAK_COLOR;
      context.lineWidth = 2;
      context.setLineDash([]);
      context.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  context.restore();
}
