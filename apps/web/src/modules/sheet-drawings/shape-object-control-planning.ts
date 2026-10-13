import type {
  PictureAxisMetrics,
  PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { normalizePictureAngle } from "@sheetcraft/core/picture-frame";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import {
  isShapeGroupDrawing,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupNode,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import {
  assertShapeDrawingForestLayouts,
  normalizeShapeDrawingForest,
} from "@sheetcraft/core/shape-group-planning";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "@sheetcraft/core/workbook";
import type {
  ShapeObjectControlAction,
  ShapeObjectOrderAction,
} from "./shape-object-controls-contract";

export type { ShapeObjectControlAction } from "./shape-object-controls-contract";

type Target = { node: SheetDrawing | ShapeGroupNode; path: ShapeGroupPath };
type FlipAxis = "shapeFlipX" | "shapeFlipY";

function dataArray<T>(
  value: readonly T[],
  name: string,
  maximum: number,
  allowNullPrototype = false,
): T[] {
  if (
    !Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Array.prototype &&
      !(allowNullPrototype && Object.getPrototypeOf(value) === null))
  )
    throw new TypeError(`${name} must be an ordinary indexed data array.`);
  if (value.length > maximum) throw new RangeError(`${name} exceeds its data budget.`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length ||
      !("value" in Object.getOwnPropertyDescriptor(value, key)!)
    )
      throw new TypeError(`${name} requires only own indexed data.`);
  }
  const result: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !("value" in field)) throw new TypeError(`${name} must be dense own data.`);
    result.push(field.value as T);
  }
  return result;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} must be an ordinary data record.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in field))
      throw new TypeError(`${name} cannot contain accessors or symbol fields.`);
    result[key] = field.value as unknown;
  }
  return result;
}

/** Also protects unrelated legacy chart/camera/control payloads before Core reads them. */
function assertOrdinaryDrawingData(values: readonly SheetDrawing[]): void {
  const active = new WeakSet<object>(),
    checked = new WeakSet<object>();
  function visit(value: unknown, depth: number): void {
    if (typeof value === "function" || typeof value === "symbol")
      throw new TypeError("Shape object controls require ordinary drawing data.");
    if (!value || typeof value !== "object") return;
    if (active.has(value)) throw new TypeError("Cyclic drawing data is not supported.");
    if (checked.has(value)) return;
    // The Core ownership limit plus placement/appearance records. This is a
    // read-only admission envelope, not another persisted ownership model.
    if (depth > MAX_SHAPE_GROUP_DEPTH * 2 + 16)
      throw new RangeError("Shape object drawing data nesting budget exceeded.");
    active.add(value);
    const children = Array.isArray(value)
      ? dataArray(value, "shape object drawing data", MAX_SHAPE_GROUP_NODES, true)
      : Object.values(record(value, "shape object drawing data"));
    for (const child of children) visit(child, depth + 1);
    active.delete(value);
    checked.add(value);
  }
  for (const value of dataArray(values, "shape object drawing forest", MAX_SHAPE_GROUP_NODES))
    visit(value, 0);
}

function axis(value: unknown, maximum: number): PictureAxisMetrics {
  const fields = record(value, "shape object axis metrics");
  const keys = ["count", "nominalSize", "visibleSize", "nominalPrefix", "visiblePrefix"];
  if (Object.keys(fields).some((key) => !keys.includes(key)))
    throw new TypeError("Unknown shape object axis metrics field.");
  if (
    typeof fields.count !== "number" ||
    !Number.isSafeInteger(fields.count) ||
    fields.count < 1 ||
    fields.count > maximum ||
    keys.slice(1).some((key) => typeof fields[key] !== "function")
  )
    throw new TypeError("Shape object controls require bounded axis metrics.");
  return {
    count: fields.count,
    nominalSize: fields.nominalSize as PictureAxisMetrics["nominalSize"],
    visibleSize: fields.visibleSize as PictureAxisMetrics["visibleSize"],
    nominalPrefix: fields.nominalPrefix as PictureAxisMetrics["nominalPrefix"],
    visiblePrefix: fields.visiblePrefix as PictureAxisMetrics["visiblePrefix"],
  };
}

