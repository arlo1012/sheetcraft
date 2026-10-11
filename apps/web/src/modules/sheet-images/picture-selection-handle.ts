import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { PictureSelectionFrameFragment } from "./picture-selection-frame";

/** Assign a seam handle once, only to a visible frame fragment in its own pane. */
export function isPictureHandleOwnedByPane(
  fragment: PictureSelectionFrameFragment,
  layout: SheetViewportLayout,
  point: Point,
): boolean {
  const paneId = fragment.paneId;
  const from = getPicturePaneTranslation(paneId, layout);
  const bounds = fragment.geometry.bounds;
  const epsilon = 1e-6;
  const all = Object.values(layout.panes).map((pane) => pane.clip);
  const outerX = Math.max(...all.map((clip) => clip.x + clip.width));
  const outerY = Math.max(...all.map((clip) => clip.y + clip.height));
  const owns = (v: number, start: number, end: number, outer: number) =>
    v >= start - epsilon &&
    (v < end - epsilon || (Math.abs(v - end) < epsilon && Math.abs(end - outer) < epsilon));
  const priority = { topLeft: 0, top: 1, left: 2, body: 3 };
  const candidates = Object.entries(layout.panes)
    .flatMap(([key, pane]) => {
      const candidate = key as typeof paneId;
      const clip = pane.clip;
      if (clip.width <= 0 || clip.height <= 0) return [];
      const to = getPicturePaneTranslation(candidate, layout);
      const dx = to.x - from.x,
        dy = to.y - from.y;
      const positive =
        Math.min(bounds.x + dx + bounds.width, clip.x + clip.width) >
          Math.max(bounds.x + dx, clip.x) &&
        Math.min(bounds.y + dy + bounds.height, clip.y + clip.height) >
          Math.max(bounds.y + dy, clip.y);
      const p = { x: point.x + dx, y: point.y + dy };
      if (
        !positive ||
        p.x < clip.x - epsilon ||
        p.x > clip.x + clip.width + epsilon ||
        p.y < clip.y - epsilon ||
        p.y > clip.y + clip.height + epsilon
      )
        return [];
      return [
        {
          paneId: candidate,
          score:
            Number(owns(p.x, clip.x, clip.x + clip.width, outerX)) +
            Number(owns(p.y, clip.y, clip.y + clip.height, outerY)),
        },
      ];
    })
    .sort((a, b) => b.score - a.score || priority[b.paneId] - priority[a.paneId]);
  return candidates[0]?.paneId === paneId;
}
