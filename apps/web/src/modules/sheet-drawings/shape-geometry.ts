import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { getFreeShapeGeometry } from "./free-shape-geometry";
import { getLegacyShapeGeometry } from "./legacy-shape-geometry";
import {
  evaluateShapePresetAtDisplaySize,
  SHAPE_PRESET_DISPLAY_SIZE_LIMITS,
  FREE_SHAPE_PATH_WORK_BUDGET,
  type ShapePathWorkBudget,
  flattenShapePath,
  getShapePresetFillBounds,
  moveShapePresetAdjustment,
  normalizeShapePresetParameters,
  shapePresetPathToSvg,
  type EvaluatedShapePresetGeometry,
  type EvaluatedShapePresetPath,
  type ShapePolyline,
  type ShapePresetBounds,
  type ShapePresetFillMode,
  type ShapePresetParameters,
} from "@sheetcraft/core/shape-presets";
import {
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import { mixHexColors } from "../../shared/color/contrast";

type Point = Readonly<{ x: number; y: number }>;
export type StandardShapeAppearance = Readonly<{
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  color?: string;
  shapeFlipX?: true;
  shapeFlipY?: true;
}>;
export type StandardShapeSvgPath = Readonly<{
  d: string;
  fillMode: ShapePresetFillMode;
  filled: boolean;
  stroke: boolean;
}>;

export const STANDARD_SHAPE_GEOMETRY_LIMITS = Object.freeze({
  ...SHAPE_PRESET_DISPLAY_SIZE_LIMITS,
  paths: 16,
  commands: 2048,
  points: 16_384,
  cache: 128,
  strokeWidth: 32,
  hitTolerance: 0.05,
});
type PreparedPath = Readonly<{
  path: EvaluatedShapePresetPath;
  polylines: readonly ShapePolyline[];
  fillPolylines: readonly ShapePolyline[];
  fillBounds: ShapePresetBounds | undefined;
  strokeBounds: ShapePresetBounds | undefined;
}>;
type PreparedGeometry = Readonly<{
  paths: readonly PreparedPath[];
  svg: readonly StandardShapeSvgPath[];
}>;
const geometryCache = new Map<string, EvaluatedShapePresetGeometry>();
const preparedGeometries = new WeakMap<EvaluatedShapePresetGeometry, PreparedGeometry>();

function extentScale(width: number, height: number): number | undefined {
  if (
    ![width, height].every(
      (value) =>
        Number.isFinite(value) && value > 0 && value <= STANDARD_SHAPE_GEOMETRY_LIMITS.extent,
    )
  )
    return;
  // One common scale preserves ss/ls and every guide's aspect-dependent calculation.
  return Math.max(1, Math.max(width, height) / STANDARD_SHAPE_GEOMETRY_LIMITS.evaluatorExtent);
}
function polylineBounds(polylines: readonly ShapePolyline[]): ShapePresetBounds | undefined {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const polyline of polylines)
    for (const point of polyline.points) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  return Number.isFinite(left)
    ? { left, top, width: right - left, height: bottom - top }
    : undefined;
}
function expandBounds(bounds: ShapePresetBounds, padding: number): ShapePresetBounds {
  return {
    left: bounds.left - padding,
    top: bounds.top - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}
function hasFillArea({ points }: ShapePolyline): boolean {
  if (points.length < 3) return false;
  const first = points[0]!,
    second = points.find((point) => point.x !== first.x || point.y !== first.y);
  return Boolean(
    second &&
    points.some(
      (point) =>
        Math.abs(
          (second.x - first.x) * (point.y - first.y) - (second.y - first.y) * (point.x - first.x),
        ) > 1e-10,
    ),
  );
}
function prepareGeometry(
  geometry: EvaluatedShapePresetGeometry,
  budget?: ShapePathWorkBudget,
  exactSvgCoordinates = false,
): PreparedGeometry {
  if (geometry.paths.length < 1 || geometry.paths.length > STANDARD_SHAPE_GEOMETRY_LIMITS.paths)
    throw new RangeError("Standard shape exceeds its path budget.");
  let commandCount = 0,
    pointCount = 0;
  const paths = geometry.paths.map((path): PreparedPath => {
    commandCount += path.commands.length;
    if (commandCount > STANDARD_SHAPE_GEOMETRY_LIMITS.commands)
      throw new RangeError("Standard shape exceeds its aggregate command budget.");
    const polylines = Object.freeze(
      flattenShapePath(path, STANDARD_SHAPE_GEOMETRY_LIMITS.hitTolerance, budget).map(
        (polyline) => {
          pointCount += polyline.points.length;
          if (pointCount > STANDARD_SHAPE_GEOMETRY_LIMITS.points)
            throw new RangeError("Standard shape exceeds its aggregate hit-point budget.");
          return Object.freeze({
            closed: polyline.closed,
            points: Object.freeze(polyline.points.map((point) => Object.freeze({ ...point }))),
          });
        },
      ),
    );
    const fillPolylines = Object.freeze(polylines.filter(hasFillArea));
    const nativeBounds = getShapePresetFillBounds(
      {
        ...geometry,
        paths: [{ ...path, filled: true }],
      },
      budget,
    );
    // Core's area bounds intentionally omit horizontal/vertical lines. They still paint strokes.
    const fallback = polylineBounds(polylines);
    const hasCurve = path.commands.some((command) => ["Q", "C", "A"].includes(command[0]));
    const strokeBounds =
      nativeBounds ??
      (fallback
        ? hasCurve
          ? expandBounds(fallback, STANDARD_SHAPE_GEOMETRY_LIMITS.hitTolerance)
          : fallback
        : undefined);
    return Object.freeze({
      path,
      polylines,
      fillPolylines,
      fillBounds:
        path.filled && path.fillMode !== "none" && fillPolylines.length ? nativeBounds : undefined,
      strokeBounds:
        path.stroke && polylines.some((polyline) => polyline.points.length > 1)
          ? strokeBounds
          : undefined,
    });
  });
  return Object.freeze({
    paths: Object.freeze(paths),
    svg: Object.freeze(
      geometry.paths.map((path) =>
        Object.freeze({
          // Core connector routes use M/L/Q/C. Preserve their representable tiny
          // padded tips; flattening above has already validated every number.
          d:
            exactSvgCoordinates && path.commands.every((command) => command[0] !== "A")
              ? path.commands.map((command) => command[0] + command.slice(1).join(" ")).join("")
              : shapePresetPathToSvg(path, budget),
          fillMode: path.fillMode,
          filled: path.filled,
          stroke: path.stroke,
        }),
      ),
    ),
  });
}

function assertStableResolvedGeometryData(value: unknown, work: { remaining: number }, depth = 0) {
  if (--work.remaining < 0 || depth > 6)
    throw new RangeError("Resolved shape exceeds its numeric-data budget.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 2_147_483_647)
      throw new RangeError("Resolved shape metadata must be finite and bounded.");
    return;
  }
  if (typeof value === "string" && value.length <= 256) return;
  if (!value || typeof value !== "object" || !Object.isFrozen(value))
    throw new TypeError("Resolved shape geometry must be deeply frozen numeric data.");
  const array = Array.isArray(value),
    prototype = Object.getPrototypeOf(value);
  if (
    (array &&
      (prototype !== Array.prototype || value.length > STANDARD_SHAPE_GEOMETRY_LIMITS.commands)) ||
    (!array && prototype !== Object.prototype && prototype !== null)
  )
    throw new TypeError("Resolved shape geometry requires bounded ordinary data containers.");
  const keys = Reflect.ownKeys(value);
  if (keys.length > work.remaining)
    throw new RangeError("Resolved shape exceeds its numeric-data budget.");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor))
      throw new TypeError("Resolved shape geometry cannot contain accessors or symbol fields.");
    assertStableResolvedGeometryData(descriptor.value, work, depth + 1);
  }
}
function resolvedCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= STANDARD_SHAPE_GEOMETRY_LIMITS.coordinate;
}

