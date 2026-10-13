import {
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import {
  isShapeFreePathClosed,
  normalizeShapeFreePath,
  type ShapeFreePath,
  type ShapeFreePathCommand,
  type ShapeFreePathPointType,
} from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { FREE_SHAPE_GEOMETRY_LIMITS, getFreeShapeGeometry } from "./free-shape-geometry";
import { shapeViewAtRect } from "./shape-view-layout";

/** Opt-in editing of a disposable canonical shape view using its metrics snapshot. */
export type ShapePointEditOptions = Readonly<{ metrics: PictureSheetMetrics }>;
export type FreeShapePointPosition = Readonly<{ x: number; y: number }>;
export type FreeShapePointRole = "vertex" | "control1" | "control2";
export type FreeShapePointDescriptor = Readonly<{
  commandIndex: number;
  role: FreeShapePointRole;
}>;
export type FreeShapePoint = FreeShapePointDescriptor &
  Readonly<{ vertexIndex: number; position: FreeShapePointPosition }>;
export type FreeShapeVertexType = "corner" | ShapeFreePathPointType;
type FreeDrawing = Pick<
  SheetGraphicDrawing,
  "kind" | "width" | "height" | "shapeGeometry" | "shapePath"
>;
const coordinateBudget = 10_000_000;
const numericalTolerance = 1e-8;
const emptyPoints: readonly FreeShapePoint[] = Object.freeze([]);

function coordinateIndex(
  operation: ShapeFreePathCommand[0],
  role: FreeShapePointRole,
): number | undefined {
  if (role === "vertex") {
    if (operation === "M" || operation === "L") return 1;
    if (operation === "Q") return 3;
    if (operation === "C") return 5;
  }
  if (role === "control1" && (operation === "Q" || operation === "C")) return 1;
  if (role === "control2" && operation === "C") return 3;
  return;
}
function endpoint(command: ShapeFreePathCommand): FreeShapePointPosition {
  const index = coordinateIndex(command[0], "vertex")!;
  return { x: command[index] as number, y: command[index + 1] as number };
}
function seamIndex(commands: readonly ShapeFreePathCommand[]): number | undefined {
  if (commands.at(-1)?.[0] !== "Z") return;
  const index = commands.length - 2,
    last = commands[index];
  if (!last || last[0] === "M" || last[0] === "Z") return;
  const first = endpoint(commands[0]!),
    end = endpoint(last);
  return first.x === end.x && first.y === end.y ? index : undefined;
}
function canonicalVertex(commands: readonly ShapeFreePathCommand[], index: number): number {
  return index === seamIndex(commands) ? 0 : index;
}
function owningVertex(
  commands: readonly ShapeFreePathCommand[],
  descriptor: FreeShapePointDescriptor,
): number {
  return canonicalVertex(
    commands,
    descriptor.role === "control1" ? descriptor.commandIndex - 1 : descriptor.commandIndex,
  );
}

/** Actual vertices and Bézier controls, not flattened curve samples or flipped points. */
export function listFreeShapePoints(drawing: FreeDrawing): readonly FreeShapePoint[] {
  if (drawing.kind !== "shape" || !drawing.shapePath || drawing.shapeGeometry) return emptyPoints;
  const geometry = getFreeShapeGeometry(drawing.shapePath, drawing.width, drawing.height);
  if (!geometry) return emptyPoints;
  const commands = geometry.paths[0]!.commands as readonly ShapeFreePathCommand[];
  const seam = seamIndex(commands);
  const points: FreeShapePoint[] = [];
  commands.forEach((command, commandIndex) => {
    for (const role of ["vertex", "control1", "control2"] as const) {
      if (role === "vertex" && commandIndex === seam) continue;
      // Free geometry contains only M/L/Q/C/Z; never an evaluated preset arc.
      const index = coordinateIndex(command[0] as ShapeFreePathCommand[0], role);
      if (index === undefined) continue;
      points.push(
        Object.freeze({
          commandIndex,
          role,
          vertexIndex: owningVertex(commands, { commandIndex, role }),
          position: Object.freeze({ x: command[index] as number, y: command[index + 1] as number }),
        }),
      );
    }
  });
  return Object.freeze(points);
}

function flipPoint(
  drawing: SheetGraphicDrawing,
  point: FreeShapePointPosition,
): FreeShapePointPosition {
  return {
    x: drawing.shapeFlipX ? drawing.width - point.x : point.x,
    y: drawing.shapeFlipY ? drawing.height - point.y : point.y,
  };
}
function finitePoint(point: FreeShapePointPosition): boolean {
  return [point.x, point.y].every(
    (value) => Number.isFinite(value) && Math.abs(value) <= coordinateBudget,
  );
}
function pointWithinSheet(
  point: FreeShapePointPosition,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): boolean {
  if (options) return finitePoint(point);
  const total = layout.getTotalSize();
  return (
    finitePoint(point) &&
    [total.width, total.height].every(Number.isFinite) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= Math.min(total.width, coordinateBudget) &&
    point.y <= Math.min(total.height, coordinateBudget)
  );
}
function rectWithinSheet(
  rect: PictureFrameRect,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): boolean {
  return (
    [rect.width, rect.height].every(
      (extent) =>
        Number.isFinite(extent) &&
        (options ? extent > 0 : extent >= 1) &&
        extent <= FREE_SHAPE_GEOMETRY_LIMITS.extent,
    ) &&
    pointWithinSheet(rect, layout, options) &&
    pointWithinSheet({ x: rect.x + rect.width, y: rect.y + rect.height }, layout, options)
  );
}
function validPlacement(drawing: SheetGraphicDrawing, options?: ShapePointEditOptions): boolean {
  return (
    drawing.kind === "shape" &&
    Boolean(drawing.shapePath) &&
    !drawing.shapeGeometry &&
    Number.isFinite(drawing.rotation) &&
    drawing.rotation >= -360 &&
    drawing.rotation <= 360 &&
    [drawing.offsetX, drawing.offsetY].every(
      (value) =>
        Number.isFinite(value) &&
        (options ? Math.abs(value) <= coordinateBudget : value >= 0 && value <= 1_000_000),
    ) &&
    (drawing.shapeFlipX === undefined || drawing.shapeFlipX === true) &&
    (drawing.shapeFlipY === undefined || drawing.shapeFlipY === true)
  );
}
function distance(left: FreeShapePointPosition, right: FreeShapePointPosition): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function translatedCommand(
  command: ShapeFreePathCommand,
  origin: FreeShapePointPosition,
): ShapeFreePathCommand {
  return command.map((value, index) =>
    index === 0 ? value : (value as number) - (index % 2 === 1 ? origin.x : origin.y),
  ) as unknown as ShapeFreePathCommand;
}
function attachedCoordinates(
  commands: readonly ShapeFreePathCommand[],
  descriptor: FreeShapePointDescriptor,
): ReadonlyMap<number, ReadonlySet<number>> {
  const moved = new Map<number, Set<number>>();
  const add = (index: number, role: FreeShapePointRole) => {
    const command = commands[index];
    const coordinate = command && coordinateIndex(command[0], role);
    if (coordinate === undefined) return;
    const fields = moved.get(index) ?? new Set<number>();
    fields.add(coordinate);
    moved.set(index, fields);
  };
  add(descriptor.commandIndex, descriptor.role);
  if (descriptor.role !== "vertex") return moved;
  const addVertexControls = (index: number) => {
    add(index, "vertex");
    add(index, "control2");
    if (commands[index + 1]?.[0] === "C") add(index + 1, "control1");
  };
  addVertexControls(descriptor.commandIndex);
  const lastIndex = seamIndex(commands);
  // An explicitly returned seam represents the first node twice. Final
  // Z alone has no extra authored point, and a linear closing edge has no handle.
  if (
    lastIndex !== undefined &&
    (descriptor.commandIndex === 0 || descriptor.commandIndex === lastIndex)
  ) {
    addVertexControls(0);
    addVertexControls(lastIndex);
  }
  return moved;
}

type ControlPair = Readonly<{
  incoming?: FreeShapePointDescriptor;
  outgoing?: FreeShapePointDescriptor;
}>;
function nodeControls(commands: readonly ShapeFreePathCommand[], vertexIndex: number): ControlPair {
  const index = canonicalVertex(commands, vertexIndex);
  const previous = index === 0 ? seamIndex(commands) : index;
  return {
    ...(previous !== undefined && commands[previous]?.[0] === "C"
      ? { incoming: { commandIndex: previous, role: "control2" as const } }
      : {}),
    ...(commands[index + 1]?.[0] === "C"
      ? { outgoing: { commandIndex: index + 1, role: "control1" as const } }
      : {}),
  };
}
function controlPosition(
  commands: readonly ShapeFreePathCommand[],
  descriptor: FreeShapePointDescriptor,
): FreeShapePointPosition {
  const command = commands[descriptor.commandIndex]!,
    index = coordinateIndex(command[0], descriptor.role)!;
  return { x: command[index] as number, y: command[index + 1] as number };
}
function replaceControl(
  commands: readonly ShapeFreePathCommand[],
  descriptor: FreeShapePointDescriptor,
  point: FreeShapePointPosition,
): ShapeFreePathCommand[] {
  return commands.map((command, index) => {
    if (index !== descriptor.commandIndex) return command;
    const field = coordinateIndex(command[0], descriptor.role)!;
    return command.map((value, offset) =>
      offset === field ? point.x : offset === field + 1 ? point.y : value,
    ) as unknown as ShapeFreePathCommand;
  });
}
function canonicalPointTypes(path: ShapeFreePath): Record<string, ShapeFreePathPointType> {
  const types: Record<string, ShapeFreePathPointType> = { ...path.pointTypes };
  const seam = seamIndex(path.commands);
  if (seam !== undefined && types[seam]) {
    types[0] ??= types[seam]!;
    delete types[seam];
  }
  return types;
}

/** Descriptor-only copy permits signed edit coordinates without invoking accessors. */
function detachedCommands(value: readonly ShapeFreePathCommand[]): ShapeFreePathCommand[] {
  const array = (input: unknown, limit: number): unknown[] => {
    if (!Array.isArray(input) || ![Array.prototype, null].includes(Object.getPrototypeOf(input)))
      throw new TypeError("Free shape edit commands must be ordinary arrays.");
    const length = Object.getOwnPropertyDescriptor(input, "length")!.value as number;
    if (length > limit) throw new RangeError("Free shape edit exceeds its command budget.");
    for (const key of Reflect.ownKeys(input)) {
      if (key === "length") continue;
      if (
        typeof key !== "string" ||
        !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= length ||
        !("value" in Object.getOwnPropertyDescriptor(input, key)!)
      )
        throw new TypeError("Free shape edit arrays require own numeric data fields.");
    }
    const result: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !("value" in descriptor))
        throw new TypeError("Sparse edit commands are invalid.");
      result.push(descriptor.value);
    }
    return result;
  };
  return array(value, FREE_SHAPE_GEOMETRY_LIMITS.commands).map((entry) => {
    const command = array(entry, 7),
      operation = command[0];
    const length =
      operation === "M" || operation === "L"
        ? 3
        : operation === "Q"
          ? 5
          : operation === "C"
            ? 7
            : operation === "Z"
              ? 1
              : 0;
    if (
      !length ||
      command.length !== length ||
      command
        .slice(1)
        .some(
          (coordinate) =>
            typeof coordinate !== "number" ||
            !Number.isFinite(coordinate) ||
            Math.abs(coordinate) > coordinateBudget,
        )
    )
      throw new TypeError("Invalid numeric free shape edit command.");
    return command as unknown as ShapeFreePathCommand;
  });
}

