import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getStandardShapeViewportFragments } from "./standard-shape-layout";
import { shapeViewLayout } from "./shape-view-layout";

export type ShapePageFragment = FloatingImageViewportFragment & { pageKey: string };
/** A shape is one continuous object, clipped once per paper content band. */
export function getShapePageFragments(
  view: SheetGraphicDrawing,
  viewport: SheetViewportLayout,
  projection: PageLayoutProjection,
  metrics: PictureSheetMetrics,
  selected = false,
): ShapePageFragment[] {
  const scroll = viewport.bodyScrollPosition;
  const pages = projection.getVisiblePages({ ...scroll, ...viewport.viewportSize });
  const output: ShapePageFragment[] = [];
  for (const page of pages) {
    const bodyClip = viewport.panes.body.clip;
    const x = Math.max(bodyClip.x, page.contentRect.x - scroll.x);
    const y = Math.max(bodyClip.y, page.contentRect.y - scroll.y);
    const width =
      Math.min(bodyClip.x + bodyClip.width, page.contentRect.x + page.sheetRect.width - scroll.x) -
      x;
    const height =
      Math.min(
        bodyClip.y + bodyClip.height,
        page.contentRect.y + page.sheetRect.height - scroll.y,
      ) - y;
    if (width <= 0 || height <= 0) continue;
    const translation = {
      x: page.contentRect.x - page.sheetRect.x - scroll.x,
      y: page.contentRect.y - page.sheetRect.y - scroll.y,
    };
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
      output.push({ ...fragment, pageKey: `${page.rowPage}:${page.columnPage}` });
  }
  return output;
}
