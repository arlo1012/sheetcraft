import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  resolveSheetShapeConnections,
  SHAPE_CONNECTOR_LAYOUT_LIMITS,
  type ResolvedSheetShapeConnector,
} from "./shape-connector-layout.js";
import { SHAPE_CONNECTOR_ROUTE_LIMITS, type ShapeConnectorPoint } from "./shape-connector-route.js";
import {
  normalizeShapeConnector,
  type ShapeConnector,
  type ShapeConnectorEndpoint,
} from "./shape-connector.js";
import { shapeFrameLocalToWorld, shapeFrameWorldToLocal } from "./shape-frame.js";
import { normalizeShapeDrawingForest } from "./shape-group-planning.js";
import type { ShapeGroupChild, ShapeGroupPath } from "./shape-group.js";
import type { ShapePresetName } from "./shape-presets/catalog.js";
import type { SheetDrawing } from "./sheet-drawings.js";

/** Current ID and ownership identity; callers own any gesture/revision lease. */
export type ShapeConnectorEditSource = Readonly<{
  connectorId: string;
  path: ShapeGroupPath;
}>;
export type ShapeConnectorEndpointEdit =
  | Readonly<{ kind: "free"; position: ShapeConnectorPoint }>
  | Readonly<{
      kind: "site";
      targetId: string;
      targetPath: ShapeGroupPath;
      preset: ShapePresetName;
      siteIndex: number;
    }>;
export type ShapeConnectorEndName = "begin" | "end";