/**
 * Shared authored-command rebase for explicit node operations. Inputs are actual
 * unflipped local units. Every supplied coordinate retains its old world
 * projection; the new frame is merged-safe and never clamped. Canonical context
 * permits signed sheet positions and positive subpixel source frames; legacy
 * calls retain their sheet bounds and 1px source minimum.
 */
export function replaceFreeShapeCommands(
  drawing: SheetGraphicDrawing,
  commandsInActualCanonicalLocalUnits: readonly ShapeFreePathCommand[],
  pointTypes: ShapeFreePath["pointTypes"],
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (!validPlacement(drawing, options)) return;
  try {
    const path = normalizeShapeFreePath(drawing.shapePath);
    const geometry = getFreeShapeGeometry(path, drawing.width, drawing.height);
    const rect = getFloatingImageSheetRect(drawing, layout);
    if (!geometry || !rect || !rectWithinSheet(rect, layout, options)) return;
    const commands = detachedCommands(commandsInActualCanonicalLocalUnits);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const command of commands)
      for (let index = 1; index < command.length; index += 2) {
        const x = command[index] as number,
          y = command[index + 1] as number;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    const width = Math.max(1, maxX - minX),
      height = Math.max(1, maxY - minY);
    const origin = {
      x: minX - (width - (maxX - minX)) / 2,
      y: minY - (height - (maxY - minY)) / 2,
    };
    const center = pictureFrameLocalToWorld(
      rect,
      drawing.rotation,
      flipPoint(drawing, { x: origin.x + width / 2, y: origin.y + height / 2 }),
    );
    const nextRect = { x: center.x - width / 2, y: center.y - height / 2, width, height };
    if (!rectWithinSheet(nextRect, layout, options)) return;
    const shapePath = normalizeShapeFreePath({
      tool: path.tool,
      ...(path.openArea ? { openArea: true } : {}),
      viewBox: { width, height },
      commands: commands.map((command) => translatedCommand(command, origin)),
      ...(pointTypes ? { pointTypes } : {}),
    });
    const next = options
      ? shapeViewAtRect({ ...drawing, shapePath }, nextRect, options.metrics)
      : reanchorFloatingImageAtSheetRect({ ...drawing, shapePath }, nextRect, layout);
    if (!next || !validPlacement(next, options)) return;
    const resolved = getFloatingImageSheetRect(next, layout);
    const actual = getFreeShapeGeometry(next.shapePath, next.width, next.height)?.paths[0]
      ?.commands;
    if (!resolved || !actual || !rectWithinSheet(resolved, layout, options)) return;
    for (let index = 0; index < commands.length; index++)
      for (let field = 1; field < commands[index]!.length; field += 2) {
        const expected = pictureFrameLocalToWorld(
          rect,
          drawing.rotation,
          flipPoint(drawing, {
            x: commands[index]![field] as number,
            y: commands[index]![field + 1] as number,
          }),
        );
        const world = pictureFrameLocalToWorld(
          resolved,
          next.rotation,
          flipPoint(next, {
            x: actual[index]![field] as number,
            y: actual[index]![field + 1] as number,
          }),
        );
        if (!finitePoint(world) || distance(world, expected) > numericalTolerance) return;
      }
    return next;
  } catch {
    return;
  }
}

