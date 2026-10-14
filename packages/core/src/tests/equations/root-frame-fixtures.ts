import type { ShapeFrameAnchor } from "../../shape-frame.js";
import type { SheetFramedEquationDrawing } from "../../sheet-drawings.js";
import { equationDrawing } from "./fixtures.js";

export const opaqueEquationSource = "  \\frac{a}{b}\n\\unknown{exact}  ";

export function equationPoint(column: number, row: number, offsetX = 0, offsetY = 0) {
  return { column: { index: column, offset: offsetX }, row: { index: row, offset: offsetY } };
}

export function framedEquationDrawing(
  anchor: ShapeFrameAnchor = {
    mode: "move-only",
    origin: equationPoint(3, 4, 7, 9),
    size: { width: 180, height: 90 },
  },
  opaque = false,
): SheetFramedEquationDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    equationDocument,
    ...appearance
  } = equationDrawing();
  return {
    ...appearance,
    kind: "equation",
    ...(opaque ? { text: opaqueEquationSource } : { equationDocument }),
    shapeFrame: { kind: "shape-frame-v1", anchor },
  };
}
