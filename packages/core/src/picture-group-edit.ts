import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  normalizePictureSourceFrame,
  resolvePictureLayout,
  type PictureSourceFrame,
} from "./picture-frame.js";
import {
  findPictureGroupNode,
  MAX_PICTURE_GROUP_DEPTH,
  MAX_PICTURE_GROUP_NODES,
  normalizePictureGroup,
  normalizePictureGroupChild,
  traversePictureGroup,
  type PictureGroup,
  type PictureGroupChild,
  type PictureGroupNode,
  type PictureGroupPath,
} from "./picture-group.js";
import {
  placePictureGroupChild,
  resolvePictureGroup,
  type PictureGroupParentLayout,
  type ResolvedPictureGroupNode,
} from "./picture-group-layout.js";

export type PictureGroupLeafSourceLease = {
  readonly path: PictureGroupPath;
  readonly assetId: string;
  readonly source: Readonly<PictureSourceFrame>;
};
/** Containers own paths and source leases, never an asset of their own. */
export type PictureGroupNodeLease =
  | (PictureGroupLeafSourceLease & { readonly kind: "grouped-picture-v1" })
  | {
      readonly kind: "picture-group-v1" | "grouped-group-v1";
      readonly path: PictureGroupPath;
      /** Ordered leaf paths also identify every intermediate owner and sibling order. */
      readonly sources: readonly PictureGroupLeafSourceLease[];
    };
