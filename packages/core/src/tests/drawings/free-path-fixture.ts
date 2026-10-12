import type { ShapeFreePath, ShapeFreePathTool } from "../../shape-free-path.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";

export function freePath(tool: ShapeFreePathTool = "curve"): ShapeFreePath {
  return {
    tool,
    viewBox: { width: 180, height: 90 },
    commands: [
      ["M", 0, 30],
      ["L", 30, 0],
      ["Q", 60, 90, 90, 45],
      ["C", 120, 0, 150, 90, 180, 30],
    ],
  };
}

export function freePathDrawing(): SheetGraphicDrawing {
  return {
    id: "free-shape",
    kind: "shape",
    name: "Synthetic free shape",
    anchor: { row: 3, column: 2 },
    offsetX: 12,
    offsetY: 8,
    width: 180,
    height: 90,
    text: "Label",
    shape: "rectangle",
    fill: "#abcdef",
    stroke: "#000000",
    strokeWidth: 2,
    color: "#123456",
    fontSize: 14,
    bold: false,
    italic: true,
    rotation: 37,
    shapePath: freePath(),
  };
}
