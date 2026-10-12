import {
  getPictureOwnerBehavior,
  normalizePictureProperties,
  type PictureProperties,
} from "./picture-properties.js";
import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import {
  anchorPictureFrameRect,
  pictureFrameFromLegacy,
  resolvePictureFrame,
  resolvePictureLayout,
  type ResolvedPictureLayout,
} from "./picture-frame.js";
import {
  clonePictureGroupChild,
  isPictureGroup,
  normalizePictureGroup,
  type GroupedPicture,
  type PictureGroupChild,
} from "./picture-group.js";
import {
  placePictureGroupChild,
  resolvePictureGroup,
  resolvePictureGroupChildLayout,
  unionPictureGroupLayoutRects,
} from "./picture-group-layout.js";
import {
  isFramedPictureObject,
  normalizePictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
  type PictureObject,
  type StandalonePictureObject,
} from "./picture-object.js";

function metadata(image: PictureObject | PictureGroupChild) {
  return {
    id: image.id,
    altText: image.altText,
    ...normalizePictureProperties(image),
    ...(image.hidden === undefined ? {} : { hidden: image.hidden }),
    ...(image.lockAspectRatio === undefined ? {} : { lockAspectRatio: image.lockAspectRatio }),
  };
}
function standaloneFrame(image: StandalonePictureObject, metrics: PictureSheetMetrics) {
  return isFramedPictureObject(image) ? image.frame : pictureFrameFromLegacy(image, metrics);
}
function rootLayout(image: PictureObject, metrics: PictureSheetMetrics): ResolvedPictureLayout {
  return isPictureGroup(image)
    ? resolvePictureGroup(image, metrics).layout
    : resolvePictureFrame(standaloneFrame(image, metrics), metrics);
}
function toMember(
  image: PictureObject,
  parent: ResolvedPictureLayout,
  metrics: PictureSheetMetrics,
): PictureGroupChild {
  const world = rootLayout(image, metrics);
  const placed = placePictureGroupChild(parent, world);
  if (placed.status !== "placed") throw new RangeError("Cannot group into a collapsed owner.");
  if (isPictureGroup(image))
    return {
      ...metadata(image),
      kind: "grouped-group-v1",
      frame: { kind: "group-local-frame-v1", ...placed.frame },
      members: image.members.map(clonePictureGroupChild),
    };
  const frame = standaloneFrame(image, metrics);
  const transform = image.transform;
  const appearance = transform
    ? {
        ...(transform.appearance ? { appearance: transform.appearance } : {}),
        ...(transform.annotations ? { annotations: transform.annotations } : {}),
      }
    : undefined;
  return {
    ...metadata(image),
    kind: "grouped-picture-v1",
    assetId: image.assetId,
    frame: {
      kind: "group-member-frame-v1",
      ...placed.frame,
      source: { ...frame.source },
      ...(frame.cropShape ? { cropShape: frame.cropShape } : {}),
      ...(frame.flipHorizontal ? { flipHorizontal: true } : {}),
      ...(frame.flipVertical ? { flipVertical: true } : {}),
    },
    ...(appearance && Object.keys(appearance).length ? { transform: appearance } : {}),
  };
}

/**
 * Explicit root grouping, not multiselection or legacy groupId migration.
 * Noncontiguous roots are lifted to the highest selected stacking position;
 * their internal order and every unselected root's relative order are preserved.
 */
export function groupPictureRoots(
  values: readonly PictureObject[],
  selectedIds: readonly string[],
  identity: { id: string; altText: string },
  metrics: PictureSheetMetrics,
): PictureObject[] {
  const roots = normalizePictureObjectCollection(values);
  if (!Array.isArray(selectedIds) || selectedIds.length < 2)
    throw new RangeError("Grouping requires at least two root pictures.");
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length) throw new TypeError("Duplicate grouping targets.");
  const members = roots.filter((root) => selected.has(root.id));
  if (members.length !== selected.size)
    throw new TypeError("Grouping targets must be current roots.");
  const layouts = members.map((member) => rootLayout(member, metrics));
  const rect = unionPictureGroupLayoutRects(layouts.map((layout) => layout.rect));
  const parent = resolvePictureLayout(rect, 0);
  const group = normalizePictureGroup({
    kind: "picture-group-v1",
    id: identity.id,
    altText: identity.altText,
    lockAspectRatio: false,
    frame: {
      kind: "group-frame-v1",
      anchor: anchorPictureFrameRect("move-and-size", rect, metrics),
      angleDeg: 0,
    },
    members: members.map((member) => toMember(member, parent, metrics)),
  });
  let last = -1;
  roots.forEach((root, index) => {
    if (selected.has(root.id)) last = index;
  });
  const next = roots.flatMap((root, index) =>
    index === last ? [group] : selected.has(root.id) ? [] : [root],
  );
  const result = normalizePictureObjectCollection(next);
  // A representability failure in even a hidden descendant rejects the complete plan.
  resolvePictureGroup(group, metrics);
  return result;
}

function fromMember(
  member: PictureGroupChild,
  parent: ResolvedPictureLayout,
  inheritedHidden: boolean,
  ownerProperties: PictureProperties,
  metrics: PictureSheetMetrics,
): PictureObject {
  const world = resolvePictureGroupChildLayout(parent, member.frame);
  if (!world || world.collapsed)
    throw new RangeError("Expand a collapsed group before ungrouping.");
  const common = {
    ...metadata(member),
    ...getPictureOwnerBehavior(ownerProperties),
    ...(inheritedHidden ? { hidden: true } : {}),
  };
  const anchor = anchorPictureFrameRect("move-and-size", world.rect, metrics);
  if (member.kind === "grouped-group-v1")
    return normalizePictureGroup({
      ...common,
      kind: "picture-group-v1",
      frame: { kind: "group-frame-v1", anchor, angleDeg: world.angleDeg },
      members: member.members.map(clonePictureGroupChild),
    });
  const picture: FramedFloatingImage = {
    ...common,
    assetId: member.assetId,
    frame: {
      kind: "object-frame-v1",
      anchor,
      angleDeg: world.angleDeg,
      source: { ...member.frame.source },
      ...(member.frame.cropShape ? { cropShape: member.frame.cropShape } : {}),
      ...(member.frame.flipHorizontal ? { flipHorizontal: true } : {}),
      ...(member.frame.flipVertical ? { flipVertical: true } : {}),
    },
    ...(member.transform ? { transform: member.transform } : {}),
  };
  return normalizePictureObject(picture);
}

/** One level only: nested groups remain owned groups and every child keeps its world layout. */
export function ungroupPictureRoot(
  values: readonly PictureObject[],
  groupId: string,
  metrics: PictureSheetMetrics,
): PictureObject[] {
  const roots = normalizePictureObjectCollection(values);
  const group = roots.find((root) => root.id === groupId);
  if (!group || !isPictureGroup(group))
    throw new TypeError("Ungroup target must be a current root group.");
  const parent = resolvePictureGroup(group, metrics).layout;
  if (parent.collapsed) throw new RangeError("Expand a collapsed group before ungrouping.");
  const result = normalizePictureObjectCollection(
    roots.flatMap((root) =>
      root.id === groupId
        ? group.members.map((member) => fromMember(member, parent, !!group.hidden, group, metrics))
        : [root],
    ),
  );
  for (const root of result) rootLayout(root, metrics);
  return result;
}

/** Source-bearing member type for consumers that explicitly resolve an owned leaf. */
export type PictureGroupLeaf = GroupedPicture;
