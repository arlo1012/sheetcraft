import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeGroupChild } from "@sheetcraft/core/shape-group";
import type { TextBoxTextReference } from "@sheetcraft/core/text-box-reference";
import { prepareShapeTextUpdate } from "./prepare-shape-text-update";
import type { TextBoxReferenceResolver } from "./textbox-reference-display";

/** Derived display is admitted for measurement only. The returned document still
 * owns empty linked text and the exact source; refreshes never call this helper. */
export function prepareTextBoxReferenceUpdate(
  resolver: TextBoxReferenceResolver,
  ...args: Parameters<typeof prepareShapeTextUpdate>
): SheetDrawing {
  const references = new Map<string, TextBoxTextReference>();
  function lift<T extends SheetDrawing | ShapeGroupChild>(node: T, capture: boolean): T {
    if (node.kind === "shapeGroup")
      return { ...node, members: node.members.map((member) => lift(member, capture)) } as T;
    if (node.kind !== "textBox" || !node.textReference) return node;
    if (capture) references.set(node.id, node.textReference);
    const display = resolver.resolve(node.textReference);
    if (display.status !== "ready") throw new Error(display.message);
    const { textReference: _reference, ...base } = node;
    return { ...base, text: display.text } as T;
  }
  function restore<T extends SheetDrawing | ShapeGroupChild>(node: T): T {
    if (node.kind === "shapeGroup") return { ...node, members: node.members.map(restore) } as T;
    const reference = references.get(node.id);
    if (!reference) return node;
    if (node.kind !== "textBox") throw new TypeError("A linked text box cannot change kind.");
    const shapeText = node.shapeText && { ...node.shapeText };
    if (shapeText) delete shapeText.characterRuns;
    return {
      ...node,
      text: "",
      textReference: reference,
      ...(shapeText ? { shapeText } : {}),
    } as T;
  }
  const [candidate, source, viewport, measurement, paint, metrics, forest, mode] = args;
  const liftedCandidate = lift(candidate, true);
  if (!references.size) return prepareShapeTextUpdate(...args);
  // A source replaced by a bind may itself be unavailable. Transfer validates
  // only the candidate pixels; original source data is still used to prove
  // connector invariants, without requiring the discarded display to render.
  const preserve = mode === "preserve-geometry";
  const liftedSource = source && (preserve ? source : lift(source, false));
  return restore(
    prepareShapeTextUpdate(
      liftedCandidate,
      liftedSource,
      viewport,
      measurement,
      paint,
      metrics,
      forest && {
        ...forest,
        candidateForest: forest.candidateForest.map((node) => lift(node, false)),
        sourceForest: preserve
          ? forest.sourceForest
          : forest.sourceForest.map((node) => lift(node, false)),
      },
      mode,
    ),
  );
}
