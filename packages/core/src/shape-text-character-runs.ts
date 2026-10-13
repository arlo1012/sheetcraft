import { readPictureDataArray } from "./picture-data-array.js";
import {
  normalizeShapeStyle,
  type ShapeChoice,
  type ShapeLine,
  type ShapePaint,
  type ShapeShadow,
  type ShapeReflection,
  type ShapeGlow,
} from "./shape-style.js";

/** Missing fields inherit the drawing's uniform typography and resolved glyph fill. */
export type ShapeTextCharacterFormat = {
  fontFamily?: string;
  /** Logical pixels, using the drawing font-size contract. */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** A direct solid glyph override, stronger than fill; absence inherits glyph appearance. */
  color?: string;
  /** Sparse local glyph paint; explicit None suppresses the inherited uniform fill. */
  fill?: ShapeChoice<ShapePaint>;
  /** Sparse local glyph outline; explicit None suppresses the inherited uniform outline. */
  line?: ShapeChoice<ShapeLine>;
  /** Sparse local glyph effects; explicit None suppresses only that inherited effect. */
  shadow?: ShapeChoice<ShapeShadow>;
  reflection?: ShapeChoice<ShapeReflection>;
  glow?: ShapeChoice<ShapeGlow>;
};
export type ShapeTextCharacterProperty = keyof ShapeTextCharacterFormat;
/** Half-open UTF-16 ranges in the authoritative drawing.text, never duplicate content. */
export type ShapeTextCharacterRun = ShapeTextCharacterFormat & { start: number; end: number };
/** Transient operation projection, not a second persistent text model. */
export type ShapeTextCharacterSource = Readonly<{
  text: string;
  characterRuns?: readonly ShapeTextCharacterRun[];
}>;
export const SHAPE_TEXT_CHARACTER_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "fill",
  "line",
  "shadow",
  "reflection",
  "glow",
] as const;
const APPEARANCE_PROPERTIES = ["fill", "line", "shadow", "reflection", "glow"] as const;
function isAppearanceProperty(
  key: ShapeTextCharacterProperty,
): key is (typeof APPEARANCE_PROPERTIES)[number] {
  return APPEARANCE_PROPERTIES.some((property) => property === key);
}
export const SHAPE_TEXT_CHARACTER_LIMITS = {
  textUnits: 100000,
  runs: 100000,
  workUnits: 2000000,
  fontFamilyUnits: 256,
} as const;

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid shape text ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`Shape text ${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown shape text ${name} field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError(`Shape text ${name} requires own data fields, not accessors.`);
    result[key] = descriptor.value as unknown;
  }
  for (const key of keys)
    if (key in value && !Object.hasOwn(value, key))
      throw new TypeError(`Shape text ${name} cannot contain inherited fields.`);
  return result;
}
/** Shared by uniform shape text and every character operation. */
export function normalizeShapeTextFontFamily(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Shape text font family must be a string.");
  if (
    !value ||
    value !== value.trim() ||
    value.length > SHAPE_TEXT_CHARACTER_LIMITS.fontFamilyUnits
  )
    throw new RangeError("Shape text font family must contain 1..256 trimmed UTF-16 units.");
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f))
      throw new TypeError("Shape text font family cannot contain control characters.");
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new TypeError("Shape text font family cannot contain unpaired surrogates.");
    } else if (unit >= 0xdc00 && unit <= 0xdfff)
      throw new TypeError("Shape text font family cannot contain unpaired surrogates.");
  }
  return value;
}
function format(source: Record<string, unknown>): ShapeTextCharacterFormat {
  const result: ShapeTextCharacterFormat = {};
  for (const key of SHAPE_TEXT_CHARACTER_PROPERTIES) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (key === "fontFamily") result.fontFamily = normalizeShapeTextFontFamily(value);
    else if (key === "fontSize") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 512)
        throw new RangeError("Shape character font size must be finite and between 1 and 512px.");
      result.fontSize = value;
    } else if (key === "color") {
      if (typeof value !== "string" || !/^(#[0-9a-f]{6}|transparent)$/i.test(value))
        throw new TypeError("Shape character color must be RGB or transparent.");
      result.color = value.toLowerCase();
    } else if (isAppearanceProperty(key)) {
      const normalized = normalizeShapeStyle({ [key]: value })!;
      if (key === "fill") result.fill = normalized.fill!;
      else if (key === "line") result.line = normalized.line!;
      else if (key === "shadow") result.shadow = normalized.shadow!;
      else if (key === "reflection") result.reflection = normalized.reflection!;
      else result.glow = normalized.glow!;
    } else {
      if (typeof value !== "boolean") throw new TypeError(`Invalid shape character ${key}.`);
      result[key] = value;
    }
  }
  return result;
}
/** Retains explicit false and explicit values equal to the current uniform fallback. */
export function normalizeShapeTextCharacterFormat(value: unknown): ShapeTextCharacterFormat {
  const source = record(value, SHAPE_TEXT_CHARACTER_PROPERTIES, "character format");
  formatWork(source);
  return format(source);
}

/** Charge bounded appearance trees before cloning; no accessor or inherited value is read. */
function appearanceWork(value: unknown, remaining: number): number {
  let work = 0;
  const pending = [{ value, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.depth > 16) throw new TypeError("Invalid shape character appearance depth.");
    work++;
    if (typeof entry.value === "string") work += entry.value.length;
    else if (entry.value && typeof entry.value === "object") {
      if (Array.isArray(entry.value)) {
        const entries = readPictureDataArray(entry.value, "shape character paint stops", 16);
        for (const value of entries) pending.push({ value, depth: entry.depth + 1 });
      } else {
        const keys = Reflect.ownKeys(entry.value);
        if (keys.length > 32) throw new TypeError("Invalid shape character appearance fields.");
        for (const key of keys) {
          const field = Object.getOwnPropertyDescriptor(entry.value, key)!;
          if (!("value" in field))
            throw new TypeError(
              "Shape character appearance requires own data fields, not accessors.",
            );
          work++;
          pending.push({ value: field.value as unknown, depth: entry.depth + 1 });
        }
      }
    }
    if (work > remaining)
      throw new RangeError("Shape character normalization work budget exceeded.");
  }
  return work;
}
function formatWork(
  source: Record<string, unknown>,
  remaining: number = SHAPE_TEXT_CHARACTER_LIMITS.workUnits,
): number {
  let work = typeof source.fontFamily === "string" ? source.fontFamily.length : 0;
  for (const key of APPEARANCE_PROPERTIES)
    if (Object.hasOwn(source, key)) work += appearanceWork(source[key], remaining - work);
  if (work > remaining) throw new RangeError("Shape character normalization work budget exceeded.");
  return work;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Shape character ranges require source text.");
  if (value.length > SHAPE_TEXT_CHARACTER_LIMITS.textUnits)
    throw new RangeError("Shape character text-unit budget exceeded.");
  return value;
}
function scalarBoundary(value: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > value.length) return false;
  const before = value.charCodeAt(offset - 1),
    after = value.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}
/** No scalar fallback: character formatting needs complete extended grapheme segmentation. */
function boundaries(value: string): Set<number> {
  if (typeof Intl.Segmenter !== "function")
    throw new TypeError("Shape character formatting requires extended grapheme segmentation.");
  const result = new Set<number>([0, value.length]);
  let work = 0;
  for (const segment of new Intl.Segmenter("und", { granularity: "grapheme" }).segment(value)) {
    if (++work > SHAPE_TEXT_CHARACTER_LIMITS.textUnits)
      throw new RangeError("Shape character segmentation budget exceeded.");
    result.add(segment.index);
  }
  return result;
}
export function isShapeTextCharacterBoundary(value: string, offset: number): boolean {
  text(value);
  return scalarBoundary(value, offset) && boundaries(value).has(offset);
}
function range(value: string, start: number, end: number, edges: Set<number>): void {
  if (
    !scalarBoundary(value, start) ||
    !scalarBoundary(value, end) ||
    !edges.has(start) ||
    !edges.has(end) ||
    start > end
  )
    throw new RangeError("Shape character ranges must use UTF-16 extended grapheme boundaries.");
}
function sameFormat(left: ShapeTextCharacterFormat, right: ShapeTextCharacterFormat): boolean {
  return SHAPE_TEXT_CHARACTER_PROPERTIES.every(
    (key) =>
      Object.hasOwn(left, key) === Object.hasOwn(right, key) &&
      (isAppearanceProperty(key)
        ? JSON.stringify(left[key]) === JSON.stringify(right[key])
        : left[key] === right[key]),
  );
}
/** Trusted mutation output still uses the exact canonical property order. */
function copyFormat(value: ShapeTextCharacterFormat): ShapeTextCharacterFormat {
  const result: Record<string, unknown> = {};
  for (const key of SHAPE_TEXT_CHARACTER_PROPERTIES)
    if (Object.hasOwn(value, key))
      result[key] = isAppearanceProperty(key)
        ? normalizeShapeStyle({ [key]: value[key] })![key]
        : value[key];
  return result as ShapeTextCharacterFormat;
}
const appendedWork = new WeakMap<ShapeTextCharacterRun[], number>();
function append(
  result: ShapeTextCharacterRun[],
  start: number,
  end: number,
  override: ShapeTextCharacterFormat,
): void {
  if (start >= end || Object.keys(override).length === 0) return;
  const previous = result.at(-1);
  if (previous && previous.end === start && sameFormat(previous, override)) previous.end = end;
  else {
    const work =
      (appendedWork.get(result) ?? 0) +
      SHAPE_TEXT_CHARACTER_PROPERTIES.length +
      formatWork(override as Record<string, unknown>);
    if (work > SHAPE_TEXT_CHARACTER_LIMITS.workUnits)
      throw new RangeError("Shape character normalization work budget exceeded.");
    appendedWork.set(result, work);
    result.push({ start, end, ...copyFormat(override) });
  }
}
function normalizedRuns(
  value: string,
  input: unknown,
  edges: Set<number>,
): ShapeTextCharacterRun[] | undefined {
  const entries = readPictureDataArray(
    input as readonly unknown[],
    "shape character runs",
    SHAPE_TEXT_CHARACTER_LIMITS.runs,
  );
  const result: ShapeTextCharacterRun[] = [];
  let previousEnd = 0;
  let work = value.length + entries.length * SHAPE_TEXT_CHARACTER_PROPERTIES.length;
  for (const entry of entries) {
    const source = record(
      entry,
      ["start", "end", ...SHAPE_TEXT_CHARACTER_PROPERTIES],
      "character run",
    );
    const start = source.start,
      end = source.end;
    if (typeof start !== "number" || typeof end !== "number")
      throw new TypeError("Shape character runs require own numeric endpoints.");
    range(value, start, end, edges);
    if (start === end || start < previousEnd)
      throw new RangeError("Shape character runs must be ordered, nonempty and non-overlapping.");
    work += formatWork(source, SHAPE_TEXT_CHARACTER_LIMITS.workUnits - work);
    if (work > SHAPE_TEXT_CHARACTER_LIMITS.workUnits)
      throw new RangeError("Shape character normalization work budget exceeded.");
    const override = format(source);
    append(result, start === 0 ? 0 : start, end, override);
    previousEnd = end;
  }
  return result.length ? result : undefined;
}
/** Never sorts or repairs malformed snapshots. Empty overrides/lists canonically disappear. */
export function normalizeShapeTextCharacterRuns(
  value: string,
  input: unknown,
): ShapeTextCharacterRun[] | undefined {
  text(value);
  if (input === undefined) return undefined;
  return normalizedRuns(value, input, boundaries(value));
}
export function cloneShapeTextCharacterRuns(
  value: string,
  input: readonly ShapeTextCharacterRun[] | undefined,
): ShapeTextCharacterRun[] | undefined {
  return normalizeShapeTextCharacterRuns(value, input);
}
export function areShapeTextCharacterRunsEqual(
  value: string,
  left: readonly ShapeTextCharacterRun[] | undefined,
  right: readonly ShapeTextCharacterRun[] | undefined,
): boolean {
  return (
    JSON.stringify(normalizeShapeTextCharacterRuns(value, left)) ===
    JSON.stringify(normalizeShapeTextCharacterRuns(value, right))
  );
}
function source(value: ShapeTextCharacterSource): {
  text: string;
  runs: ShapeTextCharacterRun[];
  edges: Set<number>;
} {
  const data = record(value, ["text", "characterRuns"], "character source");
  const content = text(data.text),
    edges = boundaries(content);
  return {
    text: content,
    runs:
      data.characterRuns === undefined
        ? []
        : (normalizedRuns(content, data.characterRuns, edges) ?? []),
    edges,
  };
}
function projection(value: string, runs: ShapeTextCharacterRun[]): ShapeTextCharacterSource {
  if (runs.length > SHAPE_TEXT_CHARACTER_LIMITS.runs)
    throw new RangeError("Shape character run budget exceeded.");
  let work = value.length + runs.length * SHAPE_TEXT_CHARACTER_PROPERTIES.length;
  for (const run of runs)
    work += formatWork(
      run as Record<string, unknown>,
      SHAPE_TEXT_CHARACTER_LIMITS.workUnits - work,
    );
  if (work > SHAPE_TEXT_CHARACTER_LIMITS.workUnits)
    throw new RangeError("Shape character normalization work budget exceeded.");
  return { text: value, ...(runs.length ? { characterRuns: runs } : {}) };
}
function overrideAt(
  runs: readonly ShapeTextCharacterRun[],
  offset: number,
  affinity: "backward" | "forward",
): ShapeTextCharacterFormat {
  let low = 0,
    high = runs.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2),
      item = runs[middle]!;
    if (affinity === "backward" ? item.end < offset : item.end <= offset) low = middle + 1;
    else high = middle;
  }
  const item = runs[low];
  return item &&
    (affinity === "backward"
      ? item.start < offset && offset <= item.end
      : item.start <= offset && offset < item.end)
    ? format(item as Record<string, unknown>)
    : {};
}
/** Exact edge policy is caller-selectable; offset zero uses forward affinity. */
export function getShapeTextCharacterOverride(
  value: ShapeTextCharacterSource,
  offset: number,
  affinity: "backward" | "forward" = "backward",
): ShapeTextCharacterFormat {
  const state = source(value);
  range(state.text, offset, offset, state.edges);
  if (affinity !== "backward" && affinity !== "forward")
    throw new TypeError("Invalid character affinity.");
  return overrideAt(state.runs, offset, offset === 0 ? "forward" : affinity);
}
/** Flat full-coverage segments; omit base.color to retain inherited advanced-fill identity. */
export function getShapeTextCharacterSegments(
  value: ShapeTextCharacterSource,
  base: ShapeTextCharacterFormat = {},
): ShapeTextCharacterRun[] {
  const state = source(value),
    fallback = normalizeShapeTextCharacterFormat(base);
  const result: ShapeTextCharacterRun[] = [];
  let offset = 0;
  for (const run of state.runs) {
    if (offset < run.start) result.push({ start: offset, end: run.start, ...copyFormat(fallback) });
    const override = format(run as Record<string, unknown>);
    const inherited = { ...fallback };
    // A selected advanced fill replaces the uniform editor color fallback. An
    // authored local color remains the stronger solid override over local fill.
    if (Object.hasOwn(override, "fill") && !Object.hasOwn(override, "color"))
      delete inherited.color;
    result.push({
      start: run.start,
      end: run.end,
      ...copyFormat({ ...inherited, ...override }),
    });
    offset = run.end;
  }
  if (offset < state.text.length)
    result.push({ start: offset, end: state.text.length, ...copyFormat(fallback) });
  return result;
}
function properties(value: readonly ShapeTextCharacterProperty[]): ShapeTextCharacterProperty[] {
  const result = readPictureDataArray(
    value,
    "shape character properties",
    SHAPE_TEXT_CHARACTER_PROPERTIES.length,
  );
  for (const key of result)
    if (!SHAPE_TEXT_CHARACTER_PROPERTIES.includes(key))
      throw new TypeError("Unknown shape character property.");
  if (new Set(result).size !== result.length)
    throw new TypeError("Duplicate shape character property.");
  return result;
}
function patchRuns(
  runs: readonly ShapeTextCharacterRun[],
  start: number,
  end: number,
  patch: ShapeTextCharacterFormat,
  inherit: readonly ShapeTextCharacterProperty[],
): ShapeTextCharacterRun[] {
  const result: ShapeTextCharacterRun[] = [];
  const patched = (old: ShapeTextCharacterFormat): ShapeTextCharacterFormat => {
    const next = { ...old };
    for (const key of inherit) delete next[key];
    return { ...next, ...patch };
  };
  let cursor = start;
  for (const run of runs) {
    const old = format(run as Record<string, unknown>);
    if (run.end <= start || run.start >= end) {
      if (run.start >= end && cursor < end) {
        append(result, cursor, end, patched({}));
        cursor = end;
      }
      append(result, run.start, run.end, old);
      continue;
    }
    append(result, run.start, Math.min(start, run.end), old);
    const left = Math.max(start, run.start),
      right = Math.min(end, run.end);
    if (cursor < left) append(result, cursor, left, patched({}));
    append(result, left, right, patched(old));
    cursor = right;
    append(result, Math.max(end, run.start), run.end, old);
  }
  if (cursor < end) append(result, cursor, end, patched({}));
  return result;
}
/** Changes/removes only named properties in the exact selected range. */
export function patchShapeTextCharacterRange(
  value: ShapeTextCharacterSource,
  start: number,
  end: number,
  patch: ShapeTextCharacterFormat,
  inheritProperties: readonly ShapeTextCharacterProperty[] = [],
): ShapeTextCharacterSource {
  const state = source(value),
    changed = normalizeShapeTextCharacterFormat(patch),
    inherit = properties(inheritProperties);
  range(state.text, start, end, state.edges);
  if (inherit.some((key) => Object.hasOwn(changed, key)))
    throw new TypeError("Cannot set and inherit the same shape character property.");
  return projection(
    state.text,
    start === end ? state.runs : patchRuns(state.runs, start, end, changed, inherit),
  );
}
/** Whole-object property broadcasts remove only these sparse overrides; callers set the uniform base. */
export function stripShapeTextCharacterProperties(
  value: ShapeTextCharacterSource,
  keys: readonly ShapeTextCharacterProperty[],
): ShapeTextCharacterSource {
  const state = source(value),
    removed = properties(keys);
  return projection(state.text, patchRuns(state.runs, 0, state.text.length, {}, removed));
}
/** Exact splice. Undefined typing format resolves affinity; explicit {} deliberately inherits. */
export function replaceShapeTextCharacterRange(
  value: ShapeTextCharacterSource,
  start: number,
  end: number,
  insertion: string,
  insertionFormat?: ShapeTextCharacterFormat,
): ShapeTextCharacterSource & { caret: number } {
  const state = source(value);
  range(state.text, start, end, state.edges);
  text(insertion);
  const typing =
    insertionFormat === undefined
      ? overrideAt(state.runs, start, start === end && start > 0 ? "backward" : "forward")
      : normalizeShapeTextCharacterFormat(insertionFormat);
  const content = text(state.text.slice(0, start) + insertion + state.text.slice(end));
  const delta = insertion.length - (end - start),
    insertedEnd = start + insertion.length;
  let result: ShapeTextCharacterRun[] = [];
  for (const run of state.runs)
    if (run.start < start)
      append(result, run.start, Math.min(run.end, start), format(run as Record<string, unknown>));
  append(result, start, insertedEnd, typing);
  for (const run of state.runs)
    if (run.end > end)
      append(
        result,
        Math.max(run.start, end) + delta,
        run.end + delta,
        format(run as Record<string, unknown>),
      );
  const edges = boundaries(content),
    sortedEdges = [...edges].sort((left, right) => left - right);
  // Re-pairing a regional-indicator suffix can affect more than the immediate joins.
  // One linear grapheme/run sweep reconciles every resulting cluster without repeated range scans.
  const reconciled: ShapeTextCharacterRun[] = [];
  let runIndex = 0,
    cachedIndex = -1;
  let leading: ShapeTextCharacterFormat = {};
  for (let index = 0; index + 1 < sortedEdges.length; index++) {
    const left = sortedEdges[index]!,
      right = sortedEdges[index + 1]!;
    while (runIndex < result.length && result[runIndex]!.end <= left) runIndex++;
    if (cachedIndex !== runIndex) {
      const run = result[runIndex];
      leading = run ? format(run as Record<string, unknown>) : {};
      cachedIndex = runIndex;
    }
    const run = result[runIndex];
    const override =
      insertion.length && left < insertedEnd && right > start
        ? typing
        : run && run.start <= left && left < run.end
          ? leading
          : {};
    append(reconciled, left, right, override);
  }
  result = reconciled;
  let caret = insertedEnd;
  if (!edges.has(caret)) caret = sortedEdges.find((edge) => edge > caret)!;
  const normalized = normalizedRuns(content, result, edges) ?? [];
  return { ...projection(content, normalized), caret };
}
