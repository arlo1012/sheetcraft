import type { SheetPageDecoration } from "@idea10/core/page-decoration";
import type { PageViewPaintState } from "../page-layout/page-view-types";
import type { SheetRenderFrame } from "../sheet-grid/rendering/sheet-render-frame";

function paintTiledImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const pattern = context.createPattern(image, "repeat");
  if (!pattern) return;
  context.fillStyle = pattern;
  context.fillRect(x, y, width, height);
}

/** Draws a worksheet background. Excel sheet backgrounds are tiled and screen-only. */
export function paintSheetBackground(
  context: CanvasRenderingContext2D,
  url: string | undefined,
  image: HTMLImageElement | undefined,
  frame: SheetRenderFrame,
): void {
  if (!url || !image) return;
  for (const pane of Object.values(frame.panes)) {
    if (pane.clip.width <= 0 || pane.clip.height <= 0) continue;
    context.save();
    context.beginPath();
    context.rect(pane.clip.x, pane.clip.y, pane.clip.width, pane.clip.height);
    context.clip();
    // Anchor a tile at worksheet coordinate 0,0. Each frozen pane has its own
    // projection, so the pattern remains continuous while the body scrolls.
    context.translate(pane.translation.x, pane.translation.y);
    paintTiledImage(
      context,
      image,
      pane.clip.x - pane.translation.x,
      pane.clip.y - pane.translation.y,
      pane.clip.width,
      pane.clip.height,
    );
    context.restore();
  }
}

export function paintWatermarkInRect(
  context: CanvasRenderingContext2D,
  watermark: NonNullable<SheetPageDecoration["watermark"]>,
  rect: { x: number; y: number; width: number; height: number },
  options: { fontScale?: number } = {},
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.rotate((watermark.angle * Math.PI) / 180);
  context.globalAlpha = watermark.opacity;
  context.fillStyle = watermark.color;
  context.font = `${Math.max(8, watermark.fontSize * (options.fontScale ?? 1))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(watermark.text, 0, 0, Math.max(0, rect.width * 0.9));
  context.restore();
}

/** A watermark is part of page content and repeats for each visible page. */
export function paintSheetWatermark(
  context: CanvasRenderingContext2D,
  decoration: SheetPageDecoration | undefined,
  frame: SheetRenderFrame,
  pageView: PageViewPaintState | undefined,
): void {
  const watermark = decoration?.watermark;
  if (!watermark?.text) return;
  if (!pageView) return;
  const scroll = frame.layout.bodyScrollPosition;
  if (pageView.mode === "page-layout") {
    for (const page of pageView.pages)
      paintWatermarkInRect(
        context,
        watermark,
        { ...page.contentRect, x: page.contentRect.x - scroll.x, y: page.contentRect.y - scroll.y },
        { fontScale: pageView.uiScale ?? 1 },
      );
  } else if (pageView.mode === "page-break-preview") {
    for (const page of pageView.pages)
      paintWatermarkInRect(context, watermark, {
        ...page.sheetRect,
        x: page.sheetRect.x - scroll.x,
        y: page.sheetRect.y - scroll.y,
      });
  }
}
