import {
  evaluateTextWarp,
  mapTextWarpEnvelopePoint,
  sampleTextWarpBoundaries,
  sampleTextWarpFraction,
  type SampledTextWarpBoundary,
  type ShapeTextWarp,
  type TextWarpExtrapolation,
  type TextWarpMappingSource,
  type TextWarpPoint,
} from "@sheetcraft/core/text-warps";
import {
  prepareShapeTextFollowPath,
  type ShapeTextFollowPathPlacement,
  type ShapeTextFollowPathResult,
} from "./shape-text-follow-path";
import {
  SHAPE_TEXT_LAYOUT_LIMITS,
  type ShapeTextFont,
  type ShapeTextLayoutResult,
  type ShapeTextMeasurer,
  type ShapeTextNormalLineMetrics,
  type ShapeTextRect,
} from "./shape-text-layout";
import {
  getShapeTextWarpNativeSource,
  type ShapeTextWarpNativeSource,
} from "./shape-text-warp-source";
import {
  TEXT_WARP_MESH_LIMITS,
  TextWarpMeshError,
  prepareTextWarpMesh,
  type TextWarpMesh,
  type TextWarpMeshBudget,
  type TextWarpSourceRect,
} from "./text-warp-mesh";

export const SHAPE_TEXT_WARP_PLAN_LIMITS = Object.freeze({
  samples: 8_192,
  bytes: TEXT_WARP_MESH_LIMITS.bytes,
  work: TEXT_WARP_MESH_LIMITS.work,
  vertices: TEXT_WARP_MESH_LIMITS.vertices,
  triangles: TEXT_WARP_MESH_LIMITS.triangles,
  decorations: 16_384,
  density: 64,
});
/** Four-plus lines are an explicit product policy, not a native-app parity claim. */
export const SHAPE_TEXT_WARP_LINE_POLICY =
  "balanced-contiguous-source-lines-earlier-remainder" as const;
export type ShapeTextWarpPlanBudget = TextWarpMeshBudget &
  Readonly<{
    maxSamples?: number;
    maxSamplesPerPath?: number;
    maxMeasurements?: number;
    maxSourceSide?: number;
    maxSourcePixels?: number;
  }>;
export type ShapeTextWarpDecoration = Readonly<{ sourceRunIndex: number; bounds: ShapeTextRect }>;
export type ShapeTextWarpPlanInput = Readonly<{
  warp: ShapeTextWarp;
  /** Actual, unreflected preset textRect. A body frame is never substituted. */
  textRect: ShapeTextRect;
  layout: ShapeTextLayoutResult;
  rasterDensity: number;
  toleranceRasterPx?: number;
  sourceText: string;
  measurer: ShapeTextMeasurer;
  font: ShapeTextFont;
  normalLineMetrics: ShapeTextNormalLineMetrics;
  resolveNormalLineMetrics?: (font: ShapeTextFont) => ShapeTextNormalLineMetrics;
  horizontalFlip?: boolean;
  verticalFlip?: boolean;
  /** Reflection carrier, normally the complete body frame. Defaults to textRect. */
  reflectionRect?: ShapeTextRect;
  /** Appearance-independent native decoration geometry, associated with original runs. */
  decorations?: readonly ShapeTextWarpDecoration[];
  budget?: ShapeTextWarpPlanBudget;
}>;
type GroupBase = Readonly<{
  lineIndices: readonly number[];
  runIndices: readonly number[];
  roleIndex: number;
  nativeSource: ShapeTextWarpNativeSource;
  /** Native normalization, also available for real decorations on space-only runs. */
  normalizationRect: TextWarpSourceRect | null;
  decorations: readonly ShapeTextWarpDecoration[];
}>;
export type ShapeTextWarpPlanGroup = GroupBase &
  (
    | Readonly<{ kind: "whitespace" }>
    | Readonly<{ kind: "follow-path" }>
    | Readonly<{
        kind: "envelope";
        /** Logical texel edges; pixel (i,j) samples left+(i+.5)/density, top+(j+.5)/density. */
        sourceRasterRect: TextWarpSourceRect;
        sourcePixelWidth: number;
        sourcePixelHeight: number;
        extrapolation: TextWarpExtrapolation;
        mesh: TextWarpMesh;
        /** Use this shared reservation when invoking rasterizeTextWarpAlpha. */
        meshBudget: TextWarpMeshBudget;
      }>
  );
export type ShapeTextWarpRigidPlacement = ShapeTextFollowPathPlacement &
  Readonly<{
    /** These two axes, rather than angle alone, retain a true glyph mirror. */
    inlineAxis: TextWarpPoint;
    blockAxis: TextWarpPoint;
  }>;
