import {
  sampleTextWarpFraction,
  type SampledTextWarpBoundary,
  type TextWarpPoint,
} from "@sheetcraft/core/text-warps";
import {
  shapeTextFontKey,
  type ShapeTextFont,
  type ShapeTextLayoutResult,
  type ShapeTextMeasurer,
  type ShapeTextMeasurementMetrics,
  type ShapeTextNormalLineMetrics,
  type ShapeTextRect,
  type ShapeTextRun,
} from "./shape-text-layout";

/** Deliberately independent native shaping/drawing: no cross-character kerning or ligatures. */
export const SHAPE_TEXT_FOLLOW_PATH_GLYPH_POLICY = "printable-ascii-independent-graphemes" as const;
export const SHAPE_TEXT_FOLLOW_PATH_LIMITS = Object.freeze({
  glyphs: 4_096,
  sourceUnits: 100_000,
  lines: 4_096,
  tracks: 6,
  groups: 3,
  trackSamples: 8_192,
  extent: 16_384,
  coordinate: 10_000_000,
  measurements: 100_000,
  numericBytes: 2 * 1_024 * 1_024,
  workUnits: 1_000_000,
});
export type ShapeTextFollowPathErrorCode =
  | "invalid-input"
  | "stale-source"
  | "invalid-group-ownership"
  | "unsupported-text"
  | "unsupported-source-angle"
  | "unavailable-metrics"
  | "singular-tangent"
  | "placement-budget";
