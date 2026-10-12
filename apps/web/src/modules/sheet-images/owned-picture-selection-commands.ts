import {
  areFloatingImageCollectionsEqual,
  cloneFloatingImage,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import {
  findPictureGroupNode,
  isPictureGroup,
  type PictureGroupChild,
} from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "@sheetcraft/core/picture-group-edit";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { resolvePictureLayout, normalizePictureAngle } from "@sheetcraft/core/picture-frame";
import { normalizePictureObjectCollection } from "@sheetcraft/core/picture-object";
import {
  resolveOwnedPictureNode,
  samePictureGroupSelection,
  type PictureGroupInteractionContext,
  type PictureGroupSelection,
} from "./picture-group-interaction";
import {
  flipPictureView,
  getPictureViewRect,
  movePictureViewBy,
  rotatePictureViewBy,
  snapPictureViewToGrid,
} from "./picture-view-operations";
import { planEqualPictureDimensions } from "./picture-equal-dimensions";
import { getPictureViewportFragments } from "./picture-viewport-fragments";
import type { PictureAlignment, PictureAlignmentReference } from "./usePictureTools";

/** A displayed command belongs to its exact owner, complete forest and immutable view metrics. */
export type OwnedPictureSelectionSnapshot = {
  context: PictureGroupInteractionContext;
  roots: FloatingImage[];
  selection: PictureGroupSelection;
  activeRootId: string | null;
  metrics: PictureGroupInteractionContext["frameContext"]["metrics"];
  columns: PictureGroupInteractionContext["frameContext"]["metrics"]["columns"];
  rows: PictureGroupInteractionContext["frameContext"]["metrics"]["rows"];
  geometryFunctions: readonly unknown[];
  geometryKey: string;
};

function geometryFunctions(context: PictureGroupInteractionContext): unknown[] {
  const { columns, rows } = context.frameContext.metrics;
  return [
    columns.count,
    columns.nominalSize,
    columns.visibleSize,
    columns.nominalPrefix,
    columns.visiblePrefix,
    rows.count,
    rows.nominalSize,
    rows.visibleSize,
    rows.nominalPrefix,
    rows.visiblePrefix,
    context.layout.getCellAtSheetPoint,
    context.layout.getCellRect,
    context.layout.getTotalSize,
  ];
}

function geometryKey(context: PictureGroupInteractionContext): string {
  // This also validates hidden roots and descendants. Pane data catches an
  // in-place scroll/freeze mutation rather than relying on object identity alone.
  const fragments = getPictureViewportFragments(
    context.roots,
    context.layout,
    context.frameContext,
  );
  return JSON.stringify({
    scroll: context.layout.bodyScrollPosition,
    freeze: context.layout.freeze,
    frozenSize: context.layout.frozenSize,
    viewportSize: context.layout.viewportSize,
    panes: context.layout.panes,
    fragments,
  });
}

export function captureOwnedPictureSelection(
  context: PictureGroupInteractionContext,
  selection: PictureGroupSelection,
  activeRootId: string | null = null,
): OwnedPictureSelectionSnapshot {
  if (
    context.frameContext.layout !== context.layout ||
    !Number.isFinite(context.scale) ||
    context.scale <= 0 ||
    !selection.rootIds.length ||
    new Set(selection.rootIds).size !== selection.rootIds.length
  )
    throw new TypeError("A picture command requires its exact worksheet selection and geometry.");
  for (const id of selection.rootIds) {
    const root = context.roots.find((entry) => entry.id === id);
    if (!root || root.hidden || !getPictureViewRect(root, context.layout, context.frameContext))
      throw new TypeError("A selected picture root is missing, hidden or collapsed.");
  }
  if (selection.path) {
    if (
      selection.path.length < 2 ||
      selection.rootIds.length !== 1 ||
      selection.path[0] !== selection.rootIds[0] ||
      !resolveOwnedPictureNode(context.roots, selection.path, context.frameContext)?.visible
    )
      throw new TypeError("An owned picture command requires its exact visible member path.");
  }
  const key = geometryKey(context);
  return {
    context: { ...context },
    roots: context.roots.map(cloneFloatingImage),
    selection: {
      rootIds: [...selection.rootIds],
      path: selection.path ? [...selection.path] : null,
    },
    activeRootId,
    metrics: context.frameContext.metrics,
    columns: context.frameContext.metrics.columns,
    rows: context.frameContext.metrics.rows,
    geometryFunctions: geometryFunctions(context),
    geometryKey: key,
  };
}

export function isOwnedPictureSelectionCurrent(
  snapshot: OwnedPictureSelectionSnapshot,
  current: PictureGroupInteractionContext,
  selection: PictureGroupSelection,
  activeRootId: string | null = null,
): boolean {
  const captured = snapshot.context;
  if (
    captured.owner !== current.owner ||
    captured.roots !== current.roots ||
    captured.revision !== current.revision ||
    captured.layout !== current.layout ||
    captured.frameContext !== current.frameContext ||
    captured.scale !== current.scale ||
    captured.readOnly !== current.readOnly ||
    current.frameContext.layout !== current.layout ||
    snapshot.metrics !== current.frameContext.metrics ||
    snapshot.columns !== current.frameContext.metrics.columns ||
    snapshot.rows !== current.frameContext.metrics.rows ||
    !snapshot.geometryFunctions.every(
      (value, index) => value === geometryFunctions(current)[index],
    ) ||
    snapshot.activeRootId !== activeRootId ||
    !samePictureGroupSelection(snapshot.selection, selection)
  )
    return false;
  try {
    return (
      areFloatingImageCollectionsEqual(snapshot.roots, current.roots) &&
      snapshot.geometryKey === geometryKey(current)
    );
  } catch {
    return false;
  }
}

function replaceSelectedRoots(
  snapshot: OwnedPictureSelectionSnapshot,
  edit: (root: FloatingImage) => FloatingImage | null,
): FloatingImage[] {
  const replacements = new Map<string, FloatingImage>();
  for (const root of snapshot.roots) {
    if (!snapshot.selection.rootIds.includes(root.id)) continue;
    const next = edit(root);
    if (!next) throw new TypeError("A selected picture root cannot resolve this transform.");
    replacements.set(root.id, next);
  }
  return normalizePictureObjectCollection(
    snapshot.roots.map((root) => replacements.get(root.id) ?? root),
  );
}

/** Quarter-turn every selected real layout about its own center; never rotate a temporary union. */
export function rotateOwnedPictureSelection(
  snapshot: OwnedPictureSelectionSnapshot,
  turns: -1 | 1 | 2,
): FloatingImage[] {
  if (![-1, 1, 2].includes(turns))
    throw new TypeError("Only explicit picture quarter-turn commands are supported.");
  const { context, selection } = snapshot;
  if (context.readOnly) throw new TypeError("The worksheet is read-only.");
  if (!selection.path)
    return replaceSelectedRoots(snapshot, (root) =>
      rotatePictureViewBy(root, turns, context.layout, context.frameContext),
    );
  const path = selection.path;
  const root = snapshot.roots.find((entry) => entry.id === path[0]);
  if (!isPictureGroup(root)) throw new TypeError("The exact picture group owner is missing.");
  const target = resolveOwnedPictureNode(snapshot.roots, path, context.frameContext);
  if (!target?.layout || !target.visible)
    throw new TypeError("The owned picture target is missing.");
  const next = applyPictureGroupChildWorldEdit(
    root,
    leasePictureGroupNode(root, path),
    resolvePictureLayout(target.layout.rect, target.layout.angleDeg + turns * 90),
    snapshot.metrics,
  );
  return normalizePictureObjectCollection(
    snapshot.roots.map((entry) => (entry.id === root.id ? next : entry)),
  );
}

function reflectDescendant(child: PictureGroupChild, axis: "horizontal" | "vertical"): void {
  const rect = child.frame.rect;
  child.frame.rect = {
    ...rect,
    ...(axis === "horizontal"
      ? { xRatio: 1 - rect.xRatio - rect.widthRatio }
      : { yRatio: 1 - rect.yRatio - rect.heightRatio }),
  };
  child.frame.angleDeg = normalizePictureAngle(-child.frame.angleDeg);
  if (child.kind === "grouped-group-v1") {
    for (const member of child.members) reflectDescendant(member, axis);
  } else reflectSource(child, axis);
}
function reflectSource(
  child: Extract<PictureGroupChild, { kind: "grouped-picture-v1" }>,
  axis: "horizontal" | "vertical",
): void {
  if (axis === "horizontal") {
    child.frame.flipHorizontal = !child.frame.flipHorizontal;
    child.frame.source.offsetXRatio = -child.frame.source.offsetXRatio;
  } else {
    child.frame.flipVertical = !child.frame.flipVertical;
    child.frame.source.offsetYRatio = -child.frame.source.offsetYRatio;
  }
}

/** Mirrors only the leased member's real tree, using the same orthogonal rules as group flips. */
export function flipOwnedPictureSelection(
  snapshot: OwnedPictureSelectionSnapshot,
  axis: "horizontal" | "vertical",
): FloatingImage[] {
  if (axis !== "horizontal" && axis !== "vertical")
    throw new TypeError("Invalid picture flip axis.");
  const { context, selection } = snapshot;
  if (context.readOnly) throw new TypeError("The worksheet is read-only.");
  if (!selection.path)
    return replaceSelectedRoots(snapshot, (root) =>
      flipPictureView(root, axis, context.layout, context.frameContext),
    );
  const path = selection.path;
  const root = snapshot.roots.find((entry) => entry.id === path[0]);
  if (!isPictureGroup(root)) throw new TypeError("The exact picture group owner is missing.");
  const target = resolveOwnedPictureNode(snapshot.roots, path, context.frameContext);
  if (!target?.layout || !target.visible)
    throw new TypeError("The owned picture target is missing.");
  // First validate its source/ownership lease and place its unchanged center in
  // the immediate owner's axes. Reflection changes sources only inside that
  // verified target; a general container replacement cannot change source leases.
  const next = applyPictureGroupChildWorldEdit(
    root,
    leasePictureGroupNode(root, path),
    resolvePictureLayout(target.layout.rect, -target.layout.angleDeg),
    snapshot.metrics,
  );
  const child = findPictureGroupNode(next, path)?.node;
  if (!child || child.kind === "picture-group-v1")
    throw new TypeError("The leased member is missing.");
  if (child.kind === "grouped-picture-v1") reflectSource(child, axis);
  else for (const member of child.members) reflectDescendant(member, axis);
  const canonical = resolvePictureGroup(next, snapshot.metrics).node;
  return normalizePictureObjectCollection(
    snapshot.roots.map((entry) => (entry.id === root.id ? canonical : entry)),
  );
}

/** Align actual unrotated root layouts. Sources and descendant unions never define the reference. */
export function arrangeOwnedPictureSelection(
  snapshot: OwnedPictureSelectionSnapshot,
  ids: readonly string[],
  action: PictureAlignment,
  reference: PictureAlignmentReference = "selection",
): FloatingImage[] {
  const { context, selection } = snapshot;
  if (context.readOnly || selection.path)
    throw new TypeError("Root arrangement requires an editable root selection.");
  if (
    !samePictureGroupSelection({ rootIds: ids, path: null }, selection) ||
    ![
      "left",
      "center",
      "right",
      "top",
      "middle",
      "both",
      "bottom",
      "horizontal",
      "vertical",
      "grid",
      "equal-height",
      "equal-width",
      "equal-size",
    ].includes(action) ||
    !["selection", "last-selected"].includes(reference)
  )
    throw new TypeError("Unsupported picture arrangement or stale root selection.");
  if (action === "grid")
    return replaceSelectedRoots(snapshot, (root) =>
      snapPictureViewToGrid(root, context.layout, context.frameContext),
    );
  if (action === "equal-height" || action === "equal-width" || action === "equal-size")
    return planEqualPictureDimensions(
      snapshot.roots,
      ids,
      snapshot.activeRootId ?? ids.at(-1),
      action,
      context.layout,
      context.frameContext,
    );
  const entries = snapshot.roots
    .filter((root) => ids.includes(root.id))
    .map((image) => ({
      image,
      rect: getPictureViewRect(image, context.layout, context.frameContext),
    }));
  if (!entries.length || entries.length !== ids.length || entries.some(({ rect }) => !rect))
    throw new TypeError("An arranged picture root is missing or collapsed.");
  const members = entries.map((entry) => ({ image: entry.image, rect: entry.rect! }));
  if ((action === "horizontal" || action === "vertical") && members.length < 3)
    return snapshot.roots.map(cloneFloatingImage);
  const left = Math.min(...members.map(({ rect }) => rect.x));
  const right = Math.max(...members.map(({ rect }) => rect.x + rect.width));
  const top = Math.min(...members.map(({ rect }) => rect.y));
  const bottom = Math.max(...members.map(({ rect }) => rect.y + rect.height));
  const last = members.find(({ image }) => image.id === (snapshot.activeRootId ?? ids.at(-1)));
  const base =
    reference === "last-selected" && last
      ? last.rect
      : { x: left, y: top, width: right - left, height: bottom - top };
  const ordered = [...members].sort((a, b) =>
    action === "horizontal" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
  );
  let cursor = action === "horizontal" ? left : top;
  const horizontal = action === "horizontal";
  const gap =
    members.length < 2
      ? 0
      : ((horizontal ? right - left : bottom - top) -
          members.reduce((sum, { rect }) => sum + (horizontal ? rect.width : rect.height), 0)) /
        (members.length - 1);
  const replacements = new Map<string, FloatingImage>();
  for (const { image, rect } of ordered) {
    let x = rect.x,
      y = rect.y;
    if (action === "left") x = base.x;
    if (action === "center" || action === "both") x = base.x + (base.width - rect.width) / 2;
    if (action === "right") x = base.x + base.width - rect.width;
    if (action === "top") y = base.y;
    if (action === "middle" || action === "both") y = base.y + (base.height - rect.height) / 2;
    if (action === "bottom") y = base.y + base.height - rect.height;
    if (action === "horizontal") {
      x = cursor;
      cursor += rect.width + gap;
    }
    if (action === "vertical") {
      y = cursor;
      cursor += rect.height + gap;
    }
    const next = movePictureViewBy(
      image,
      { x: x - rect.x, y: y - rect.y },
      context.layout,
      context.frameContext,
    );
    if (!next) throw new TypeError("An arranged picture root cannot resolve its real layout.");
    // Legacy movement may clamp an impossible negative origin. Such a partial
    // alignment is not a valid atomic arrangement, so reject the entire plan.
    const actual = getPictureViewRect(next, context.layout, context.frameContext);
    if (!actual || Math.abs(actual.x - x) > 1e-7 || Math.abs(actual.y - y) > 1e-7)
      throw new RangeError("The complete arrangement is not representable.");
    replacements.set(image.id, next);
  }
  return normalizePictureObjectCollection(
    snapshot.roots.map((root) => replacements.get(root.id) ?? root),
  );
}
