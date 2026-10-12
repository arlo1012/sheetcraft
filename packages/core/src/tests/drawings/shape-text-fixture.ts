import type { ShapeText } from "../../shape-text.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";

export function shapeText(): ShapeText {
  return {
    layout: {
      blockAlignment: "start",
      direction: "horizontal",
      lineOrder: "rtl",
      marginsPt: { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: {
      alignment: "left",
      beforePt: 0,
      afterPt: 0,
      lineSpacing: { kind: "normal" },
    },
  };
}
export function textDrawing(model: ShapeText = shapeText()): SheetGraphicDrawing {
  return { ...legacyShapeDrawing(), shapeText: model };
}
