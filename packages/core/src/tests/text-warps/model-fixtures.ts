import type { ShapeText } from "../../shape-text.js";
import type { ShapeTextWarp } from "../../text-warps/types.js";
import type { SheetFramedGraphicDrawing, SheetGraphicDrawing } from "../../sheet-drawings.js";
import { traverseShapeGroup, type ShapeGroupDrawing } from "../../shape-group.js";
import { shapeText } from "../drawings/shape-text-fixture.js";
import { legacyShapeDrawing, textureShapeStyle } from "../drawings/shape-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";

export const WARP_OWNER_TEXT = "alpha beta\n中文";

export function warpedText(
  warp: ShapeTextWarp = { preset: "textWave1", adjustments: { adj1: 17000, adj2: -3000 } },
): ShapeText {
  const model = shapeText();
  model.layout.autoFit = "resize-shape";
  model.layout.keepFlat = true;
  model.paragraph.beforePt = 2;
  return {
    ...model,
    fontFamily: "Exact Local 😀",
    underline: true,
    style: textureShapeStyle("glyph-fill", "glyph-line"),
    characterRuns: [{ start: 0, end: 5, fontSize: 20, bold: false, color: "#aabbcc" }],
    warp,
  };
}

export function warpedDrawing(kind: "shape" | "textBox" = "shape"): SheetGraphicDrawing {
  return {
    ...legacyShapeDrawing(),
    kind,
    text: WARP_OWNER_TEXT,
    shapeFlipX: true,
    shapeFlipY: true,
    ...(kind === "shape" ? { shapeStyle: textureShapeStyle("body-fill", "body-line") } : {}),
    shapeText: warpedText(),
  };
}

export function framedWarpedDrawing(): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = warpedDrawing();
  return {
    ...appearance,
    kind: "shape",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 10, y: 20, size: { width: 200, height: 100 } },
    },
    shapeGeometry: { preset: "rect" },
    shapeProperties: { lockAspectRatio: true, altTitle: "Retained title" },
  };
}

export function warpedTree(kind: "shape" | "textBox" = "shape"): ShapeGroupDrawing {
  return {
    ...group("warp-root"),
    members: [
      {
        ...nested("warp-inner"),
        members: [
          {
            ...leaf("warped-leaf", kind),
            text: WARP_OWNER_TEXT,
            shapeText: warpedText(),
            shapeFlipX: true,
            shapeFlipY: true,
          },
        ],
      },
      leaf("untouched-leaf"),
    ],
  };
}

export function textWarpLeaf(root: ShapeGroupDrawing) {
  const target = traverseShapeGroup(root).find(({ node }) => node.id === "warped-leaf")!.node;
  if (target.kind === "shapeGroup") throw Error("Expected a text-warp leaf.");
  return target;
}
