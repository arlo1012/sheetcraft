import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  anchorPictureFrameRect,
  pictureFrameFromLegacy,
  resolvePictureFrame,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import {
  isPictureGroup,
  MAX_PICTURE_GROUP_NODES,
  traversePictureGroup,
  type PictureGroupChild,
  type PictureGroupNode,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import { clonePictureRootsForClipboard } from "@sheetcraft/core/picture-group-copy";
import {
  getPictureOwnerBehavior,
  normalizePictureProperties,
  type PictureProperties,
} from "@sheetcraft/core/picture-properties";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupNode,
} from "@sheetcraft/core/picture-group-layout";
import {
  arePictureObjectsEqual,
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type PictureObject,
} from "@sheetcraft/core/picture-object";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type Sheet } from "@sheetcraft/core/workbook";

export type OwnedPictureClipboardIdentity = { readonly token: string; readonly generation: number };
export type OwnedPictureClipboardCapture = {
  sheet: Sheet;
  revision: number;
  ownerGeneration: number;
  /** The effective view metrics, including AutoFit. They must be immutable snapshots. */
  sourceMetrics: PictureSheetMetrics;
  mode: "copy" | "cut";
} & (
  | { selectedIds: readonly string[]; selectedPaths?: never }
  | { selectedPaths: readonly PictureGroupPath[]; selectedIds?: never }
);
export type OwnedPictureClipboardSnapshot = OwnedPictureClipboardIdentity & {
  readonly mode: "copy" | "cut";
  readonly sourceSheetId: string;
  readonly sourceRevision: number;
  readonly ownerGeneration: number;
  readonly sourceMetrics: PictureSheetMetrics;
  /** Detached complete trees, never a flattened render list. */
  readonly roots: readonly PictureObject[];
  readonly sourceForest: readonly PictureObject[];
  readonly selectedPaths: readonly PictureGroupPath[];
};
export type OwnedPictureClipboardPlacement = {
  readonly roots: readonly PictureObject[];
  readonly sourceMetrics: PictureSheetMetrics;
  readonly destinationMetrics: PictureSheetMetrics;
  readonly sourceSheetId: string;
  readonly sourceRevision: number;
  readonly sourceOwnerGeneration: number;
};
export type OwnedPictureClipboardPaste = OwnedPictureClipboardIdentity & {
  sheet: Sheet;
  revision: number;
  ownerGeneration: number;
  /** For cut, this must still be the captured source-owner context. */
  sourceMetrics: PictureSheetMetrics;
  destinationMetrics: PictureSheetMetrics;
  /** Move root anchors only; preserve root order, identities and every owned descendant. */
  placeRoots: (placement: OwnedPictureClipboardPlacement) => readonly PictureObject[];
};
export type OwnedPictureClipboardPlan = OwnedPictureClipboardIdentity & {
  readonly mode: "copy" | "cut";
  readonly sheetId: string;
  readonly revision: number;
  readonly ownerGeneration: number;
  readonly roots: readonly PictureObject[];
  /** Command input: append copies or replace moved roots in their existing stacking positions. */
  readonly nextForest: readonly PictureObject[];
};
export class OwnedPictureClipboardError extends Error {
  constructor(
    readonly reason:
      | "invalid-selection"
      | "member-cut-unsupported"
      | "collapsed-selection"
      | "stale-session"
      | "stale-owner"
      | "invalid-placement",
  ) {
    super(`Owned picture clipboard: ${reason}.`);
    this.name = "OwnedPictureClipboardError";
  }
}

type Pending = OwnedPictureClipboardSnapshot & { readonly sheet: Sheet };
type OwnedVisit = {
  node: PictureGroupNode | PictureObject;
  path: PictureGroupPath;
  resolved?: ResolvedPictureGroupNode;
  rootProperties?: PictureProperties;
};