/** Prepare trusted Core runtime geometry without evaluating its source preset again.
 * Only deeply frozen, bounded numeric data is admitted; the exact geometry identity,
 * padded local coordinates and metadata survive. Failure is explicit absence, never
 * a legacy rectangle. The WeakMap retains no drawing or persisted source state. */
export function prepareResolvedShapeGeometry(
  geometry: EvaluatedShapePresetGeometry | undefined,
): EvaluatedShapePresetGeometry | undefined {
  if (!geometry) return;
  try {
    if (preparedGeometries.has(geometry)) return geometry;
    assertStableResolvedGeometryData(geometry, {
      remaining: STANDARD_SHAPE_GEOMETRY_LIMITS.commands * 8 + 4096,
    });
    if (
      extentScale(geometry.width, geometry.height) === undefined ||
      !Array.isArray(geometry.paths) ||
      !Array.isArray(geometry.handles) ||
      geometry.handles.length > 16 ||
      !Array.isArray(geometry.connectionSites) ||
      geometry.connectionSites.length > 16 ||
      !geometry.adjustments ||
      typeof geometry.adjustments !== "object" ||
      Array.isArray(geometry.adjustments) ||
      Object.keys(geometry.adjustments).length > 16 ||
      Object.values(geometry.adjustments).some((value) => typeof value !== "number") ||
      Object.keys(geometry).some(
        (key) =>
          ![
            "width",
            "height",
            "paths",
            "handles",
            "adjustments",
            "textRect",
            "connectionSites",
          ].includes(key),
      ) ||
      geometry.paths.some(
        (path) =>
          typeof path.filled !== "boolean" ||
          typeof path.stroke !== "boolean" ||
          !["norm", "none", "lighten", "lightenLess", "darken", "darkenLess"].includes(
            path.fillMode,
          ) ||
          !Array.isArray(path.commands) ||
          !path.commands.length ||
          path.commands[0]?.[0] !== "M",
      ) ||
      [...geometry.handles, ...geometry.connectionSites].some(
        ({ position }) => !position || ![position.x, position.y].every(resolvedCoordinate),
      ) ||
      (geometry.textRect !== null &&
        (!geometry.textRect ||
          ![
            geometry.textRect.left,
            geometry.textRect.top,
            geometry.textRect.right,
            geometry.textRect.bottom,
          ].every(resolvedCoordinate)))
    )
      return;
    const prepared = prepareGeometry(geometry, undefined, true);
    if (
      prepared.paths.some((path) =>
        path.polylines.some((polyline) =>
          polyline.points.some((point) => ![point.x, point.y].every(resolvedCoordinate)),
        ),
      )
    )
      return;
    preparedGeometries.set(geometry, prepared);
    return geometry;
  } catch {
    return;
  }
}

