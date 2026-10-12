import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  resolveSheetShapeConnections,
  SHAPE_CONNECTOR_LAYOUT_LIMITS,
  type ResolvedShapeConnectorEndpoint,
} from "./shape-connector-layout.js";
import { normalizeShapeConnector, type ShapeConnector } from "./shape-connector.js";
import { shapeFrameWorldToLocal } from "./shape-frame.js";
import { normalizeShapeDrawingForest } from "./shape-group-planning.js";
import type { ShapeGroupChild } from "./shape-group.js";
import type { SheetDrawing } from "./sheet-drawings.js";

export type MaterializeShapeConnectorOptions = {
  /** Omission selects all live connectors; an empty array selects none. */
  connectorIds?: readonly string[];
};

type ConnectorForestNode = SheetDrawing | ShapeGroupChild;
type EndName = "begin" | "end";
type ReadyEndpoint = Extract<ResolvedShapeConnectorEndpoint, { status: "ready" }>;
type ExpectedEndpoint = {
  connectorId: string;
  endName: EndName;
  position: ReadyEndpoint["position"];
  scale: number;
};

function optionsRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid shape connector materialization options.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Shape connector materialization options must be an ordinary data record.");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (key !== "connectorIds" || !("value" in descriptor))
      throw new TypeError(
        "Shape connector materialization options require supported own data fields.",
      );
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function ids(value: readonly string[], name: string): Set<string> {
  const entries = readPictureDataArray(value, name, SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes);
  const result = new Set<string>();
  let characters = 0;
  for (const id of entries) {
    if (typeof id !== "string" || !id.trim())
      throw new TypeError(`${name} must contain non-empty IDs.`);
    if (id.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.identityLength)
      throw new RangeError(`${name} ID length budget exceeded.`);
    characters += id.length;
    if (characters > SHAPE_CONNECTOR_LAYOUT_LIMITS.identityCharacters)
      throw new RangeError(`${name} aggregate identity-character budget exceeded.`);
    if (result.has(id)) throw new TypeError(`Duplicate ${name} ID: ${id}.`);
    result.add(id);
  }
  return result;
}

function nodes(forest: readonly SheetDrawing[]): Map<string, ConnectorForestNode> {
  const result = new Map<string, ConnectorForestNode>();
  function visit(node: ConnectorForestNode): void {
    result.set(node.id, node);
    if (node.kind === "shapeGroup") for (const child of node.members) visit(child);
  }
  for (const root of forest) visit(root);
  return result;
}

/**
 * Capture selected site endpoints before their targets disappear or leave a copy
 * closure. Only endpoint state changes: carrier placement, source geometry,
 * appearance, identities and ownership order stay intact. The returned forest
 * is detached; missing IDs, unavailable chosen sites and unrepresentable inverse
 * placement reject the whole plan without changing caller data.
 */
export function materializeShapeConnectorTargets(
  forest: readonly SheetDrawing[],
  targetIds: readonly string[],
  metrics: PictureSheetMetrics,
  options: MaterializeShapeConnectorOptions = {},
): SheetDrawing[] {
  const targets = ids(targetIds, "connector materialization targets");
  const fields = optionsRecord(options);
  const selected =
    fields.connectorIds === undefined
      ? undefined
      : ids(fields.connectorIds as readonly string[], "connector materialization selection");
  const roots = normalizeShapeDrawingForest(forest);
  const sourceNodes = nodes(roots);
  for (const id of targets)
    if (!sourceNodes.has(id))
      throw new TypeError(`Connector materialization target ${id} is missing.`);
  if (selected)
    for (const id of selected) {
      const node = sourceNodes.get(id);
      if (!node || node.kind !== "shape" || !node.shapeConnector)
        throw new TypeError(
          `Connector materialization selection ${id} is not a current live connector.`,
        );
    }
  const affected = [...sourceNodes.values()].filter(
    (node) =>
      node.kind === "shape" &&
      node.shapeConnector &&
      (!selected || selected.has(node.id)) &&
      [node.shapeConnector.begin, node.shapeConnector.end].some(
        (endpoint) => endpoint.kind === "site" && targets.has(endpoint.targetId),
      ),
  );
  if (!affected.length) return roots;
  const context = resolveSheetShapeConnections(roots, metrics);
  const replacements = new Map<string, ShapeConnector>();
  const expected: ExpectedEndpoint[] = [];
  for (const node of affected) {
    if (node.kind !== "shape" || !node.shapeConnector) continue;
    const resolved = context.getConnector(node.id)!;
    let next = node.shapeConnector;
    for (const endName of ["begin", "end"] as const) {
      const source = node.shapeConnector[endName];
      if (source.kind !== "site" || !targets.has(source.targetId)) continue;
      const endpoint = resolved[endName];
      const carrier = resolved.carrierLayout;
      if (
        endpoint.status !== "ready" ||
        !carrier ||
        carrier.collapsed ||
        carrier.rect.width <= 0 ||
        carrier.rect.height <= 0
      )
        throw new RangeError(
          `Connector ${node.id} ${endName} cannot materialize an unavailable endpoint or collapsed carrier.`,
        );
      const local = shapeFrameWorldToLocal(carrier.rect, carrier.angleDeg, endpoint.position);
      const x = node.shapeFlipX ? carrier.rect.width - local.x : local.x;
      const y = node.shapeFlipY ? carrier.rect.height - local.y : local.y;
      next = normalizeShapeConnector({
        ...next,
        [endName]: {
          kind: "free",
          xRatio: x / carrier.rect.width,
          yRatio: y / carrier.rect.height,
        },
      });
      expected.push({
        connectorId: node.id,
        endName,
        position: endpoint.position,
        scale: Math.max(
          1,
          Math.abs(endpoint.position.x),
          Math.abs(endpoint.position.y),
          Math.abs(carrier.rect.x),
          Math.abs(carrier.rect.y),
          carrier.rect.width,
          carrier.rect.height,
          Math.abs(local.x),
          Math.abs(local.y),
        ),
      });
    }
    if (next !== node.shapeConnector) replacements.set(node.id, next);
  }
  if (!replacements.size) return roots;
  for (const [id, replacement] of replacements) {
    const node = sourceNodes.get(id)!;
    if (node.kind !== "shape") throw new TypeError("Connector materialization source changed.");
    node.shapeConnector = replacement;
  }
  const result = normalizeShapeDrawingForest(roots);
  const after = resolveSheetShapeConnections(result, metrics);
  for (const value of expected) {
    const endpoint = after.getConnector(value.connectorId)![value.endName];
    // Round-trip tolerance is bounded by floating-point precision, not pixels
    // or a guessed fallback. Ratio/local/world budgets are checked by Core.
    const tolerance = Number.EPSILON * 32 * value.scale;
    if (
      endpoint.status !== "ready" ||
      endpoint.kind !== "free" ||
      Math.abs(endpoint.position.x - value.position.x) > tolerance ||
      Math.abs(endpoint.position.y - value.position.y) > tolerance
    )
      throw new RangeError(
        `Connector ${value.connectorId} ${value.endName} cannot represent its materialized worksheet point.`,
      );
  }
  return result;
}