type ForestNode = SheetDrawing | ShapeGroupChild;
type SourceShape = Extract<ForestNode, { kind: "shape" | "textBox" }>;
type ReadyConnector = Exclude<ResolvedSheetShapeConnector, { status: "suspended" }>;
type ExpectedTips = Readonly<Record<ShapeConnectorEndName, ShapeConnectorPoint>>;
type IndexedNode = { node: ForestNode; path: ShapeGroupPath };

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in descriptor))
      throw new TypeError(`${name} requires supported own data fields.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function identity(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty.`);
  if (value.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.identityLength)
    throw new RangeError(`${name} exceeds its identity-length budget.`);
  return value;
}
function path(value: ShapeGroupPath, name: string): ShapeGroupPath {
  const entries = readPictureDataArray(value, name, SHAPE_CONNECTOR_LAYOUT_LIMITS.depth + 1);
  if (!entries.length) throw new TypeError(`${name} must be non-empty.`);
  return entries.map((entry) => identity(entry, name));
}
function point(value: ShapeConnectorPoint, name: string): ShapeConnectorPoint {
  const fields = record(value, ["x", "y"], name);
  const coordinate = (entry: unknown) => {
    if (
      typeof entry !== "number" ||
      !Number.isFinite(entry) ||
      Math.abs(entry) > SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate
    )
      throw new RangeError(`${name} exceeds its finite worksheet-coordinate budget.`);
    return entry === 0 ? 0 : entry;
  };
  return { x: coordinate(fields.x), y: coordinate(fields.y) };
}
function source(value: ShapeConnectorEditSource): ShapeConnectorEditSource {
  const fields = record(value, ["connectorId", "path"], "connector edit source");
  return {
    connectorId: identity(fields.connectorId, "Connector edit source ID"),
    path: path(fields.path as ShapeGroupPath, "connector edit source path"),
  };
}
function endpoint(value: ShapeConnectorEndpointEdit): ShapeConnectorEndpointEdit {
  const fields = record(
    value,
    ["kind", "position", "targetId", "targetPath", "preset", "siteIndex"],
    "connector endpoint edit",
  );
  if (fields.kind === "free") {
    const free = record(fields, ["kind", "position"], "free connector endpoint edit");
    return { kind: "free", position: point(free.position as ShapeConnectorPoint, "Free endpoint") };
  }
  if (fields.kind === "site") {
    const site = record(
      fields,
      ["kind", "targetId", "targetPath", "preset", "siteIndex"],
      "site connector endpoint edit",
    );
    const targetId = identity(site.targetId, "Connector edit target ID");
    const normalized = normalizeShapeConnector({
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId, preset: site.preset, siteIndex: site.siteIndex },
      end: { kind: "free", xRatio: 0, yRatio: 0 },
    }).begin;
    if (normalized.kind !== "site") throw new TypeError("Expected connector site identity.");
    return {
      ...normalized,
      targetPath: path(site.targetPath as ShapeGroupPath, "connector edit target path"),
    };
  }
  throw new TypeError("Unknown connector endpoint edit kind.");
}
function index(forest: readonly SheetDrawing[]): Map<string, IndexedNode> {
  const entries = new Map<string, IndexedNode>();
  const visit = (node: ForestNode, parent: ShapeGroupPath) => {
    const nodePath = [...parent, node.id];
    entries.set(node.id, { node, path: nodePath });
    if (node.kind === "shapeGroup") for (const member of node.members) visit(member, nodePath);
  };
  for (const root of forest) visit(root, []);
  return entries;
}
function atPath(
  nodes: ReadonlyMap<string, IndexedNode>,
  id: string,
  expectedPath: ShapeGroupPath,
  name: string,
): ForestNode {
  const entry = nodes.get(id);
  if (
    !entry ||
    entry.path.length !== expectedPath.length ||
    entry.path.some((part, offset) => part !== expectedPath[offset])
  )
    throw new TypeError(`${name} is missing, reparented or has a stale ID/path identity.`);
  return entry.node;
}
function sourceNode(
  nodes: ReadonlyMap<string, IndexedNode>,
  value: ShapeConnectorEditSource,
): SourceShape & { shapeConnector: ShapeConnector } {
  const node = atPath(nodes, value.connectorId, value.path, "Connector edit source");
  if (node.kind !== "shape" || !node.shapeConnector)
    throw new TypeError("Connector edit source is not a current live connector shape.");
  return node as SourceShape & { shapeConnector: ShapeConnector };
}
function ready(value: ResolvedSheetShapeConnector): ReadyConnector {
  if (
    value.status === "suspended" ||
    value.begin.status !== "ready" ||
    value.end.status !== "ready" ||
    !value.carrierLayout ||
    value.carrierLayout.collapsed ||
    value.carrierLayout.rect.width <= 0 ||
    value.carrierLayout.rect.height <= 0
  )
    throw new RangeError(
      "Connector editing requires available endpoints and a noncollapsed carrier.",
    );
  return value;
}
function tips(value: ReadyConnector): ExpectedTips {
  if (value.begin.status !== "ready" || value.end.status !== "ready")
    throw new RangeError("Connector editing requires available ordered tips.");
  return { begin: value.begin.position, end: value.end.position };
}
function freeEndpoint(
  node: SourceShape,
  resolved: ReadyConnector,
  position: ShapeConnectorPoint,
): ShapeConnectorEndpoint {
  const carrier = resolved.carrierLayout!;
  const local = shapeFrameWorldToLocal(carrier.rect, carrier.angleDeg, position);
  // Persist in the existing source carrier, never the padded disposable paint frame.
  const x = node.shapeFlipX ? carrier.rect.width - local.x : local.x;
  const y = node.shapeFlipY ? carrier.rect.height - local.y : local.y;
  return normalizeShapeConnector({
    kind: "shape-connector-v1",
    begin: { kind: "free", xRatio: x / carrier.rect.width, yRatio: y / carrier.rect.height },
    end: { kind: "free", xRatio: 0, yRatio: 0 },
  }).begin;
}
function verify(resolved: ReadyConnector, expected: ExpectedTips, original: ReadyConnector): void {
  const actual = tips(resolved);
  const carrier = original.carrierLayout!;
  const paintedTips: Record<ShapeConnectorEndName, ShapeConnectorPoint> = {
    begin: resolved.route.begin,
    end: resolved.route.end,
  };
  for (const endName of ["begin", "end"] as const) {
    const position = expected[endName];
    const local = shapeFrameWorldToLocal(carrier.rect, carrier.angleDeg, position);
    const scale = Math.max(
      1,
      Math.abs(position.x),
      Math.abs(position.y),
      Math.abs(carrier.rect.x),
      Math.abs(carrier.rect.y),
      carrier.rect.width,
      carrier.rect.height,
      Math.abs(local.x),
      Math.abs(local.y),
    );
    const painted =
      resolved.route.status === "ready"
        ? shapeFrameLocalToWorld(
            resolved.route.paintLayout.rect,
            resolved.route.paintLayout.angleDeg,
            resolved.route.localEndpoints[endName === "begin" ? 0 : 1],
          )
        : resolved.route[endName];
    paintedTips[endName] = painted;
    // Only floating-point transform error is allowed, never pixel padding/snapping.
    const tolerance = Number.EPSILON * 32 * scale;
    for (const axis of ["x", "y"] as const)
      if (
        Math.abs(actual[endName][axis] - position[axis]) > tolerance ||
        Math.abs(painted[axis] - position[axis]) > tolerance
      )
        throw new RangeError(`Connector ${endName} cannot represent its exact worksheet point.`);
  }
  const span = {
    x: expected.end.x - expected.begin.x,
    y: expected.end.y - expected.begin.y,
  };
  const spanScale = Math.max(Math.abs(span.x), Math.abs(span.y));
  for (const axis of ["x", "y"] as const) {
    const allowed =
      span[axis] === 0
        ? 8 * Number.EPSILON * spanScale
        : Math.abs(span[axis]) * SHAPE_CONNECTOR_ROUTE_LIMITS.spanRelativeError;
    for (const positions of [actual, paintedTips])
      if (Math.abs(positions.end[axis] - positions.begin[axis] - span[axis]) > allowed)
        throw new RangeError("Connector ordered tips cannot represent their exact worksheet span.");
  }
}
function finish(
  roots: SheetDrawing[],
  node: SourceShape & { shapeConnector: ShapeConnector },
  relation: ShapeConnector,
  expected: ExpectedTips,
  original: ReadyConnector,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  node.shapeConnector = normalizeShapeConnector(relation);
  const result = normalizeShapeDrawingForest(roots);
  const resolved = ready(resolveSheetShapeConnections(result, metrics).getConnector(node.id)!);
  verify(resolved, expected, original);
  return result;
}

