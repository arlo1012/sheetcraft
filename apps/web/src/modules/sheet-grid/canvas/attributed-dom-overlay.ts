import type { CellAddress } from "@sheetcraft/core/workbook";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { PageViewPaintState } from "../../page-layout/page-view-types";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";
import type { CanvasCell, SheetCanvasScene } from "./cell-scene";

export type AttributedDomCell = Readonly<{
  key: string;
  paneId: FrozenPaneId;
  cell: CanvasCell;
  /** Surface coordinates, clipped to the viewport pane and page content. */
  clip: Rect;
  /** Full cell placement relative to the clip; rotation/overflow remains cell-local. */
  placement: Rect;
}>;

function intersection(left: Rect, right: Rect): Rect | undefined {
  const x = Math.max(left.x, right.x),
    y = Math.max(left.y, right.y);
  const width = Math.min(left.x + left.width, right.x + right.width) - x;
  const height = Math.min(left.y + left.height, right.y + right.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/** Only complex multi-font bidi uses DOM. Canvas remains authoritative for all other cells. */
export function getAttributedDomCells(options: {
  scene: SheetCanvasScene | undefined;
  frame: SheetRenderFrame;
  editingCell?: CellAddress;
  pageView?: PageViewPaintState;
}): AttributedDomCell[] {
  const cells: AttributedDomCell[] = [];
  for (const pane of options.scene?.panes ?? []) {
    const projection = options.frame.panes[pane.id];
    const seen = new Set<string>();
    for (const cell of pane.cells) {
      if (!cell.content.textLayout?.canvasBidiRequired) continue;
      const source = cell.span?.kind === "centerContinuous" ? cell.span.source : cell.address;
      if (source.row === options.editingCell?.row && source.column === options.editingCell.column)
        continue;
      const key = `${source.row}:${source.column}`;
      if (cell.span?.kind === "centerContinuous") {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const full: Rect = {
        x: cell.contentRect.x + projection.translation.x,
        y: cell.contentRect.y + projection.translation.y,
        width: Math.max(0, cell.contentRect.width - 1),
        height: Math.max(0, cell.contentRect.height - 1),
      };
      const paneClip = intersection(full, projection.clip);
      if (!paneClip) continue;
      const clips =
        options.pageView?.mode === "page-layout"
          ? options.pageView.pages.flatMap((page) => {
              const clip = intersection(paneClip, {
                ...page.contentRect,
                x: page.contentRect.x - options.frame.layout.bodyScrollPosition.x,
                y: page.contentRect.y - options.frame.layout.bodyScrollPosition.y,
              });
              return clip ? [clip] : [];
            })
          : [paneClip];
      clips.forEach((clip, index) =>
        cells.push({
          key: `${pane.id}:${key}:${index}`,
          paneId: pane.id,
          cell,
          clip: { ...clip, x: clip.x + options.frame.body.x, y: clip.y + options.frame.body.y },
          placement: {
            x: full.x - clip.x,
            y: full.y - clip.y,
            width: full.width,
            height: full.height,
          },
        }),
      );
    }
  }
  return cells;
}
