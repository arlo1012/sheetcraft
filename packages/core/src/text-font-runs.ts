import { normalizeFontFamily } from "./style.js";
import type { CellTextFontRun } from "./formula/types.js";

export type CellTextDocument = Readonly<{
  text: string;
  fontRuns?: readonly CellTextFontRun[];
}>;

/** UTF-16 offsets may not split a Unicode scalar. Grapheme affinity belongs to the editor. */
export function isCellTextBoundary(text: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff);
}

/** Validates without sorting or repairing invalid intervals; returns independent metadata. */
export function normalizeCellTextFontRuns(
  text: string,
  value: unknown,
): CellTextFontRun[] | undefined {
  if (typeof text !== "string") throw new TypeError("Font runs require text.");
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("Cell font runs must be an array.");
  const result: CellTextFontRun[] = [];
  let previousEnd = 0;
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new TypeError("Cell font runs must contain range objects.");
    }
    if (Object.keys(item).some((key) => !["start", "end", "fontFamily"].includes(key))) {
      throw new TypeError("Cell font runs only support start, end, and fontFamily.");
    }
    const { start, end } = item;
    if (
      !isCellTextBoundary(text, start) ||
      !isCellTextBoundary(text, end) ||
      start >= end ||
      start < previousEnd
    )
      throw new RangeError(
        "Cell font runs must be ordered, non-overlapping UTF-16 scalar ranges within the text.",
      );
    const fontFamily = normalizeFontFamily(item.fontFamily);
    const previous = result.at(-1);
    if (previous && previous.end === start && previous.fontFamily === fontFamily) {
      result[result.length - 1] = { start: previous.start, end, fontFamily };
    } else result.push({ start, end, fontFamily });
    previousEnd = end;
  }
  return result.length ? result : undefined;
}

export function cloneCellTextFontRuns(
  runs: readonly CellTextFontRun[] | undefined,
): CellTextFontRun[] | undefined {
  return runs?.length ? runs.map((run) => ({ ...run })) : undefined;
}

export function areCellTextFontRunsEqual(
  left: readonly CellTextFontRun[] | undefined,
  right: readonly CellTextFontRun[] | undefined,
): boolean {
  return (
    (left?.length ?? 0) === (right?.length ?? 0) &&
    (left ?? []).every((run, index) => {
      const other = right?.[index];
      return (
        other?.start === run.start && other.end === run.end && other.fontFamily === run.fontFamily
      );
    })
  );
}

/** Returns an explicit override only; gaps and outer boundaries inherit the cell font. */
export function getCellTextFontOverride(
  document: CellTextDocument,
  offset: number,
  affinity: "backward" | "forward" = "backward",
): string | undefined {
  if (!isCellTextBoundary(document.text, offset)) throw new RangeError("Invalid text offset.");
  return normalizeCellTextFontRuns(document.text, document.fontRuns)?.find((run) =>
    affinity === "backward"
      ? run.start < offset && offset <= run.end
      : run.start <= offset && offset < run.end,
  )?.fontFamily;
}

/** No insertionFont means inherited font. Callers may explicitly supply their typing affinity. */
export function replaceCellTextRange(
  document: CellTextDocument,
  start: number,
  end: number,
  insertion: string,
  insertionFont?: string,
): CellTextDocument & { caret: number } {
  const runs = normalizeCellTextFontRuns(document.text, document.fontRuns) ?? [];
  if (
    !isCellTextBoundary(document.text, start) ||
    !isCellTextBoundary(document.text, end) ||
    start > end
  ) {
    throw new RangeError("Invalid text replacement range.");
  }
  if (typeof insertion !== "string") throw new TypeError("Inserted text must be a string.");
  const family = insertionFont === undefined ? undefined : normalizeFontFamily(insertionFont);
  const text = document.text.slice(0, start) + insertion + document.text.slice(end);
  const delta = insertion.length - (end - start);
  const next: CellTextFontRun[] = [];
  for (const run of runs) {
    if (run.start < start) next.push({ ...run, end: Math.min(run.end, start) });
  }
  if (insertion.length && family !== undefined)
    next.push({ start, end: start + insertion.length, fontFamily: family });
  for (const run of runs) {
    if (run.end > end)
      next.push({ ...run, start: Math.max(run.start, end) + delta, end: run.end + delta });
  }
  const fontRuns = normalizeCellTextFontRuns(text, next);
  return { text, ...(fontRuns ? { fontRuns } : {}), caret: start + insertion.length };
}

/** Complete segments, including inherited gaps; useful before display-text projection. */
export function getCellTextFontSegments(document: CellTextDocument): Array<{
  start: number;
  end: number;
  text: string;
  fontFamily?: string;
}> {
  const result: Array<{ start: number; end: number; text: string; fontFamily?: string }> = [];
  let start = 0;
  for (const run of normalizeCellTextFontRuns(document.text, document.fontRuns) ?? []) {
    if (start < run.start)
      result.push({ start, end: run.start, text: document.text.slice(start, run.start) });
    result.push({ ...run, text: document.text.slice(run.start, run.end) });
    start = run.end;
  }
  if (start < document.text.length)
    result.push({ start, end: document.text.length, text: document.text.slice(start) });
  return result;
}

/** Deterministic single-range plain edit. Ambiguous repeated text uses longest prefix first. */
export function replaceCellTextByDiff(
  document: CellTextDocument,
  text: string,
  options: { inheritInsertionFont?: boolean } = {},
): CellTextDocument {
  if (text === document.text) {
    const fontRuns = normalizeCellTextFontRuns(text, document.fontRuns);
    return { text, ...(fontRuns ? { fontRuns } : {}) };
  }
  let start = 0;
  while (
    start < text.length &&
    start < document.text.length &&
    text[start] === document.text[start]
  )
    start++;
  while (!isCellTextBoundary(text, start) || !isCellTextBoundary(document.text, start)) start--;
  let suffix = 0;
  while (
    suffix < text.length - start &&
    suffix < document.text.length - start &&
    text[text.length - 1 - suffix] === document.text[document.text.length - 1 - suffix]
  )
    suffix++;
  while (
    !isCellTextBoundary(text, text.length - suffix) ||
    !isCellTextBoundary(document.text, document.text.length - suffix)
  )
    suffix--;
  return replaceCellTextRange(
    document,
    start,
    document.text.length - suffix,
    text.slice(start, text.length - suffix),
    options.inheritInsertionFont
      ? getCellTextFontOverride(
          document,
          start,
          start === document.text.length - suffix ? "backward" : "forward",
        )
      : undefined,
  );
}

/** Preserve only the source portion of a trimmed caption with an optional uniqueness suffix. */
export function normalizeCellTextCaption(
  document: CellTextDocument,
  caption: string,
): CellTextDocument {
  const trimmed = document.text.trim();
  if (!caption.startsWith(trimmed)) return { text: caption };
  const start = document.text.length - document.text.trimStart().length;
  let result = replaceCellTextRange(document, start + trimmed.length, document.text.length, "");
  result = replaceCellTextRange(result, 0, start, "");
  return replaceCellTextRange(
    result,
    trimmed.length,
    trimmed.length,
    caption.slice(trimmed.length),
  );
}
