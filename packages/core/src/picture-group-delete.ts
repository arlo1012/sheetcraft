import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  anchorPictureFrameRect,
  pictureFrameFromLegacy,
  pictureFrameLocalToWorld,
  pictureFrameWorldToLocal,
  resolvePictureFrame,
  resolvePictureLayout,
  type PictureFrameAnchor,
  type ResolvedPictureLayout,
} from "./picture-frame.js";
import {
  isPictureGroup,
  MAX_PICTURE_GROUP_DEPTH,
  MAX_PICTURE_GROUP_NODES,
  type PictureGroup,
  type PictureGroupChild,
  type PictureGroupPath,
} from "./picture-group.js";
import {
  placePictureGroupChild,
  resolvePictureGroup,
  unionPictureGroupLayoutRects,
  type ResolvedPictureGroup,
  type ResolvedPictureGroupChild,
} from "./picture-group-layout.js";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type PictureObject,
  type StandalonePictureObject,
} from "./picture-object.js";
import { MAX_FLOATING_IMAGE_SIZE, MIN_FLOATING_IMAGE_SIZE } from "./workbook.js";

type PlannedChild = {
  node: PictureGroupChild;
  layout: ResolvedPictureLayout;
  changed: boolean;
};
type PlannedOwner = {
  members: PlannedChild[];
  layout: ResolvedPictureLayout;
  changed: boolean;
};

