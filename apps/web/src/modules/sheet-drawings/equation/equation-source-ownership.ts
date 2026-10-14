import { normalizeEquationFlipState } from "@sheetcraft/core/equation-flip";
import { normalizeEquationDocument } from "@sheetcraft/core/equation-document";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { traverseShapeGroup, type ShapeGroupChild } from "@sheetcraft/core/shape-group";

export type EquationSourceCarrier = SheetDrawing | ShapeGroupChild;

/** Generic geometry/collection preparation cannot perform the Equation editor's
 * deliberate source conversion or replace its authoritative mathematical tree. */
export function assertEquationSourcePreserved(
  before: EquationSourceCarrier,
  after: EquationSourceCarrier,
): void {
  if (before.kind !== "equation") return;
  if (after.kind !== "equation")
    throw new TypeError("An equation operation must retain its source kind.");
  const sourceTree = before.equationDocument
    ? normalizeEquationDocument(before.equationDocument)
    : null;
  const nextTree = after.equationDocument
    ? normalizeEquationDocument(after.equationDocument)
    : null;
  if (after.text !== before.text || JSON.stringify(nextTree) !== JSON.stringify(sourceTree))
    throw new TypeError("An equation geometry view must preserve its exact mathematical source.");
}

function equationForestNodes(forest: readonly SheetDrawing[]) {
  const result = new Map<string, EquationSourceCarrier>();
  for (const root of forest)
    for (const node of root.kind === "shapeGroup"
      ? traverseShapeGroup(root).map((visit) => visit.node)
      : [root]) {
      if (result.has(node.id)) throw new TypeError("Duplicate drawing identity.");
      result.set(node.id, node);
    }
  return result;
}

/** Ownership may change during group/release without changing mathematical source.
 * Inspect the complete forests, never just matching worksheet-root IDs. */
export function assertEquationForestSourcesPreserved(
  before: readonly SheetDrawing[],
  after: readonly SheetDrawing[],
  deliberateSourceOwner?: EquationSourceCarrier,
): void {
  const next = equationForestNodes(after);
  for (const [id, source] of equationForestNodes(before)) {
    const current = next.get(id);
    if (current && source.kind === "equation" && source !== deliberateSourceOwner)
      assertEquationSourcePreserved(source, current);
  }
}

/** Geometry views carry existing math flip identity; only the explicit flip planner changes it. */
export function assertEquationGeometryPreserved(
  before: EquationSourceCarrier,
  after: EquationSourceCarrier,
): void {
  assertEquationSourcePreserved(before, after);
  if (before.kind !== "equation") return;
  if (
    JSON.stringify(normalizeEquationFlipState(before)) !==
    JSON.stringify(normalizeEquationFlipState(after))
  )
    throw new TypeError("An equation geometry view must preserve its math flip identity.");
}

/** Consumer preparation cannot alter retained flip identity after the deliberate proposal. */
export function assertEquationForestGeometryPreserved(
  before: readonly SheetDrawing[],
  after: readonly SheetDrawing[],
): void {
  const next = equationForestNodes(after);
  for (const [id, source] of equationForestNodes(before)) {
    const current = next.get(id);
    if (current && source.kind === "equation") assertEquationGeometryPreserved(source, current);
  }
}
