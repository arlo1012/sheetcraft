import type { CellAddress } from "@sheetcraft/core/workbook";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { Point, Rect, Size } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";

export type HeaderItem = Readonly<{ index: number; offset: number; size: number }>;
export type HeaderPane = Readonly<{
  id: "frozen" | "body";
  /** Surface coordinates, including the row/column header insets. */
  clip: Rect;
  items: readonly HeaderItem[];
}>;
export type RenderPane = Readonly<{
  id: FrozenPaneId;
  /** Body viewport coordinates, excluding header insets. */
  clip: Rect;
  /** Sheet coordinates to body viewport coordinates. */
  translation: Point;
}>;

/** One geometry projection shared by paint, hit testing and native overlays. */
export type SheetRenderFrame = Readonly<{
  layout: SheetViewportLayout;
  scale: number;
  headerSize: Size;
  /** Visual heading labels can leave room for a ruler lane before the body. */
  headingSize: Size;
  /** Outer ruler lanes precede the fixed heading labels in page layout. */
  headingOrigin: Point;
  size: Size;
  body: Rect;
  panes: Readonly<Record<FrozenPaneId, RenderPane>>;
  rowHeaders: readonly HeaderPane[];
  columnHeaders: readonly HeaderPane[];
}>;

export function createSheetRenderFrame(
  layout: SheetViewportLayout,
  headerSize: Size,
  scale: number,
  headingSize: Size = headerSize,
  headingOrigin: Point = { x: 0, y: 0 },
): SheetRenderFrame {
  const panes = {} as Record<FrozenPaneId, RenderPane>;
  for (const id of ["topLeft", "top", "left", "body"] as const) {
    const pane = layout.panes[id];
    panes[id] = {
      id,
      clip: pane.clip,
      translation: {
        x:
          id === "topLeft" || id === "left"
            ? 0
            : pane.clip.x - layout.frozenSize.width - layout.bodyScrollPosition.x,
        y:
          id === "topLeft" || id === "top"
            ? 0
            : pane.clip.y - layout.frozenSize.height - layout.bodyScrollPosition.y,
      },
    };
  }
  const rowHeaders = (["topLeft", "left"] as const).map((id, index): HeaderPane => ({
    id: index === 0 ? "frozen" : "body",
    clip: {
      x: headingOrigin.x,
      y: headerSize.height + panes[id].clip.y,
      width: headingSize.width,
      height: panes[id].clip.height,
    },
    items: layout.panes[id].rows.map((item) => ({
      ...item,
      offset: headerSize.height + item.offset + panes[id].translation.y,
    })),
  }));
  const columnHeaders = (["topLeft", "top"] as const).map((id, index): HeaderPane => ({
    id: index === 0 ? "frozen" : "body",
    clip: {
      x: headerSize.width + panes[id].clip.x,
      y: headingOrigin.y,
      width: panes[id].clip.width,
      height: headingSize.height,
    },
    items: layout.panes[id].columns.map((item) => ({
      ...item,
      offset: headerSize.width + item.offset + panes[id].translation.x,
    })),
  }));
  return {
    layout,
    scale,
    headerSize,
    headingSize,
    headingOrigin,
    size: {
      width: headerSize.width + layout.viewportSize.width,
      height: headerSize.height + layout.viewportSize.height,
    },
    body: { x: headerSize.width, y: headerSize.height, ...layout.viewportSize },
    panes,
    rowHeaders,
    columnHeaders,
  };
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

export function getSurfaceCell(frame: SheetRenderFrame, point: Point): CellAddress | null {
  if (!containsPoint(frame.body, point)) return null;
  return frame.layout.getCellAtViewportPoint({
    x: point.x - frame.body.x,
    y: point.y - frame.body.y,
  });
}
