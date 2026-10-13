import {
  SHAPE_TEXT_LAYOUT_LIMITS,
  type ShapeTextLayoutResult,
  type ShapeTextRect,
  type ShapeTextRun,
} from "./shape-text-layout";

export type ShapeTextWarpNativeSource =
  | Readonly<{ kind: "whitespace"; runIndices: readonly number[] }>
  | Readonly<{
      kind: "native-text";
      left: number;
      top: number;
      width: number;
      height: number;
      /** Native, unreflected baseline; appearance never establishes this coordinate. */
      baselineY: number;
      runIndices: readonly number[];
    }>;

const MAX_COORDINATE = 10_000_000;

function finite(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE)
    throw new RangeError("Text-warp native source exceeds its finite coordinate budget.");
  return value === 0 ? 0 : value;
}

function checkRect(rect: ShapeTextRect): void {
  finite(rect.x);
  finite(rect.y);
  if (finite(rect.width) < 0 || finite(rect.height) < 0)
    throw new RangeError("Text-warp native source rectangles cannot have negative extents.");
  finite(rect.x + rect.width);
  finite(rect.y + rect.height);
}

/**
 * The normalization rectangle is independent of fill, clipping, outline and effects.
 * Advance endpoints retain authored spaces; nonempty native ink retains overhangs.
 * A caller chooses complete source lines explicitly. This helper assigns no warp tracks.
 */
export function getShapeTextWarpNativeSource(
  layout: ShapeTextLayoutResult,
  lineIndices: readonly number[] = layout.lines.map((_, index) => index),
): ShapeTextWarpNativeSource {
  if (
    !Array.isArray(layout.lines) ||
    !Array.isArray(layout.runs) ||
    layout.lines.length > SHAPE_TEXT_LAYOUT_LIMITS.lines ||
    layout.runs.length > SHAPE_TEXT_LAYOUT_LIMITS.textUnits ||
    lineIndices.length > layout.lines.length
  )
    throw new RangeError("Text-warp source exceeds its ordered layout budget.");
  let previousLine = -1;
  for (const index of lineIndices) {
    if (!Number.isSafeInteger(index) || index <= previousLine || index >= layout.lines.length)
      throw new TypeError("Text-warp source lines must be distinct, ordered layout identities.");
    previousLine = index;
  }
  const identity = new Map<ShapeTextRun, number>();
  for (let index = 0; index < layout.runs.length; index++) {
    const run = layout.runs[index]!;
    if (identity.has(run))
      throw new TypeError("Text-warp source has a repeated native run identity.");
    identity.set(run, index);
  }
  const runIndices: number[] = [];
  const selected = new Set<number>();
  let units = 0;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity,
    baselineY = -Infinity,
    hasInk = false;
  const includePoint = (x: number, y: number) => {
    finite(x);
    finite(y);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  };
  const includeInline = (run: ShapeTextRun) => {
    const advance = finite(run.inlineAdvancePx);
    if (advance < 0) throw new RangeError("Text-warp native advances cannot be negative.");
    if (run.angle === 0 || run.angle === 180) {
      const end = finite(run.x + (run.angle === 0 ? advance : -advance));
      left = Math.min(left, run.x, end);
      right = Math.max(right, run.x, end);
    } else {
      const end = finite(run.y + (run.angle === 90 ? advance : -advance));
      top = Math.min(top, run.y, end);
      bottom = Math.max(bottom, run.y, end);
    }
  };
  for (const lineIndex of lineIndices) {
    const line = layout.lines[lineIndex]!;
    checkRect(line.rect);
    for (const run of line.runs) {
      const index = identity.get(run);
      if (index === undefined || selected.has(index))
        throw new TypeError("Text-warp source lines must own each native run exactly once.");
      selected.add(index);
      runIndices.push(index);
      if (typeof run.text !== "string" || ![0, 90, 180, 270].includes(run.angle))
        throw new TypeError("Text-warp source requires ordered native text runs.");
      units += run.text.length;
      if (units > SHAPE_TEXT_LAYOUT_LIMITS.textUnits)
        throw new RangeError("Text-warp source exceeds its text-unit budget.");
      finite(run.x);
      finite(run.y);
      checkRect(run.inkBounds);
      includeInline(run);
      baselineY = Math.max(baselineY, run.y);
      if (/\S/u.test(run.text) && run.inkBounds.width > 0 && run.inkBounds.height > 0) {
        hasInk = true;
        includePoint(run.inkBounds.x, run.inkBounds.y);
        includePoint(run.inkBounds.x + run.inkBounds.width, run.inkBounds.y + run.inkBounds.height);
      }
    }
  }
  // Native shaping can produce no alpha (spaces, controls, zero-width blank source).
  // No allocation sentinel is returned as a glyph or an artificial rectangle.
  if (!hasInk) return { kind: "whitespace", runIndices: Object.freeze(runIndices) };
  // Blank authored paragraphs still consume vertical/column advances. Their
  // line rectangles are included only after a real native-ink source exists.
  for (const lineIndex of lineIndices) {
    const line = layout.lines[lineIndex]!;
    if (!line.text) {
      includePoint(line.rect.x, line.rect.y);
      includePoint(line.rect.x + line.rect.width, line.rect.y + line.rect.height);
    }
  }
  const width = finite(right - left),
    height = finite(bottom - top);
  if (!(width > 0 && height > 0) || !Number.isFinite(baselineY))
    throw new RangeError("Text-warp source has no usable native normalization rectangle.");
  return {
    kind: "native-text",
    left,
    top,
    width,
    height,
    baselineY,
    runIndices: Object.freeze(runIndices),
  };
}