/**
 * Atomic whole-forest endpoint edit. Only the chosen endpoint changes; the
 * opposite relationship, source appearance/carrier, IDs and ownership stay put.
 * Paths validate current ownership, not replacement objects with the same ID.
 * Protection and revision/metrics leases belong to the caller/collection command.
 */
export function planShapeConnectorEndpointChange(
  forest: readonly SheetDrawing[],
  sourceValue: ShapeConnectorEditSource,
  endName: ShapeConnectorEndName,
  endpointValue: ShapeConnectorEndpointEdit,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const selected = source(sourceValue);
  if (endName !== "begin" && endName !== "end") throw new TypeError("Unknown connector end name.");
  const edit = endpoint(endpointValue);
  const roots = normalizeShapeDrawingForest(forest);
  const nodes = index(roots);
  const node = sourceNode(nodes, selected);
  if (edit.kind === "site") atPath(nodes, edit.targetId, edit.targetPath, "Connector edit target");
  const context = resolveSheetShapeConnections(roots, metrics);
  const original = ready(context.getConnector(selected.connectorId)!);
  let nextEndpoint: ShapeConnectorEndpoint;
  let position: ShapeConnectorPoint;
  if (edit.kind === "free") {
    position = edit.position;
    nextEndpoint = freeEndpoint(node, original, position);
  } else {
    const target = context.getTarget(edit.targetId);
    if (!target || target.preset !== edit.preset)
      throw new TypeError("Connector edit target is ineligible or has a stale preset identity.");
    if (target.status !== "ready") throw new RangeError("Connector edit target is collapsed.");
    const site = target.sites[edit.siteIndex];
    if (!site) throw new RangeError("Connector edit target has no such ordered preset site.");
    position = site.position;
    nextEndpoint = {
      kind: "site",
      targetId: edit.targetId,
      preset: edit.preset,
      siteIndex: edit.siteIndex,
    };
  }
  return finish(
    roots,
    node,
    { ...node.shapeConnector, [endName]: nextEndpoint },
    { ...tips(original), [endName]: position },
    original,
    metrics,
  );
}

/**
 * Translate both resolved worksheet tips and free both ends. Source carrier,
 * target shapes and dependent data are unchanged. Zero delta does not detach.
 * Commit this full collection through Core history so Undo restores bindings.
 */
export function planShapeConnectorBodyTranslation(
  forest: readonly SheetDrawing[],
  sourceValue: ShapeConnectorEditSource,
  deltaValue: ShapeConnectorPoint,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const selected = source(sourceValue);
  const delta = point(deltaValue, "Connector body delta");
  const roots = normalizeShapeDrawingForest(forest);
  const node = sourceNode(index(roots), selected);
  const original = ready(resolveSheetShapeConnections(roots, metrics).getConnector(node.id)!);
  const old = tips(original);
  if (delta.x === 0 && delta.y === 0) return roots;
  const translated = (position: ShapeConnectorPoint) =>
    point({ x: position.x + delta.x, y: position.y + delta.y }, "Translated connector endpoint");
  const expected = { begin: translated(old.begin), end: translated(old.end) };
  const relation: ShapeConnector = {
    kind: "shape-connector-v1",
    begin: freeEndpoint(node, original, expected.begin),
    end: freeEndpoint(node, original, expected.end),
  };
  return finish(roots, node, relation, expected, original, metrics);
}