export type ShapeTextWarpDecorationQuad = Readonly<{
  sourceRunIndex: number;
  sourceStart: number;
  points: readonly [TextWarpPoint, TextWarpPoint, TextWarpPoint, TextWarpPoint];
}>;
export type ShapeTextWarpPlan = Readonly<{
  family: "envelope" | "follow-path";
  linePolicy: typeof SHAPE_TEXT_WARP_LINE_POLICY;
  groups: readonly ShapeTextWarpPlanGroup[];
  placements: readonly ShapeTextWarpRigidPlacement[];
  decorationQuads: readonly ShapeTextWarpDecorationQuad[];
  followPath: ShapeTextFollowPathResult | null;
  /** Conservative common logical destination bounds, including supplied decorations and texel support. */
  destinationBounds: Readonly<ShapeTextRect> | null;
  /** Exact common integer raster frame, shared by every nonblank envelope mesh. */
  destinationRasterRect: TextWarpSourceRect | null;
  /** Bounds of actual admitted mapping probes/rigid native ink, never derived from alpha. */
  measuredDestinationBounds: Readonly<ShapeTextRect> | null;
  rasterDensity: number;
  proof: Readonly<{
    samples: number;
    retainedNumericBytes: number;
    numericBytes: number;
    preparationAllocatedNumericBytes: number;
    mappingAllocatedNumericBytes: number;
    sourceRasterBytes: number;
    destinationAlphaBytes: number;
    reservedBytes: number;
    peakBytes: number;
    estimatedPeakBytes: number;
    mappingEvaluations: number;
    mappingLookupWork: number;
    work: number;
    preparationWork: number;
    rasterWork: number;
    vertices: number;
    triangles: number;
    measurements: number;
  }>;
}>;
export class ShapeTextWarpPlanError extends RangeError {
  constructor(
    public readonly code: "invalid" | "budget" | "mapping",
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ShapeTextWarpPlanError";
  }
}
const limits = SHAPE_TEXT_WARP_PLAN_LIMITS;
const MAX_COORDINATE = TEXT_WARP_MESH_LIMITS.coordinateMagnitude;
// Conservative numeric scalar allocation for Core's strict records, curve evaluation,
// tangent differentiation and lookup scratch on every call. Not a JavaScript heap claim.
const MAPPING_CALL_NUMERIC_BYTES = 1_024;
const MAPPING_CALL_WORK = 512;
function fail(code: ShapeTextWarpPlanError["code"], message: string, cause?: unknown): never {
  throw new ShapeTextWarpPlanError(code, message, cause);
}
function finite(value: number, maximum: number = MAX_COORDINATE): number {
  if (!Number.isFinite(value) || Math.abs(value) > maximum)
    fail("invalid", "Text-warp planning requires bounded finite native coordinates.");
  return value === 0 ? 0 : value;
}
function integer(value: number | undefined, maximum: number, minimum = 1): number {
  const result = value ?? maximum;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum)
    fail("invalid", "Text-warp budgets may only tighten their positive integer limits.");
  return result;
}
function validRect(rect: ShapeTextRect, positive = false): void {
  if (!rect) fail("invalid", "Text-warp planning requires a native numeric rectangle.");
  finite(rect.x);
  finite(rect.y);
  if (
    finite(rect.width, 16_384) < (positive ? Number.MIN_VALUE : 0) ||
    finite(rect.height, 16_384) < (positive ? Number.MIN_VALUE : 0)
  )
    fail("invalid", "Text-warp rectangles have invalid extents.");
  finite(rect.x + rect.width);
  finite(rect.y + rect.height);
}
function union(a: ShapeTextRect | null, b: ShapeTextRect): ShapeTextRect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
function pointBounds(points: readonly TextWarpPoint[]): ShapeTextRect {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const point of points) {
    x = Math.min(x, finite(point.x));
    y = Math.min(y, finite(point.y));
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { x, y, width: right - x, height: bottom - y };
}
function corners(rect: ShapeTextRect): readonly TextWarpPoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}
/** Each complete line is owned once. 1/2/3 lines occupy only the first 1/2/3 available roles. */
export function allocateShapeTextWarpLines(
  lineCount: number,
  roleCount: number,
): readonly (readonly number[])[] {
  integer(lineCount, SHAPE_TEXT_LAYOUT_LIMITS.lines, 0);
  integer(roleCount, 3);
  const count = Math.min(lineCount, roleCount),
    result: (readonly number[])[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index++) {
    const size = Math.floor(lineCount / count) + (index < lineCount % count ? 1 : 0);
    const group: number[] = [];
    for (let offset = 0; offset < size; offset++) group.push(cursor++);
    result.push(Object.freeze(group));
  }
  return Object.freeze(result);
}
function nativeMappingRecord(source: TextWarpSourceRect): TextWarpMappingSource {
  // Core admission intentionally rejects baselineY/runIndices: copy only exact own fields.
  return Object.freeze({
    kind: "native-text",
    left: source.left,
    top: source.top,
    width: source.width,
    height: source.height,
  });
}
function whitespaceNormalization(
  layout: ShapeTextLayoutResult,
  lineIndices: readonly number[],
): TextWarpSourceRect | null {
  let bounds: ShapeTextRect | null = null;
  for (const lineIndex of lineIndices) {
    const line = layout.lines[lineIndex]!;
    for (const run of line.runs) {
      const radians = (run.angle * Math.PI) / 180,
        tx = Math.round(Math.cos(radians)),
        ty = Math.round(Math.sin(radians));
      const native = [
        [0, -run.ascentPx],
        [run.inlineAdvancePx, -run.ascentPx],
        [run.inlineAdvancePx, run.descentPx],
        [0, run.descentPx],
      ].map(([inline, block]) => ({
        x: run.x + tx * inline! - ty * block!,
        y: run.y + ty * inline! + tx * block!,
      }));
      bounds = union(bounds, pointBounds(native));
    }
    if (!line.text) bounds = union(bounds, line.rect);
  }
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  validRect(bounds, true);
  return Object.freeze({
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}
function extendedBoundaryBounds(
  boundary: SampledTextWarpBoundary,
  before: number,
  after: number,
): ShapeTextRect {
  const b = boundary.bounds;
  let result: ShapeTextRect = {
    x: b.left,
    y: b.top,
    width: b.right - b.left,
    height: b.bottom - b.top,
  };
  for (const [fraction, extension] of [
    [0, -before],
    [1, after],
  ] as const) {
    if (!extension) continue;
    const endpoint = sampleTextWarpFraction(boundary, fraction);
    if (!endpoint.tangent && !boundary.constant)
      fail("mapping", "Text-warp overhang requires a directed nonsingular endpoint tangent.");
    const p = {
      x: endpoint.position.x + (endpoint.tangent?.x ?? 0) * extension * boundary.length,
      y: endpoint.position.y + (endpoint.tangent?.y ?? 0) * extension * boundary.length,
    };
    result = union(result, { x: p.x, y: p.y, width: 0, height: 0 });
  }
  return result;
}
function envelopeBounds(
  top: SampledTextWarpBoundary,
  bottom: SampledTextWarpBoundary,
  overhang: TextWarpExtrapolation,
): ShapeTextRect {
  const upper = corners(
    extendedBoundaryBounds(top, overhang.horizontalBefore!, overhang.horizontalAfter!),
  );
  const lower = corners(
    extendedBoundaryBounds(bottom, overhang.horizontalBefore!, overhang.horizontalAfter!),
  );
  const points: TextWarpPoint[] = [];
  // Independent curve boxes provide a conservative continuous bound, including foldovers.
  for (const v of [-overhang.verticalBefore!, 1 + overhang.verticalAfter!])
    for (const a of upper)
      for (const b of lower)
        points.push({ x: (1 - v) * a.x + v * b.x, y: (1 - v) * a.y + v * b.y });
  return pointBounds(points);
}
type EnvelopeDraft = GroupBase & {
  normalizationRect: TextWarpSourceRect;
  sourceRasterRect: TextWarpSourceRect;
  sourcePixelWidth: number;
  sourcePixelHeight: number;
  extrapolation: Required<TextWarpExtrapolation>;
  top: SampledTextWarpBoundary;
  bottom: SampledTextWarpBoundary;
};

/** Native geometry only. No Canvas, pixels, fill/effects, font fallback or density retry. */
export function prepareShapeTextWarpPlan(input: ShapeTextWarpPlanInput): ShapeTextWarpPlan {
  validRect(input.textRect, true);
  const reflectionRect = input.reflectionRect ?? input.textRect;
  validRect(reflectionRect, true);
  const density = finite(input.rasterDensity, limits.density);
  if (
    !(density > 0) ||
    typeof input.sourceText !== "string" ||
    input.sourceText.length > SHAPE_TEXT_LAYOUT_LIMITS.textUnits
  )
    fail(
      "invalid",
      "Text-warp planning requires a positive settled density and bounded source text.",
    );
  for (const bit of [input.horizontalFlip, input.verticalFlip])
    if (bit !== undefined && typeof bit !== "boolean")
      fail("invalid", "Text-warp reflection bits must be boolean.");
  const tolerance = input.toleranceRasterPx ?? 0.25;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 4_096)
    fail("invalid", "Text-warp planning requires a positive bounded raster tolerance.");
  const budget = input.budget ?? {},
    maxBytes = integer(budget.maxBytes, limits.bytes),
    maxWork = integer(budget.maxWork, limits.work),
    reservedBytes = integer(budget.reservedBytes ?? 0, limits.bytes, 0),
    maxSamples = integer(budget.maxSamples, limits.samples),
    maxSamplesPerPath = integer(budget.maxSamplesPerPath, 4_096),
    maxVertices = integer(budget.maxVertices, limits.vertices, 4),
    maxTriangles = integer(budget.maxTriangles, limits.triangles, 2),
    maxSide = integer(budget.maxDestinationSide, TEXT_WARP_MESH_LIMITS.destinationSide),
    maxPixels = integer(budget.maxDestinationPixels, TEXT_WARP_MESH_LIMITS.destinationPixels),
    maxSourceSide = integer(budget.maxSourceSide ?? maxSide, TEXT_WARP_MESH_LIMITS.destinationSide),
    maxSourcePixels = integer(
      budget.maxSourcePixels ?? maxPixels,
      TEXT_WARP_MESH_LIMITS.destinationPixels,
    ),
    maxMeasurements = integer(budget.maxMeasurements, SHAPE_TEXT_LAYOUT_LIMITS.measurements, 0);
  if (budget.sourceBytes !== undefined)
    fail("invalid", "The planner owns all native source-buffer reservations.");
  // Preflight the sampler's conservative scalar allocation bound before it allocates.
  const geometryBytes = 16_384,
    samplerReservation = maxSamples * 512 + 6 * 16 * 256;
  if (reservedBytes + geometryBytes + samplerReservation > maxBytes)
    fail("budget", "Text-warp geometry/sampling exceeds the shared byte budget.");
  if (maxSamples * 4_096 + 65_536 > maxWork)
    fail("budget", "Text-warp geometry/sampling exceeds the shared work budget.");
  const geometry = evaluateTextWarp(input.warp, input.textRect.width, input.textRect.height);
  const sampled = sampleTextWarpBoundaries(geometry.boundaries, {
    width: input.textRect.width,
    height: input.textRect.height,
    positionTolerance: tolerance / (8 * density),
    maxSamplesPerPath,
    maxSamplesPerObject: maxSamples,
  });
  let numericBytes = geometryBytes + sampled.numericBytes,
    allocatedNumericBytes = geometryBytes + samplerReservation,
    mappingAllocatedNumericBytes = 0,
    sourceRasterBytes = 0,
    destinationAlphaBytes = 0,
    mappingEvaluations = 0,
    mappingLookupWork = 0,
    vertices = 0,
    triangles = 0,
    rasterWork = 0;
  let work =
    65_536 +
    sampled.boundaries.reduce(
      (sum, boundary) =>
        sum +
        boundary.work.positionEvaluations * 256 +
        boundary.work.subdivisions * 64 +
        boundary.work.samples * 32,
      0,
    );
  const check = () => {
    if (
      reservedBytes +
        allocatedNumericBytes +
        mappingAllocatedNumericBytes +
        sourceRasterBytes +
        destinationAlphaBytes >
      maxBytes
    )
      fail("budget", "Text-warp groups exceed their shared live-byte/preparation budget.");
    if (work + mappingLookupWork > maxWork)
      fail("budget", "Text-warp groups exceed their shared work budget.");
  };
  check();
  if (
    !input.layout ||
    !Array.isArray(input.layout.lines) ||
    !Array.isArray(input.layout.runs) ||
    input.layout.lines.length > SHAPE_TEXT_LAYOUT_LIMITS.lines ||
    input.layout.runs.length > SHAPE_TEXT_LAYOUT_LIMITS.textUnits
  )
    fail("invalid", "Text-warp planning requires a bounded complete native layout.");
  if (
    !Number.isSafeInteger(input.layout.measurementCount) ||
    input.layout.measurementCount < 0 ||
    input.layout.measurementCount > maxMeasurements
  )
    fail("budget", "Text-warp prior layout exhausted the shared native-measurement budget.");
  const decorations = input.decorations ?? [];
  if (!Array.isArray(decorations) || decorations.length > limits.decorations)
    fail("budget", "Text-warp decorations exceed their shared native geometry budget.");
  const roleCount = geometry.family === "envelope" ? geometry.bands.length : geometry.tracks.length;
  const lineGroups = allocateShapeTextWarpLines(input.layout.lines.length, roleCount);
  const groupRetainedBytes =
    512 +
    decorations.length * 56 +
    lineGroups.length * 256 +
    input.layout.lines.length * 8 +
    input.layout.runs.length * 8;
  // Native source helper constructs an identity map and selected-run set for each
  // group. Their numeric identities are charged cumulatively even with delayed GC.
  allocatedNumericBytes +=
    groupRetainedBytes +
    lineGroups.length * input.layout.runs.length * 16 +
    input.layout.runs.length +
    lineGroups.length * 8_192;
  numericBytes += groupRetainedBytes;
  work +=
    decorations.length * 128 +
    lineGroups.length * input.layout.runs.length * 32 +
    input.sourceText.length;
  check();
  const byRun = new Map<number, ShapeTextWarpDecoration[]>();
  for (const decoration of decorations) {
    if (
      !decoration ||
      !Number.isSafeInteger(decoration.sourceRunIndex) ||
      decoration.sourceRunIndex < 0 ||
      decoration.sourceRunIndex >= input.layout.runs.length
    )
      fail("invalid", "Text-warp decorations require an existing native run identity.");
    validRect(decoration.bounds);
    if (decoration.bounds.width === 0 || decoration.bounds.height === 0) continue;
    const list = byRun.get(decoration.sourceRunIndex) ?? [];
    list.push(
      Object.freeze({
        sourceRunIndex: decoration.sourceRunIndex,
        bounds: Object.freeze({ ...decoration.bounds }),
      }),
    );
    byRun.set(decoration.sourceRunIndex, list);
  }
  const groups: ShapeTextWarpPlanGroup[] = [],
    drafts: EnvelopeDraft[] = [];
  const ownedRuns = new Uint8Array(input.layout.runs.length);
  let ownedRunCount = 0;
  const sx = input.horizontalFlip ? -1 : 1,
    sy = input.verticalFlip ? -1 : 1;
  const reflect = (point: TextWarpPoint): TextWarpPoint => ({
    x: finite(
      input.horizontalFlip ? 2 * reflectionRect.x + reflectionRect.width - point.x : point.x,
    ),
    y: finite(
      input.verticalFlip ? 2 * reflectionRect.y + reflectionRect.height - point.y : point.y,
    ),
  });
  const reflectRect = (rect: ShapeTextRect) => pointBounds(corners(rect).map(reflect));
  let destinationBounds: ShapeTextRect | null = null,
    measuredBounds: ShapeTextRect | null = null;
  for (let roleIndex = 0; roleIndex < lineGroups.length; roleIndex++) {
    const lineIndices = lineGroups[roleIndex]!,
      nativeSource = getShapeTextWarpNativeSource(input.layout, lineIndices);
    for (const index of nativeSource.runIndices) {
      if (ownedRuns[index]) fail("invalid", "Text-warp groups repeat a native run identity.");
      ownedRuns[index] = 1;
      ownedRunCount++;
    }
    const groupDecorations = Object.freeze(
      nativeSource.runIndices.flatMap((index) => byRun.get(index) ?? []),
    );
    if (nativeSource.kind === "whitespace" && groupDecorations.length) {
      allocatedNumericBytes += nativeSource.runIndices.length * 256;
      check();
    }
    const normalizationRect =
      nativeSource.kind === "native-text"
        ? Object.freeze({
            left: nativeSource.left,
            top: nativeSource.top,
            width: nativeSource.width,
            height: nativeSource.height,
          })
        : groupDecorations.length
          ? whitespaceNormalization(input.layout, lineIndices)
          : null;
    const base: GroupBase = {
      lineIndices,
      runIndices: nativeSource.runIndices,
      roleIndex,
      nativeSource,
      normalizationRect,
      decorations: groupDecorations,
    };
    if (nativeSource.kind === "whitespace" && !groupDecorations.length) {
      groups.push(Object.freeze({ ...base, kind: "whitespace" }));
      continue;
    }
    if (geometry.family === "follow-path") {
      groups.push(Object.freeze({ ...base, kind: "follow-path" }));
      continue;
    }
    if (!normalizationRect)
      fail("mapping", "Decorated blank text has no positive native advance/normal geometry.");
    let support: ShapeTextRect = {
      x: normalizationRect.left,
      y: normalizationRect.top,
      width: normalizationRect.width,
      height: normalizationRect.height,
    };
    for (const decoration of groupDecorations) support = union(support, decoration.bounds);
    const pixelLeft = Math.floor(support.x * density) - 1,
      pixelTop = Math.floor(support.y * density) - 1,
      pixelRight = Math.ceil((support.x + support.width) * density) + 1,
      pixelBottom = Math.ceil((support.y + support.height) * density) + 1,
      sourcePixelWidth = pixelRight - pixelLeft,
      sourcePixelHeight = pixelBottom - pixelTop;
    if (
      !Number.isSafeInteger(sourcePixelWidth) ||
      !Number.isSafeInteger(sourcePixelHeight) ||
      sourcePixelWidth > maxSourceSide ||
      sourcePixelHeight > maxSourceSide ||
      sourcePixelWidth * sourcePixelHeight > maxSourcePixels
    )
      fail("budget", "Text-warp native source exceeds its settled raster side/pixel budget.");
    const sourceRasterRect = Object.freeze({
      left: pixelLeft / density,
      top: pixelTop / density,
      width: sourcePixelWidth / density,
      height: sourcePixelHeight / density,
    });
    const slack = 64 * Number.EPSILON;
    const extrapolation = Object.freeze({
      horizontalBefore:
        Math.max(0, (normalizationRect.left - sourceRasterRect.left) / normalizationRect.width) +
        slack,
      horizontalAfter:
        Math.max(
          0,
          (sourceRasterRect.left +
            sourceRasterRect.width -
            normalizationRect.left -
            normalizationRect.width) /
            normalizationRect.width,
        ) + slack,
      verticalBefore:
        Math.max(0, (normalizationRect.top - sourceRasterRect.top) / normalizationRect.height) +
        slack,
      verticalAfter:
        Math.max(
          0,
          (sourceRasterRect.top +
            sourceRasterRect.height -
            normalizationRect.top -
            normalizationRect.height) /
            normalizationRect.height,
        ) + slack,
    });
    if (Object.values(extrapolation).some((value) => value > 1))
      fail("mapping", "Text-warp source support exceeds the explicit one-extent overhang policy.");
    const band = geometry.bands[roleIndex]!,
      top = sampled.boundaries[band.topPathIndex]!,
      bottom = sampled.boundaries[band.bottomPathIndex]!;
    const local = envelopeBounds(top, bottom, extrapolation);
    destinationBounds = union(
      destinationBounds,
      reflectRect({ ...local, x: local.x + input.textRect.x, y: local.y + input.textRect.y }),
    );
    sourceRasterBytes += sourcePixelWidth * sourcePixelHeight * 8;
    const draft: EnvelopeDraft = {
      ...base,
      normalizationRect,
      sourceRasterRect,
      sourcePixelWidth,
      sourcePixelHeight,
      extrapolation,
      top,
      bottom,
    };
    drafts.push(draft);
    groups.push(Object.freeze({ ...base, kind: "whitespace" })); // Replaced atomically after mesh admission.
  }
  if (ownedRunCount !== input.layout.runs.length)
    fail("invalid", "Text-warp complete source lines omit a native run identity.");
  work += sourceRasterBytes;
  check();
  let followPath: ShapeTextFollowPathResult | null = null;
  let placements: ShapeTextWarpRigidPlacement[] = [];
  const decorationQuads: ShapeTextWarpDecorationQuad[] = [];
  if (geometry.family === "follow-path" && lineGroups.length) {
    const tracks = geometry.tracks.map((role) => sampled.boundaries[role.pathIndex]!);
    const glyphBound = input.sourceText.replace(/\r\n?|\n/gu, "").length;
    const quadCountBound = decorations.reduce(
      (sum, decoration) => sum + input.layout.runs[decoration.sourceRunIndex]!.text.length,
      0,
    );
    if (quadCountBound > limits.decorations)
      fail("budget", "Rigid decorations exceed their total per-glyph quad budget.");
    const followReservation =
      4_096 +
      lineGroups.length * 40 +
      tracks.reduce((sum, track) => sum + track.work.numericBytes, 0) +
      glyphBound * (384 + 192) +
      input.layout.runs.length * 48 +
      quadCountBound * 96;
    if (reservedBytes + allocatedNumericBytes + followReservation > maxBytes)
      fail("budget", "Rigid text placement exceeds the shared numeric budget before preparation.");
    const followWorkBound =
      input.sourceText.length +
      input.layout.lines.length +
      input.layout.runs.length +
      sampled.samples +
      glyphBound * (1 + Math.ceil(Math.log2(maxSamplesPerPath))) +
      quadCountBound * 64;
    if (work + followWorkBound > maxWork)
      fail("budget", "Rigid text placement exceeds its shared work budget before preparation.");
    followPath = prepareShapeTextFollowPath({
      sourceText: input.sourceText,
      layout: input.layout,
      measurer: input.measurer,
      font: input.font,
      normalLineMetrics: input.normalLineMetrics,
      resolveNormalLineMetrics: input.resolveNormalLineMetrics,
      tracks,
      groups: groups.map((group) => ({
        lineIndices: group.lineIndices,
        trackIndex: group.roleIndex,
        nativeBaselineY:
          group.nativeSource.kind === "native-text"
            ? group.nativeSource.baselineY
            : Math.max(
                ...group.lineIndices.map(
                  (index) =>
                    input.layout.lines[index]!.runs[0]?.y ?? input.layout.lines[index]!.rect.y,
                ),
              ),
      })),
      origin: { x: input.textRect.x, y: input.textRect.y },
      maxMeasurements,
    });
    allocatedNumericBytes += followReservation;
    numericBytes += followPath.numericBytes;
    work += followPath.work.workUnits;
    placements = followPath.placements.map((placement) => {
      const p = reflect(placement),
        inlineAxis = Object.freeze({ x: sx * placement.tangent.x, y: sy * placement.tangent.y }),
        blockAxis = Object.freeze({ x: -sx * placement.tangent.y, y: sy * placement.tangent.x });
      const inkBounds = placement.inkBounds
        ? Object.freeze(reflectRect(placement.inkBounds))
        : null;
      if (inkBounds) measuredBounds = union(measuredBounds, inkBounds);
      return Object.freeze({
        ...placement,
        ...p,
        baselineCenter: Object.freeze(reflect(placement.baselineCenter)),
        tangent: inlineAxis,
        inlineAxis,
        blockAxis,
        angle: (Math.atan2(inlineAxis.y, inlineAxis.x) * 180) / Math.PI,
        inkBounds,
      });
    });
    const decorationAtGlyph = (placement: ShapeTextWarpRigidPlacement, bounds: ShapeTextRect) => {
      if (placement.nativeAdvancePx <= 0 || bounds.height <= 0) return;
      const nativeRun = input.layout.runs[placement.sourceRunIndex]!;
      // Existing decorations cover the whole run. Reuse its native block offsets with
      // independent glyph advance, including authored spaces, without fabricating ink.
      const top = bounds.y - nativeRun.y,
        bottom = top + bounds.height;
      const point = (inline: number, block: number): TextWarpPoint =>
        Object.freeze({
          x: finite(placement.x + placement.inlineAxis.x * inline + placement.blockAxis.x * block),
          y: finite(placement.y + placement.inlineAxis.y * inline + placement.blockAxis.y * block),
        });
      const points = Object.freeze([
        point(0, top),
        point(placement.nativeAdvancePx, top),
        point(placement.nativeAdvancePx, bottom),
        point(0, bottom),
      ]) as readonly [TextWarpPoint, TextWarpPoint, TextWarpPoint, TextWarpPoint];
      const result = pointBounds(points);
      if (result.width <= 0 || result.height <= 0) return;
      measuredBounds = union(measuredBounds, result);
      decorationQuads.push(
        Object.freeze({
          sourceRunIndex: placement.sourceRunIndex,
          sourceStart: placement.sourceStart,
          points,
        }),
      );
    };
    for (const placement of placements)
      for (const decoration of byRun.get(placement.sourceRunIndex) ?? [])
        decorationAtGlyph(placement, decoration.bounds);
    numericBytes += placements.length * 192 + decorationQuads.length * 96;
    work += decorationQuads.length * 64;
    destinationBounds = measuredBounds;
  }
  let destinationRasterRect: TextWarpSourceRect | null = null;
  if (destinationBounds && destinationBounds.width > 0 && destinationBounds.height > 0) {
    const left = Math.floor(destinationBounds.x * density),
      top = Math.floor(destinationBounds.y * density),
      width = Math.ceil((destinationBounds.x + destinationBounds.width) * density) - left,
      height = Math.ceil((destinationBounds.y + destinationBounds.height) * density) - top;
    if (width > maxSide || height > maxSide || width * height > maxPixels)
      fail("budget", "Text-warp groups exceed their common settled destination side/pixel budget.");
    destinationRasterRect = Object.freeze({ left, top, width, height });
    destinationAlphaBytes = drafts.length * width * height;
  }
  check();
  for (const draft of drafts) {
    if (!destinationRasterRect)
      fail("mapping", "Text-warp envelope has no positive destination frame.");
    const liveReserved =
        reservedBytes +
        allocatedNumericBytes +
        mappingAllocatedNumericBytes +
        sourceRasterBytes +
        destinationAlphaBytes,
      numericRemaining = maxBytes - liveReserved,
      mappingSlice = Math.floor(numericRemaining / 2),
      meshSlice = numericRemaining - mappingSlice;
    let groupMappingBytes = 0,
      groupMappingWork = 0;
    const lookupCharge =
      MAPPING_CALL_WORK +
      2 * Math.ceil(Math.log2(Math.max(draft.top.samples.length, draft.bottom.samples.length, 1)));
    const remainingWork = maxWork - work - mappingLookupWork,
      mappingWorkSlice = Math.floor(remainingWork / 2);
    if (
      maxVertices - vertices < 4 ||
      maxTriangles - triangles < 2 ||
      meshSlice < 1 ||
      remainingWork < 2
    )
      fail("budget", "Text-warp group exhausted the aggregate mesh budget before preparation.");
    const native = nativeMappingRecord(draft.normalizationRect);
    let mapperFailure: ShapeTextWarpPlanError | null = null;
    let mesh: TextWarpMesh;
    try {
      mesh = prepareTextWarpMesh({
        sourceRect: draft.sourceRasterRect,
        toleranceRasterPx: tolerance,
        destinationFrame: destinationRasterRect,
        mapPoint: (x, y) => {
          if (
            groupMappingBytes + MAPPING_CALL_NUMERIC_BYTES > mappingSlice ||
            groupMappingWork + lookupCharge > mappingWorkSlice
          ) {
            mapperFailure = new ShapeTextWarpPlanError(
              "budget",
              "Text-warp mapper exhausted its shared preparation allocation/lookup slice.",
            );
            throw mapperFailure;
          }
          groupMappingBytes += MAPPING_CALL_NUMERIC_BYTES;
          groupMappingWork += lookupCharge;
          mappingEvaluations++;
          const mapped = mapTextWarpEnvelopePoint(
            draft.top,
            draft.bottom,
            native,
            { x, y },
            {
              origin: { x: input.textRect.x, y: input.textRect.y },
              extrapolation: draft.extrapolation,
            },
          );
          if (!mapped) fail("mapping", "Text-warp envelope mapping has a singular source point.");
          const reflected = reflect(mapped);
          measuredBounds = union(measuredBounds, { ...reflected, width: 0, height: 0 });
          return { x: reflected.x * density, y: reflected.y * density };
        },
        budget: {
          ...budget,
          maxVertices: maxVertices - vertices,
          maxTriangles: maxTriangles - triangles,
          maxDestinationSide: maxSide,
          maxDestinationPixels: maxPixels,
          maxBytes: meshSlice + destinationRasterRect.width * destinationRasterRect.height,
          maxWork: remainingWork - mappingWorkSlice,
          reservedBytes: 0,
          sourceBytes: 0,
        },
      });
    } catch (cause) {
      if (mapperFailure) throw mapperFailure;
      fail(
        cause instanceof TextWarpMeshError && cause.code === "budget" ? "budget" : "mapping",
        "Text-warp group mesh could not be admitted within its bounded geometry plan.",
        cause,
      );
    }
    mappingAllocatedNumericBytes += groupMappingBytes;
    mappingLookupWork += groupMappingWork;
    allocatedNumericBytes += mesh.proof.preparationAllocatedNumericBytes;
    numericBytes += mesh.proof.numericBytes;
    vertices += mesh.vertexCount;
    triangles += mesh.triangleCount;
    work += mesh.proof.totalWork;
    rasterWork += mesh.proof.rasterWork;
    check();
    groups[draft.roleIndex] = Object.freeze({
      ...draft,
      kind: "envelope",
      mesh,
      meshBudget: Object.freeze({
        ...budget,
        maxVertices: mesh.vertexCount,
        maxTriangles: mesh.triangleCount,
        maxDestinationSide: maxSide,
        maxDestinationPixels: maxPixels,
        maxBytes,
        maxWork,
        sourceBytes: draft.sourcePixelWidth * draft.sourcePixelHeight * 4,
        reservedBytes:
          reservedBytes +
          allocatedNumericBytes +
          mappingAllocatedNumericBytes +
          sourceRasterBytes +
          destinationAlphaBytes -
          mesh.proof.preparationAllocatedNumericBytes -
          draft.sourcePixelWidth * draft.sourcePixelHeight * 4 -
          mesh.proof.outputBytes,
      }),
    });
  }
  // Reconcile every mesh's raster reservation with the complete admitted plan, including later groups.
  const peakBytes =
    reservedBytes +
    allocatedNumericBytes +
    mappingAllocatedNumericBytes +
    sourceRasterBytes +
    destinationAlphaBytes;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    if (group.kind !== "envelope") continue;
    groups[index] = Object.freeze({
      ...group,
      meshBudget: Object.freeze({
        ...group.meshBudget,
        reservedBytes:
          peakBytes -
          group.mesh.proof.preparationAllocatedNumericBytes -
          group.sourcePixelWidth * group.sourcePixelHeight * 4 -
          group.mesh.proof.outputBytes,
      }),
    });
  }
  check();
  return Object.freeze({
    family: geometry.family,
    linePolicy: SHAPE_TEXT_WARP_LINE_POLICY,
    groups: Object.freeze(groups),
    placements: Object.freeze(placements),
    decorationQuads: Object.freeze(decorationQuads),
    followPath,
    destinationBounds: destinationBounds ? Object.freeze(destinationBounds) : null,
    destinationRasterRect,
    measuredDestinationBounds: measuredBounds ? Object.freeze(measuredBounds) : null,
    rasterDensity: density,
    proof: Object.freeze({
      samples: sampled.samples,
      retainedNumericBytes: numericBytes,
      numericBytes,
      preparationAllocatedNumericBytes: allocatedNumericBytes + mappingAllocatedNumericBytes,
      mappingAllocatedNumericBytes,
      sourceRasterBytes,
      destinationAlphaBytes,
      reservedBytes,
      peakBytes,
      estimatedPeakBytes: peakBytes - reservedBytes,
      mappingEvaluations,
      mappingLookupWork,
      work: work + mappingLookupWork,
      preparationWork: work + mappingLookupWork - rasterWork,
      rasterWork,
      vertices,
      triangles,
      measurements: followPath?.totalMeasurementCount ?? input.layout.measurementCount,
    }),
  });
}
