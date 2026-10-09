import type { SheetPageDecoration } from "@sheetcraft/core/page-decoration";
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
  options: {
    fontScale?: number;
    image?: HTMLImageElement;
    /** Visible portion of the canvas; avoids visiting off-screen page tiles. */
    viewport?: { x: number; y: number; width: number; height: number };
  } = {},
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const scale = options.fontScale ?? 1;
  const fontSize = Math.max(8, watermark.fontSize) * scale;
  const hasText = Boolean(watermark.text);
  const image = watermark.image && options.image;
  if (!hasText && !image) return;

  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.font = `${fontSize}px ${JSON.stringify(watermark.fontFamily ?? "sans-serif")}`;
  const textMetrics = hasText ? context.measureText(watermark.text) : undefined;
  const textWidth = textMetrics?.width ?? 0;
  const textHeight = textMetrics
    ? Math.max(fontSize, textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent)
    : 0;
  const imageWidth = image
    ? image.naturalWidth *
      scale *
      (watermark.image?.scale == null
        ? 100 / Math.max(image.naturalWidth, image.naturalHeight)
        : watermark.image.scale / 100)
    : 0;
  const imageHeight = image
    ? image.naturalHeight *
      scale *
      (watermark.image?.scale == null
        ? 100 / Math.max(image.naturalWidth, image.naturalHeight)
        : watermark.image.scale / 100)
    : 0;
  const itemWidth = Math.max(textWidth, imageWidth);
  const itemHeight = Math.max(textHeight, imageHeight);
  const diagonal = Math.hypot(itemWidth, itemHeight);
  // WPS keeps a small, diagonal watermark lattice across the complete page. The
  // fixed floor avoids a dense pattern for short labels; the measured extent
  // prevents larger custom labels or pictures from colliding.
  const step = Math.max(110 * scale, diagonal + 36 * scale);
  const viewport = options.viewport;
  const left = Math.max(rect.x, viewport?.x ?? rect.x);
  const top = Math.max(rect.y, viewport?.y ?? rect.y);
  const right = Math.min(
    rect.x + rect.width,
    (viewport?.x ?? rect.x) + (viewport?.width ?? rect.width),
  );
  const bottom = Math.min(
    rect.y + rect.height,
    (viewport?.y ?? rect.y) + (viewport?.height ?? rect.height),
  );
  if (right <= left || bottom <= top) {
    context.restore();
    return;
  }
  const startX = rect.x + Math.floor((left - rect.x) / step) * step - step;
  const startY = rect.y + Math.floor((top - rect.y) / step) * step - step;
  for (let y = startY; y < bottom + step; y += step) {
    for (let x = startX; x < right + step; x += step) {
      if (hasText) {
        context.save();
        context.globalAlpha = watermark.opacity;
        context.translate(x, y);
        context.rotate((watermark.angle * Math.PI) / 180);
        context.fillStyle = watermark.color;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(watermark.text, 0, 0);
        context.restore();
      }
      if (image) {
        context.save();
        context.translate(x, y);
        context.rotate(((watermark.image?.angle ?? watermark.angle) * Math.PI) / 180);
        context.globalAlpha = watermark.image?.washout ? 0.2 : 1;
        context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
        context.restore();
      }
    }
  }
  context.restore();
}

/** Normal views anchor the pattern to sheet coordinates; page views anchor it to each page. */
export function paintSheetWatermark(
  context: CanvasRenderingContext2D,
  decoration: SheetPageDecoration | undefined,
  frame: SheetRenderFrame,
  pageView: PageViewPaintState | undefined,
  image?: HTMLImageElement,
): void {
  const watermark = decoration?.watermark;
  if (!watermark || (!watermark.text && !watermark.image)) return;
  if (!pageView || pageView.mode === "normal") {
    for (const pane of Object.values(frame.panes)) {
      const { clip, translation } = pane;
      if (clip.width <= 0 || clip.height <= 0) continue;
      context.save();
      context.beginPath();
      context.rect(clip.x, clip.y, clip.width, clip.height);
      context.clip();
      paintWatermarkInRect(
        context,
        watermark,
        {
          x: translation.x,
          y: translation.y,
          width: clip.x + clip.width - translation.x,
          height: clip.y + clip.height - translation.y,
        },
        { image, viewport: clip },
      );
      context.restore();
    }
    return;
  }
  const scroll = frame.layout.bodyScrollPosition;
  if (pageView.mode === "page-layout") {
    for (const page of pageView.pages)
      paintWatermarkInRect(
        context,
        watermark,
        { ...page.paperRect, x: page.paperRect.x - scroll.x, y: page.paperRect.y - scroll.y },
        {
          fontScale: pageView.uiScale ?? 1,
          image,
          viewport: {
            x: 0,
            y: 0,
            width: frame.layout.viewportSize.width,
            height: frame.layout.viewportSize.height,
          },
        },
      );
  } else if (pageView.mode === "page-break-preview") {
    for (const page of pageView.pages)
      paintWatermarkInRect(
        context,
        watermark,
        { ...page.sheetRect, x: page.sheetRect.x - scroll.x, y: page.sheetRect.y - scroll.y },
        {
          image,
          viewport: {
            x: 0,
            y: 0,
            width: frame.layout.viewportSize.width,
            height: frame.layout.viewportSize.height,
          },
        },
      );
  }
}
