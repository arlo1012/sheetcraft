import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { PageBreak, SheetPagination } from "@sheetcraft/sheet-engine/page-layout";
import { createCanvasPixelGrid } from "../../../shared/canvas/pixel-grid";
import type { SheetRenderFrame } from "../../sheet-grid/rendering/sheet-render-frame";

const AUTOMATIC_BREAK_COLOR = "#5b9bd5";
const MANUAL_BREAK_COLOR = "#2672d9";

function rowPanes(frame: SheetRenderFrame, index: number): readonly FrozenPaneId[] {
  return index < frame.layout.freeze.rows ? ["topLeft", "top"] : ["left", "body"];
}

function columnPanes(frame: SheetRenderFrame, index: number): readonly FrozenPaneId[] {
  return index < frame.layout.freeze.columns ? ["topLeft", "left"] : ["top", "body"];
}

function paintHorizontalGuide(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  line: PageBreak,
): void {
  const width = 1 / frame.scale;
  const pixelGrid = createCanvasPixelGrid(context, frame.scale);
  for (const paneId of rowPanes(frame, line.index)) {
    const pane = frame.panes[paneId];
    const y = line.offset + pane.translation.y;
    if (y < pane.clip.y || y > pane.clip.y + pane.clip.height) continue;
    context.save();
    context.beginPath();
    context.rect(pane.clip.x, pane.clip.y, pane.clip.width, pane.clip.height);
    context.clip();
    context.beginPath();
    const snappedY = pixelGrid.strokeY(y, width);
    context.moveTo(pixelGrid.snapX(pane.clip.x), snappedY);
    context.lineTo(pixelGrid.snapX(pane.clip.x + pane.clip.width), snappedY);
    context.stroke();
    context.restore();
  }
}

function paintVerticalGuide(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  line: PageBreak,
): void {
  const width = 1 / frame.scale;
  const pixelGrid = createCanvasPixelGrid(context, frame.scale);
  for (const paneId of columnPanes(frame, line.index)) {
    const pane = frame.panes[paneId];
    const x = line.offset + pane.translation.x;
    if (x < pane.clip.x || x > pane.clip.x + pane.clip.width) continue;
    context.save();
    context.beginPath();
    context.rect(pane.clip.x, pane.clip.y, pane.clip.width, pane.clip.height);
    context.clip();
    context.beginPath();
    const snappedX = pixelGrid.strokeX(x, width);
    context.moveTo(snappedX, pixelGrid.snapY(pane.clip.y));
    context.lineTo(snappedX, pixelGrid.snapY(pane.clip.y + pane.clip.height));
    context.stroke();
    context.restore();
  }
}

function paintGuides(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  lines: readonly PageBreak[],
  paint: (context: CanvasRenderingContext2D, frame: SheetRenderFrame, line: PageBreak) => void,
): void {
  const width = 1 / frame.scale;
  for (const kind of ["automatic", "manual"] as const) {
    const matches = lines.filter((line) => line.kind === kind);
    if (matches.length === 0) continue;
    context.strokeStyle = kind === "manual" ? MANUAL_BREAK_COLOR : AUTOMATIC_BREAK_COLOR;
    context.lineWidth = width;
    context.setLineDash(kind === "automatic" ? [4 / frame.scale, 3 / frame.scale] : []);
    for (const line of matches) paint(context, frame, line);
  }
}

/** Paints normal-view page breaks in the viewport coordinates of every frozen pane. */
export function paintPageBreakGuides(
  context: CanvasRenderingContext2D,
  frame: SheetRenderFrame,
  pagination: Pick<SheetPagination, "rowBreaks" | "columnBreaks">,
): void {
  context.save();
  paintGuides(context, frame, pagination.rowBreaks, paintHorizontalGuide);
  paintGuides(context, frame, pagination.columnBreaks, paintVerticalGuide);
  context.restore();
}
