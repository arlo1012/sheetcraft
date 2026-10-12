import type { SheetFramedGraphicDrawing } from "../../sheet-drawings.js";
import type { ShapeFrameAnchor } from "../../shape-frame.js";
import { textDrawing } from "./shape-text-fixture.js";

export function framedShapeDrawing(
  anchor: ShapeFrameAnchor = {
    mode: "move-and-size",
    start: { row: { index: 5, offset: 7 }, column: { index: 2, offset: 3 } },
    end: { row: { index: 15, offset: 7 }, column: { index: 5, offset: 3 } },
  },
): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = textDrawing();
  return { ...appearance, kind: "shape", shapeFrame: { kind: "shape-frame-v1", anchor } };
}
