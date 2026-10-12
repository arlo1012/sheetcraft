import type { ShapeDetailedStyle } from "../../shape-style.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { fullStyle, line, picturePaint } from "../images/detailed-style-fixture.js";
import { freePathDrawing } from "./free-path-fixture.js";

export function legacyShapeDrawing(): SheetGraphicDrawing {
  const { shapePath: _path, ...drawing } = freePathDrawing();
  return drawing;
}

export function styledShapeDrawing(
  shapeStyle: ShapeDetailedStyle = fullStyle(),
): SheetGraphicDrawing {
  return { ...legacyShapeDrawing(), shapeStyle };
}

export function textureShapeStyle(
  fillAssetId = "fill-texture",
  lineAssetId = "line-texture",
): ShapeDetailedStyle {
  return {
    fill: { kind: "value", value: picturePaint(fillAssetId) },
    line: { kind: "value", value: line(picturePaint(lineAssetId)) },
  };
}
