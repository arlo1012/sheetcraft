import type { SheetDrawing, SheetGraphicDrawing } from "../../sheet-drawings.js";
import { traverseShapeGroup, type ShapeGroupDrawing } from "../../shape-group.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { shapeText } from "../drawings/shape-text-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";

export function linkedBox(
  sheetId = "source",
  cell: { row: number; column: number } | null = { row: 4, column: 2 },
): SheetGraphicDrawing {
  return { ...legacyShapeDrawing(), kind: "textBox", text: "", textReference: { sheetId, cell } };
}
export function framedBox(sheetId = "source") {
  return {
    ...framedShapeDrawing(),
    shapeFrame: {
      kind: "shape-frame-v1" as const,
      anchor: { mode: "fixed" as const, x: 100, y: 100, size: { width: 200, height: 100 } },
    },
    kind: "textBox" as const,
    text: "",
    textReference: { sheetId, cell: { row: 4, column: 2 } },
    shapeText: { ...shapeText(), warp: { preset: "textCircle" as const } },
    shapeStyle: { fill: { kind: "none" as const } },
  };
}
export function ownedBox(sheetId = "source"): ShapeGroupDrawing {
  return {
    ...group("ref-root"),
    hidden: true,
    members: [
      {
        ...nested("ref-inner"),
        hidden: true,
        members: [
          {
            ...leaf("ref-leaf", "textBox"),
            text: "",
            hidden: true,
            textReference: { sheetId, cell: { row: 4, column: 2 } },
            shapeText: shapeText(),
          },
        ],
      },
    ],
  };
}
export function target(drawing: SheetDrawing) {
  if (drawing.kind !== "shapeGroup") {
    if (drawing.kind !== "textBox") throw Error("Expected text box");
    return drawing;
  }
  const node = traverseShapeGroup(drawing).find(({ node }) => node.kind === "textBox")!.node;
  if (node.kind === "shapeGroup") throw Error("Expected text box");
  return node;
}
