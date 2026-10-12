import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  projectShapePresetConnectionSites,
  SHAPE_CONNECTION_SITE_REVISION,
  type ProjectedShapeConnectionSite,
  type ShapeConnectionSiteIdentity,
} from "./shape-connection-sites.js";
import type { ShapeConnector, ShapeConnectorEndpoint } from "./shape-connector.js";
import {
  resolveShapeConnectorRoute,
  type ShapeConnectorPaintLayout,
  type ShapeConnectorPoint,
  type ShapeConnectorRoute,
} from "./shape-connector-route.js";
import { shapeFrameLocalToWorld, type ResolvedShapeFrame } from "./shape-frame.js";
import { resolveShapeGroup, type ResolvedShapeGroupChild } from "./shape-group-layout.js";
import {
  isShapeGroupEligibleRoot,
  normalizeShapeDrawingForest,
  resolveShapeRootLayout,
} from "./shape-group-planning.js";
import {
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  type ShapeGroupChild,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "./shape-group.js";
import { isShapeLinePreset } from "./shape-line-ends.js";
import { SHAPE_PRESET_DEFINITIONS } from "./shape-presets/definitions.js";
import type { ShapePresetName } from "./shape-presets/catalog.js";
import type { ShapePresetParameters } from "./shape-presets/types.js";
import type {
  SheetDrawing,
  SheetFramedGraphicDrawing,
  SheetGraphicDrawing,
} from "./sheet-drawings.js";

/** Character limits count UTF-16 code units. No feature means legacy admission is unchanged. */
export const SHAPE_CONNECTOR_LAYOUT_LIMITS = Object.freeze({
  nodes: MAX_SHAPE_GROUP_NODES,
  depth: MAX_SHAPE_GROUP_DEPTH,
  identityLength: 512,
  identityCharacters: 1_000_000,
  // At most 8 MiB of UTF-16 content across all returned resolution strings.
  resolutionCharacters: 4_194_304,
});

type NodeSource = SheetDrawing | ShapeGroupChild;
type GraphicSource = SheetGraphicDrawing | SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing;
type IndexedSource = {
  node: NodeSource;
  rootId: string;
  path: ShapeGroupPath;
  parentPath: ShapeGroupPath | null;
};
export type ResolvedShapeConnectionNode = Readonly<{
  nodeId: string;
  rootId: string;
  kind: NodeSource["kind"];
  path: ShapeGroupPath;
  parentPath: ShapeGroupPath | null;
  /** Source carrier geometry only; connector body geometry is separate. */
  carrierLayout: ShapeConnectorPaintLayout | null;
}>;
export type ResolvedShapeConnectionTarget = Readonly<{
  nodeId: string;
  rootId: string;
  path: ShapeGroupPath;
  preset: ShapePresetName;
  status: "ready" | "collapsed";
  sites: readonly ProjectedShapeConnectionSite[];
}>;
export type ResolvedShapeConnectorEndpoint =
  | Readonly<{ status: "ready"; kind: "free"; position: ShapeConnectorPoint }>
  | Readonly<{
      status: "ready";
      kind: "site";
      targetId: string;
      identity: ShapeConnectionSiteIdentity;
      position: ShapeConnectorPoint;
      direction: ShapeConnectorPoint;
    }>
  | Readonly<{ status: "suspended"; kind: "free"; reason: "carrier-collapsed" }>
  | Readonly<{
      status: "suspended";
      kind: "site";
      reason: "target-collapsed";
      targetId: string;
      identity: ShapeConnectionSiteIdentity;
    }>;
type ConnectorIdentity = Readonly<{
  nodeId: string;
  rootId: string;
  path: ShapeGroupPath;
  carrierLayout: ShapeConnectorPaintLayout | null;
  begin: ResolvedShapeConnectorEndpoint;
  end: ResolvedShapeConnectorEndpoint;
}>;
export type ResolvedSheetShapeConnector = ConnectorIdentity &
  (
    | Readonly<{
        status: "ready" | "degenerate";
        route: ShapeConnectorRoute;
        resolutionKey: string;
      }>
    | Readonly<{
        status: "suspended";
        reason: "carrier-collapsed" | "endpoint-suspended";
        resolutionKey: string;
      }>
  );
export type ResolvedSheetShapeConnections = Readonly<{
  nodes: readonly ResolvedShapeConnectionNode[];
  targets: readonly ResolvedShapeConnectionTarget[];
  connectors: readonly ResolvedSheetShapeConnector[];
  /** Snapshot key includes numeric dependencies; it retains no workbook objects. */
  resolutionKey: string;
  getNode(nodeId: string): ResolvedShapeConnectionNode | undefined;
  getNodeAtPath(path: ShapeGroupPath): ResolvedShapeConnectionNode | undefined;
  getTarget(nodeId: string): ResolvedShapeConnectionTarget | undefined;
  getConnector(nodeId: string): ResolvedSheetShapeConnector | undefined;
  getConnectorsForTarget(nodeId: string): readonly ResolvedSheetShapeConnector[];
}>;

function graphic(node: NodeSource): GraphicSource | undefined {
  return node.kind === "shape" || node.kind === "textBox" ? (node as GraphicSource) : undefined;
}
function connector(node: NodeSource): ShapeConnector | undefined {
  return node.kind === "shape" ? graphic(node)?.shapeConnector : undefined;
}
function targetGeometry(node: NodeSource): ShapePresetParameters | undefined {
  const value = graphic(node);
  return value?.kind === "shape" &&
    value.shapeGeometry &&
    !value.shapePath &&
    !value.shapeConnector &&
    !isShapeLinePreset(value.shapeGeometry.preset)
    ? value.shapeGeometry
    : undefined;
}
/** Only traversal/relations: admission may call this after local normalization. */
function indexNormalizedForest(values: readonly SheetDrawing[]): Map<string, IndexedSource> {
  const roots = readPictureDataArray(values, "connector drawing forest", MAX_SHAPE_GROUP_NODES);
  const index = new Map<string, IndexedSource>();
  const seen = new WeakSet<object>();
  let identityCharacters = 0;
  const countIdentity = (value: string) => {
    identityCharacters += value.length;
    if (identityCharacters > SHAPE_CONNECTOR_LAYOUT_LIMITS.identityCharacters)
      throw new RangeError("Connector forest exceeds its aggregate identity-character budget.");
  };
  const visit = (
    node: NodeSource,
    rootId: string,
    parentPath: ShapeGroupPath | null,
    depth: number,
  ) => {
    if (depth > MAX_SHAPE_GROUP_DEPTH)
      throw new RangeError("Connector ownership depth budget exceeded.");
    if (!node || typeof node !== "object" || seen.has(node))
      throw new TypeError("Connector forest requires distinct, acyclic normalized drawing nodes.");
    seen.add(node);
    if (typeof node.id !== "string" || !node.id.trim())
      throw new TypeError("Connector forest requires non-empty node IDs.");
    if (node.id.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.identityLength)
      throw new RangeError("Connector forest node IDs must be at most 512 UTF-16 characters.");
    if (index.has(node.id)) throw new TypeError(`Duplicate connector forest node ID: ${node.id}.`);
    const path = [...(parentPath ?? []), node.id];
    for (const id of [node.id, rootId, ...path, ...(parentPath ?? [])]) countIdentity(id);
    const relation = connector(node);
    if (relation)
      for (const endpoint of [relation.begin, relation.end]) {
        if (endpoint.kind !== "site") continue;
        if (endpoint.targetId.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.identityLength)
          throw new RangeError(
            `Connector ${node.id} target IDs must be at most 512 UTF-16 characters.`,
          );
        countIdentity(endpoint.targetId);
      }
    index.set(node.id, { node, rootId, path, parentPath });
    if (index.size > MAX_SHAPE_GROUP_NODES)
      throw new RangeError("Connector forest node budget exceeded.");
    if (node.kind === "shapeGroup")
      for (const child of readPictureDataArray(
        node.members,
        "connector owner members",
        MAX_SHAPE_GROUP_NODES,
      ))
        visit(child, rootId, path, depth + 1);
  };
  for (const root of roots) visit(root, root.id, null, 0);
  return index;
}
function validateReferences(index: ReadonlyMap<string, IndexedSource>): void {
  for (const { node } of index.values()) {
    const relation = connector(node);
    if (!relation) continue;
    for (const endName of ["begin", "end"] as const) {
      const end = relation[endName];
      if (end.kind !== "site") continue;
      const label = `Connector ${node.id} ${endName} target ${end.targetId}`;
      const target = index.get(end.targetId);
      if (!target) throw new TypeError(`${label} is missing from the sheet drawing forest.`);
      const geometry = targetGeometry(target.node);
      if (!geometry)
        throw new TypeError(`${label} is not an eligible explicit standard non-line shape.`);
      if (geometry.preset !== end.preset)
        throw new TypeError(`${label} has a different preset (${geometry.preset}).`);
      if (
        !Number.isInteger(end.siteIndex) ||
        end.siteIndex < 0 ||
        end.siteIndex >= SHAPE_PRESET_DEFINITIONS[geometry.preset].connectionSites.length
      )
        throw new RangeError(`${label} has no ordered site ${end.siteIndex}.`);
    }
  }
}
/**
 * Validate references in an already locally normalized, complete sheet forest.
 * Never invokes a drawing normalizer: normalizeSheetDrawings/admission may call
 * it without recursive normalization or any worksheet/display metrics.
 */
export function validateShapeConnectorReferences(forest: readonly SheetDrawing[]): void {
  // Normal drawing admission historically has its own budgets. Build the
  // bounded relation index only when this new feature is actually present.
  const hasConnector = (node: NodeSource): boolean =>
    Boolean(connector(node)) || (node.kind === "shapeGroup" && node.members.some(hasConnector));
  if (forest.some(hasConnector)) validateReferences(indexNormalizedForest(forest));
}
function point(value: ShapeConnectorPoint): ShapeConnectorPoint {
  if (
    ![value.x, value.y].every((number) => Number.isFinite(number) && Math.abs(number) <= 10_000_000)
  )
    throw new RangeError("Shape connector endpoint exceeds its worksheet-coordinate budget.");
  return Object.freeze({ x: value.x === 0 ? 0 : value.x, y: value.y === 0 ? 0 : value.y });
}
function detachLayout(layout: ResolvedShapeFrame | null): ShapeConnectorPaintLayout | null {
  if (!layout) return null;
  const rect = (value: ResolvedShapeFrame["rect"]) => {
    if (!Object.values(value).every(Number.isFinite))
      throw new RangeError("Connector carrier layout must be finite.");
    return Object.freeze({ ...value });
  };
  return Object.freeze({
    rect: rect(layout.rect),
    angleDeg: layout.angleDeg,
    collapsed: layout.collapsed,
    corners: Object.freeze(
      layout.corners.map((value) => Object.freeze({ ...value })),
    ) as ShapeConnectorPaintLayout["corners"],
    bounds: rect(layout.bounds),
  });
}
function resolveEndpoint(
  endpoint: ShapeConnectorEndpoint,
  carrier: ShapeConnectorPaintLayout | null,
  source: GraphicSource,
  targets: ReadonlyMap<string, ResolvedShapeConnectionTarget>,
): ResolvedShapeConnectorEndpoint {
  if (endpoint.kind === "free") {
    if (!carrier || carrier.collapsed)
      return Object.freeze({ status: "suspended", kind: "free", reason: "carrier-collapsed" });
    const local = point({
      x: carrier.rect.width * endpoint.xRatio,
      y: carrier.rect.height * endpoint.yRatio,
    });
    const flipped = point({
      x: source.shapeFlipX ? carrier.rect.width - local.x : local.x,
      y: source.shapeFlipY ? carrier.rect.height - local.y : local.y,
    });
    return Object.freeze({
      status: "ready",
      kind: "free",
      position: point(shapeFrameLocalToWorld(carrier.rect, carrier.angleDeg, flipped)),
    });
  }
  const target = targets.get(endpoint.targetId)!;
  const identity: ShapeConnectionSiteIdentity = Object.freeze({
    revision: SHAPE_CONNECTION_SITE_REVISION,
    preset: endpoint.preset,
    index: endpoint.siteIndex,
  });
  if (target.status === "collapsed")
    return Object.freeze({
      status: "suspended",
      kind: "site",
      reason: "target-collapsed",
      targetId: endpoint.targetId,
      identity,
    });
  const site = target.sites[endpoint.siteIndex]!;
  return Object.freeze({
    status: "ready",
    kind: "site",
    targetId: endpoint.targetId,
    identity: site.identity,
    position: site.position,
    direction: site.direction,
  });
}

/** Resolve the whole sheet before returning any relation or derived route. */
export function resolveSheetShapeConnections(
  forest: readonly SheetDrawing[],
  metrics: PictureSheetMetrics,
): ResolvedSheetShapeConnections {
  const roots = normalizeShapeDrawingForest(forest);
  const index = indexNormalizedForest(roots);
  validateReferences(index);
  let remainingKeyCharacters = SHAPE_CONNECTOR_LAYOUT_LIMITS.resolutionCharacters;
  const resolutionKey = (value: unknown): string => {
    const serialized = JSON.stringify(value);
    if (serialized.length > remainingKeyCharacters)
      throw new RangeError("Connector context exceeds its shared resolution-character budget.");
    remainingKeyCharacters -= serialized.length;
    return serialized;
  };
  const targetLabels = new Map<string, string>();
  for (const { node } of index.values()) {
    const relation = connector(node);
    if (!relation) continue;
    for (const endName of ["begin", "end"] as const) {
      const endpoint = relation[endName];
      if (endpoint.kind === "site" && !targetLabels.has(endpoint.targetId))
        targetLabels.set(
          endpoint.targetId,
          `Connector ${node.id} ${endName} target ${endpoint.targetId}`,
        );
    }
  }
  const layouts = new Map<string, ResolvedShapeFrame | null>();
  const visitOwned = (child: ResolvedShapeGroupChild) => {
    layouts.set(child.node.id, child.layout);
    if ("members" in child) for (const member of child.members) visitOwned(member);
  };
  for (const root of roots) {
    if (root.kind === "shapeGroup") {
      const group = resolveShapeGroup(root, metrics);
      layouts.set(root.id, group.layout);
      for (const member of group.members) visitOwned(member);
    } else if (isShapeGroupEligibleRoot(root))
      layouts.set(root.id, resolveShapeRootLayout(root, metrics));
  }
  const nodes: ResolvedShapeConnectionNode[] = [];
  const nodeIndex = new Map<string, ResolvedShapeConnectionNode>();
  const targets: ResolvedShapeConnectionTarget[] = [];
  const targetIndex = new Map<string, ResolvedShapeConnectionTarget>();
  for (const entry of index.values()) {
    const node: ResolvedShapeConnectionNode = Object.freeze({
      nodeId: entry.node.id,
      rootId: entry.rootId,
      kind: entry.node.kind,
      path: Object.freeze([...entry.path]),
      parentPath: entry.parentPath ? Object.freeze([...entry.parentPath]) : null,
      carrierLayout: detachLayout(layouts.get(entry.node.id) ?? null),
    });
    nodes.push(node);
    nodeIndex.set(node.nodeId, node);
    const geometry = targetGeometry(entry.node);
    if (!geometry) continue;
    const carrier = node.carrierLayout;
    let projected: ReturnType<typeof projectShapePresetConnectionSites>;
    try {
      projected =
        carrier && !carrier.collapsed
          ? projectShapePresetConnectionSites(geometry, carrier.rect, carrier.angleDeg, {
              shapeFlipX: graphic(entry.node)!.shapeFlipX,
              shapeFlipY: graphic(entry.node)!.shapeFlipY,
            })
          : { status: "collapsed", sites: Object.freeze([]) as readonly [] };
    } catch (error) {
      throw new RangeError(
        `${targetLabels.get(node.nodeId) ?? `Target ${node.nodeId}`} sites failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const target: ResolvedShapeConnectionTarget = Object.freeze({
      nodeId: node.nodeId,
      rootId: node.rootId,
      path: node.path,
      preset: geometry.preset,
      status: projected.status,
      sites: projected.sites,
    });
    targets.push(target);
    targetIndex.set(target.nodeId, target);
  }
  const connectors: ResolvedSheetShapeConnector[] = [];
  const connectorIndex = new Map<string, ResolvedSheetShapeConnector>();
  const reverse = new Map<string, ResolvedSheetShapeConnector[]>();
  for (const entry of index.values()) {
    const relation = connector(entry.node);
    if (!relation) continue;
    const node = nodeIndex.get(entry.node.id)!;
    const source = graphic(entry.node)!;
    const namedEndpoint = (endName: "begin" | "end") => {
      const endpoint = relation[endName];
      try {
        return resolveEndpoint(endpoint, node.carrierLayout, source, targetIndex);
      } catch (error) {
        const targetLabel = endpoint.kind === "site" ? ` target ${endpoint.targetId}` : "";
        throw new RangeError(
          `Connector ${node.nodeId} ${endName}${targetLabel} endpoint failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const begin = namedEndpoint("begin");
    const end = namedEndpoint("end");
    const identity = {
      nodeId: node.nodeId,
      rootId: node.rootId,
      path: node.path,
      carrierLayout: node.carrierLayout,
      begin,
      end,
    };
    let resolved: ResolvedSheetShapeConnector;
    if (
      !node.carrierLayout ||
      node.carrierLayout.collapsed ||
      begin.status === "suspended" ||
      end.status === "suspended"
    ) {
      const reason =
        !node.carrierLayout || node.carrierLayout.collapsed
          ? "carrier-collapsed"
          : "endpoint-suspended";
      resolved = Object.freeze({
        ...identity,
        status: "suspended",
        reason,
        resolutionKey: resolutionKey({ ...identity, reason }),
      });
    } else {
      let route: ShapeConnectorRoute;
      try {
        route = resolveShapeConnectorRoute(
          source.shapeGeometry!,
          node.carrierLayout,
          begin.position,
          end.position,
        );
      } catch (error) {
        throw new RangeError(
          `Connector ${node.nodeId} route failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      resolved = Object.freeze({
        ...identity,
        status: route.status,
        route,
        resolutionKey: resolutionKey({ ...identity, route }),
      });
    }
    connectors.push(resolved);
    connectorIndex.set(resolved.nodeId, resolved);
    for (const targetId of new Set(
      [relation.begin, relation.end].flatMap((endpoint) =>
        endpoint.kind === "site" ? [endpoint.targetId] : [],
      ),
    )) {
      const dependent = reverse.get(targetId) ?? [];
      dependent.push(resolved);
      reverse.set(targetId, dependent);
    }
  }
  const frozenNodes = Object.freeze(nodes),
    frozenTargets = Object.freeze(targets),
    frozenConnectors = Object.freeze(connectors);
  const empty: readonly ResolvedSheetShapeConnector[] = Object.freeze([]);
  for (const dependents of reverse.values()) Object.freeze(dependents);
  return Object.freeze({
    nodes: frozenNodes,
    targets: frozenTargets,
    connectors: frozenConnectors,
    resolutionKey: resolutionKey({
      nodes: frozenNodes,
      targets: frozenTargets,
      connectors: frozenConnectors.map(({ resolutionKey: _key, ...numeric }) => numeric),
    }),
    getNode: (nodeId: string) => nodeIndex.get(nodeId),
    getNodeAtPath: (path: ShapeGroupPath) => {
      if (!path.length || path.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.depth + 1) return undefined;
      const node = nodeIndex.get(path[path.length - 1]!);
      return node &&
        node.path.length === path.length &&
        node.path.every((id, index) => id === path[index])
        ? node
        : undefined;
    },
    getTarget: (nodeId: string) => targetIndex.get(nodeId),
    getConnector: (nodeId: string) => connectorIndex.get(nodeId),
    getConnectorsForTarget: (nodeId: string) => reverse.get(nodeId) ?? empty,
  });
}
