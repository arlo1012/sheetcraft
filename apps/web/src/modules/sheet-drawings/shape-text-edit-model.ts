import { cloneShapeText } from "@sheetcraft/core/shape-text";
import {
  normalizeShapeTextCharacterRuns,
  replaceShapeTextCharacterRange,
  isShapeTextCharacterBoundary,
  type ShapeTextCharacterSource,
  type ShapeTextCharacterFormat,
} from "@sheetcraft/core/shape-text-character-runs";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { materializeDrawingShapeText } from "./shape-text-options";
import type { TextDomSelection } from "../../shared/cell-editing/text-dom-selection";

export type ShapeTextRichDraft = Readonly<{
  source: ShapeTextCharacterSource;
  selection: TextDomSelection;
  pendingFormat?: ShapeTextCharacterFormat;
}>;
export function shapeTextDraftSource(drawing: {
  text: string;
  shapeText?: { characterRuns?: ShapeTextCharacterSource["characterRuns"] };
}): ShapeTextCharacterSource {
  const runs = normalizeShapeTextCharacterRuns(drawing.text, drawing.shapeText?.characterRuns);
  return { text: drawing.text, ...(runs ? { characterRuns: runs } : {}) };
}
/** Temporary carrier only; never persists its anchor or measured world geometry. */
export function withShapeTextDraftSource(
  drawing: SheetGraphicDrawing,
  source: ShapeTextCharacterSource,
): SheetGraphicDrawing {
  const runs = normalizeShapeTextCharacterRuns(source.text, source.characterRuns);
  if (!drawing.shapeText && !runs) return { ...drawing, text: source.text };
  // Clone against the OLD authoritative text before replacing range coordinates.
  const shapeText = drawing.shapeText
    ? cloneShapeText(drawing.shapeText, drawing.text)!
    : materializeDrawingShapeText(drawing);
  if (runs) shapeText.characterRuns = runs;
  else delete shapeText.characterRuns;
  return { ...drawing, text: source.text, shapeText };
}
export function shapeTextDraftSelection(
  source: ShapeTextCharacterSource,
  selection: TextDomSelection,
): TextDomSelection {
  if (
    !["forward", "backward", "none"].includes(selection.direction) ||
    selection.start > selection.end ||
    !isShapeTextCharacterBoundary(source.text, selection.start) ||
    !isShapeTextCharacterBoundary(source.text, selection.end)
  )
    throw new RangeError("Shape character selection must follow complete graphemes.");
  return { ...selection };
}
/** Legacy textarea fallback only. Rich input submits exact beforeinput ranges instead. */
export function replaceShapeTextDraftByDiff(
  source: ShapeTextCharacterSource,
  nextText: string,
): ShapeTextCharacterSource {
  if (nextText === source.text) return source;
  let start = 0,
    oldEnd = source.text.length,
    newEnd = nextText.length;
  while (start < oldEnd && start < newEnd && source.text[start] === nextText[start]) start++;
  while (oldEnd > start && newEnd > start && source.text[oldEnd - 1] === nextText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const edges = (text: string) =>
    new Set<number>([
      0,
      text.length,
      ...Array.from(
        new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text),
        (segment) => segment.index,
      ),
    ]);
  const oldEdges = edges(source.text),
    newEdges = edges(nextText);
  while (start > 0 && (!oldEdges.has(start) || !newEdges.has(start))) start--;
  while (
    oldEnd < source.text.length &&
    newEnd < nextText.length &&
    (!oldEdges.has(oldEnd) || !newEdges.has(newEnd))
  ) {
    oldEnd++;
    newEnd++;
  }
  if (oldEnd > source.text.length || newEnd > nextText.length)
    throw new RangeError("Cannot project this character edit safely.");
  const { caret: _caret, ...next } = replaceShapeTextCharacterRange(
    source,
    start,
    oldEnd,
    nextText.slice(start, newEnd),
  );
  return next;
}