/** Standard geometry only. Absence/failure never silently becomes a legacy rectangle.
 * Results are detached, deeply frozen, bounded, and expressed in the actual local frame.
 * The LRU retains only preset parameters and numeric geometry, never workbook/source data. */
export function getStandardShapeGeometry(
  shape: ShapePresetParameters | undefined,
  width: number,
  height: number,
): EvaluatedShapePresetGeometry | undefined {
  if (!shape) return;
  const scale = extentScale(width, height);
  if (scale === undefined) return;
  try {
    const normalized = normalizeShapePresetParameters(shape) ?? {
      preset: "rect" as const,
    };
    const key = JSON.stringify([normalized, width, height]);
    const cached = geometryCache.get(key);
    if (cached) {
      geometryCache.delete(key);
      geometryCache.set(key, cached);
      return cached;
    }
    const geometry = evaluateShapePresetAtDisplaySize(normalized, width, height);
    preparedGeometries.set(geometry, prepareGeometry(geometry));
    geometryCache.set(key, geometry);
    if (geometryCache.size > STANDARD_SHAPE_GEOMETRY_LIMITS.cache)
      geometryCache.delete(geometryCache.keys().next().value!);
    return geometry;
  } catch {
    return;
  }
}

/** Explicit preset and bounded numeric free paths share paint/hit preparation.
 * Supplied runtime geometry must match the paint frame and never falls back. */