function sheetMetrics(value: PictureSheetMetrics): PictureSheetMetrics {
  const fields = record(value, "shape object sheet metrics");
  if (Object.keys(fields).some((key) => key !== "columns" && key !== "rows"))
    throw new TypeError("Unknown shape object sheet metrics field.");
  return {
    columns: axis(fields.columns, MAX_SHEET_COLUMNS),
    rows: axis(fields.rows, MAX_SHEET_ROWS),
  };
}

/** Strict shared selection reader; an empty selection is valid for clear/idle UI state. */
export function readShapeObjectControlPaths(values: readonly ShapeGroupPath[]): ShapeGroupPath[] {
  const paths = dataArray(values, "shape object selection", MAX_SHAPE_GROUP_NODES).map((value) => {
    const path = dataArray(value, "shape object path", MAX_SHAPE_GROUP_DEPTH + 1);
    if (!path.length || path.some((id) => typeof id !== "string" || !id.trim()))
      throw new TypeError("Shape object paths require non-empty own string IDs.");
    return path;
  });
  const selected = new Set<string>();
  for (const path of paths) {
    const id = path.at(-1)!;
    if (selected.has(id)) throw new TypeError("Duplicate selected shape object IDs.");
    selected.add(id);
  }
  for (const path of paths)
    if (path.slice(0, -1).some((id) => selected.has(id)))
      throw new TypeError("A shape object selection cannot overlap an ancestor and descendant.");
  return paths;
}