/**
 * Moves one authored node or control in sheet-space. A moved cubic node carries
 * its attached incoming/outgoing controls. A corner control stays isolated;
 * smooth and straight controls constrain only their opposite paired handle.
 * Quadratic controls are independent because their one shared control has no
 * unambiguous node ownership. Rotation and explicit flips are inverted before
 * editing. All authored coordinates define
 * the new canonical bounding frame; a thin axis gains symmetric padding to 1px.
 * Projecting that frame's canonical center through the old transform preserves
 * every untouched point's world position, including controls and flipped curves.
 * Invalid or unrepresentable frames are rejected, never clamped. No history is
 * recorded here; callers own the preview and one final Core command.
 */
export function moveFreeShapePoint(
  drawing: SheetGraphicDrawing,
  descriptor: FreeShapePointDescriptor,
  targetWorldPoint: FreeShapePointPosition,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (
    !validPlacement(drawing, options) ||
    !Number.isSafeInteger(descriptor.commandIndex) ||
    descriptor.commandIndex < 0 ||
    !pointWithinSheet(targetWorldPoint, layout, options)
  )
    return;
  try {
    const path = normalizeShapeFreePath(drawing.shapePath);
    const geometry = getFreeShapeGeometry(path, drawing.width, drawing.height);
    const rect = getFloatingImageSheetRect(drawing, layout);
    if (!geometry || !rect || !rectWithinSheet(rect, layout, options)) return;
    const originalCommands = geometry.paths[0]!.commands as readonly ShapeFreePathCommand[];
    const selected = originalCommands[descriptor.commandIndex];
    if (!selected) return;
    const coordinate = coordinateIndex(selected[0], descriptor.role);
    if (coordinate === undefined) return;
    const originalPoint = {
      x: selected[coordinate] as number,
      y: selected[coordinate + 1] as number,
    };
    const currentWorld = pictureFrameLocalToWorld(
      rect,
      drawing.rotation,
      flipPoint(drawing, originalPoint),
    );
    if (distance(currentWorld, targetWorldPoint) <= numericalTolerance) return drawing;
    const localTarget = flipPoint(
      drawing,
      pictureFrameWorldToLocal(rect, drawing.rotation, targetWorldPoint),
    );
    if (!finitePoint(localTarget)) return;
    const movedCoordinates = attachedCoordinates(originalCommands, descriptor);
    const delta = { x: localTarget.x - originalPoint.x, y: localTarget.y - originalPoint.y };
    let commands = originalCommands.map((command, index): ShapeFreePathCommand =>
      movedCoordinates.has(index)
        ? (command.map((value, field) =>
            field > 0 && movedCoordinates.get(index)!.has(field % 2 === 1 ? field : field - 1)
              ? (value as number) + (field % 2 === 1 ? delta.x : delta.y)
              : value,
          ) as unknown as ShapeFreePathCommand)
        : command,
    );
    const pointTypes = canonicalPointTypes(path);
    if (descriptor.role !== "vertex" && selected[0] === "C") {
      const owner = owningVertex(originalCommands, descriptor),
        type = pointTypes[owner];
      const pair = nodeControls(originalCommands, owner);
      const partner = descriptor.role === "control1" ? pair.incoming : pair.outgoing;
      if (type && partner) {
        const node = endpoint(originalCommands[owner]!);
        const moved = controlPosition(commands, descriptor),
          oldPartner = controlPosition(originalCommands, partner);
        const length = distance(moved, node),
          partnerLength = distance(oldPartner, node);
        if (length > 0 || type === "smooth") {
          const ratio = length === 0 ? 0 : type === "smooth" ? 1 : partnerLength / length;
          commands = replaceControl(commands, partner, {
            x: node.x - (moved.x - node.x) * ratio,
            y: node.y - (moved.y - node.y) * ratio,
          });
        }
      }
    }
    return replaceFreeShapeCommands(drawing, commands, pointTypes, layout, options);
  } catch {
    return;
  }
}