/** Standalone validators predate owned trees; reject executable fields before using them. */
function dataRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor))
      throw new TypeError(`${name} must contain data fields, not accessors or symbols.`);
    result[key] = descriptor.value;
  }
  return result;
}
function preflightStandalone(value: PictureObject): void {
  if (isPictureGroup(value)) return;
  const fields = dataRecord(value, "standalone picture");
  if (fields.anchor !== undefined) dataRecord(fields.anchor, "standalone picture anchor");
  if (fields.transform === undefined || fields.transform === null) return;
  const transform = dataRecord(fields.transform, "standalone picture transform");
  if (transform.crop !== undefined) dataRecord(transform.crop, "standalone picture crop");
  if (transform.appearance !== undefined) {
    const appearance = dataRecord(transform.appearance, "standalone picture appearance");
    if (appearance.border !== undefined) dataRecord(appearance.border, "standalone picture border");
  }
  if (transform.annotations !== undefined) {
    const annotations = readPictureDataArray(
      transform.annotations as readonly unknown[],
      "standalone picture annotations",
      100,
    );
    for (const annotationValue of annotations) {
      const annotation = dataRecord(annotationValue, "standalone picture annotation");
      const points = readPictureDataArray(
        annotation.points as readonly unknown[],
        "standalone picture annotation points",
        1024,
      );
      for (const point of points) dataRecord(point, "standalone picture annotation point");
    }
  }
}
function readPath(value: PictureGroupPath): string[] {
  const path = readPictureDataArray(value, "picture deletion path", MAX_PICTURE_GROUP_DEPTH + 1);
  if (path.length === 0 || path.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Picture deletion paths require non-empty IDs.");
  return path;
}
function samePath(left: PictureGroupPath, right: PictureGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function standaloneLayout(value: StandalonePictureObject, metrics: PictureSheetMetrics) {
  return resolvePictureFrame(
    isFramedPictureObject(value) ? value.frame : pictureFrameFromLegacy(value, metrics),
    metrics,
  );
}
function metadata(node: PictureGroup | PictureGroupChild) {
  return {
    id: node.id,
    altText: node.altText,
    ...(node.hidden === undefined ? {} : { hidden: node.hidden }),
    ...(node.lockAspectRatio === undefined ? {} : { lockAspectRatio: node.lockAspectRatio }),
  };
}
function inheritHidden(child: PlannedChild, hidden: boolean | undefined): PlannedChild {
  return hidden ? { ...child, node: { ...child.node, hidden: true }, changed: true } : child;
}
function placeChild(child: PlannedChild, parent: ResolvedPictureLayout): PictureGroupChild {
  const placed = placePictureGroupChild(parent, child.layout);
  if (placed.status !== "placed")
    throw new RangeError("Expand a collapsed group before deleting an owned child.");
  return child.node.kind === "grouped-picture-v1"
    ? { ...child.node, frame: { ...child.node.frame, ...placed.frame } }
    : { ...child.node, frame: { ...child.node.frame, ...placed.frame } };
}

/**
 * Contract a surviving owner's layout in its own unrotated axes. Relative child
 * angles do not enlarge this union: this model owns orthogonal layout dimensions,
 * not an affine visual-bounds matrix. Existing owner rotation is retained.
 */
function contractOwner(
  owner: ResolvedPictureLayout,
  children: readonly PlannedChild[],
): ResolvedPictureLayout {
  const localRects = children.map(({ layout }) => {
    const center = pictureFrameWorldToLocal(owner.rect, owner.angleDeg, {
      x: layout.rect.x + layout.rect.width / 2,
      y: layout.rect.y + layout.rect.height / 2,
    });
    return {
      x: center.x - layout.rect.width / 2,
      y: center.y - layout.rect.height / 2,
      width: layout.rect.width,
      height: layout.rect.height,
    };
  });
  const union = unionPictureGroupLayoutRects(localRects);
  const center = pictureFrameLocalToWorld(owner.rect, owner.angleDeg, {
    x: union.x + union.width / 2,
    y: union.y + union.height / 2,
  });
  return resolvePictureLayout(
    {
      x: center.x - union.width / 2,
      y: center.y - union.height / 2,
      width: union.width,
      height: union.height,
    },
    owner.angleDeg,
  );
}
function retainedAnchor(
  original: PictureFrameAnchor,
  layout: ResolvedPictureLayout,
  metrics: PictureSheetMetrics,
): PictureFrameAnchor {
  const { width, height } = layout.rect;
  const mode =
    original.mode !== "move-and-size" &&
    (width < MIN_FLOATING_IMAGE_SIZE ||
      height < MIN_FLOATING_IMAGE_SIZE ||
      width > MAX_FLOATING_IMAGE_SIZE ||
      height > MAX_FLOATING_IMAGE_SIZE)
      ? "move-and-size"
      : original.mode;
  return anchorPictureFrameRect(mode, layout.rect, metrics, original);
}
function releaseRoot(child: PlannedChild, metrics: PictureSheetMetrics): PictureObject {
  const anchor = anchorPictureFrameRect("move-and-size", child.layout.rect, metrics);
  const common = metadata(child.node);
  if (child.node.kind === "grouped-group-v1")
    return {
      ...common,
      kind: "picture-group-v1",
      frame: { kind: "group-frame-v1", anchor, angleDeg: child.layout.angleDeg },
      members: child.node.members,
    };
  return {
    ...common,
    assetId: child.node.assetId,
    frame: {
      kind: "object-frame-v1",
      anchor,
      angleDeg: child.layout.angleDeg,
      source: { ...child.node.frame.source },
      ...(child.node.frame.flipHorizontal === undefined
        ? {}
        : { flipHorizontal: child.node.frame.flipHorizontal }),
      ...(child.node.frame.flipVertical === undefined
        ? {}
        : { flipVertical: child.node.frame.flipVertical }),
    },
    ...(child.node.transform ? { transform: child.node.transform } : {}),
  };
}

/**
 * Pure Delete planning for exact root/owner/target paths. Validate every path
 * before ancestor pruning, then remove empty owners and dissolve affected
 * singleton owners into their actual surviving leaf or subgroup. Unaffected
 * singleton groups and legacy flat group IDs retain their existing semantics.
 *
 * Both complete forests are normalized, bounded and geometry-checked (including
 * hidden descendants) before returning detached bottom-to-top roots. A collapsed
 * root may be deleted outright; editing its owned descendants is refused.
 * Empty nested removal and rotated-owner contraction are deliberate product
 * policies beyond the observed WPS Delete cases. This is not a Cut contract.
 */
export function planDeletePictureGroupNodes(
  values: readonly PictureObject[],
  selectedPaths: readonly PictureGroupPath[],
  metrics: PictureSheetMetrics,
): PictureObject[] {
  const original = readPictureDataArray(values, "picture deletion roots", MAX_PICTURE_GROUP_NODES);
  for (const root of original) preflightStandalone(root);
  const roots = normalizePictureObjectCollection(original);
  const groups = new Map<string, ResolvedPictureGroup>();
  const pathsById = new Map<string, PictureGroupPath>();
  function collect(resolved: ResolvedPictureGroup | ResolvedPictureGroupChild): void {
    pathsById.set(resolved.node.id, resolved.path);
    if ("members" in resolved) for (const child of resolved.members) collect(child);
  }
  for (const root of roots) {
    if (isPictureGroup(root)) {
      const resolved = resolvePictureGroup(root, metrics);
      groups.set(root.id, resolved);
      collect(resolved);
    } else {
      standaloneLayout(root, metrics);
      pathsById.set(root.id, [root.id]);
    }
  }
  const paths = readPictureDataArray(
    selectedPaths,
    "picture deletion selection",
    MAX_PICTURE_GROUP_NODES,
  ).map(readPath);
  for (const path of paths)
    if (!samePath(pathsById.get(path.at(-1)!) ?? [], path))
      throw new TypeError("Picture deletion target is missing or reparented.");
  const selectedIds = new Set(paths.map((path) => path.at(-1)!));
  const deletedIds = new Set(
    paths
      .filter((path) => !path.slice(0, -1).some((id) => selectedIds.has(id)))
      .map((path) => path.at(-1)!),
  );
  const editedRootIds = new Set(paths.filter((path) => path.length > 1).map((path) => path[0]!));

  function planOwner(
    resolved: ResolvedPictureGroup | Extract<ResolvedPictureGroupChild, { members: unknown }>,
  ): PlannedOwner {
    const members: PlannedChild[] = [];
    let changed = false;
    for (const child of resolved.members) {
      const next = planChild(child);
      if (!next) changed = true;
      else {
        members.push(next);
        changed ||= next.changed;
      }
    }
    if (!resolved.layout || resolved.layout.collapsed)
      throw new RangeError("Expand a collapsed group before deleting an owned child.");
    return {
      members,
      changed,
      layout:
        changed && members.length > 1 ? contractOwner(resolved.layout, members) : resolved.layout,
    };
  }
  function planChild(resolved: ResolvedPictureGroupChild): PlannedChild | null {
    if (deletedIds.has(resolved.node.id)) return null;
    if (!resolved.layout)
      throw new RangeError("Expand a collapsed group before deleting an owned child.");
    if (!("members" in resolved))
      return { node: resolved.node, layout: resolved.layout, changed: false };
    const owner = planOwner(resolved);
    if (!owner.changed) return { node: resolved.node, layout: resolved.layout, changed: false };
    if (owner.members.length === 0) return null;
    if (owner.members.length === 1)
      return { ...inheritHidden(owner.members[0]!, resolved.node.hidden), changed: true };
    return {
      node: {
        ...resolved.node,
        members: owner.members.map((child) => placeChild(child, owner.layout)),
      },
      layout: owner.layout,
      changed: true,
    };
  }

  const next: PictureObject[] = [];
  for (const root of roots) {
    if (deletedIds.has(root.id)) continue;
    const resolved = groups.get(root.id);
    // Do not inspect/reframe an unrelated collapsed tree, including a no-op selection.
    if (!resolved || !editedRootIds.has(root.id)) {
      next.push(root);
      continue;
    }
    const owner = planOwner(resolved);
    if (owner.members.length === 0) continue;
    if (owner.members.length === 1) {
      next.push(releaseRoot(inheritHidden(owner.members[0]!, resolved.node.hidden), metrics));
      continue;
    }
    next.push({
      ...resolved.node,
      frame: {
        ...resolved.node.frame,
        anchor: retainedAnchor(resolved.node.frame.anchor, owner.layout, metrics),
      },
      members: owner.members.map((child) => placeChild(child, owner.layout)),
    });
  }
  const result = normalizePictureObjectCollection(next);
  for (const root of result)
    if (isPictureGroup(root)) resolvePictureGroup(root, metrics);
    else standaloneLayout(root, metrics);
  return result;
}
