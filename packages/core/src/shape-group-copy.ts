import { resolveSheetShapeConnections } from "./shape-connector-layout.js";
import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { materializeShapeConnectorTargets } from "./shape-connector-materialize.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  isShapeGroupDrawing,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupChild,
} from "./shape-group.js";
import { normalizeShapeDrawingForest } from "./shape-group-planning.js";
import type { SheetDrawing } from "./sheet-drawings.js";

export type ShapeClipboardCloneOptions = {
  /** Called once per identity. Invalid/colliding output fails without implicit retries. */
  createId: () => string;
  /** Every ID in the destination drawing forest, including non-shape roots. */
  reservedIds?: readonly string[];
};

function readCloneOptions(options: ShapeClipboardCloneOptions): {
  createId: () => string;
  reserved: string[];
} {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Invalid shape clipboard clone options.");
  const prototype: unknown = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Shape clipboard clone options must be an ordinary data record.");
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key)!;
    if (
      typeof key !== "string" ||
      (key !== "createId" && key !== "reservedIds") ||
      !("value" in descriptor)
    )
      throw new TypeError("Shape clipboard clone options require known own data fields.");
    fields[key] = descriptor.value as unknown;
  }
  if (typeof fields.createId !== "function")
    throw new TypeError("Shape clipboard cloning requires an ID factory.");
  const reserved = readPictureDataArray(
    (fields.reservedIds ?? []) as readonly string[],
    "reserved shape clipboard IDs",
    MAX_SHAPE_GROUP_NODES * 2,
  );
  if (reserved.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Reserved shape clipboard IDs must be non-empty strings.");
  return { createId: fields.createId as () => string, reserved };
}

/** Deeply detached internal-model copy. All owned IDs are fresh; glyph/body asset references stay shared. */
export function cloneShapeRootsForClipboard(
  values: readonly SheetDrawing[],
  options: ShapeClipboardCloneOptions,
): SheetDrawing[] {
  const roots = normalizeShapeDrawingForest(values);
  return cloneNormalizedRoots(roots, readCloneOptions(options));
}

function cloneNormalizedRoots(
  roots: SheetDrawing[],
  { createId, reserved }: ReturnType<typeof readCloneOptions>,
  sourceUnavailable: readonly string[] = [],
): SheetDrawing[] {
  const unavailable = new Set([...reserved, ...sourceUnavailable]);
  const ids: string[] = [];
  for (const root of roots)
    for (const node of isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node }) => node)
      : [root]) {
      ids.push(node.id);
      unavailable.add(node.id);
    }
  const remapped = new Map<string, string>();
  for (const old of ids) {
    const id = createId();
    if (typeof id !== "string" || !id.trim())
      throw new TypeError("Shape clipboard ID factory must return a non-empty string.");
    if (unavailable.has(id))
      throw new TypeError("Shape clipboard ID factory returned a collision.");
    unavailable.add(id);
    remapped.set(old, id);
  }
  function remapConnector(node: SheetDrawing | ShapeGroupChild): void {
    if (node.kind !== "shape" || !node.shapeConnector) return;
    for (const endpoint of [node.shapeConnector.begin, node.shapeConnector.end]) {
      if (endpoint.kind !== "site") continue;
      const targetId = remapped.get(endpoint.targetId);
      if (!targetId) throw new TypeError("Copy the full connector target closure before cloning.");
      endpoint.targetId = targetId;
    }
  }
  function remapChild(child: ShapeGroupChild): void {
    child.id = remapped.get(child.id)!;
    remapConnector(child);
    if (child.kind === "shapeGroup") for (const member of child.members) remapChild(member);
  }
  for (const root of roots) {
    root.id = remapped.get(root.id)!;
    remapConnector(root);
    if (isShapeGroupDrawing(root)) for (const child of root.members) remapChild(child);
  }
  return normalizeShapeDrawingForest(roots);
}

/** Whole source context permits a selected connector's external tips to become free before copying. */
export function planCloneShapeRootsForClipboard(
  values: readonly SheetDrawing[],
  selectedRootIds: readonly string[],
  metrics: PictureSheetMetrics,
  options: ShapeClipboardCloneOptions,
): SheetDrawing[] {
  let roots = normalizeShapeDrawingForest(values);
  const { createId, reserved } = readCloneOptions(options);
  const selected = readPictureDataArray(
    selectedRootIds,
    "shape clipboard selection",
    MAX_SHAPE_GROUP_NODES,
  );
  if (
    selected.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(selected).size !== selected.length
  )
    throw new TypeError("Shape clipboard selection requires unique non-empty root IDs.");
  const selectedSet = new Set(selected);
  const copiedRoots = roots.filter((root) => selectedSet.has(root.id));
  if (copiedRoots.length !== selectedSet.size)
    throw new TypeError("Shape clipboard selection must reference current worksheet roots.");
  const allNodes = roots.flatMap<SheetDrawing | ShapeGroupChild>((root) =>
    isShapeGroupDrawing(root) ? traverseShapeGroup(root).map(({ node }) => node) : [root],
  );
  const copiedNodes = copiedRoots.flatMap<SheetDrawing | ShapeGroupChild>((root) =>
    isShapeGroupDrawing(root) ? traverseShapeGroup(root).map(({ node }) => node) : [root],
  );
  const closure = new Set(copiedNodes.map((node) => node.id));
  const copiedConnections = copiedNodes.filter(
    (node) => node.kind === "shape" && node.shapeConnector,
  );
  const externalTargets = new Set<string>();
  for (const node of copiedConnections)
    if (node.kind === "shape")
      for (const endpoint of [node.shapeConnector!.begin, node.shapeConnector!.end])
        if (endpoint.kind === "site" && !closure.has(endpoint.targetId))
          externalTargets.add(endpoint.targetId);
  if (externalTargets.size)
    roots = materializeShapeConnectorTargets(roots, [...externalTargets], metrics, {
      connectorIds: copiedConnections.map((node) => node.id),
    });
  const result = cloneNormalizedRoots(
    normalizeShapeDrawingForest(roots.filter((root) => selectedSet.has(root.id))),
    { createId, reserved },
    allNodes.map((node) => node.id),
  );
  if (copiedConnections.length) resolveSheetShapeConnections(result, metrics);
  return result;
}