function counter(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid owner counter.");
}
function validateMetrics(metrics: PictureSheetMetrics): void {
  for (const [axis, count] of [
    [metrics?.columns, MAX_SHEET_COLUMNS],
    [metrics?.rows, MAX_SHEET_ROWS],
  ] as const) {
    if (
      !axis ||
      axis.count !== count ||
      typeof axis.nominalSize !== "function" ||
      typeof axis.visibleSize !== "function" ||
      typeof axis.nominalPrefix !== "function" ||
      typeof axis.visiblePrefix !== "function"
    )
      throw new TypeError("The clipboard requires effective worksheet metrics.");
    const nominal = axis.nominalSize(0);
    const visible = axis.visibleSize(0);
    const nominalExtent = axis.nominalPrefix(count);
    const visibleExtent = axis.visiblePrefix(count);
    if (
      axis.nominalPrefix(0) !== 0 ||
      axis.visiblePrefix(0) !== 0 ||
      !Number.isFinite(nominal) ||
      nominal <= 0 ||
      !Number.isFinite(visible) ||
      visible < 0 ||
      !Number.isFinite(nominalExtent) ||
      nominalExtent <= 0 ||
      !Number.isFinite(visibleExtent) ||
      visibleExtent < 0
    )
      throw new RangeError("Invalid effective worksheet metrics.");
  }
}
function samePath(left: PictureGroupPath, right: PictureGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function sameForest(left: readonly PictureObject[], right: readonly PictureObject[]): boolean {
  return (
    left.length === right.length &&
    left.every((root, index) => arePictureObjectsEqual(root, right[index]!))
  );
}
function layout(root: PictureObject, metrics: PictureSheetMetrics): ResolvedPictureLayout {
  if (isPictureGroup(root)) return resolvePictureGroup(root, metrics).layout;
  return resolvePictureFrame(
    isFramedPictureObject(root) ? root.frame : pictureFrameFromLegacy(root, metrics),
    metrics,
  );
}
function validateForest(roots: readonly PictureObject[], metrics: PictureSheetMetrics): void {
  for (const root of roots) layout(root, metrics);
}
function visits(roots: readonly PictureObject[], metrics: PictureSheetMetrics): OwnedVisit[] {
  const result: OwnedVisit[] = [];
  function collect(node: ResolvedPictureGroupNode, rootProperties: PictureProperties): void {
    result.push({ node: node.node, path: node.path, resolved: node, rootProperties });
    if ("members" in node) for (const child of node.members) collect(child, rootProperties);
  }
  for (const root of roots) {
    if (isPictureGroup(root)) collect(resolvePictureGroup(root, metrics), root);
    else {
      layout(root, metrics);
      result.push({ node: root, path: [root.id] });
    }
  }
  return result;
}
function selection(input: OwnedPictureClipboardCapture, all: readonly OwnedVisit[]): OwnedVisit[] {
  const values = input.selectedIds ?? input.selectedPaths;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > MAX_PICTURE_GROUP_NODES ||
    (input.selectedIds !== undefined && input.selectedPaths !== undefined)
  )
    throw new OwnedPictureClipboardError("invalid-selection");
  const byId = new Map(all.map((visit) => [visit.node.id, visit]));
  const selected = new Set<string>();
  for (const value of values) {
    const path = input.selectedIds === undefined ? (value as PictureGroupPath) : undefined;
    const id = path ? path.at(-1) : value;
    const visit = typeof id === "string" ? byId.get(id) : undefined;
    if (!visit || (path && (!Array.isArray(path) || !samePath(path, visit.path))))
      throw new OwnedPictureClipboardError("invalid-selection");
    selected.add(visit.node.id);
  }
  // Forest traversal order is the stacking order; selection order is not ownership.
  return all.filter(
    (visit) =>
      selected.has(visit.node.id) && !visit.path.slice(0, -1).some((id) => selected.has(id)),
  );
}
function extract(visit: OwnedVisit, metrics: PictureSheetMetrics): PictureObject {
  if (visit.path.length === 1) return visit.node as PictureObject;
  const resolved = visit.resolved!;
  if (!resolved.layout || resolved.layout.collapsed)
    throw new OwnedPictureClipboardError("collapsed-selection");
  const node = visit.node as PictureGroupChild;
  const common = {
    id: node.id,
    altText: node.altText,
    ...normalizePictureProperties(node),
    ...getPictureOwnerBehavior(visit.rootProperties!),
    ...(!resolved.visible ? { hidden: true } : node.hidden === undefined ? {} : { hidden: false }),
    ...(node.lockAspectRatio === undefined ? {} : { lockAspectRatio: node.lockAspectRatio }),
  };
  const anchor = anchorPictureFrameRect("move-and-size", resolved.layout.rect, metrics);
  if (node.kind === "grouped-group-v1")
    return {
      ...common,
      kind: "picture-group-v1",
      frame: { kind: "group-frame-v1", anchor, angleDeg: resolved.layout.angleDeg },
      members: node.members,
    };
  return {
    ...common,
    assetId: node.assetId,
    frame: {
      kind: "object-frame-v1",
      anchor,
      angleDeg: resolved.layout.angleDeg,
      source: node.frame.source,
      ...(node.frame.cropShape ? { cropShape: node.frame.cropShape } : {}),
      ...(node.frame.flipHorizontal === undefined
        ? {}
        : { flipHorizontal: node.frame.flipHorizontal }),
      ...(node.frame.flipVertical === undefined ? {} : { flipVertical: node.frame.flipVertical }),
    },
    ...(node.transform ? { transform: node.transform } : {}),
  };
}
function reservedIds(roots: readonly PictureObject[]): string[] {
  return roots.flatMap((root) =>
    isPictureGroup(root)
      ? traversePictureGroup(root).map(({ node }) => node.id)
      : [root.id, ...(root.groupId === undefined ? [] : [root.groupId])],
  );
}
function assertPlacement(before: readonly PictureObject[], after: readonly PictureObject[]): void {
  if (before.length !== after.length) throw new OwnedPictureClipboardError("invalid-placement");
  before.forEach((original, index) => {
    const moved = after[index]!;
    let positioned: PictureObject;
    if (isPictureGroup(original) && isPictureGroup(moved))
      positioned = { ...original, frame: { ...original.frame, anchor: moved.frame.anchor } };
    else if (isFramedPictureObject(original) && isFramedPictureObject(moved))
      positioned = { ...original, frame: { ...original.frame, anchor: moved.frame.anchor } };
    else if (
      !isPictureGroup(original) &&
      !isFramedPictureObject(original) &&
      !isPictureGroup(moved) &&
      !isFramedPictureObject(moved)
    )
      positioned = {
        ...original,
        anchor: moved.anchor,
        offsetX: moved.offsetX,
        offsetY: moved.offsetY,
      };
    else throw new OwnedPictureClipboardError("invalid-placement");
    if (!arePictureObjectsEqual(positioned, moved))
      throw new OwnedPictureClipboardError("invalid-placement");
  });
}
function snapshot(current: Pending): OwnedPictureClipboardSnapshot {
  const { sheet: _sheet, ...value } = current;
  return {
    ...value,
    roots: normalizePictureObjectCollection(current.roots),
    sourceForest: normalizePictureObjectCollection(current.sourceForest),
    selectedPaths: current.selectedPaths.map((path) => [...path]),
  };
}

