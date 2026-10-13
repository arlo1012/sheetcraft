import type { ShapeConnectionSiteIdentity } from "@sheetcraft/core/shape-connection-sites";
import {
  SHAPE_CONNECTOR_LAYOUT_LIMITS,
  type ResolvedSheetShapeConnections,
} from "@sheetcraft/core/shape-connector-layout";
import {
  SHAPE_CONNECTOR_ROUTE_LIMITS,
  type ShapeConnectorPoint,
} from "@sheetcraft/core/shape-connector-route";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import type { ShapePresetName } from "@sheetcraft/core/shape-presets";

export type ShapeConnectorSiteCandidate = Readonly<{
  targetId: string;
  preset: ShapePresetName;
  siteIndex: number;
  identity: ShapeConnectionSiteIdentity;
  /** Exact Core-projected worksheet coordinates and outward world direction. */
  position: ShapeConnectorPoint;
  direction: ShapeConnectorPoint;
  rootId: string;
  path: ShapeGroupPath;
  distance: number;
}>;

type RankedCandidate = Readonly<{ candidate: ShapeConnectorSiteCandidate; targetOrder: number }>;
// Core's public connector endpoint admission accepts site indices 0–15.
// Keep the full legal forest available rather than limiting it to one route's points.
const MAX_TARGET_SITES = 16;
const MAX_SITE_WORK = SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes * MAX_TARGET_SITES;

function queryPoint(value: ShapeConnectorPoint): ShapeConnectorPoint {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Connector site picking requires an ordinary world point.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Connector site picking requires an ordinary world point.");
  for (const key of Reflect.ownKeys(value))
    if ((key !== "x" && key !== "y") || !("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError("Connector site picking requires own coordinate data.");
  const x: unknown = Object.getOwnPropertyDescriptor(value, "x")?.value;
  const y: unknown = Object.getOwnPropertyDescriptor(value, "y")?.value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    ![x, y].every(
      (coordinate) =>
        Number.isFinite(coordinate) &&
        Math.abs(coordinate) <= SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate,
    )
  )
    throw new RangeError("Connector site picking exceeds its world-coordinate budget.");
  return { x, y };
}

function compare(left: RankedCandidate, right: RankedCandidate): number {
  return (
    left.candidate.distance - right.candidate.distance ||
    right.targetOrder - left.targetOrder ||
    left.candidate.siteIndex - right.candidate.siteIndex
  );
}

function visitCandidates(
  context: ResolvedSheetShapeConnections,
  pointValue: ShapeConnectorPoint,
  worldTolerance: number,
  visit: (value: RankedCandidate) => void,
): void {
  const point = queryPoint(pointValue);
  if (
    typeof worldTolerance !== "number" ||
    !Number.isFinite(worldTolerance) ||
    worldTolerance < 0 ||
    worldTolerance > SHAPE_CONNECTOR_ROUTE_LIMITS.coordinate
  )
    throw new RangeError("Connector site tolerance must be finite within its world-radius budget.");
  if (!context || !Array.isArray(context.nodes) || !Array.isArray(context.targets))
    throw new TypeError("Connector site picking requires a full Core connection context.");
  if (
    context.nodes.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes ||
    context.targets.length > context.nodes.length
  )
    throw new RangeError("Connector site picking exceeds its forest-node budget.");
  let siteWork = 0;
  // Core targets retain depth-first, bottom-to-top forest order. Thus a later
  // target also respects later-painted owners, including nested sibling groups.
  for (let targetOrder = 0; targetOrder < context.targets.length; targetOrder++) {
    const target = context.targets[targetOrder]!;
    if (
      target.path.length > SHAPE_CONNECTOR_LAYOUT_LIMITS.depth + 1 ||
      target.sites.length > MAX_TARGET_SITES ||
      (siteWork += target.sites.length) > MAX_SITE_WORK
    )
      throw new RangeError("Connector site picking exceeds its target-site work budget.");
    if (target.status !== "ready") continue;
    for (const site of target.sites) {
      const distance = Math.hypot(site.position.x - point.x, site.position.y - point.y);
      if (distance > worldTolerance) continue;
      visit({
        targetOrder,
        candidate: Object.freeze({
          targetId: target.nodeId,
          preset: site.identity.preset,
          siteIndex: site.identity.index,
          identity: site.identity,
          position: site.position,
          direction: site.direction,
          rootId: target.rootId,
          path: target.path,
          distance,
        }),
      });
    }
  }
}

/**
 * Pick only actual ready preset sites from an authoritative full-forest Core
 * resolution. The caller supplies world tolerance after any viewport conversion.
 * No target lock filtering: connecting does not edit a target. These candidates
 * confer no permission to edit, create or bind a connector.
 */
export function getShapeConnectorSiteCandidates(
  context: ResolvedSheetShapeConnections,
  worldPoint: ShapeConnectorPoint,
  worldTolerance: number,
): readonly ShapeConnectorSiteCandidate[] {
  const ranked: RankedCandidate[] = [];
  visitCandidates(context, worldPoint, worldTolerance, (candidate) => ranked.push(candidate));
  ranked.sort(compare);
  return Object.freeze(ranked.map(({ candidate }) => candidate));
}

/** Same exact distance/paint-order/site-order rule, with linear bounded work. */
export function pickNearestShapeConnectorSite(
  context: ResolvedSheetShapeConnections,
  worldPoint: ShapeConnectorPoint,
  worldTolerance: number,
): ShapeConnectorSiteCandidate | undefined {
  let nearest: RankedCandidate | undefined;
  visitCandidates(context, worldPoint, worldTolerance, (candidate) => {
    if (!nearest || compare(candidate, nearest) < 0) nearest = candidate;
  });
  return nearest?.candidate;
}
