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
export type FreeShapeSegmentType = "straight" | "curved";
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

function closingSeam(commands: readonly ShapeFreePathCommand[]): number | undefined {
  if (commands.at(-1)?.[0] !== "Z") return;
  const index = commands.length - 2;
  if (samePoint(endpoint(commands[index]!)!, endpoint(commands[0]!)!)) return index;
}
function incidentSegments(
  commands: readonly ShapeFreePathCommand[],
  vertexIndex: number,
): Readonly<{ incoming?: Segment; outgoing?: Segment }> {
  const closed = commands.at(-1)?.[0] === "Z",
    seam = closingSeam(commands),
    index = vertexIndex === seam ? 0 : vertexIndex;
  const incomingIndex = index === 0 ? (closed ? (seam ?? commands.length - 1) : undefined) : index;
  const outgoingIndex = index + 1 < commands.length ? index + 1 : undefined;
  return {
    ...(incomingIndex === undefined ? {} : { incoming: segmentAt(commands, incomingIndex) }),
    ...(outgoingIndex === undefined ? {} : { outgoing: segmentAt(commands, outgoingIndex) }),
  };
}
/** Traversal direction, preferring the nearest noncoincident Bézier control. */
function segmentTangent(segment: Segment | undefined, incoming: boolean): Point | undefined {
  if (!segment) return;
  const points = incoming ? [...segment.points].reverse() : segment.points,
    node = points[0]!;
  for (const point of points.slice(1)) {
    const dx = incoming ? node.x - point.x : point.x - node.x,
      dy = incoming ? node.y - point.y : point.y - node.y,
      length = Math.hypot(dx, dy);
    if (length > 0) return { x: dx / length, y: dy / length };
  }
}
/** Lines and quadratics have the same endpoint handles as exact degree elevation. */
function endpointHandle(segment: Segment, incoming: boolean): Point {
  const points = segment.points,
    node = incoming ? points.at(-1)! : points[0]!,
    control = incoming ? points.at(-2)! : points[1]!,
    factor = points.length === 2 ? 1 / 3 : points.length === 3 ? 2 / 3 : 1;
  return { x: (control.x - node.x) * factor, y: (control.y - node.y) * factor };
}
function compatiblePointType(
  commands: readonly ShapeFreePathCommand[],
  index: number,
  type: ShapeFreePathPointType,
): boolean {
  const { incoming, outgoing } = incidentSegments(commands, index);
  // An open endpoint has no opposite handle to constrain.
  if (!incoming || !outgoing) return true;
  const left = endpointHandle(incoming, true),
    right = endpointHandle(outgoing, false),
    leftLength = Math.hypot(left.x, left.y),
    rightLength = Math.hypot(right.x, right.y),
    tolerance = 1e-8;
  if (
    type === "smooth" &&
    Math.abs(leftLength - rightLength) > tolerance * Math.max(1, leftLength, rightLength)
  )
    return false;
  if (leftLength === 0 || rightLength === 0) return true;
  const lx = left.x / leftLength,
    ly = left.y / leftLength,
    rx = right.x / rightLength,
    ry = right.y / rightLength;
  return Math.abs(lx * ry - ly * rx) <= tolerance && lx * rx + ly * ry <= tolerance;
}

/** Classifies an actual authored edge, including a nondegenerate implicit Z chord. */
export function getFreeShapeSegmentType(
  drawing: SheetGraphicDrawing,
  commandIndex: number,
): FreeShapeSegmentType | undefined {
  try {
    const prepared = preparedPath(drawing);
    if (!prepared || !segmentAt(prepared.commands, commandIndex)) return;
    const operation = prepared.commands[commandIndex]![0];
    return operation === "L" || operation === "Z" ? "straight" : "curved";
  } catch {
    return;
  }
}

/**
 * Removes one real edge from a closed contour, retaining every authored vertex
 * and the original frame/text area. The open outline follows the remaining
 * cycle; its fill still closes implicitly, without creating a closing stroke.
 * No coordinate rebasing or materialization of inherited paint is performed.
 */