export type PictureGroupChildMetadataEdit = {
  altText?: string;
  hidden?: boolean;
  lockAspectRatio?: boolean;
};
export type PictureGroupChildWorldEditOptions = {
  metadata?: PictureGroupChildMetadataEdit;
  /**
   * Same target kind/ID. A leaf replacement may change its source and appearance
   * after the old lease is checked. Container replacements retain ownership and
   * every descendant source; a separate command must change membership.
   */
  replacement?: PictureGroupChild;
};

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in descriptor))
      throw new TypeError(`Unknown or non-data ${name} field.`);
    result[key] = descriptor.value;
  }
  return result;
}
function readPath(value: PictureGroupPath): string[] {
  const path = readPictureDataArray(value, "picture group path", MAX_PICTURE_GROUP_DEPTH + 1);
  if (path.length === 0 || path.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Picture group paths require non-empty IDs.");
  return path;
}
function samePath(left: PictureGroupPath, right: PictureGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function isAncestorPath(left: PictureGroupPath, right: PictureGroupPath): boolean {
  return left.length < right.length && left.every((id, index) => id === right[index]);
}
function sourceLease(node: PictureGroupNode, path: PictureGroupPath): PictureGroupNodeLease {
  if (node.kind === "grouped-picture-v1")
    return {
      kind: node.kind,
      path: [...path],
      assetId: node.assetId,
      source: { ...node.frame.source },
    };
  const sources: PictureGroupLeafSourceLease[] = [];
  function collect(owner: PictureGroupNode, ownerPath: PictureGroupPath): void {
    if (owner.kind === "grouped-picture-v1") {
      sources.push({
        path: [...ownerPath],
        assetId: owner.assetId,
        source: { ...owner.frame.source },
      });
      return;
    }
    for (const member of owner.members) collect(member, [...ownerPath, member.id]);
  }
  collect(node, path);
  return { kind: node.kind, path: [...path], sources };
}
function readLeafLease(value: unknown): PictureGroupLeafSourceLease {
  const fields = record(value, ["path", "assetId", "source"], "picture leaf source lease");
  if (typeof fields.assetId !== "string" || !fields.assetId.trim())
    throw new TypeError("A picture leaf source lease requires its actual asset ID.");
  return {
    path: readPath(fields.path as PictureGroupPath),
    assetId: fields.assetId,
    source: normalizePictureSourceFrame(fields.source as PictureSourceFrame),
  };
}
function readLease(value: PictureGroupNodeLease): PictureGroupNodeLease {
  const fields = record(
    value,
    ["kind", "path", "assetId", "source", "sources"],
    "picture node lease",
  );
  const path = readPath(fields.path as PictureGroupPath);
  if (fields.kind === "grouped-picture-v1") {
    if (Object.hasOwn(fields, "sources")) throw new TypeError("A leaf cannot lease members.");
    const leaf = readLeafLease({ path, assetId: fields.assetId, source: fields.source });
    return { kind: fields.kind, ...leaf };
  }
  if (fields.kind !== "picture-group-v1" && fields.kind !== "grouped-group-v1")
    throw new TypeError("Unknown picture node lease kind.");
  if (Object.hasOwn(fields, "assetId") || Object.hasOwn(fields, "source"))
    throw new TypeError("A picture container cannot lease a fake asset.");
  const sources = readPictureDataArray(
    fields.sources as readonly PictureGroupLeafSourceLease[],
    "picture container source leases",
    MAX_PICTURE_GROUP_NODES,
  ).map(readLeafLease);
  if (sources.length === 0 || sources.some((leaf) => !isAncestorPath(path, leaf.path)))
    throw new TypeError("Container source leases require owned descendant paths.");
  return { kind: fields.kind, path, sources };
}
function sameSource(
  left: PictureGroupLeafSourceLease,
  right: PictureGroupLeafSourceLease,
): boolean {
  return (
    samePath(left.path, right.path) &&
    left.assetId === right.assetId &&
    left.source.widthRatio === right.source.widthRatio &&
    left.source.heightRatio === right.source.heightRatio &&
    left.source.offsetXRatio === right.source.offsetXRatio &&
    left.source.offsetYRatio === right.source.offsetYRatio
  );
}
function sameLease(left: PictureGroupNodeLease, right: PictureGroupNodeLease): boolean {
  if (left.kind !== right.kind || !samePath(left.path, right.path)) return false;
  if (left.kind === "grouped-picture-v1")
    return right.kind === "grouped-picture-v1" && sameSource(left, right);
  if (right.kind === "grouped-picture-v1") return false;
  return (
    left.sources.length === right.sources.length &&
    left.sources.every((leaf, index) => sameSource(leaf, right.sources[index]!))
  );
}

/** Exact root/owner/target lookup; missing targets never become positional fallbacks. */
export function leasePictureGroupNode(
  value: PictureGroup,
  pathValue: PictureGroupPath,
): PictureGroupNodeLease {
  const root = normalizePictureGroup(value);
  const path = readPath(pathValue);
  const target = findPictureGroupNode(root, path);
  if (!target) throw new TypeError("Picture group lease target is missing or reparented.");
  return sourceLease(target.node, path);
}

/** Validate every selection first, then retain ancestor selections in input order. */
export function deduplicatePictureGroupPaths(
  value: PictureGroup,
  pathValues: readonly PictureGroupPath[],
): PictureGroupPath[] {
  const root = normalizePictureGroup(value);
  const paths = readPictureDataArray(
    pathValues,
    "picture group selection",
    MAX_PICTURE_GROUP_NODES,
  ).map(readPath);
  const visits = new Map(traversePictureGroup(root).map((visit) => [visit.node.id, visit]));
  for (const path of paths)
    if (!samePath(visits.get(path.at(-1)!)?.path ?? [], path))
      throw new TypeError("Picture group selection target is missing or reparented.");
  const selectedIds = new Set(paths.map((path) => path.at(-1)!));
  const retainedIds = new Set<string>();
  return paths.filter((path) => {
    const id = path.at(-1)!;
    if (retainedIds.has(id) || path.slice(0, -1).some((owner) => selectedIds.has(owner)))
      return false;
    retainedIds.add(id);
    return true;
  });
}

function findResolvedNode(
  root: ResolvedPictureGroupNode,
  path: PictureGroupPath,
): ResolvedPictureGroupNode | undefined {
  if (samePath(root.path, path)) return root;
  if (!("members" in root)) return undefined;
  for (const member of root.members) {
    const found = findResolvedNode(member, path);
    if (found) return found;
  }
  return undefined;
}
function applyMetadata(
  child: PictureGroupChild,
  value: PictureGroupChildMetadataEdit | undefined,
): PictureGroupChild {
  if (value === undefined) return child;
  const metadata = record(
    value,
    ["altText", "hidden", "lockAspectRatio"],
    "picture child metadata",
  );
  // Undefined means retain; clearing optional fields is explicit in a replacement.
  return {
    ...child,
    ...(metadata.altText === undefined ? {} : { altText: metadata.altText as string }),
    ...(metadata.hidden === undefined ? {} : { hidden: metadata.hidden as boolean }),
    ...(metadata.lockAspectRatio === undefined
      ? {}
      : { lockAspectRatio: metadata.lockAspectRatio as boolean }),
  };
}
function sameWorld(left: PictureGroupParentLayout, right: PictureGroupParentLayout): boolean {
  return (
    left.angleDeg === right.angleDeg &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.rect.width === right.rect.width &&
    left.rect.height === right.rect.height
  );
}

/**
 * Pure owned-child edit. Resolve the immediate owner's orthogonal geometry, not
 * an affine ancestor matrix. Validate both complete trees, including hidden
 * members, before returning a detached root; never edit a collapsed owner.
 */
export function applyPictureGroupChildWorldEdit(
  value: PictureGroup,
  leaseValue: PictureGroupNodeLease,
  worldValue: PictureGroupParentLayout,
  metrics: PictureSheetMetrics,
  optionsValue: PictureGroupChildWorldEditOptions = {},
): PictureGroup {
  const resolved = resolvePictureGroup(value, metrics);
  const lease = readLease(leaseValue);
  const target = findResolvedNode(resolved, lease.path);
  if (!target || !sameLease(sourceLease(target.node, target.path), lease))
    throw new TypeError("Picture group edit lease is stale, missing or reparented.");
  if (target.node.kind === "picture-group-v1" || lease.path.length < 2)
    throw new TypeError("An owned-child edit requires an immediate group owner.");
  const parent = findResolvedNode(resolved, lease.path.slice(0, -1));
  if (!parent || !("members" in parent))
    throw new TypeError("Picture group edit requires its exact immediate owner.");
  if (!parent.layout || parent.layout.collapsed || !target.layout)
    throw new RangeError("Expand a collapsed group before editing an owned child.");
  const options = record(optionsValue, ["metadata", "replacement"], "picture child edit options");
  let replacement = target.node;
  if (options.replacement !== undefined) {
    replacement = normalizePictureGroupChild(options.replacement as PictureGroupChild);
    if (replacement.id !== target.node.id || replacement.kind !== target.node.kind)
      throw new TypeError("A picture child replacement must retain its kind and ID.");
    if (
      replacement.kind === "grouped-group-v1" &&
      !sameLease(sourceLease(replacement, target.path), lease)
    )
      throw new TypeError("A container replacement must retain ownership and descendant sources.");
  }
  replacement = applyMetadata(
    replacement,
    options.metadata as PictureGroupChildMetadataEdit | undefined,
  );
  const world = resolvePictureLayout(worldValue.rect, worldValue.angleDeg);
  const placement = placePictureGroupChild(parent.layout, world);
  if (placement.status !== "placed")
    throw new RangeError("Expand a collapsed group before editing an owned child.");
  // Avoid inverse-rounding noise when a caller submits the already-resolved frame.
  const local = sameWorld(target.layout, world) ? target.node.frame : placement.frame;
  const nextChild = normalizePictureGroupChild(
    replacement.kind === "grouped-picture-v1"
      ? {
          ...replacement,
          frame: { ...replacement.frame, rect: { ...local.rect }, angleDeg: local.angleDeg },
        }
      : {
          ...replacement,
          frame: { ...replacement.frame, rect: { ...local.rect }, angleDeg: local.angleDeg },
        },
  );
  const root = resolved.node;
  const owner = findPictureGroupNode(root, parent.path)?.node;
  if (!owner || owner.kind === "grouped-picture-v1")
    throw new TypeError("Picture group edit requires its exact immediate owner.");
  const index = owner.members.findIndex((member) => member.id === target.node.id);
  if (index < 0) throw new TypeError("Picture group edit target is missing from its owner.");
  owner.members[index] = nextChild;
  return resolvePictureGroup(root, metrics).node;
}
