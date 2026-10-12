import { pictureFrameWorldToLocal, type PictureFrameRect } from "@sheetcraft/core/picture-frame";
import {
  MAX_SHAPE_FREE_PATH_COMMANDS,
  normalizeShapeFreePath,
  type ShapeFreePath,
  type ShapeFreePathCommand,
  type ShapeFreePathPointType,
} from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getFreeShapeGeometry } from "./free-shape-geometry";
import {
  listFreeShapePoints,
  replaceFreeShapeCommands,
  type FreeShapePointPosition,
  type ShapePointEditOptions,
} from "./free-shape-point-layout";

type Point = FreeShapePointPosition;
type Segment = Readonly<{
  commandIndex: number;
  points: readonly Point[];
}>;
type PreparedPath = Readonly<{
  path: ShapeFreePath;
  commands: readonly ShapeFreePathCommand[];
}>;
export type NearestFreeShapeSegment = Readonly<{
  commandIndex: number;
  t: number;
  distance: number;
}>;
const coordinateBudget = 10_000_000;
const samplesPerCurve = 32;
const refinementSteps = 32;

function finitePoint(point: Point): boolean {
  return [point.x, point.y].every(
    (value) => Number.isFinite(value) && Math.abs(value) <= coordinateBudget,
  );
}
function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}
function endpoint(command: ShapeFreePathCommand): Point | undefined {
  if (command[0] === "Z") return;
  return { x: command[command.length - 2] as number, y: command[command.length - 1] as number };
}
function preparedPath(drawing: SheetGraphicDrawing): PreparedPath | undefined {
  if (drawing.kind !== "shape" || !drawing.shapePath || drawing.shapeGeometry) return;
  const geometry = getFreeShapeGeometry(drawing.shapePath, drawing.width, drawing.height);
  if (!geometry) return;
  try {
    return {
      path: normalizeShapeFreePath(drawing.shapePath),
      commands: geometry.paths[0]!.commands as readonly ShapeFreePathCommand[],
    };
  } catch {
    return;
  }
}
function segmentAt(commands: readonly ShapeFreePathCommand[], index: number): Segment | undefined {
  if (!Number.isSafeInteger(index) || index <= 0 || index >= commands.length) return;
  const command = commands[index]!,
    start = endpoint(commands[index - 1]!);
  if (!start) return;
  const points: Point[] = [start];
  if (command[0] === "Z") points.push(endpoint(commands[0]!)!);
  else
    for (let coordinate = 1; coordinate < command.length; coordinate += 2)
      points.push({ x: command[coordinate] as number, y: command[coordinate + 1] as number });
  if (
    points.length < 2 ||
    !points.every(finitePoint) ||
    points.every((point) => samePoint(point, start))
  )
    return;
  return { commandIndex: index, points };
}
function interpolate(left: Point, right: Point, t: number): Point {
  return { x: left.x + (right.x - left.x) * t, y: left.y + (right.y - left.y) * t };
}
function pointOnSegment(segment: Segment, t: number): Point {
  let points = [...segment.points];
  while (points.length > 1)
    points = points.slice(0, -1).map((point, index) => interpolate(point, points[index + 1]!, t));
  return points[0]!;
}
/** The two Bézier control polygons from de Casteljau, in the original local frame. */
function splitSegment(
  segment: Segment,
  t: number,
): readonly [ShapeFreePathCommand, ShapeFreePathCommand] {
  let row = [...segment.points];
  const left = [row[0]!],
    right = [row.at(-1)!];
  while (row.length > 1) {
    row = row.slice(0, -1).map((point, index) => interpolate(point, row[index + 1]!, t));
    left.push(row[0]!);
    right.unshift(row.at(-1)!);
  }
  const operation = segment.points.length === 2 ? "L" : segment.points.length === 3 ? "Q" : "C";
  const command = (points: readonly Point[]) =>
    [
      operation,
      ...points.slice(1).flatMap((point) => [point.x, point.y]),
    ] as unknown as ShapeFreePathCommand;
  return [command(left), command(right)];
}
function remapPointTypes(
  pointTypes: ShapeFreePath["pointTypes"],
  indices: ReadonlyMap<number, number>,
): ShapeFreePath["pointTypes"] {
  if (!pointTypes) return;
  const result: Record<string, ShapeFreePathPointType> = {};
  for (const [key, value] of Object.entries(pointTypes)) {
    const index = indices.get(Number(key));
    if (index !== undefined) result[index] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

/**
 * Inserts a corner-default authored node, preserving an L/Q/C curve exactly.
 * A final Z is an implicit linear segment: its first half becomes an authored L
 * and the remaining half stays Z. An already coincident seam has no edge to add.
 * Existing point types follow their original endpoints, including the split end.
 * This is a pure preview operation; the caller owns the eventual Core command.
 */
export function addFreeShapePoint(
  drawing: SheetGraphicDrawing,
  segmentCommandIndex: number,
  layout: SheetViewportLayout,
  t = 0.5,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (!Number.isFinite(t) || t <= 0 || t >= 1) return;
  try {
    const prepared = preparedPath(drawing);
    if (!prepared || prepared.commands.length >= MAX_SHAPE_FREE_PATH_COMMANDS) return;
    const segment = segmentAt(prepared.commands, segmentCommandIndex);
    if (!segment) return;
    const split = splitSegment(segment, t),
      closing = prepared.commands[segmentCommandIndex]![0] === "Z";
    const start = segment.points[0]!,
      inserted = endpoint(split[0])!;
    // Strictly interior t can still round to an endpoint. Reject a wholly
    // collapsed split half instead of manufacturing a no-op duplicate node.
    if (
      !segmentAt([["M", start.x, start.y], split[0]], 1) ||
      !segmentAt([["M", inserted.x, inserted.y], split[1]], 1)
    )
      return;
    const commands: ShapeFreePathCommand[] = [
      ...prepared.commands.slice(0, segmentCommandIndex),
      split[0],
      closing ? ["Z"] : split[1],
      ...prepared.commands.slice(segmentCommandIndex + 1),
    ];
    const indices = new Map<number, number>();
    prepared.commands.forEach((command, index) => {
      if (command[0] !== "Z") indices.set(index, index < segmentCommandIndex ? index : index + 1);
    });
    return replaceFreeShapeCommands(
      drawing,
      commands,
      remapPointTypes(prepared.path.pointTypes, indices),
      layout,
      options,
    );
  } catch {
    return;
  }
}

function reconnectedSegment(
  incoming: ShapeFreePathCommand,
  outgoing: ShapeFreePathCommand,
): ShapeFreePathCommand {
  if (incoming[0] === "C" && outgoing[0] === "C")
    return ["C", incoming[1], incoming[2], outgoing[3], outgoing[4], outgoing[5], outgoing[6]];
  return outgoing;
}

/**
 * Deletes one logical vertex; a closed coincident endpoint aliases the initial M.
 * For C→C, the reconnect keeps the surviving previous node's outgoing handle and
 * next node's incoming handle, dropping the deleted node's two handles. Mixed
 * segments deterministically retain the following segment's kind and controls;
 * controls on its removed incoming segment disappear. Surviving vertex positions
 * and types never move. At an open end its attached segment is simply removed.
 * This product-owned rule does not claim WPS's unverified curve-fitting algorithm.
 */
export function deleteFreeShapePoint(
  drawing: SheetGraphicDrawing,
  vertexIndex: number,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0) return;
  try {
    const prepared = preparedPath(drawing);
    if (!prepared) return;
    const vertices = listFreeShapePoints(drawing).filter((point) => point.role === "vertex");
    if (vertices.length <= 2) return;
    const selected = vertices.find((point) => point.vertexIndex === vertexIndex);
    if (!selected) return;
    const original = prepared.commands,
      closed = original.at(-1)?.[0] === "Z";
    const lastIndex = original.length - (closed ? 2 : 1),
      first = endpoint(original[0]!)!;
    const seam = closed && samePoint(endpoint(original[lastIndex]!)!, first);
    const commands: ShapeFreePathCommand[] = [];
    const indices = new Map<number, number>();
    if (selected.commandIndex === 0) {
      const promoted = endpoint(original[1]!)!;
      commands.push(["M", promoted.x, promoted.y]);
      indices.set(1, 0);
      const end = seam ? lastIndex : lastIndex + 1;
      for (let index = 2; index < end; index++) {
        indices.set(index, commands.length);
        commands.push(original[index]!);
      }
      if (closed) {
        const incoming = seam ? original[lastIndex]! : (["Z"] as const);
        commands.push(reconnectedSegment(incoming, original[1]!), ["Z"]);
      }
    } else {
      for (let index = 0; index < original.length; index++) {
        if (index === selected.commandIndex) continue;
        const nextIndex = commands.length;
        commands.push(
          index === selected.commandIndex + 1
            ? reconnectedSegment(original[selected.commandIndex]!, original[index]!)
            : original[index]!,
        );
        if (original[index]![0] !== "Z" && !(seam && index === lastIndex))
          indices.set(index, nextIndex);
      }
    }
    return replaceFreeShapeCommands(
      drawing,
      commands,
      remapPointTypes(prepared.path.pointTypes, indices),
      layout,
      options,
    );
  } catch {
    return;
  }
}

function validRect(
  drawing: SheetGraphicDrawing,
  rect: PictureFrameRect,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): boolean {
  const total = layout.getTotalSize();
  return (
    Number.isFinite(drawing.rotation) &&
    drawing.rotation >= -360 &&
    drawing.rotation <= 360 &&
    [drawing.offsetX, drawing.offsetY].every(
      (value) =>
        Number.isFinite(value) &&
        (options ? Math.abs(value) <= coordinateBudget : value >= 0 && value <= 1_000_000),
    ) &&
    (drawing.shapeFlipX === undefined || drawing.shapeFlipX === true) &&
    (drawing.shapeFlipY === undefined || drawing.shapeFlipY === true) &&
    finitePoint(rect) &&
    (options
      ? finitePoint({ x: rect.x + rect.width, y: rect.y + rect.height })
      : [total.width, total.height].every(Number.isFinite) &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= Math.min(total.width, coordinateBudget) &&
        rect.y + rect.height <= Math.min(total.height, coordinateBudget))
  );
}
function squaredDistance(left: Point, right: Point): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}
function nearestOnSegment(
  segment: Segment,
  query: Point,
): Readonly<{ t: number; distance: number }> {
  if (segment.points.length === 2) {
    const start = segment.points[0]!,
      end = segment.points[1]!;
    const dx = end.x - start.x,
      dy = end.y - start.y,
      length = Math.hypot(dx, dy);
    const t = Math.max(
      0,
      Math.min(
        1,
        ((query.x - start.x) * (dx / length) + (query.y - start.y) * (dy / length)) / length,
      ),
    );
    return { t, distance: Math.sqrt(squaredDistance(pointOnSegment(segment, t), query)) };
  }
  let t = 0,
    best = squaredDistance(segment.points[0]!, query),
    sampleIndex = 0;
  for (let index = 1; index <= samplesPerCurve; index++) {
    const candidateT = index / samplesPerCurve,
      candidate = squaredDistance(pointOnSegment(segment, candidateT), query);
    if (candidate < best) {
      best = candidate;
      t = candidateT;
      sampleIndex = index;
    }
  }
  let left = Math.max(0, (sampleIndex - 1) / samplesPerCurve),
    right = Math.min(1, (sampleIndex + 1) / samplesPerCurve);
  const fraction = (Math.sqrt(5) - 1) / 2;
  let a = right - fraction * (right - left),
    b = left + fraction * (right - left);
  let distanceA = squaredDistance(pointOnSegment(segment, a), query),
    distanceB = squaredDistance(pointOnSegment(segment, b), query);
  for (let index = 0; index < refinementSteps; index++) {
    if (distanceA <= distanceB) {
      right = b;
      b = a;
      distanceB = distanceA;
      a = right - fraction * (right - left);
      distanceA = squaredDistance(pointOnSegment(segment, a), query);
    } else {
      left = a;
      a = b;
      distanceA = distanceB;
      b = left + fraction * (right - left);
      distanceB = squaredDistance(pointOnSegment(segment, b), query);
    }
  }
  for (const candidateT of [a, b]) {
    const candidate = squaredDistance(pointOnSegment(segment, candidateT), query);
    if (candidate < best) {
      best = candidate;
      t = candidateT;
    }
  }
  return { t, distance: Math.sqrt(best) };
}

