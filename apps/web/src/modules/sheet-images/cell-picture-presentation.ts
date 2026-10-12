import { cloneCellImage, type FramedCellImage } from "@sheetcraft/core/cell-picture-frame";
import { resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import {
  capturePictureSourcePresentation,
  type PictureSourcePresentation,
} from "./picture-source-presentation";

/**
 * A detached, view-only adapter for the source painter. Its local reference frame
 * does not identify a workbook object and must never be written to an owner.
 */
export function captureCellPictureSourcePresentation(
  image: FramedCellImage,
): PictureSourcePresentation {
  const { frame, ...metadata } = cloneCellImage(image);
  const { size, ...sourceFrame } = frame;
  const picture: FramedFloatingImage = {
    ...metadata,
    id: "cell-picture-source",
    frame: {
      ...sourceFrame,
      kind: "object-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 0, offset: size.width }, row: { index: 0, offset: size.height } },
      },
    },
  };
  return capturePictureSourcePresentation(
    picture,
    resolvePictureSourceLayout({ x: 0, y: 0, ...size }, frame.angleDeg, frame.source),
  );
}