/** Local document model only: no native clipboard, serialized format, assets or I/O. */
export function createOwnedPictureClipboardSession(options: {
  createId: () => string;
  createToken: () => string;
}) {
  let generation = 0;
  let pending: Pending | undefined;
  const issuedPlans = new WeakMap<OwnedPictureClipboardPlan, Pending>();

  function capture(input: OwnedPictureClipboardCapture): OwnedPictureClipboardSnapshot {
    const startedGeneration = generation;
    counter(input.revision);
    counter(input.ownerGeneration);
    if (input.mode !== "copy" && input.mode !== "cut")
      throw new TypeError("Invalid clipboard mode.");
    validateMetrics(input.sourceMetrics);
    const forest = normalizePictureObjectCollection(input.sheet.floatingImages);
    const selected = selection(input, visits(forest, input.sourceMetrics));
    if (input.mode === "cut" && selected.some((visit) => visit.path.length !== 1))
      throw new OwnedPictureClipboardError("member-cut-unsupported");
    const roots = normalizePictureObjectCollection(
      selected.map((visit) => extract(visit, input.sourceMetrics)),
    );
    validateForest(roots, input.sourceMetrics);
    const token = options.createToken();
    if (typeof token !== "string" || !token.trim()) throw new TypeError("Invalid clipboard token.");
    if (generation !== startedGeneration) throw new OwnedPictureClipboardError("stale-session");
    pending = {
      mode: input.mode,
      token,
      generation: ++generation,
      sheet: input.sheet,
      sourceSheetId: input.sheet.id,
      sourceRevision: input.revision,
      ownerGeneration: input.ownerGeneration,
      sourceMetrics: input.sourceMetrics,
      roots,
      sourceForest: forest,
      selectedPaths: selected.map((visit) => [...visit.path]),
    };
    return snapshot(pending);
  }

  function assertCurrent(input: OwnedPictureClipboardIdentity): Pending {
    if (!pending || pending.token !== input.token || pending.generation !== input.generation)
      throw new OwnedPictureClipboardError("stale-session");
    return pending;
  }
  function assertCutOwner(current: Pending, input: OwnedPictureClipboardPaste): void {
    if (
      current.sheet !== input.sheet ||
      current.sourceSheetId !== input.sheet.id ||
      current.sourceRevision !== input.revision ||
      current.ownerGeneration !== input.ownerGeneration ||
      current.sourceMetrics !== input.sourceMetrics ||
      input.destinationMetrics !== input.sourceMetrics ||
      !sameForest(
        current.sourceForest,
        normalizePictureObjectCollection(input.sheet.floatingImages),
      )
    )
      throw new OwnedPictureClipboardError("stale-owner");
  }
  function planPaste(input: OwnedPictureClipboardPaste): OwnedPictureClipboardPlan {
    counter(input.revision);
    counter(input.ownerGeneration);
    const current = assertCurrent(input);
    if (input.sourceMetrics !== current.sourceMetrics)
      throw new OwnedPictureClipboardError("stale-owner");
    validateMetrics(input.destinationMetrics);
    if (current.mode === "cut") assertCutOwner(current, input);
    const destination = normalizePictureObjectCollection(input.sheet.floatingImages);
    validateForest(destination, input.destinationMetrics);
    const roots =
      current.mode === "copy"
        ? clonePictureRootsForClipboard(current.roots, {
            createId: options.createId,
            reservedIds: reservedIds(destination),
          })
        : normalizePictureObjectCollection(current.roots);
    const placed = normalizePictureObjectCollection(
      input.placeRoots({
        roots: normalizePictureObjectCollection(roots),
        sourceMetrics: current.sourceMetrics,
        destinationMetrics: input.destinationMetrics,
        sourceSheetId: current.sourceSheetId,
        sourceRevision: current.sourceRevision,
        sourceOwnerGeneration: current.ownerGeneration,
      }),
    );
    assertPlacement(roots, placed);
    const replacements = new Map(placed.map((root) => [root.id, root]));
    const nextForest = normalizePictureObjectCollection(
      current.mode === "copy"
        ? [...destination, ...placed]
        : destination.map((root) => replacements.get(root.id) ?? root),
    );
    validateForest(nextForest, input.destinationMetrics);
    // Factories/placement can reenter their owner; never return a superseded command plan.
    if (assertCurrent(input) !== current) throw new OwnedPictureClipboardError("stale-session");
    if (current.mode === "cut") assertCutOwner(current, input);
    if (!sameForest(destination, normalizePictureObjectCollection(input.sheet.floatingImages)))
      throw new OwnedPictureClipboardError("stale-owner");
    const plan: OwnedPictureClipboardPlan = {
      mode: current.mode,
      token: current.token,
      generation: current.generation,
      sheetId: input.sheet.id,
      revision: input.revision,
      ownerGeneration: input.ownerGeneration,
      roots: normalizePictureObjectCollection(placed),
      nextForest,
    };
    issuedPlans.set(plan, current);
    return plan;
  }
  /** Returns true only when an authoritative successful command consumes its matching cut. */
  function complete(plan: OwnedPictureClipboardPlan, accepted: boolean): boolean {
    const captured = issuedPlans.get(plan);
    issuedPlans.delete(plan);
    if (
      accepted !== true ||
      !captured ||
      captured.mode !== "cut" ||
      pending !== captured ||
      plan.token !== captured.token ||
      plan.generation !== captured.generation
    )
      return false;
    pending = undefined;
    generation += 1;
    return true;
  }
  /** Explicit owner cancellation is leased too, so delayed cancellation cannot clear a newer copy. */
  function clear(identity: OwnedPictureClipboardIdentity): boolean {
    if (
      !pending ||
      !identity ||
      pending.token !== identity.token ||
      pending.generation !== identity.generation
    )
      return false;
    pending = undefined;
    generation += 1;
    return true;
  }
  return {
    capture,
    getCurrent: () => (pending ? snapshot(pending) : undefined),
    planPaste,
    complete,
    clear,
  };
}