function samePath(left: ShapeGroupPath, right: ShapeGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function indexedForest(roots: readonly SheetDrawing[]): Map<string, Target> {
  const entries = new Map<string, Target>();
  for (const root of roots)
    if (isShapeGroupDrawing(root)) {
      for (const visit of traverseShapeGroup(root))
        entries.set(visit.node.id, { node: visit.node, path: visit.path });
    } else entries.set(root.id, { node: root, path: [root.id] });
  return entries;
}

function isOrderAction(action: ShapeObjectControlAction): action is ShapeObjectOrderAction {
  return (
    action === "bring-forward" ||
    action === "send-backward" ||
    action === "bring-front" ||
    action === "send-back"
  );
}

/** Stack order comes only from the immediate owner's bottom-to-top array. */
function reorder<T extends { id: string }>(
  values: readonly T[],
  ids: ReadonlySet<string>,
  action: ShapeObjectOrderAction,
): T[] {
  if (action === "bring-front" || action === "send-back") {
    const selected = values.filter((value) => ids.has(value.id)),
      remaining = values.filter((value) => !ids.has(value.id));
    return action === "bring-front" ? [...remaining, ...selected] : [...selected, ...remaining];
  }
  const next = [...values];
  if (action === "bring-forward") {
    for (let index = next.length - 2; index >= 0; index--)
      if (ids.has(next[index]!.id) && !ids.has(next[index + 1]!.id))
        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
  } else {
    for (let index = 1; index < next.length; index++)
      if (ids.has(next[index]!.id) && !ids.has(next[index - 1]!.id))
        [next[index], next[index - 1]] = [next[index - 1]!, next[index]!];
  }
  return next;
}

function assertFlippable(node: SheetDrawing | ShapeGroupNode): void {
  if (node.kind === "shapeGroup") {
    for (const member of node.members) assertFlippable(member);
    return;
  }
  if (node.kind !== "shape" || (!node.shapeGeometry && !node.shapePath))
    throw new TypeError(
      "Shape flips require explicit standard or free geometry; legacy shapes and text boxes are not yet supported.",
    );
  if (node.shapeConnector)
    throw new TypeError("A live connector cannot use ordinary shape flip geometry.");
}

function toggleFlip(node: SheetDrawing | ShapeGroupNode, axis: FlipAxis): void {
  if (node.kind !== "shape") throw new TypeError("Only explicit shape leaves have flip flags.");
  if (node[axis]) delete node[axis];
  else node[axis] = true;
}

/**
 * F R(a) = R(-a) F. Reflect each local center, negate each relative
 * member angle, then recurse with the same reflection into nested owners.
 * Diagonal owner scaling commutes with F, so dimensions remain orthogonal
 * even in nonuniformly scaled, rotated groups. No world AABB or shear is
 * persisted. Ungroup retains this world visual result rather than changing
 * the reflected member angle back. Connector and text-box descendants remain
 * gated until their own flip semantics are supported.
 */
function reflectMember(member: ShapeGroupChild, axis: FlipAxis): void {
  const rect = member.groupFrame.rect;
  member.groupFrame = {
    ...member.groupFrame,
    rect: {
      ...rect,
      ...(axis === "shapeFlipX"
        ? { xRatio: 1 - rect.xRatio - rect.widthRatio }
        : { yRatio: 1 - rect.yRatio - rect.heightRatio }),
    },
  };
  member.rotation = normalizePictureAngle(-member.rotation);
  if (member.kind === "shapeGroup") for (const child of member.members) reflectMember(child, axis);
  else toggleFlip(member, axis);
}

/** Pure complete-forest plan; caller routes a changed collection through Core history. */
export function planShapeObjectControlAction(
  values: readonly SheetDrawing[],
  pathsValue: readonly ShapeGroupPath[],
  action: ShapeObjectControlAction,
  metricsValue: PictureSheetMetrics,
): SheetDrawing[] {
  if (
    action !== "flip-horizontal" &&
    action !== "flip-vertical" &&
    action !== "rotate-left" &&
    action !== "rotate-right" &&
    !isOrderAction(action)
  )
    throw new TypeError("Unknown shape object control action.");
  const metrics = sheetMetrics(metricsValue),
    paths = readShapeObjectControlPaths(pathsValue);
  if (!paths.length) throw new TypeError("Shape object controls require a selection.");
  assertOrdinaryDrawingData(values);
  let roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const indexed = indexedForest(roots);
  const hasConnector = [...indexed.values()].some(
    ({ node }) => node.kind === "shape" && !!node.shapeConnector,
  );
  if (hasConnector) resolveSheetShapeConnections(roots, metrics);
  const targets = paths.map((path): Target => {
    const target = indexed.get(path.at(-1)!);
    if (
      !target ||
      !samePath(target.path, path) ||
      (target.node.kind !== "shape" &&
        target.node.kind !== "textBox" &&
        target.node.kind !== "shapeGroup")
    )
      throw new TypeError("Shape object target is missing, stale, reparented or ineligible.");
    return target;
  });
  if (isOrderAction(action)) {
    const ownerPath = paths[0]!.slice(0, -1);
    if (paths.some((path) => !samePath(path.slice(0, -1), ownerPath)))
      throw new TypeError("Shape reordering requires one exact immediate owner.");
    const selected = new Set(targets.map(({ node }) => node.id));
    if (!ownerPath.length) roots = reorder(roots, selected, action);
    else {
      const owner = indexed.get(ownerPath.at(-1)!)?.node;
      if (!owner || owner.kind !== "shapeGroup")
        throw new TypeError("Shape reordering requires its actual group owner.");
      owner.members = reorder(owner.members, selected, action);
    }
  } else if (action === "flip-horizontal" || action === "flip-vertical") {
    // Validate every selected subtree before applying any edit.
    for (const { node } of targets) assertFlippable(node);
    const axis = action === "flip-horizontal" ? "shapeFlipX" : "shapeFlipY";
    for (const { node } of targets)
      if (node.kind === "shapeGroup")
        for (const member of node.members) reflectMember(member, axis);
      else toggleFlip(node, axis);
  } else {
    for (const { node } of targets)
      if (node.kind === "shape" && node.shapeConnector)
        throw new TypeError("A live connector cannot use ordinary shape rotation geometry.");
    const delta = action === "rotate-left" ? -90 : 90;
    for (const { node } of targets) node.rotation = normalizePictureAngle(node.rotation + delta);
  }
  // IDs, owned relations, connector references and the shared Core forest
  // budget are checked again; reordering never rewrites binding target IDs.
  const result = normalizeShapeDrawingForest(roots);
  assertShapeDrawingForestLayouts(result, metrics);
  if (hasConnector) resolveSheetShapeConnections(result, metrics);
  return result;
}