function cubicizedCommand(
  commands: readonly ShapeFreePathCommand[],
  index: number,
): ShapeFreePathCommand {
  const command = commands[index]!;
  if (command[0] === "C") return command;
  const start = endpoint(commands[index - 1]!),
    end = endpoint(command);
  if (command[0] === "Q") {
    const control = { x: command[1], y: command[2] };
    return [
      "C",
      start.x + ((control.x - start.x) * 2) / 3,
      start.y + ((control.y - start.y) * 2) / 3,
      end.x + ((control.x - end.x) * 2) / 3,
      end.y + ((control.y - end.y) * 2) / 3,
      end.x,
      end.y,
    ];
  }
  return [
    "C",
    start.x + (end.x - start.x) / 3,
    start.y + (end.y - start.y) / 3,
    end.x - (end.x - start.x) / 3,
    end.y - (end.y - start.y) / 3,
    end.x,
    end.y,
  ];
}
function equalCommands(
  left: readonly ShapeFreePathCommand[],
  right: readonly ShapeFreePathCommand[],
): boolean {
  return (
    left.length === right.length &&
    left.every((command, index) => {
      const other = right[index]!;
      return (
        command.length === other.length &&
        command.every((value, field) =>
          typeof value === "number"
            ? typeof other[field] === "number" &&
              Math.abs(value - (other[field] as number)) <= numericalTolerance
            : value === other[field],
        )
      );
    })
  );
}

