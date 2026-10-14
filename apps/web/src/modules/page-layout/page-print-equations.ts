import type { Sheet } from "@sheetcraft/core/workbook";
import { hasShapeObjectFrame, isSheetDrawingVisible } from "@sheetcraft/core/sheet-drawings";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { EquationPresentationInput } from "../sheet-drawings/equation/equation-presentation-plan";
import type { ResolvedShapeForestForRender } from "../sheet-drawings/resolved-shape-render-source";
import { getPrintableShapeGroupLeafIds, getPrintShapeSourceDrawings } from "./page-print-shapes";
import { getEquationMathRotationDeg } from "@sheetcraft/core/equation-flip";
import {
  traverseShapeGroup,
  type ShapeGroupPath,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import type {
  SheetDrawing,
  SheetFramedEquationDrawing,
  SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";

type EquationSource =
  | (SheetGraphicDrawing & { kind: "equation" })
  | SheetFramedEquationDrawing
  | SheetGroupedEquationDrawing;

function isEquationSource(
  source: SheetDrawing | SheetGroupedEquationDrawing,
): source is EquationSource {
  return source.kind === "equation";
}

/** An explicit consumer gate. Rendering raw LaTeX or omitting math
 * would both produce a misleading successful print. The source stays intact. */
export class EquationPrintUnavailableError extends Error {
  constructor(readonly drawingIds: readonly string[]) {
    super("Equation printing is not yet available. The workbook has not been changed.");
    this.name = "EquationPrintUnavailableError";
  }
}

export function assertEquationPrintConsumer(
  sheet: Pick<Sheet, "drawings">,
  hasNativeConsumer = false,
): void {
  const drawingIds = (sheet.drawings ?? []).flatMap((drawing) =>
    drawing.kind === "shapeGroup"
      ? traverseShapeGroup(drawing)
          .filter(({ node }) => node.kind === "equation")
          .map(({ node }) => node.id)
      : drawing.kind === "equation"
        ? [drawing.id]
        : [],
  );
  if (drawingIds.length && !hasNativeConsumer) throw new EquationPrintUnavailableError(drawingIds);
}

export type PrintEquationEntry = Readonly<{
  root: NonNullable<Sheet["drawings"]>[number];
  sourceNode: EquationSource;
  sourceIdentity: EquationSource;
  path: ShapeGroupPath;
  /** Worksheet root order, then native leaves follow actual DFS sibling order. */
  order: number;
  input: Omit<EquationPresentationInput, "density">;
  rect: ShapeFrameRect;
  rotation: number;
  /** A separate local glyph transform, never a geometric/body mirror. */
  mathRotation: 0 | 180;
  bounds: { left: number; top: number; right: number; bottom: number };
}>;
export type PrintEquationPass = Readonly<{
  entries: readonly PrintEquationEntry[];
  key: string;
  revision: number;
  assertCurrent(): void;
}>;

/** Capture real worksheet owners once. Native mathematical layout is prepared later;
 * pagination already includes the rotated, locally clipped equation rectangle. */
export function capturePrintEquationPass(
  sheet: Sheet,
  metrics: PictureSheetMetrics,
  renderPass: ResolvedShapeForestForRender,
): PrintEquationPass {
  const assertCurrent = () =>
    renderPass.assertCurrent(getPrintShapeSourceDrawings(sheet), metrics, renderPass.revision);
  assertCurrent();
  const entries: PrintEquationEntry[] = [];
  function capture(
    root: SheetDrawing,
    sourceNode: EquationSource,
    path: ShapeGroupPath,
    order: number,
  ) {
    if (sourceNode.kind !== "equation") throw new EquationPrintUnavailableError([sourceNode.id]);
    const leaf = renderPass.getLeaf(sourceNode.id);
    if (
      !leaf ||
      leaf.sourceRoot !== root ||
      leaf.sourceNode !== sourceNode ||
      leaf.path.length !== path.length ||
      leaf.path.some((id, index) => id !== path[index])
    )
      throw new EquationPrintUnavailableError([sourceNode.id]);
    const carrier = root === sourceNode ? leaf.carrierRoot : leaf.carrierLeaf;
    if (!carrier) throw new EquationPrintUnavailableError([sourceNode.id]);
    if (carrier.collapsed) return;
    const view = carrier.view;
    const placement = "rect" in carrier ? carrier.rect : carrier.layout?.rect;
    if (!view || view.kind !== "equation" || !placement)
      throw new EquationPrintUnavailableError([sourceNode.id]);
    const rect = Object.freeze({ ...placement });
    const mathRotation = getEquationMathRotationDeg(sourceNode);
    const corners = [
      { x: 0, y: 0 },
      { x: rect.width, y: 0 },
      { x: rect.width, y: rect.height },
      { x: 0, y: rect.height },
    ].map((point) => shapeFrameLocalToWorld(rect, view.rotation, point));
    entries.push(
      Object.freeze({
        root,
        sourceNode,
        sourceIdentity: sourceNode,
        path: Object.freeze([...path]),
        order,
        rect,
        rotation: view.rotation,
        mathRotation,
        input: Object.freeze({
          sourceIdentity: sourceNode,
          source: sourceNode.text,
          fontSize: sourceNode.fontSize,
          color: sourceNode.color,
          localW: rect.width,
          localH: rect.height,
        }),
        bounds: Object.freeze({
          left: Math.min(...corners.map((p) => p.x)),
          top: Math.min(...corners.map((p) => p.y)),
          right: Math.max(...corners.map((p) => p.x)),
          bottom: Math.max(...corners.map((p) => p.y)),
        }),
      }),
    );
    if (entries.length > 128)
      throw new RangeError("Printing supports up to 128 equations per sheet.");
  }
  for (const [order, root] of getPrintShapeSourceDrawings(sheet).entries()) {
    if (root.kind === "shapeGroup") {
      const printable = getPrintableShapeGroupLeafIds(root);
      for (const { node, path } of traverseShapeGroup(root))
        if (node.kind === "equation" && printable.has(node.id)) capture(root, node, path, order);
      continue;
    }
    if (!isEquationSource(root) || !isSheetDrawingVisible(root)) continue;
    if (hasShapeObjectFrame(root) && !getShapeObjectProperties(root.shapeProperties).printObject)
      continue;
    capture(root, root, [root.id], order);
  }
  assertCurrent();
  return Object.freeze({
    entries: Object.freeze(entries),
    revision: renderPass.revision,
    key: JSON.stringify(
      entries.map((entry) => [
        entry.root.id,
        entry.sourceNode.id,
        entry.path,
        entry.sourceNode.equationFlipX === true,
        entry.sourceNode.equationFlipY === true,
        entry.order,
        entry.input.source,
        entry.input.fontSize,
        entry.input.color,
        entry.rect,
        entry.rotation,
        entry.mathRotation,
      ]),
    ),
    assertCurrent,
  });
}

export function getPrintEquationContentExtent(
  pass: PrintEquationPass,
  metrics: PictureSheetMetrics,
) {
  pass.assertCurrent();
  const count = (position: number, axis: PictureSheetMetrics["rows"]) => {
    let low = 0,
      high = axis.count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (axis.visiblePrefix(middle) < position) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  let rowCount = 0,
    columnCount = 0;
  for (const entry of pass.entries) {
    rowCount = Math.max(rowCount, count(entry.bounds.bottom, metrics.rows));
    columnCount = Math.max(columnCount, count(entry.bounds.right, metrics.columns));
  }
  return { rowCount, columnCount };
}
