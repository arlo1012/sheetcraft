import {
  normalizeShapeTextCharacterFormat,
  normalizeShapeTextCharacterRuns,
  replaceShapeTextCharacterRange,
  type ShapeTextCharacterFormat,
  type ShapeTextCharacterSource,
} from "@sheetcraft/core/shape-text-character-runs";
import type { TextDomSelection } from "../../shared/cell-editing/text-dom-selection";

export type ShapeRichTextSnapshot = {
  source: ShapeTextCharacterSource;
  selection: TextDomSelection;
  pendingFormat?: ShapeTextCharacterFormat;
};
export const SHAPE_RICH_TEXT_HISTORY_LIMIT = 100;
const HISTORY_UNIT_LIMIT = 4_000_000;

function graphemeEdges(text: string): number[] {
  if (text.length > 100000) throw new RangeError("Shape text cannot exceed 100000 characters.");
  if (typeof Intl.Segmenter !== "function")
    throw new TypeError("Shape text editing requires grapheme segmentation.");
  const edges = Array.from(
    new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text),
    (segment) => segment.index,
  );
  if (edges.at(-1) !== text.length) edges.push(text.length);
  return edges;
}
function lowerEdge(edges: readonly number[], value: number): number {
  let lower = 0,
    upper = edges.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (edges[middle]! < value) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

/** DOM ranges are expanded to whole graphemes; collapsed carets use the nearest edge. */
export function normalizeShapeRichTextSelection(
  text: string,
  value: Pick<TextDomSelection, "start" | "end"> & Partial<Pick<TextDomSelection, "direction">>,
): TextDomSelection {
  const edges = graphemeEdges(text);
  const clamp = (offset: number) =>
    Number.isFinite(offset) ? Math.min(text.length, Math.max(0, Math.trunc(offset))) : 0;
  const first = clamp(value.start),
    last = clamp(value.end);
  const start = Math.min(first, last),
    end = Math.max(first, last);
  const startIndex = lowerEdge(edges, start),
    endIndex = lowerEdge(edges, end);
  if (start === end) {
    const next = edges[startIndex] ?? text.length;
    const previous = edges[Math.max(0, startIndex - 1)] ?? 0;
    const caret = start - previous <= next - start ? previous : next;
    return { start: caret, end: caret, direction: "none" };
  }
  return {
    start: edges[startIndex] === start ? start : (edges[Math.max(0, startIndex - 1)] ?? 0),
    end: edges[endIndex] ?? text.length,
    direction: value.direction ?? "forward",
  };
}

export function cloneShapeRichTextSnapshot(value: ShapeRichTextSnapshot): ShapeRichTextSnapshot {
  const runs = normalizeShapeTextCharacterRuns(value.source.text, value.source.characterRuns);
  return {
    source: { text: value.source.text, ...(runs ? { characterRuns: runs } : {}) },
    selection: normalizeShapeRichTextSelection(value.source.text, value.selection),
    ...(value.pendingFormat !== undefined
      ? { pendingFormat: normalizeShapeTextCharacterFormat(value.pendingFormat) }
      : {}),
  };
}

export function shapeRichTextSourcesEqual(
  left: ShapeTextCharacterSource,
  right: ShapeTextCharacterSource,
): boolean {
  return (
    left.text === right.text &&
    JSON.stringify(left.characterRuns ?? []) === JSON.stringify(right.characterRuns ?? [])
  );
}
export function shapeRichTextSnapshotsEqual(
  left: ShapeRichTextSnapshot,
  right: ShapeRichTextSnapshot,
): boolean {
  return (
    shapeRichTextSourcesEqual(left.source, right.source) &&
    left.selection.start === right.selection.start &&
    left.selection.end === right.selection.end &&
    left.selection.direction === right.selection.direction &&
    JSON.stringify(left.pendingFormat) === JSON.stringify(right.pendingFormat)
  );
}

export function replaceShapeRichTextSelection(
  state: ShapeRichTextSnapshot,
  range: TextDomSelection,
  insertion: string,
): ShapeRichTextSnapshot {
  const selection = normalizeShapeRichTextSelection(state.source.text, range);
  // A present pending format is the complete sparse override. In particular,
  // {} explicitly clears all character overrides and inherits the base.
  const format = selection.start === selection.end ? state.pendingFormat : undefined;
  const replacement = replaceShapeTextCharacterRange(
    state.source,
    selection.start,
    selection.end,
    insertion,
    format,
  );
  return cloneShapeRichTextSnapshot({
    source: {
      text: replacement.text,
      ...(replacement.characterRuns ? { characterRuns: replacement.characterRuns } : {}),
    },
    selection: { start: replacement.caret, end: replacement.caret, direction: "none" },
    ...(state.pendingFormat !== undefined ? { pendingFormat: state.pendingFormat } : {}),
  });
}

export function shapeRichTextDeletionRange(
  text: string,
  value: TextDomSelection,
  inputType: string,
): TextDomSelection {
  const selection = normalizeShapeRichTextSelection(text, value);
  if (selection.start !== selection.end) return selection;
  const edges = graphemeEdges(text),
    index = lowerEdge(edges, selection.start);
  const backward = inputType.endsWith("Backward");
  let start = selection.start,
    end = selection.end;
  if (inputType.includes("Line")) {
    if (backward) start = text.lastIndexOf("\n", Math.max(-1, start - 1)) + 1;
    else {
      const newline = text.indexOf("\n", end);
      end = newline < 0 ? text.length : newline;
    }
  } else if (inputType.includes("Word")) {
    // Native target ranges take precedence. This fallback deletes one adjacent
    // whitespace group and word, and never splits an extended grapheme.
    let at = index;
    const slice = (left: number) => text.slice(edges[left], edges[left + 1]);
    if (backward) {
      while (at > 0 && /^\s+$/u.test(slice(at - 1))) at--;
      while (at > 0 && !/^\s+$/u.test(slice(at - 1))) at--;
      start = edges[at] ?? 0;
    } else {
      while (at < edges.length - 1 && /^\s+$/u.test(slice(at))) at++;
      while (at < edges.length - 1 && !/^\s+$/u.test(slice(at))) at++;
      end = edges[at] ?? text.length;
    }
  } else if (backward) start = edges[Math.max(0, index - 1)] ?? 0;
  else end = edges[Math.min(edges.length - 1, index + 1)] ?? text.length;
  return { start, end, direction: "none" };
}

/** Reconcile native IME text only. Native span styling is never imported. */
export function reconcileShapeRichTextComposition(
  original: ShapeRichTextSnapshot,
  text: string,
): ShapeRichTextSnapshot {
  if (text === original.source.text) return cloneShapeRichTextSnapshot(original);
  const previous = original.source.text;
  const selected = normalizeShapeRichTextSelection(previous, original.selection);
  const prefix = previous.slice(0, selected.start),
    suffix = previous.slice(selected.end);
  // The captured target is the only valid splice anchor. A global textual diff
  // shifts repeated characters to the wrong style run, and cannot establish
  // which native edit occurred outside the captured composition transaction.
  if (
    text.length < prefix.length + suffix.length ||
    !text.startsWith(prefix) ||
    !text.endsWith(suffix)
  )
    throw new RangeError(
      "Composition changed outside its captured selection. Your previous text and formatting have been kept.",
    );
  return replaceShapeRichTextSelection(
    original,
    selected,
    text.slice(prefix.length, text.length - suffix.length),
  );
}

/** Private surface history, independent of workbook history and native HTML Undo. */
export class ShapeRichTextInputHistory {
  private entries: ShapeRichTextSnapshot[];
  private cursor = 0;
  constructor(initial: ShapeRichTextSnapshot) {
    this.entries = [cloneShapeRichTextSnapshot(initial)];
  }
  get current(): ShapeRichTextSnapshot {
    return cloneShapeRichTextSnapshot(this.entries[this.cursor]!);
  }
  get length(): number {
    return this.entries.length;
  }
  captureSelection(selection: TextDomSelection, clearPendingFormat = false): void {
    const next = { ...this.entries[this.cursor]!, selection };
    if (clearPendingFormat) delete next.pendingFormat;
    this.entries[this.cursor] = cloneShapeRichTextSnapshot(next);
  }
  record(snapshot: ShapeRichTextSnapshot): boolean {
    const next = cloneShapeRichTextSnapshot(snapshot);
    if (shapeRichTextSnapshotsEqual(this.entries[this.cursor]!, next)) return false;
    this.entries.splice(this.cursor + 1);
    this.entries.push(next);
    this.cursor++;
    let units = this.entries.reduce(
      (sum, entry) =>
        sum + entry.source.text.length + (entry.source.characterRuns?.length ?? 0) * 32 + 16,
      0,
    );
    while (
      this.entries.length > 1 &&
      (this.entries.length > SHAPE_RICH_TEXT_HISTORY_LIMIT || units > HISTORY_UNIT_LIMIT)
    ) {
      const dropped = this.entries.shift()!;
      units -= dropped.source.text.length + (dropped.source.characterRuns?.length ?? 0) * 32 + 16;
      this.cursor--;
    }
    return true;
  }
  step(direction: "undo" | "redo"): ShapeRichTextSnapshot | undefined {
    const index = this.cursor + (direction === "undo" ? -1 : 1);
    if (index < 0 || index >= this.entries.length) return undefined;
    this.cursor = index;
    return this.current;
  }
}