/**
 * Explicit node-type action. Adjacent lines become equivalent cubic segments;
 * quadratics are degree-elevated exactly before their independent handles are
 * constrained. Smooth uses an opposite equal-length pair, straight keeps the
 * two original lengths, and corner only clears the sparse constraint.
 */
export function setFreeShapePointType(
  drawing: SheetGraphicDrawing,
  vertexIndex: number,
  type: FreeShapeVertexType,
  layout: SheetViewportLayout,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (
    !validPlacement(drawing, options) ||
    !Number.isSafeInteger(vertexIndex) ||
    vertexIndex < 0 ||
    !["corner", "smooth", "straight"].includes(type)
  )
    return;
  try {
    const path = normalizeShapeFreePath(drawing.shapePath);
    const geometry = getFreeShapeGeometry(path, drawing.width, drawing.height);
    const rect = getFloatingImageSheetRect(drawing, layout);
    if (!geometry || !rect || !rectWithinSheet(rect, layout, options)) return;
    const original = geometry.paths[0]!.commands as readonly ShapeFreePathCommand[];
    if (!original[vertexIndex] || original[vertexIndex]![0] === "Z") return;
    const index = canonicalVertex(original, vertexIndex),
      pointTypes = canonicalPointTypes(path);
    if (type === "corner") {
      if (!pointTypes[index]) return drawing;
      delete pointTypes[index];
      const nextPath: ShapeFreePath = { ...path };
      delete nextPath.pointTypes;
      if (Object.keys(pointTypes).length) nextPath.pointTypes = pointTypes;
      return { ...drawing, shapePath: normalizeShapeFreePath(nextPath) };
    }
    let commands = [...original];
    // Z's implicit line must become an authored segment if either seam endpoint
    // needs a closing Bézier handle. This is an explicit edit, never a render fix.
    if (
      isShapeFreePathClosed(path) &&
      seamIndex(commands) === undefined &&
      (index === 0 || index === commands.length - 2)
    ) {
      const first = endpoint(commands[0]!);
      commands.splice(commands.length - 1, 0, ["L", first.x, first.y]);
    }
    const incoming = index === 0 ? seamIndex(commands) : index;
    for (const segment of [incoming, index + 1]) {
      if (segment === undefined) continue;
      const operation = commands[segment]?.[0];
      if (operation === "L" || operation === "Q")
        commands[segment] = cubicizedCommand(commands, segment);
    }
    const pair = nodeControls(commands, index),
      node = endpoint(commands[index]!);
    if (pair.incoming && pair.outgoing) {
      const incomingPoint = controlPosition(commands, pair.incoming),
        outgoingPoint = controlPosition(commands, pair.outgoing);
      const incomingLength = distance(incomingPoint, node),
        outgoingLength = distance(outgoingPoint, node);
      let axis = { x: outgoingPoint.x - incomingPoint.x, y: outgoingPoint.y - incomingPoint.y };
      let length = Math.hypot(axis.x, axis.y);
      if (length === 0) {
        axis = { x: outgoingPoint.x - node.x, y: outgoingPoint.y - node.y };
        length = Math.hypot(axis.x, axis.y);
      }
      if (length === 0) axis = { x: 1, y: 0 };
      else axis = { x: axis.x / length, y: axis.y / length };
      const inLength = type === "smooth" ? (incomingLength + outgoingLength) / 2 : incomingLength;
      const outLength = type === "smooth" ? inLength : outgoingLength;
      commands = replaceControl(commands, pair.incoming, {
        x: node.x - axis.x * inLength,
        y: node.y - axis.y * inLength,
      });
      commands = replaceControl(commands, pair.outgoing, {
        x: node.x + axis.x * outLength,
        y: node.y + axis.y * outLength,
      });
    }
    if (pointTypes[index] === type && equalCommands(commands, original)) return drawing;
    pointTypes[index] = type;
    return replaceFreeShapeCommands(drawing, commands, pointTypes, layout, options);
  } catch {
    return;
  }
}

