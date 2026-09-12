import type { CellAddress } from "@idea10/core/workbook";
import type { Rect } from "@idea10/sheet-engine/geometry";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { paintCellFill } from "./cell-fill-painter";
import { paintCellText } from "./cell-text-painter";
import type { SheetCanvasScene } from "./cell-scene";
import { paintCellImage, type CanvasImageCache } from "./image-painter";

export type SheetCanvasPalette = {
  background: string;
  text: string;
  gridLine: string;
  mutedText: string;
};

function clipRect(context: CanvasRenderingContext2D, rect: Rect): void {
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
}

export function paintSheetScene(
  context: CanvasRenderingContext2D,
  scene: SheetCanvasScene,
  layout: SheetViewportLayout,
  options: {
    palette: SheetCanvasPalette;
    showGridLines: boolean;
    editingCell?: CellAddress;
    imageUrls?: ReadonlyMap<string, string>;
    images: CanvasImageCache;
    imagePlaceholder: (assetId: string) => string;
  },
): void {
  const { palette } = options;
  context.fillStyle = palette.background;
  context.fillRect(0, 0, layout.viewportSize.width, layout.viewportSize.height);
  const visibleImageUrls = new Set<string>();
  for (const paneScene of scene.panes) {
    const pane = layout.panes[paneScene.id];
    if (pane.clip.width <= 0 || pane.clip.height <= 0) continue;
    const scrollX =
      pane.id === "body" || pane.id === "top"
        ? layout.frozenSize.width + layout.bodyScrollPosition.x - pane.clip.x
        : 0;
    const scrollY =
      pane.id === "body" || pane.id === "left"
        ? layout.frozenSize.height + layout.bodyScrollPosition.y - pane.clip.y
        : 0;
    context.save();
    clipRect(context, pane.clip);
    context.translate(-scrollX, -scrollY);
    for (const cell of paneScene.cells) paintCellFill(context, cell.rect, cell.style);
    if (options.showGridLines) {
      context.beginPath();
      context.strokeStyle = palette.gridLine;
      context.lineWidth = 1;
      for (const { rect } of paneScene.cells) {
        const right = rect.x + rect.width - 0.5;
        const bottom = rect.y + rect.height - 0.5;
        context.moveTo(rect.x, bottom);
        context.lineTo(right, bottom);
        context.lineTo(right, rect.y);
      }
      context.stroke();
    }
    const drawnSpans = new Set<string>();
    for (const cell of paneScene.cells) {
      const { content, contentRect, span } = cell;
      const source = span?.kind === "centerContinuous" ? span.source : cell.address;
      if (source.row === options.editingCell?.row && source.column === options.editingCell.column)
        continue;
      if (span?.kind === "centerContinuous") {
        const key = `${span.source.row}:${span.source.column}`;
        if (drawnSpans.has(key)) continue;
        drawnSpans.add(key);
      }
      if (!content.image && !content.textLayout) continue;
      context.save();
      clipRect(context, {
        x: contentRect.x,
        y: contentRect.y,
        width: Math.max(0, contentRect.width - 1),
        height: Math.max(0, contentRect.height - 1),
      });
      if (content.image) {
        const url = options.imageUrls?.get(content.image.assetId);
        if (url) visibleImageUrls.add(url);
        const image = url ? options.images.get(url) : undefined;
        if (image) paintCellImage(context, image, contentRect, content.image.transform);
        else {
          context.font = "12px sans-serif";
          context.fillStyle = palette.mutedText;
          context.textAlign = "left";
          context.textBaseline = "middle";
          context.fillText(
            options.imagePlaceholder(content.image.assetId),
            contentRect.x + 4,
            contentRect.y + contentRect.height / 2,
          );
        }
      } else if (content.textLayout) {
        context.translate(contentRect.x, contentRect.y);
        paintCellText(context, content.textLayout, content.style, palette.text);
      }
      context.restore();
    }
    context.restore();
  }
  options.images.retain(visibleImageUrls);
}
