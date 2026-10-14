import type { EquationDocument, EquationNode, EquationSequence } from "../../equation-document.js";
import { serializeEquationDocument } from "../../equation-document.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";

export function equationFactory() {
  let counter = 0;
  const id = () => `node-${++counter}`;
  const sequence = (...children: EquationNode[]): EquationSequence => ({
    id: id(),
    kind: "sequence",
    children,
  });
  const text = (value: string): EquationNode => ({ id: id(), kind: "text", value });
  return { id, sequence, text };
}

export function equationDocument(): EquationDocument {
  const { id, sequence, text } = equationFactory();
  return {
    kind: "equation-document-v1",
    body: sequence({
      id: id(),
      kind: "fraction",
      style: "stacked",
      numerator: sequence({ id: id(), kind: "radical", radicand: sequence(text("x")) }, text("y"), {
        id: id(),
        kind: "matrix",
        brackets: "paren",
        alignment: "center",
        rows: [
          [sequence(text("12")), sequence(text("3"))],
          [sequence(text("4")), sequence(text("5"))],
        ],
      }),
      denominator: sequence(text("c")),
    }),
  };
}

export function equationDrawing(document = equationDocument()): SheetGraphicDrawing {
  return {
    id: "equation-1",
    kind: "equation",
    name: "Equation 1",
    anchor: { row: 3, column: 2 },
    offsetX: 12,
    offsetY: 8,
    width: 180,
    height: 90,
    text: serializeEquationDocument(document),
    equationDocument: document,
    shape: "rectangle",
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    color: "#000000",
    fontSize: 11,
    bold: false,
    italic: true,
    rotation: 0,
  };
}
