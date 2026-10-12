import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { SheetPage, PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { getStandardShapeViewportFragments } from "./standard-shape-layout";
import { shapeViewLayout } from "./shape-view-layout";

export type ShapePageFragment = FloatingImageViewportFragment & {
  pageKey: string;
  /** A handle belongs to actual sheet content, never its paper margin or gap. */
  pageClip: Rect;
};
function pageSheetRect(page: SheetPage, metrics: PictureSheetMetrics): Rect {
  const x = metrics.columns.visiblePrefix(page.range.start.column);
  const y = metrics.rows.visiblePrefix(page.range.start.row);
  return {
    x,
    y,
    width: metrics.columns.visiblePrefix(page.range.end.column + 1) - x,
    height: metrics.rows.visiblePrefix(page.range.end.row + 1) - y,
  };
}
function pageContentRect(page: SheetPage, metrics: PictureSheetMetrics): Rect {
  const rect = pageSheetRect(page, metrics);
  return {
    ...page.contentRect,
    width: Math.min(page.contentRect.width, rect.width),
    height: Math.min(page.contentRect.height, rect.height),
  };
}
export type ShapePagePoint = {
  point: { x: number; y: number };
  paneId: "body";
  pageKey: string;
};
function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    [rect.x, rect.y, rect.width, rect.height, point.x, point.y].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
/** Every captured sample is inverted independently. Paper whitespace is not sheet distance. */
export function shapePagePointFromViewport(
  point: { x: number; y: number },
  viewport: SheetViewportLayout,
  projection: PageLayoutProjection,
  metrics: PictureSheetMetrics,
): ShapePagePoint | null {
  if (!contains(viewport.panes.body.clip, point)) return null;
  const paperPoint = {
    x: point.x + viewport.bodyScrollPosition.x,
    y: point.y + viewport.bodyScrollPosition.y,
  };
  const pages = projection.getVisiblePages({ ...paperPoint, width: 0.0001, height: 0.0001 });
  const page = pages.find((item) => contains(pageContentRect(item, metrics), paperPoint));
  if (!page) return null;
  const sheetRect = pageSheetRect(page, metrics);
  return {
    point: {
      x: sheetRect.x + paperPoint.x - page.contentRect.x,
      y: sheetRect.y + paperPoint.y - page.contentRect.y,
    },
    paneId: "body",
    pageKey: `${page.rowPage}:${page.columnPage}`,
  };
}
/** Projects a continuous point only into its visible, real paper content band. */
export function projectShapePointToViewport(
  point: { x: number; y: number },
  viewport: SheetViewportLayout,
  projection: PageLayoutProjection,
  metrics: PictureSheetMetrics,
): ShapePagePoint | null {
  if (![point.x, point.y].every(Number.isFinite)) return null;
  const scroll = viewport.bodyScrollPosition;
  const page = projection
    .getVisiblePages({ ...scroll, ...viewport.viewportSize })
    .find((item) => contains(pageSheetRect(item, metrics), point));
  if (!page) return null;
  const sheetRect = pageSheetRect(page, metrics);
  const projected = {
    x: point.x + page.contentRect.x - sheetRect.x - scroll.x,
    y: point.y + page.contentRect.y - sheetRect.y - scroll.y,
  };
  const content = pageContentRect(page, metrics);
  const visibleContent = { ...content, x: content.x - scroll.x, y: content.y - scroll.y };
  return contains(viewport.panes.body.clip, projected) && contains(visibleContent, projected)
    ? { point: projected, paneId: "body", pageKey: `${page.rowPage}:${page.columnPage}` }
    : null;
}
export type ShapePageProjectionBand = {
  pageKey: string;
  clip: Rect;
  translation: { x: number; y: number };
};
export function getShapePageProjectionBands(
  viewport: SheetViewportLayout,
  projection: PageLayoutProjection,
  metrics: PictureSheetMetrics,
): ShapePageProjectionBand[] {
  const scroll = viewport.bodyScrollPosition;
  const pages = projection.getVisiblePages({ ...scroll, ...viewport.viewportSize });
  const output: ShapePageProjectionBand[] = [];
  for (const page of pages) {
    const sheetRect = pageSheetRect(page, metrics);
    const content = pageContentRect(page, metrics);
    const bodyClip = viewport.panes.body.clip;
    const x = Math.max(bodyClip.x, content.x - scroll.x);
    const y = Math.max(bodyClip.y, content.y - scroll.y);
    const width = Math.min(bodyClip.x + bodyClip.width, content.x + content.width - scroll.x) - x;
    const height =
      Math.min(bodyClip.y + bodyClip.height, content.y + content.height - scroll.y) - y;
    if (width <= 0 || height <= 0) continue;
    const translation = {
      x: page.contentRect.x - sheetRect.x - scroll.x,
      y: page.contentRect.y - sheetRect.y - scroll.y,
    };
    output.push({
      pageKey: `${page.rowPage}:${page.columnPage}`,
      clip: { x, y, width, height },
      translation,
    });
  }
  return output;
}
/** A shape is one continuous object, clipped once per paper content band. */
export function getShapePageFragments(
  view: SheetGraphicDrawing,
  viewport: SheetViewportLayout,
  projection: PageLayoutProjection,
  metrics: PictureSheetMetrics,
  selected = false,
): ShapePageFragment[] {
  const output: ShapePageFragment[] = [];
  for (const band of getShapePageProjectionBands(viewport, projection, metrics)) {
    const {
      clip: { x, y, width, height },
      translation,
    } = band;
    const empty = { x: 0, y: 0, width: 0, height: 0 };
    const layout = shapeViewLayout(
      {
        ...viewport,
        frozenSize: { width: 0, height: 0 },
        bodyScrollPosition: { x: x - translation.x, y: y - translation.y },
        panes: {
          topLeft: { ...viewport.panes.topLeft, clip: empty },
          top: { ...viewport.panes.top, clip: empty },
          left: { ...viewport.panes.left, clip: empty },
          body: { ...viewport.panes.body, clip: { x, y, width, height } },
        },
      },
      metrics,
    );
    for (const fragment of getStandardShapeViewportFragments(view, layout, selected, true))
      output.push({
        ...fragment,
        pageKey: band.pageKey,
        pageClip: { x, y, width, height },
      });
  }
  return output;
}
