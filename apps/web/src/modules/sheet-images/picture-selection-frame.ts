import type { ResolvedPictureLayout } from "@sheetcraft/core/picture-frame";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";

/** Handle/selection geometry has no image asset or source rectangle contract. */
export type PictureSelectionFrameFragment = {
  paneId: FrozenPaneId;
  geometry: ResolvedPictureLayout;
  clippedBounds: Rect;
};