export function getDrawingShapeGeometry(
  drawing: SheetGraphicDrawing,
  includeLegacyView = false,
  resolvedGeometry?: EvaluatedShapePresetGeometry,
): EvaluatedShapePresetGeometry | undefined {
  if (resolvedGeometry !== undefined) {
    const geometry = prepareResolvedShapeGeometry(resolvedGeometry);
    return geometry?.width === drawing.width && geometry.height === drawing.height
      ? geometry
      : undefined;
  }
  if (drawing.kind === "textBox" && (drawing.shapeText || includeLegacyView))
    return getStandardShapeGeometry({ preset: "rect" }, drawing.width, drawing.height);
  if (drawing.shapeGeometry && drawing.shapePath) return;
  if (
    !drawing.shapeGeometry &&
    !drawing.shapePath &&
    (drawing.shapeStyle || drawing.shapeText || includeLegacyView)
  ) {
    const geometry = getLegacyShapeGeometry(drawing.shape, drawing.width, drawing.height);
    if (!geometry) return;
    try {
      if (!preparedGeometries.has(geometry))
        preparedGeometries.set(geometry, prepareGeometry(geometry));
      return geometry;
    } catch {
      return;
    }
  }
  if (!drawing.shapePath)
    return getStandardShapeGeometry(drawing.shapeGeometry, drawing.width, drawing.height);
  try {
    const geometry = getFreeShapeGeometry(drawing.shapePath, drawing.width, drawing.height);
    if (!geometry) return;
    if (!preparedGeometries.has(geometry))
      preparedGeometries.set(geometry, prepareGeometry(geometry, FREE_SHAPE_PATH_WORK_BUDGET));
    return geometry;
  } catch {
    return;
  }
}

/** Native numeric SVG paths retain separate nonzero fills and their original paint order. */
export function getStandardShapeSvgPaths(
  geometry: EvaluatedShapePresetGeometry | undefined,
): readonly StandardShapeSvgPath[] {
  return geometry ? (preparedGeometries.get(geometry)?.svg ?? []) : [];
}
function visibleColor(color: string | undefined): boolean {
  return typeof color === "string" && /^#[\da-f]{6}$/i.test(color);
}
function visibleStroke(appearance: StandardShapeAppearance): boolean {
  return (
    visibleColor(appearance.stroke) &&
    Number.isFinite(appearance.strokeWidth) &&
    appearance.strokeWidth > 0 &&
    appearance.strokeWidth <= STANDARD_SHAPE_GEOMETRY_LIMITS.strokeWidth
  );
}
function textBounds(
  geometry: EvaluatedShapePresetGeometry,
  appearance: StandardShapeAppearance,
): ShapePresetBounds | undefined {
  const rect = geometry.textRect;
  if (
    !rect ||
    typeof appearance.text !== "string" ||
    !appearance.text.trim() ||
    !visibleColor(appearance.color ?? "#000000") ||
    rect.right <= rect.left ||
    rect.bottom <= rect.top
  )
    return;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}
function unionBounds(bounds: readonly ShapePresetBounds[]): ShapePresetBounds | undefined {
  if (!bounds.length) return;
  const left = Math.min(...bounds.map((value) => value.left)),
    top = Math.min(...bounds.map((value) => value.top));
  return {
    left,
    top,
    width: Math.max(...bounds.map((value) => value.left + value.width)) - left,
    height: Math.max(...bounds.map((value) => value.top + value.height)) - top,
  };
}

/** Paint bounds include transparent-fill outlines, actual text rectangles and callout tails.
 * SVG consumers must use round caps/joins, matching the stroke-distance hit contract. */