/**
 * Bounded numeric path hit-testing in sheet-space, including the true closing
 * edge. Rotation is inverted by Core's frame helper and explicit flips afterward.
 * Lines are analytic; Béziers use 32 samples and 32 bounded refinement steps.
 * Endpoints can return t=0/1; Add requires a strictly interior t from the caller.
 */
export function nearestFreeShapeSegment(
  drawing: SheetGraphicDrawing,
  worldPoint: Point,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): NearestFreeShapeSegment | undefined {
  if (!finitePoint(worldPoint)) return;
  try {
    const prepared = preparedPath(drawing),
      rect = getFloatingImageSheetRect(drawing, layout);
    if (!prepared || !rect || !validRect(drawing, rect, layout, options)) return;
    const point = pictureFrameWorldToLocal(rect, drawing.rotation, worldPoint);
    const query = {
      x: drawing.shapeFlipX ? drawing.width - point.x : point.x,
      y: drawing.shapeFlipY ? drawing.height - point.y : point.y,
    };
    if (!finitePoint(query)) return;
    let nearest: NearestFreeShapeSegment | undefined;
    for (let index = 1; index < prepared.commands.length; index++) {
      const segment = segmentAt(prepared.commands, index);
      if (!segment) continue;
      const candidate = nearestOnSegment(segment, query);
      if (!nearest || candidate.distance < nearest.distance)
        nearest = { commandIndex: index, ...candidate };
    }
    return nearest;
  } catch {
    return;
  }
}