/**
 * Closing strips endpoint decoration. Opening at a selected node rotates the
 * full cycle and splits that node into independent coincident endpoints. Every
 * existing edge remains, including an implicit Z edge materialized as L.
 */
export function toggleClosedFreeShape(
  drawing: SheetGraphicDrawing,
  closed: boolean,
  layout: SheetViewportLayout,
  vertexIndex = 0,
  options?: ShapePointEditOptions,
): SheetGraphicDrawing | undefined {
  if (!validPlacement(drawing, options) || typeof closed !== "boolean") return;
  try {
    const geometry = getFreeShapeGeometry(drawing.shapePath, drawing.width, drawing.height);
    const rect = getFloatingImageSheetRect(drawing, layout);
    if (!geometry || !rect || !rectWithinSheet(rect, layout, options)) return;
    const path = normalizeShapeFreePath(drawing.shapePath);
    if (isShapeFreePathClosed(path) === closed) return drawing;
    let commands: ShapeFreePathCommand[], pointTypes: Record<string, ShapeFreePathPointType>;
    if (closed) {
      commands = [...path.commands, ["Z"]];
      pointTypes = { ...path.pointTypes };
      const seam = seamIndex(commands);
      // Closing deliberately merges two open endpoint identities. The initial
      // node owns the resulting seam, including its sparse default corner type.
      if (seam !== undefined) delete pointTypes[seam];
    } else {
      if (
        !Number.isSafeInteger(vertexIndex) ||
        vertexIndex < 0 ||
        !path.commands[vertexIndex] ||
        path.commands[vertexIndex]![0] === "Z"
      )
        return;
      const selected = canonicalVertex(path.commands, vertexIndex),
        first = endpoint(path.commands[0]!);
      const edges: { command: ShapeFreePathCommand; endVertex: number }[] = path.commands
        .slice(1, -1)
        .map((command, index) => ({
          command,
          endVertex: canonicalVertex(path.commands, index + 1),
        }));
      if (seamIndex(path.commands) === undefined)
        edges.push({ command: ["L", first.x, first.y], endVertex: 0 });
      const ordered = [...edges.slice(selected), ...edges.slice(0, selected)];
      const start = endpoint(path.commands[selected]!);
      commands = [["M", start.x, start.y], ...ordered.map((edge) => edge.command)];
      const originalTypes = canonicalPointTypes(path);
      pointTypes = {};
      if (originalTypes[selected]) pointTypes[0] = originalTypes[selected]!;
      ordered.forEach((edge, index) => {
        const type = originalTypes[edge.endVertex];
        if (type) pointTypes[index + 1] = type;
      });
    }
    const nextPath: ShapeFreePath = { ...path, commands };
    if (closed) delete nextPath.openArea;
    delete nextPath.pointTypes;
    if (Object.keys(pointTypes).length) nextPath.pointTypes = pointTypes;
    const shapePath = normalizeShapeFreePath(nextPath);
    const next = { ...drawing, shapePath };
    if (closed) delete next.shapeLineEnds;
    return next;
  } catch {
    return;
  }
}