export function getStandardShapeLocalBounds(
  geometry: EvaluatedShapePresetGeometry | undefined,
  appearance: StandardShapeAppearance,
): ShapePresetBounds | undefined {
  const prepared = geometry && preparedGeometries.get(geometry);
  if (!geometry || !prepared) return;
  const bounds: ShapePresetBounds[] = [];
  for (const path of prepared.paths) {
    if (visibleColor(appearance.fill) && path.fillBounds) bounds.push(path.fillBounds);
    if (visibleStroke(appearance) && path.strokeBounds)
      bounds.push(expandBounds(path.strokeBounds, appearance.strokeWidth / 2));
  }
  const text = textBounds(geometry, appearance);
  if (text) bounds.push(text);
  return unionBounds(bounds);
}
function distance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    square = dx * dx + dy * dy;
  const t =
    square === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function filledPathContains(polylines: readonly ShapePolyline[], point: Point): boolean {
  let winding = 0;
  for (const { points } of polylines) {
    for (let index = 0; index < points.length; index++) {
      const a = points[index]!,
        b = points[(index + 1) % points.length]!;
      if (distance(point, a, b) <= 1e-8) return true;
      const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
      if (a.y <= point.y && b.y > point.y && cross > 0) winding++;
      else if (a.y > point.y && b.y <= point.y && cross < 0) winding--;
    }
  }
  return winding !== 0;
}
function strokePathContains(
  polylines: readonly ShapePolyline[],
  point: Point,
  radius: number,
): boolean {
  for (const { points, closed } of polylines) {
    // Open subpaths never gain an implicit closing stroke; fill closure is separate above.
    for (let index = 1; index < points.length; index++)
      if (distance(point, points[index - 1]!, points[index]!) <= radius + 1e-8) return true;
    if (closed && points.length > 1 && distance(point, points.at(-1)!, points[0]!) <= radius + 1e-8)
      return true;
  }
  return false;
}
function inBounds(bounds: ShapePresetBounds, point: Point): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.left + bounds.width &&
    point.y >= bounds.top &&
    point.y <= bounds.top + bounds.height
  );
}

/** Independent path fills are unioned; reversed sub-contours stay transparent holes.
 * Native curves use bounded 0.05-local-pixel flattening, with no rectangular-frame fallback. */
export function standardShapeContainsLocalPoint(
  geometry: EvaluatedShapePresetGeometry | undefined,
  appearance: StandardShapeAppearance,
  point: Point,
): boolean {
  const prepared = geometry && preparedGeometries.get(geometry);
  if (!geometry || !prepared || ![point.x, point.y].every(Number.isFinite)) return false;
  const text = textBounds(geometry, appearance);
  if (text && inBounds(text, point)) return true;
  for (const path of prepared.paths) {
    if (
      visibleColor(appearance.fill) &&
      path.fillBounds &&
      filledPathContains(path.fillPolylines, point)
    )
      return true;
    if (
      visibleStroke(appearance) &&
      path.path.stroke &&
      strokePathContains(path.polylines, point, appearance.strokeWidth / 2)
    )
      return true;
  }
  return false;
}

/** Geometry-local reflection is its own inverse; text glyphs remain readable. */
export function standardShapeFlipPoint(
  drawing: Readonly<{
    width: number;
    height: number;
    shapeFlipX?: true;
    shapeFlipY?: true;
  }>,
  point: Point,
): Point {
  return {
    x: drawing.shapeFlipX ? drawing.width - point.x : point.x,
    y: drawing.shapeFlipY ? drawing.height - point.y : point.y,
  };
}
export function standardShapeSvgTransform(
  drawing: Readonly<{
    width: number;
    height: number;
    shapeFlipX?: true;
    shapeFlipY?: true;
  }>,
): string | undefined {
  if (!drawing.shapeFlipX && !drawing.shapeFlipY) return;
  return `translate(${drawing.shapeFlipX ? drawing.width : 0} ${drawing.shapeFlipY ? drawing.height : 0}) scale(${drawing.shapeFlipX ? -1 : 1} ${drawing.shapeFlipY ? -1 : 1})`;
}

