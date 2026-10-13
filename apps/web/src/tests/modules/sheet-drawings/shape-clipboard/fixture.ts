import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { Choice, PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";
import {
  normalizeShapeGroup,
  type ShapeGroupDrawing,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapePaint } from "@sheetcraft/core/shape-style";
import { createSheet } from "@sheetcraft/core/workbook";
import { framedShape } from "../framed-shape-fixture";

export function shape(id = "shape", x = 80, y = 24): SheetFramedGraphicDrawing {
  const result = framedShape();
  result.id = id;
  result.name = id;
  result.shapeFrame.anchor = { mode: "fixed", x, y, size: { width: 240, height: 120 } };
  return result;
}
export function texture(assetId: string): ShapePaint {
  return {
    kind: "picture",
    assetId,
    opacity: 1,
    rotateWithShape: true,
    layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
  };
}
export function wordArt(id = "art"): SheetFramedGraphicDrawing {
  const result = shape(id);
  delete result.shapeGeometry;
  result.kind = "shape";
  result.wordArt = true;
  result.text = "Art 中文";
  result.shapeStyle = { fill: { kind: "value", value: texture("body-asset") } };
  result.shapeText = {
    ...result.shapeText!,
    fontFamily: "SheetcraftLocal_0123456789abcdef",
    style: { fill: { kind: "value", value: texture("glyph-asset") } },
    characterRuns: [
      {
        start: 0,
        end: 3,
        fontSize: 32,
        bold: true,
        fill: { kind: "value", value: texture("run-asset") },
      },
    ],
  };
  return result;
}
export function leaf(id: string): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = shape(id);
  return {
    ...appearance,
    rotation: 13,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.4 },
    },
  };
}
export function group(): ShapeGroupDrawing {
  const art = wordArt("hidden-art");
  const { shapeFrame: _frame, ...appearance } = art;
  return normalizeShapeGroup({
    kind: "shapeGroup",
    id: "outer",
    name: "Outer",
    rotation: 37,
    shapeProperties: { locked: false, printObject: false, altTitle: "Outer title" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 30, y: 10, size: { width: 320, height: 180 } },
    },
    members: [
      leaf("first"),
      {
        kind: "shapeGroup",
        id: "inner",
        name: "Inner",
        rotation: 29,
        shapeProperties: { altTitle: "Inner title", lockAspectRatio: true },
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.3, yRatio: 0.3, widthRatio: 0.5, heightRatio: 0.5 },
        },
        members: [
          leaf("nested"),
          {
            ...appearance,
            hidden: true,
            rotation: 9,
            groupFrame: {
              kind: "shape-group-local-v1",
              rect: { xRatio: 0.5, yRatio: 0.2, widthRatio: 0.2, heightRatio: 0.7 },
            },
          },
        ],
      },
    ],
  });
}
export const camera: Choice<PictureRotation3d> = {
  kind: "value",
  value: { xDeg: 45, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0, projection: "parallel" },
};
export function metrics() {
  return createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
}