export class ShapeTextFollowPathError extends Error {
  constructor(
    public readonly code: ShapeTextFollowPathErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ShapeTextFollowPathError";
  }
}
export type ShapeTextFollowPathGroup = Readonly<{
  /** Complete native lines, in source order. All groups together partition the layout. */
  lineIndices: readonly number[];
  trackIndex: number;
  /** Explicit caller choice; native y offsets travel along the track's directed normal. */
  nativeBaselineY: number;
}>;
export type ShapeTextFollowPathInput = Readonly<{
  sourceText: string;
  layout: ShapeTextLayoutResult;
  /** The exact ready native tuple used to produce layout; no browser fallback is created. */
  measurer: ShapeTextMeasurer;
  font: ShapeTextFont;
  normalLineMetrics: ShapeTextNormalLineMetrics;
  resolveNormalLineMetrics?: (font: ShapeTextFont) => ShapeTextNormalLineMetrics;
  /** Sampler-produced native directed tracks. Owner H/V reflection happens later. */
  tracks: readonly SampledTextWarpBoundary[];
  groups: readonly ShapeTextFollowPathGroup[];
  origin?: TextWarpPoint;
  /** May tighten, never enlarge, the total prior-layout plus new native-call budget. */
  maxMeasurements?: number;
}>;
export type ShapeTextFollowPathPlacement = Readonly<{
  sourceRunIndex: number;
  sourceLineIndex: number;
  groupIndex: number;
  trackIndex: number;
  /** Original sourceText UTF-16 range; one independent printable ASCII grapheme. */
  sourceStart: number;
  sourceEnd: number;
  text: string;
  font: Readonly<ShapeTextFont>;
  /** Native left-aligned alphabetic baseline origin, rotated only. */
  x: number;
  y: number;
  angle: number;
  baselineCenter: TextWarpPoint;
  tangent: TextWarpPoint;
  trackFraction: number;
  nativeAdvancePx: number;
  ascentPx: number;
  descentPx: number;
  /** Signed independent native ink bounds after rigid rotation; spaces have no ink. */
  inkBounds: Readonly<ShapeTextRect> | null;
}>;
export type ShapeTextFollowPathResult = Readonly<{
  policy: typeof SHAPE_TEXT_FOLLOW_PATH_GLYPH_POLICY;
  /** Always source order, irrespective of group/track order; styles inherit via sourceRunIndex. */
  placements: readonly ShapeTextFollowPathPlacement[];
  inkBounds: Readonly<ShapeTextRect> | null;
  /** Shared independently measured inline domain across ALL native lines, before any track grouping. */
  sourceInlineLeft: number | null;
  sourceInlineRight: number | null;
  measurementCount: number;
  totalMeasurementCount: number;
  numericBytes: number;
  work: Readonly<{
    sourceUnits: number;
    lines: number;
    runs: number;
    glyphs: number;
    trackSamples: number;
    trackLookups: number;
    normalMetricResolutions: number;
    workUnits: number;
  }>;
}>;
type GlyphDraft = {
  sourceRunIndex: number;
  sourceLineIndex: number;
  sourceStart: number;
  text: string;
  font: Readonly<ShapeTextFont>;
  normal: ShapeTextNormalLineMetrics;
  metrics: ShapeTextMeasurementMetrics & { inkLeft: number; inkRight: number };
  centerX: number;
  y: number;
};
const limits = SHAPE_TEXT_FOLLOW_PATH_LIMITS;
function fail(code: ShapeTextFollowPathErrorCode, message: string, cause?: unknown): never {
  throw new ShapeTextFollowPathError(code, message, cause);
}
function finite(value: number, maximum: number = limits.coordinate): number {
  if (!Number.isFinite(value) || Math.abs(value) > maximum)
    fail("placement-budget", "Follow-path text exceeds its finite coordinate or extent budget.");
  return value === 0 ? 0 : value;
}
function rect(value: ShapeTextRect): void {
  if (!value) fail("invalid-input", "Follow-path text requires native numeric rectangles.");
  finite(value.x);
  finite(value.y);
  if (finite(value.width, limits.extent) < 0 || finite(value.height, limits.extent) < 0)
    fail("invalid-input", "Follow-path native rectangles cannot have negative extents.");
  finite(value.x + value.width);
  finite(value.y + value.height);
}
function validFont(font: ShapeTextFont): void {
  if (
    !font ||
    typeof font.family !== "string" ||
    !font.family ||
    font.family.length > 1_024 ||
    !Number.isFinite(font.size) ||
    font.size <= 0 ||
    font.size > 512 ||
    ![400, 700].includes(font.weight) ||
    typeof font.italic !== "boolean"
  )
    fail("unavailable-metrics", "Follow-path text requires an exact valid ready native font.");
}
function normalMetrics(normal: ShapeTextNormalLineMetrics): ShapeTextNormalLineMetrics {
  if (
    !normal ||
    ![normal.ascent, normal.descent, normal.lineAdvance].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= limits.extent,
    ) ||
    normal.ascent + normal.descent <= 0 ||
    normal.ascent + normal.descent > limits.extent ||
    normal.lineAdvance <= 0
  )
    fail(
      "unavailable-metrics",
      "Follow-path text requires positive bounded native normal metrics.",
    );
  return { ...normal };
}
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}
function printable(text: string): void {
  if (/[^\x20-\x7e]/u.test(text))
    fail(
      "unsupported-text",
      "Follow-path independent graphemes support printable ASCII U+0020–U+007E only.",
    );
}
function union(a: ShapeTextRect | null, b: ShapeTextRect): ShapeTextRect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  const result = {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
  rect(result);
  return result;
}

/**
 * Bounded, native-measurement-only rigid placement. The caller owns line/track grouping,
 * baseline choice, ready-font lifecycle, reflection and painting. Existing whole-run
 * shaping is intentionally replaced by independent printable-ASCII glyph typography.
 * No prefix-width cluster guesses, scalar segmentation, pixel bending or synthetic ink.
 */