/** Source-free rotation/inverse use the same frame-center convention as pictures. */
export const standardShapeLocalToWorld = pictureFrameLocalToWorld;
export const standardShapeWorldToLocal = pictureFrameWorldToLocal;

export function standardShapeContainsWorldPoint(
  geometry: EvaluatedShapePresetGeometry | undefined,
  appearance: StandardShapeAppearance,
  rect: PictureFrameRect,
  rotation: number,
  point: Point,
): boolean {
  if (!geometry || geometry.width !== rect.width || geometry.height !== rect.height) return false;
  try {
    return standardShapeContainsLocalPoint(
      geometry,
      appearance,
      standardShapeFlipPoint(
        { ...appearance, width: rect.width, height: rect.height },
        standardShapeWorldToLocal(rect, rotation, point),
      ),
    );
  } catch {
    return false;
  }
}

export function getStandardShapeWorldBounds(
  geometry: EvaluatedShapePresetGeometry | undefined,
  appearance: StandardShapeAppearance,
  rect: PictureFrameRect,
  rotation: number,
): PictureFrameRect | undefined {
  if (!geometry || geometry.width !== rect.width || geometry.height !== rect.height) return;
  const bounds = getStandardShapeLocalBounds(geometry, appearance);
  if (!bounds) return;
  try {
    const points = [
      { x: bounds.left, y: bounds.top },
      { x: bounds.left + bounds.width, y: bounds.top },
      { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
      { x: bounds.left, y: bounds.top + bounds.height },
    ].map((point) =>
      standardShapeLocalToWorld(
        rect,
        rotation,
        standardShapeFlipPoint({ ...appearance, width: rect.width, height: rect.height }, point),
      ),
    );
    const projected = unionBounds(
      points.map((point) => ({
        left: point.x,
        top: point.y,
        width: 0,
        height: 0,
      })),
    )!;
    return {
      x: projected.left,
      y: projected.top,
      width: projected.width,
      height: projected.height,
    };
  } catch {
    return;
  }
}

/** Drag local coordinates through the same uniform scale used to evaluate the shape. */
export function moveStandardShapeAdjustment(
  shape: ShapePresetParameters,
  width: number,
  height: number,
  handleIndex: number,
  localTarget: Point,
): ShapePresetParameters | undefined {
  const scale = extentScale(width, height);
  if (
    scale === undefined ||
    !Number.isSafeInteger(handleIndex) ||
    ![localTarget.x, localTarget.y].every(
      (value) =>
        Number.isFinite(value) && Math.abs(value) <= STANDARD_SHAPE_GEOMETRY_LIMITS.coordinate,
    )
  )
    return;
  try {
    if (!getStandardShapeGeometry(shape, width, height)?.handles[handleIndex]) return;
    const moved = moveShapePresetAdjustment(shape, width / scale, height / scale, handleIndex, {
      x: localTarget.x / scale,
      y: localTarget.y / scale,
    });
    return getStandardShapeGeometry(moved, width, height) ? moved : undefined;
  } catch {
    return;
  }
}

/** Product-owned 40%/20% path shading, using the existing pure channel-mixing utility.
 * Percentages follow Apache POI DrawPaint's public LIGHTEN/DARKEN modifier magnitudes.
 * https://github.com/apache/poi/blob/trunk/poi/src/main/java/org/apache/poi/sl/draw/DrawPaint.java */
export function standardShapeFillColor(base: string, mode: ShapePresetFillMode): string {
  if (!visibleColor(base) || mode === "none") return "transparent";
  if (mode === "norm") return base;
  const weight = mode === "lightenLess" || mode === "darkenLess" ? 0.8 : 0.6;
  return mixHexColors(
    base,
    mode === "lighten" || mode === "lightenLess" ? "#ffffff" : "#000000",
    weight,
  );
}