export function deleteClosedFreeShapeSegment(
  drawing: SheetGraphicDrawing,
  commandIndex: number,
): SheetGraphicDrawing | undefined {
  try {
    const prepared = preparedPath(drawing);
    if (
      !prepared ||
      prepared.path.commands.at(-1)?.[0] !== "Z" ||
      !segmentAt(prepared.commands, commandIndex)
    )
      return;
    const path = prepared.path,
      first = endpoint(path.commands[0]!)!,
      seam = closingSeam(path.commands);
    const edges = path.commands.slice(1, -1).map((command, index) => ({
      command,
      commandIndex: index + 1,
      endVertex: index + 1 === seam ? 0 : index + 1,
    }));
    if (seam === undefined)
      edges.push({
        command: ["L", first.x, first.y],
        commandIndex: path.commands.length - 1,
        endVertex: 0,
      });
    const selected = edges.findIndex((edge) => edge.commandIndex === commandIndex);
    if (selected < 0) return;
    const removed = edges[selected]!,
      start = endpoint(removed.command)!,
      ordered = [...edges.slice(selected + 1), ...edges.slice(0, selected)],
      commands: ShapeFreePathCommand[] = [
        ["M", start.x, start.y],
        ...ordered.map((edge) => [...edge.command] as ShapeFreePathCommand),
      ],
      pointTypes: Record<string, ShapeFreePathPointType> = {};
    const addType = (oldIndex: number, newIndex: number) => {
      const type = path.pointTypes?.[oldIndex];
      if (type) pointTypes[newIndex] = type;
    };
    addType(removed.endVertex, 0);
    ordered.forEach((edge, index) => addType(edge.endVertex, index + 1));
    const nextPath: ShapeFreePath = { ...path, commands, openArea: true };
    delete nextPath.pointTypes;
    if (Object.keys(pointTypes).length) nextPath.pointTypes = pointTypes;
    return { ...drawing, shapePath: normalizeShapeFreePath(nextPath) };
  } catch {
    return;
  }
}

/** Closed contours only; invalid, collapsed or area-less changes stay disabled. */
export function canDeleteClosedFreeShapeSegment(
  drawing: SheetGraphicDrawing,
  commandIndex: number,
): boolean {
  return deleteClosedFreeShapeSegment(drawing, commandIndex) !== undefined;
}

/**
 * Changes only the selected edge. Straight drops Q/C controls for its chord;
 * curved creates a cubic using adjacent endpoint tangent directions and handles
 * of chord/3. Missing or collapsed adjacent tangents use the selected chord.
 * Existing vertices and every neighboring control keep their world positions.
 * A curved closing Z becomes an authored C to the initial M, followed by Z.
 * Endpoint types survive when their incident handle pair still satisfies its
 * rule; conflicting types become sparse corners instead of moving neighbors.
 * There is no saved-curve cache: the caller's Undo restores the original path.
 */
export function setFreeShapeSegmentType(
  drawing: SheetGraphicDrawing,
  commandIndex: number,
  type: FreeShapeSegmentType,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (type !== "straight" && type !== "curved") return;
  try {
    const prepared = preparedPath(drawing),
      rect = getFloatingImageSheetRect(drawing, layout);
    if (
      !prepared ||
      !rect ||
      !validRect(drawing, rect, layout, options) ||
      [rect.width, rect.height].some((extent) => (options ? extent <= 0 : extent < 1))
    )
      return;
    const segment = segmentAt(prepared.commands, commandIndex);
    if (!segment) return;
    const start = segment.points[0]!,
      end = segment.points.at(-1)!,
      length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length === 0 || !Number.isFinite(length)) return;
    const operation = prepared.commands[commandIndex]![0];
    if ((type === "straight") === (operation === "L" || operation === "Z")) return drawing;
    const closing = operation === "Z";
    if (closing && prepared.commands.length >= MAX_SHAPE_FREE_PATH_COMMANDS) return;
    let replacement: ShapeFreePathCommand;
    if (type === "straight") replacement = ["L", end.x, end.y];
    else {
      const chord = { x: (end.x - start.x) / length, y: (end.y - start.y) / length },
        incoming = incidentSegments(prepared.commands, commandIndex - 1).incoming,
        outgoing = incidentSegments(prepared.commands, closing ? 0 : commandIndex).outgoing,
        startTangent = segmentTangent(incoming, true) ?? chord,
        endTangent = segmentTangent(outgoing, false) ?? chord,
        handleLength = length / 3;
      replacement = [
        "C",
        start.x + startTangent.x * handleLength,
        start.y + startTangent.y * handleLength,
        end.x - endTangent.x * handleLength,
        end.y - endTangent.y * handleLength,
        end.x,
        end.y,
      ];
    }
    const commands = [...prepared.commands];
    commands.splice(commandIndex, 1, replacement, ...(closing ? [["Z"] as const] : []));
    const indices = new Map<number, number>();
    prepared.commands.forEach((command, index) => {
      if (command[0] !== "Z") indices.set(index, index);
    });
    const pointTypes = { ...remapPointTypes(prepared.path.pointTypes, indices) },
      seam = closingSeam(commands);
    for (const endpointIndex of [commandIndex - 1, closing ? 0 : commandIndex]) {
      const index = endpointIndex === seam ? 0 : endpointIndex,
        pointType = pointTypes[index];
      if (pointType && !compatiblePointType(commands, index, pointType)) delete pointTypes[index];
    }
    return replaceFreeShapeCommands(
      drawing,
      commands,
      Object.keys(pointTypes).length ? pointTypes : undefined,
      layout,
      options,
    );
  } catch {
    return;
  }
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
