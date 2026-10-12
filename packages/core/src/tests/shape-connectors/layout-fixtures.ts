import type { ShapeConnector } from "../../shape-connector.js";
import type { ShapePresetName } from "../../shape-presets/catalog.js";
import type { SheetFramedGraphicDrawing } from "../../sheet-drawings.js";

export function framedShape(
  id: string,
  preset: ShapePresetName = "rect",
  x = 10,
  y = 20,
  width = 100,
  height = 60,
): SheetFramedGraphicDrawing {
  return {
    kind: "shape",
    id,
    name: id,
    text: "",
    shape: "rectangle",
    fill: "#abcdef",
    stroke: "#123456",
    strokeWidth: 1,
    color: "#123456",
    fontSize: 12,
    bold: false,
    italic: false,
    rotation: 0,
    shapeGeometry: { preset },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x, y, size: { width, height } },
    },
  };
}
export function connectorShape(
  id = "connector",
  beginId = "rect",
  endId = "ellipse",
): SheetFramedGraphicDrawing {
  const shapeConnector: ShapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: beginId, preset: "rect", siteIndex: 3 },
    end: { kind: "site", targetId: endId, preset: "ellipse", siteIndex: 2 },
  };
  return { ...framedShape(id, "bentConnector3", 110, 50, 100, 60), shapeConnector };
}