export function prepareShapeTextFollowPath(
  input: ShapeTextFollowPathInput,
): ShapeTextFollowPathResult {
  const { layout, sourceText, measurer, tracks, groups } = input;
  if (
    typeof sourceText !== "string" ||
    sourceText.length > limits.sourceUnits ||
    !layout ||
    !Array.isArray(layout.lines) ||
    layout.lines.length > limits.lines ||
    !Array.isArray(layout.runs) ||
    layout.runs.length > limits.glyphs ||
    !Array.isArray(tracks) ||
    tracks.length < 1 ||
    tracks.length > limits.tracks ||
    !Array.isArray(groups) ||
    groups.length < 1 ||
    groups.length > limits.groups
  )
    fail("placement-budget", "Follow-path text exceeds its bounded source/layout/track budget.");
  printable(sourceText.replace(/\r\n?|\n/gu, ""));
  validFont(input.font);
  const baseNormal = normalMetrics(input.normalLineMetrics);
  if (!measurer || typeof measurer.measureMetrics !== "function")
    fail(
      "unavailable-metrics",
      "Follow-path text requires native signed per-grapheme ink metrics.",
    );
  const maximumMeasurements = input.maxMeasurements ?? limits.measurements;
  if (
    !Number.isSafeInteger(maximumMeasurements) ||
    maximumMeasurements < 0 ||
    maximumMeasurements > limits.measurements
  )
    fail("placement-budget", "Follow-path measurement limit must tighten the native-call budget.");
  if (
    !Number.isSafeInteger(layout.measurementCount) ||
    layout.measurementCount < 0 ||
    layout.measurementCount > maximumMeasurements
  )
    fail("placement-budget", "Follow-path prior layout exhausted the native-call budget.");
  const origin = input.origin ?? { x: 0, y: 0 };
  finite(origin.x);
  finite(origin.y);
  rect(layout.contentRect);
  if (layout.clipRect) rect(layout.clipRect);
  const normalCache = new Map<string, ShapeTextNormalLineMetrics>([
    [shapeTextFontKey(input.font), baseNormal],
  ]);
  let measurementCount = 0,
    normalMetricResolutions = 0,
    trackSamples = 0;
  let numericBytes = 4_096 + groups.length * 5 * 8;
  let workUnits = sourceText.length + layout.lines.length + layout.runs.length;
  const spendWork = (amount: number) => {
    workUnits += amount;
    if (workUnits > limits.workUnits)
      fail("placement-budget", "Follow-path text exhausted its work budget.");
  };
  const reserveCall = () => {
    if (layout.measurementCount + measurementCount + normalMetricResolutions >= maximumMeasurements)
      fail("placement-budget", "Follow-path text exhausted its total native-call budget.");
  };
  const normalFor = (font: ShapeTextFont) => {
    validFont(font);
    const key = shapeTextFontKey(font),
      cached = normalCache.get(key);
    if (cached) return cached;
    if (!input.resolveNormalLineMetrics)
      fail(
        "unavailable-metrics",
        "Mixed follow-path fonts require the same native normal-metric resolver as layout.",
      );
    reserveCall();
    normalMetricResolutions++;
    let value: ShapeTextNormalLineMetrics;
    try {
      value = normalMetrics(input.resolveNormalLineMetrics(font));
    } catch (cause) {
      if (cause instanceof ShapeTextFollowPathError) throw cause;
      fail("unavailable-metrics", "Follow-path font normal metrics could not be resolved.", cause);
    }
    normalCache.set(key, value);
    numericBytes += 6 * 8;
    return value;
  };
  for (const track of tracks) {
    if (
      !track ||
      !Array.isArray(track.samples) ||
      track.samples.length > limits.trackSamples ||
      !track.work
    )
      fail("invalid-input", "Follow-path tracks must be bounded sampler-produced boundaries.");
    trackSamples += track.samples.length;
    numericBytes += track.work.numericBytes;
    if (
      trackSamples > limits.trackSamples ||
      !Number.isSafeInteger(numericBytes) ||
      numericBytes > limits.numericBytes
    )
      fail("placement-budget", "Follow-path tracks exceed their shared sample/numeric budget.");
    finite(track.bounds.left);
    finite(track.bounds.top);
    finite(track.bounds.right);
    finite(track.bounds.bottom);
    const width = finite(track.bounds.right - track.bounds.left, limits.extent),
      height = finite(track.bounds.bottom - track.bounds.top, limits.extent);
    if (width < 0 || height < 0) fail("invalid-input", "Follow-path track has reversed bounds.");
    // Authenticates sampler identity even for a completely blank source.
    try {
      sampleTextWarpFraction(track, 0);
    } catch (cause) {
      fail("invalid-input", "Follow-path tracks must retain their sampler identity.", cause);
    }
  }
  spendWork(trackSamples);
  const lineGroups = new Map<number, number>();
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]!;
    if (
      !group ||
      !Array.isArray(group.lineIndices) ||
      !group.lineIndices.length ||
      group.lineIndices.length > layout.lines.length ||
      !Number.isSafeInteger(group.trackIndex) ||
      group.trackIndex < 0 ||
      group.trackIndex >= tracks.length
    )
      fail(
        "invalid-group-ownership",
        "Follow-path groups need explicit complete lines and a selected track.",
      );
    finite(group.nativeBaselineY);
    let previous = -1;
    for (const lineIndex of group.lineIndices) {
      if (
        !Number.isSafeInteger(lineIndex) ||
        lineIndex <= previous ||
        lineIndex >= layout.lines.length ||
        lineGroups.has(lineIndex)
      )
        fail(
          "invalid-group-ownership",
          "Follow-path groups must partition distinct ordered complete source lines.",
        );
      lineGroups.set(lineIndex, groupIndex);
      previous = lineIndex;
    }
  }
  if (lineGroups.size !== layout.lines.length)
    fail("invalid-group-ownership", "Follow-path groups omit a complete native source line.");
  const identities = new Map<ShapeTextRun, number>();
  for (let index = 0; index < layout.runs.length; index++) {
    const run = layout.runs[index]!;
    if (!run || identities.has(run))
      fail("stale-source", "Follow-path layout repeats a native run identity.");
    identities.set(run, index);
  }
  const drafts: GlyphDraft[] = [],
    sourceExtent = { left: Infinity, right: -Infinity };
  let sourceCursor = 0,
    nextRunIndex = 0;
  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex++) {
    const line = layout.lines[lineIndex]!;
    if (
      !line ||
      typeof line.text !== "string" ||
      line.text.length > limits.sourceUnits ||
      !Array.isArray(line.runs) ||
      line.runs.length > limits.glyphs
    )
      fail("stale-source", "Follow-path layout requires complete ordered native lines.");
    rect(line.rect);
    printable(line.text);
    if (sourceText.slice(sourceCursor, sourceCursor + line.text.length) !== line.text)
      fail(
        "stale-source",
        "Follow-path layout line text no longer matches the authoritative source.",
      );
    const lineSourceStart = sourceCursor;
    sourceCursor += line.text.length;
    let inlineCursor = line.runs[0]?.x ?? line.rect.x,
      lineUnits = 0;
    if (line.runs.length) sourceExtent.left = Math.min(sourceExtent.left, inlineCursor);
    for (const run of line.runs) {
      const sourceRunIndex = identities.get(run);
      if (sourceRunIndex !== nextRunIndex++)
        fail("stale-source", "Follow-path lines must own each ordered native run exactly once.");
      if (
        typeof run.text !== "string" ||
        run.text.length < 1 ||
        run.sourceStart !== lineSourceStart + lineUnits ||
        run.sourceEnd !== run.sourceStart + run.text.length ||
        sourceText.slice(run.sourceStart, run.sourceEnd) !== run.text
      )
        fail(
          "stale-source",
          "Follow-path native runs require exact original UTF-16 source coverage.",
        );
      printable(run.text);
      if (
        run.angle !== 0 ||
        run.direction !== "ltr" ||
        run.verticalOrientation !== undefined ||
        run.verticalGlyphFallback
      )
        fail(
          "unsupported-source-angle",
          "Follow-path rigid ASCII placement currently supports horizontal zero-angle native runs only.",
        );
      finite(run.x);
      finite(run.y);
      rect(run.inkBounds);
      if (
        finite(run.advancePx, limits.extent) < 0 ||
        finite(run.inlineAdvancePx, limits.extent) < 0
      )
        fail("unavailable-metrics", "Follow-path native advances must be nonnegative.");
      const normal = normalFor(run.font);
      if (!close(normal.ascent, run.ascentPx) || !close(normal.descent, run.descentPx))
        fail(
          "stale-source",
          "Follow-path native normal metrics no longer match the source run font.",
        );
      finite(run.y - groups[lineGroups.get(lineIndex)!]!.nativeBaselineY, limits.extent);
      const font = Object.freeze({ ...run.font });
      for (let offset = 0; offset < run.text.length; offset++) {
        if (drafts.length >= limits.glyphs)
          fail("placement-budget", "Follow-path text exceeds 4096 independent glyphs.");
        reserveCall();
        measurementCount++;
        let raw: ShapeTextMeasurementMetrics;
        try {
          raw = measurer.measureMetrics(run.text[offset]!, font);
        } catch (cause) {
          fail(
            "unavailable-metrics",
            "Follow-path independent native grapheme measurement failed.",
            cause,
          );
        }
        if (
          !raw ||
          ![raw.width, raw.ascent, raw.descent, raw.inkLeft, raw.inkRight].every(
            (value) =>
              typeof value === "number" &&
              Number.isFinite(value) &&
              Math.abs(value) <= limits.extent,
          ) ||
          raw.width < 0 ||
          raw.ascent < 0 ||
          raw.descent < 0 ||
          raw.inkRight! < raw.inkLeft! ||
          raw.ascent + raw.descent > limits.extent ||
          raw.inkRight! - raw.inkLeft! > limits.extent
        )
          fail(
            "unavailable-metrics",
            "Follow-path independent native signed ink metrics are unsupported or invalid.",
          );
        drafts.push({
          sourceRunIndex,
          sourceLineIndex: lineIndex,
          sourceStart: run.sourceStart + offset,
          text: run.text[offset]!,
          font,
          normal,
          metrics: { ...raw, inkLeft: raw.inkLeft!, inkRight: raw.inkRight! },
          centerX: finite(inlineCursor + raw.width / 2),
          y: run.y,
        });
        inlineCursor = finite(inlineCursor + raw.width);
        // Conservative peak scalar storage: draft plus returned placement and rotation scratch.
        // This includes prebuilt track numeric storage; it is not a JS heap-size estimate.
        numericBytes += 48 * 8;
        if (numericBytes > limits.numericBytes)
          fail("placement-budget", "Follow-path placement exceeds its numeric storage budget.");
        spendWork(1);
      }
      lineUnits += run.text.length;
    }
    if (lineUnits !== line.text.length)
      fail("stale-source", "Follow-path native runs omit or duplicate source line text.");
    if (line.runs.length) sourceExtent.right = Math.max(sourceExtent.right, inlineCursor);
    if (line.paragraphEnd && sourceCursor < sourceText.length) {
      const newline = /^\r\n?|^\n/u.exec(sourceText.slice(sourceCursor, sourceCursor + 2));
      if (!newline)
        fail("stale-source", "Follow-path hard-line boundary no longer matches the source.");
      sourceCursor += newline[0].length;
    }
  }
  if (sourceCursor !== sourceText.length || nextRunIndex !== layout.runs.length)
    fail("stale-source", "Follow-path layout does not completely own the authoritative source.");
  if (sourceExtent.left !== Infinity) finite(sourceExtent.right - sourceExtent.left, limits.extent);
  const placements: ShapeTextFollowPathPlacement[] = [];
  let inkBounds: ShapeTextRect | null = null;
  for (const glyph of drafts) {
    const groupIndex = lineGroups.get(glyph.sourceLineIndex)!,
      group = groups[groupIndex]!,
      track = tracks[group.trackIndex]!,
      width = sourceExtent.right - sourceExtent.left;
    // An entirely zero-advance line has no normalized inline coordinate; never fabricate one.
    if (!(width > 0))
      fail(
        "unavailable-metrics",
        "Follow-path source has no positive independently measured native advance.",
      );
    const trackFraction = (glyph.centerX - sourceExtent.left) / width;
    const sample = sampleTextWarpFraction(track, trackFraction);
    spendWork(1 + Math.ceil(Math.log2(Math.max(1, track.samples.length))));
    if (!sample.tangent || !sample.normal)
      fail(
        "singular-tangent",
        "Follow-path rigid glyph placement requires a nonsingular directed track tangent.",
      );
    const tangent = sample.tangent,
      normal = sample.normal,
      offset = glyph.y - group.nativeBaselineY;
    const baselineCenter = Object.freeze({
      x: finite(origin.x + sample.position.x + normal.x * offset),
      y: finite(origin.y + sample.position.y + normal.y * offset),
    });
    const x = finite(baselineCenter.x - (tangent.x * glyph.metrics.width) / 2),
      y = finite(baselineCenter.y - (tangent.y * glyph.metrics.width) / 2);
    let glyphInk: ShapeTextRect | null = null;
    if (
      glyph.text !== " " &&
      glyph.metrics.inkRight > glyph.metrics.inkLeft &&
      glyph.metrics.ascent + glyph.metrics.descent > 0
    ) {
      const points = [
        [glyph.metrics.inkLeft, -glyph.metrics.ascent],
        [glyph.metrics.inkRight, -glyph.metrics.ascent],
        [glyph.metrics.inkRight, glyph.metrics.descent],
        [glyph.metrics.inkLeft, glyph.metrics.descent],
      ].map(([inline, block]) => ({
        x: finite(x + tangent.x * inline! + normal.x * block!),
        y: finite(y + tangent.y * inline! + normal.y * block!),
      }));
      const left = Math.min(...points.map((point) => point.x)),
        top = Math.min(...points.map((point) => point.y));
      glyphInk = {
        x: left,
        y: top,
        width: Math.max(...points.map((point) => point.x)) - left,
        height: Math.max(...points.map((point) => point.y)) - top,
      };
      rect(glyphInk);
      inkBounds = union(inkBounds, glyphInk);
    }
    placements.push(
      Object.freeze({
        sourceRunIndex: glyph.sourceRunIndex,
        sourceLineIndex: glyph.sourceLineIndex,
        groupIndex,
        trackIndex: group.trackIndex,
        sourceStart: glyph.sourceStart,
        sourceEnd: glyph.sourceStart + 1,
        text: glyph.text,
        font: glyph.font,
        x,
        y,
        angle: (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI,
        baselineCenter,
        tangent,
        trackFraction,
        nativeAdvancePx: glyph.metrics.width,
        ascentPx: glyph.normal.ascent,
        descentPx: glyph.normal.descent,
        inkBounds: glyphInk ? Object.freeze(glyphInk) : null,
      }),
    );
  }
  return Object.freeze({
    policy: SHAPE_TEXT_FOLLOW_PATH_GLYPH_POLICY,
    placements: Object.freeze(placements),
    inkBounds: inkBounds ? Object.freeze(inkBounds) : null,
    sourceInlineLeft: sourceExtent.left === Infinity ? null : sourceExtent.left,
    sourceInlineRight: sourceExtent.right === -Infinity ? null : sourceExtent.right,
    measurementCount,
    totalMeasurementCount: layout.measurementCount + measurementCount + normalMetricResolutions,
    numericBytes,
    work: Object.freeze({
      sourceUnits: sourceText.length,
      lines: layout.lines.length,
      runs: layout.runs.length,
      glyphs: placements.length,
      trackSamples,
      trackLookups: placements.length,
      normalMetricResolutions,
      workUnits,
    }),
  });
}
