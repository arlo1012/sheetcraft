import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
export function framedShape(): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing("shape", "shape", "Shape", { row: 0, column: 0 });
  return normalizeSheetDrawing({
    ...appearance,
    kind: "shape",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 80, y: 24, size: { width: 240, height: 120 } },
    },
  });
}
