import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import type { ShapePaint } from "../../shape-style.js";
import type { ShapeText } from "../../shape-text.js";
import type {
  ShapeGroupDrawing,
  ShapeGroupedGroup,
  ShapeGroupLocalFrame,
  SheetGroupedGraphicDrawing,
} from "../../shape-group.js";
import { createSheet } from "../../workbook.js";

export function localFrame(): ShapeGroupLocalFrame {
  return {
    kind: "shape-group-local-v1",
    rect: { xRatio: 0, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
  };
}
export function leaf(id = "leaf", kind: "shape" | "textBox" = "shape"): SheetGroupedGraphicDrawing {
  return {
    kind,
    id,
    name: `Shape ${id}`,
    text: "Literal text 中文",
    shape: "roundedRectangle",
    fill: "#abcdef",
    stroke: "#123456",
    strokeWidth: 2.5,
    color: "#654321",
    fontSize: 19,
    bold: true,
    italic: true,
    rotation: 0,
    groupFrame: localFrame(),
  };
}
export function group(id = "group"): ShapeGroupDrawing {
  return {
    kind: "shapeGroup",
    id,
    name: `Group ${id}`,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 100, size: { width: 200, height: 100 } },
    },
    rotation: 0,
    members: [leaf(`${id}-a`), leaf(`${id}-b`, "textBox")],
  };
}
export function nested(id = "nested"): ShapeGroupedGroup {
  return {
    kind: "shapeGroup",
    id,
    name: "Nested group",
    groupFrame: localFrame(),
    rotation: 13,
    members: [leaf(`${id}-leaf`)],
  };
}
export function textModel(): ShapeText {
  return {
    layout: {
      blockAlignment: "center",
      direction: "stacked",
      lineOrder: "ltr",
      marginsPt: { leftPt: 1, rightPt: 2, topPt: 3, bottomPt: 4 },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: true,
    },
    paragraph: {
      alignment: "justify",
      beforePt: 1,
      afterPt: 2,
      lineSpacing: { kind: "exact", pt: 24 },
    },
    fontFamily: "SheetcraftLocal_0123456789abcdef",
    underline: true,
    strike: true,
  };
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
export function metrics() {
  return createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
}
