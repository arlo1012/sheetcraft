import type { PictureDetailedStyle } from "@sheetcraft/core/picture-detailed-style";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { normalizePictureAngle } from "@sheetcraft/core/picture-frame";
import {
  anchorShapeFrameRect,
  normalizeShapeFrameSize,
  resizeShapeFrame,
  shapeFrameLocalToWorld,
  type ResolvedShapeFrame,
  type ShapeFrameAnchor,
  type ShapeFrameRect,
} from "@sheetcraft/core/shape-frame";
import {
  findShapeGroupNode,
  normalizeShapeGroup,
  normalizeShapeGroupEffects,
  SHAPE_GROUP_EFFECT_CATEGORIES,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import {
  applyShapeGroup3dRotationEdit,
  applyShapeGroupChildWorldEdit,
  leaseShapeGroup3dRotation,
  leaseShapeGroupNode,
  type ShapeGroup3dRotationLease,
  type ShapeGroupNodeLease,
} from "@sheetcraft/core/shape-group-edit";
import {
  resolveShapeGroup3dSource,
  type ResolvedShapeGroup3dSource,
} from "@sheetcraft/core/shape-group-3d";
import { normalizeShapeStyle } from "@sheetcraft/core/shape-style";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "@sheetcraft/core/shape-group-layout";
import { isShapeFreePathClosed } from "@sheetcraft/core/shape-free-path";
import { normalizeShapeLineEnds, type ShapeLineEnds } from "@sheetcraft/core/shape-line-ends";
import { isShapeLinePreset } from "@sheetcraft/core/shape-line-ends";
import {
  getShapeObjectProperties,
  normalizeShapeObjectProperties,
} from "@sheetcraft/core/shape-object-properties";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  resolveShapeGroupProjection,
  type ResolvedShapeGroupLeaf,
  type ResolvedShapeGroupProjection,
} from "./resolved-shape-group";
import type { ResolvedShapeForestForRender } from "./resolved-shape-render-source";
import { resolveShapeDetailedPaintStyle } from "./shape-detailed-paint";
import type {
  ShapeFormatField,
  ShapeFormatIntent,
  ShapeFormatMode,
  ShapeFormatStyleCategory,
  ShapeFormatValues,
} from "./shape-format-pane-model";
import {
  drawingShapeTextValues,
  drawingShapeTextCharacterValues,
  editDrawingShapeTextField,
  materializeDrawingShapeText,
  withDrawingShapeText,
  withoutDrawingShapeTextCharacterProperties,
} from "./shape-text-options";
import { resolveShapeTextPaintStyle } from "./shape-text-paint";
import { getDrawingShapeTextRect } from "./shape-text-runtime";

export type ShapeGroupFormatBaseline = Readonly<{ width: number; height: number }>;
/** Selection ownership is the exact container or explicitly selected ordinary leaf. */
export type ShapeGroupFormatContext = {
  readonly sourceRoot: ShapeGroupDrawing;
  readonly sourceNode: ShapeGroupDrawing | ShapeGroupedGroup | SheetGroupedGraphicDrawing;
  readonly path: ShapeGroupPath;
  readonly metrics: PictureSheetMetrics;
  readonly layout: ResolvedShapeFrame | null;
  readonly collapsed: boolean;
  readonly leaves: readonly ResolvedShapeGroupLeaf[];
  readonly projection: ResolvedShapeGroupProjection;
  readonly renderPass?: ResolvedShapeForestForRender;
  readonly rootLease: ShapeGroupNodeLease;
  readonly targetLease: ShapeGroupNodeLease;
  /** Effective source ownership is captured separately from the selected subtree. */
  readonly rotation3dSource: ResolvedShapeGroup3dSource;
  readonly rotation3dLease: ShapeGroup3dRotationLease;
  /** Worksheet behavior always belongs to the outermost root. */
  readonly locked: boolean;
  readonly printObject: boolean;
  readonly anchor: ShapeFormatValues["anchor"];
};
export type ShapeGroupFormatPlan = {
  readonly root: ShapeGroupDrawing;
  readonly affectedPaths: readonly ShapeGroupPath[];
  readonly eligibleCount: number;
  readonly descendantCount: number;
};
export type ShapeGroupFormatAggregate = {
  readonly values: Partial<ShapeFormatValues>;
  readonly mixedFields: readonly ShapeFormatField[];
  readonly shapeStyle: PictureDetailedStyle;
  readonly textStyle: PictureDetailedStyle;
  readonly mixedStyleCategories: Readonly<{
    shape: readonly ShapeFormatStyleCategory[];
    text: readonly ShapeFormatStyleCategory[];
  }>;
  readonly bodyEligibleCount: number;
  readonly textEligibleCount: number;
  readonly descendantCount: number;
  readonly independentTextCameraCount: number;
  readonly rotation3dAffectedCount: number;
  readonly rotation3dInherited: boolean;
  readonly rotation3dShared: boolean;
  readonly lineEnds?: ShapeLineEnds;
  readonly mixedLineEnds: readonly ("begin" | "end")[];
  readonly lineEligibleCount: number;
};
type WithoutIdentity<T> = T extends ShapeFormatIntent
  ? Omit<T, "owner" | "baseRevision" | "intentId">
  : never;
export type ShapeGroupFormatEdit = WithoutIdentity<ShapeFormatIntent>;

const styleCategories: readonly ShapeFormatStyleCategory[] = [
  "fill",
  "line",
  "shadow",
  "reflection",
  "glow",
  "softEdges",
  "format3d",
  "rotation3d",
];
/** Member glyph effects are distinct from the container's completed-alpha effects. */
export function isShapeGroupMemberStyleCategory(
  target: ShapeFormatMode,
  category: ShapeFormatStyleCategory,
): boolean {
  return (
    category === "fill" ||
    category === "line" ||
    (target === "shape" && category === "format3d") ||
    (target === "text" &&
      (category === "shadow" ||
        category === "reflection" ||
        category === "glow" ||
        category === "softEdges" ||
        category === "format3d"))
  );
}
const objectFields = new Set<ShapeFormatField>([
  "lockAspectRatio",
  "anchor",
  "locked",
  "printObject",
  "altTitle",
  "altDescription",
]);
const contextSnapshots = new WeakMap<ShapeGroupFormatContext, string>();
function samePath(left: ShapeGroupPath, right: ShapeGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function beneath(path: ShapeGroupPath, owner: ShapeGroupPath): boolean {
  return path.length > owner.length && owner.every((id, index) => path[index] === id);
}
function anchorValue(mode: ShapeFrameAnchor["mode"]): ShapeFormatValues["anchor"] {
  return mode === "move-and-size" ? "move-size" : mode === "move-only" ? "move" : "fixed";
}
function anchorMode(value: ShapeFormatValues["anchor"]): ShapeFrameAnchor["mode"] {
  if (value === "move-size") return "move-and-size";
  if (value === "move") return "move-only";
  if (value === "fixed") return "fixed";
  throw new TypeError("Unknown shape group anchor mode.");
}
function boundedNumber(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`${name} is outside its supported range.`);
  return value;
}

/** Resolving first validates every node, including off-screen and collapsed subtrees. */
export function resolveShapeGroupFormatContext(
  root: ShapeGroupDrawing,
  path: ShapeGroupPath,
  metrics: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
): ShapeGroupFormatContext {
  renderPass?.assertCurrent(renderPass.sourceForest, metrics, renderPass.revision);
  const projection = renderPass
    ? renderPass.getGroup(root.id)
    : resolveShapeGroupProjection(root, metrics);
  if (!projection || projection.sourceRoot !== root || projection.metrics !== metrics)
    throw new TypeError("Shape group formatting requires its exact whole-forest projection.");
  // Core's path reader rejects malformed arrays and paths before owner lookup.
  const targetLease = leaseShapeGroupNode(root, path);
  const owner =
    projection.owners.find((entry) => samePath(entry.path, targetLease.path)) ??
    projection.leaves.find((entry) => samePath(entry.path, targetLease.path));
  if (!owner || (owner.sourceNode.kind === "shape" && owner.sourceNode.shapeConnector))
    throw new TypeError("Shape formatting requires an exact container or ordinary leaf path.");
  const rootLease = path.length === 1 ? targetLease : leaseShapeGroupNode(root, [root.id]);
  const context: ShapeGroupFormatContext = {
    sourceRoot: root,
    sourceNode: owner.sourceNode,
    path: [...targetLease.path],
    metrics,
    layout: owner.layout,
    collapsed: owner.collapsed,
    leaves: projection.leaves.filter(
      (leaf) => samePath(leaf.path, targetLease.path) || beneath(leaf.path, targetLease.path),
    ),
    projection,
    ...(renderPass ? { renderPass } : {}),
    rootLease,
    targetLease,
    rotation3dSource: resolveShapeGroup3dSource(root, targetLease.path),
    rotation3dLease: leaseShapeGroup3dRotation(root, targetLease.path),
    locked: projection.locked,
    printObject: projection.printObject,
    anchor: anchorValue(root.shapeFrame.anchor.mode),
  };
  contextSnapshots.set(context, JSON.stringify(rootLease));
  return context;
}

/** Root identity and its complete canonical old tree form the exact CAS boundary. */
export function isShapeGroupFormatContextCurrent(
  context: ShapeGroupFormatContext,
  root: ShapeGroupDrawing,
  path: ShapeGroupPath = context.path,
): boolean {
  if (root !== context.sourceRoot || !samePath(path, context.path)) return false;
  try {
    context.renderPass?.assertCurrent(
      context.renderPass.sourceForest,
      context.metrics,
      context.renderPass.revision,
    );
    return (
      findShapeGroupNode(root, path)?.node === context.sourceNode &&
      JSON.stringify(leaseShapeGroupNode(root, [root.id])) === contextSnapshots.get(context)
    );
  } catch {
    return false;
  }
}
function assertCurrent(context: ShapeGroupFormatContext): void {
  if (!isShapeGroupFormatContextCurrent(context, context.sourceRoot))
    throw new TypeError("Shape group format context is stale, missing or reparented.");
}
function isLine(view: SheetGraphicDrawing): boolean {
  return !!(
    (view.shapeGeometry && isShapeLinePreset(view.shapeGeometry.preset)) ||
    (!view.shapeGeometry && !view.shapePath && view.shape === "line")
  );
}
function hasText(leaf: ResolvedShapeGroupLeaf): boolean {
  if (!leaf.view || leaf.collapsed || leaf.sourceNode.shapeConnector) return false;
  const rect = getDrawingShapeTextRect(leaf.view);
  return (
    !!rect &&
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
/** Real descendant eligibility. Group-level effects are not inferred from leaf paint. */
export function getShapeGroupFormatEligibleLeaves(
  context: ShapeGroupFormatContext,
  target: ShapeFormatMode,
  category?: ShapeFormatStyleCategory,
): readonly ResolvedShapeGroupLeaf[] {
  if (target !== "shape" && target !== "text")
    throw new TypeError("Unknown shape group format target.");
  if (category !== undefined && !styleCategories.includes(category))
    throw new TypeError("Unknown shape style category.");
  return context.leaves.filter((leaf) => {
    const view = leaf.view;
    if (!view || leaf.collapsed) return false;
    if (target === "text") return hasText(leaf);
    if (view.kind === "textBox" && (category === "format3d" || category === "rotation3d"))
      return true;
    if (view.kind !== "shape") return false;
    return (
      category !== "fill" ||
      !(
        isLine(view) ||
        (view.shapePath && !isShapeFreePathClosed(view.shapePath) && !view.shapePath.openArea)
      )
    );
  });
}
/** Arrowheads belong to real open line descendants, never the container itself. */
export function getShapeGroupLineEligibleLeaves(
  context: ShapeGroupFormatContext,
): readonly ResolvedShapeGroupLeaf[] {
  return getShapeGroupFormatEligibleLeaves(context, "shape").filter(
    (leaf) =>
      isLine(leaf.view!) ||
      !!(leaf.view!.shapePath && !isShapeFreePathClosed(leaf.view!.shapePath)),
  );
}
/** Conditional text fields retain the same genuine per-leaf semantics as ordinary shapes. */
export function getShapeGroupFormatFieldEligibleLeaves(
  context: ShapeGroupFormatContext,
  field: ShapeFormatField,
): readonly ResolvedShapeGroupLeaf[] {
  return getShapeGroupFormatEligibleLeaves(context, "text").filter((leaf) => {
    const view = leaf.view!;
    const model = materializeDrawingShapeText(view);
    return field === "textLineOrder"
      ? model.layout.direction === "stacked"
      : field === "paragraphLineSpacingPt"
        ? model.paragraph.lineSpacing.kind === "exact"
        : true;
  });
}

function checkedResult(
  context: ShapeGroupFormatContext,
  root: ShapeGroupDrawing,
  paths: readonly ShapeGroupPath[],
  resized = false,
): ShapeGroupFormatPlan {
  const resolved = resolveShapeGroup(root, context.metrics);
  if (resized) {
    function check(entry: ResolvedShapeGroupNode): void {
      if (samePath(entry.path, context.path) || beneath(entry.path, context.path)) {
        if (!entry.layout || entry.layout.collapsed)
          throw new RangeError("Expand a collapsed shape group before resizing.");
        normalizeShapeFrameSize({
          width: entry.layout.rect.width,
          height: entry.layout.rect.height,
        });
      }
      if ("members" in entry) for (const child of entry.members) check(child);
    }
    check(resolved);
  }
  return {
    root: resolved.node,
    affectedPaths: paths.map((path) => [...path]),
    eligibleCount: paths.length,
    descendantCount: context.leaves.length,
  };
}
function requiredLayout(context: ShapeGroupFormatContext): ResolvedShapeFrame {
  if (!context.layout || context.collapsed)
    throw new RangeError("Expand a collapsed shape group before editing its geometry.");
  return context.layout;
}
function resizedRect(
  rect: ShapeFrameRect,
  angle: number,
  size: ShapeGroupFormatBaseline,
): ShapeFrameRect {
  const next = normalizeShapeFrameSize(size);
  const fixed = shapeFrameLocalToWorld(rect, angle, { x: 0, y: 0 });
  const probe = shapeFrameLocalToWorld({ x: 0, y: 0, ...next }, angle, { x: 0, y: 0 });
  return { x: fixed.x - probe.x, y: fixed.y - probe.y, ...next };
}
function geometryPlan(
  context: ShapeGroupFormatContext,
  field: ShapeFormatField,
  value: unknown,
  baseline: ShapeGroupFormatBaseline,
): ShapeGroupFormatPlan {
  const layout = requiredLayout(context);
  const rect = layout.rect;
  let angleDeg = layout.angleDeg;
  let nextRect = rect;
  const isRotation = field === "rotationDeg";
  if (isRotation)
    angleDeg = normalizePictureAngle(boundedNumber(value, -360, 360, "Shape group rotation"));
  else {
    const axis = field === "sizeWidthPt" || field === "scaleWidthPercent" ? "width" : "height";
    const numeric = field === "sizeWidthPt" || field === "sizeHeightPt";
    const requested = numeric
      ? (boundedNumber(value, 0.75, 12288, "Shape group size") * 4) / 3
      : (boundedNumber(
          baseline[axis],
          Number.MIN_VALUE,
          Number.MAX_VALUE,
          "Shape group selection baseline",
        ) *
          boundedNumber(value, Number.MIN_VALUE, Number.MAX_VALUE, "Shape group scale")) /
        100;
    const locked = getShapeObjectProperties(context.sourceNode.shapeProperties).lockAspectRatio;
    const width =
      axis === "width" ? requested : locked ? (rect.width * requested) / rect.height : rect.width;
    const height =
      axis === "height" ? requested : locked ? (rect.height * requested) / rect.width : rect.height;
    nextRect = resizedRect(rect, angleDeg, { width, height });
  }
  let next: ShapeGroupDrawing;
  if (context.path.length === 1) {
    const root = normalizeShapeGroup(context.sourceRoot);
    next = isRotation
      ? { ...root, rotation: angleDeg }
      : {
          ...root,
          shapeFrame: resizeShapeFrame(
            root.shapeFrame,
            { width: nextRect.width, height: nextRect.height },
            context.metrics,
            angleDeg,
          ),
        };
  } else
    next = applyShapeGroupChildWorldEdit(
      context.sourceRoot,
      context.targetLease,
      { rect: nextRect, angleDeg },
      context.metrics,
    );
  return checkedResult(
    context,
    next,
    [context.path],
    !isRotation && (nextRect.width !== rect.width || nextRect.height !== rect.height),
  );
}
function metadataPlan(
  context: ShapeGroupFormatContext,
  field: ShapeFormatField,
  value: unknown,
): ShapeGroupFormatPlan {
  const root = normalizeShapeGroup(context.sourceRoot);
  const node = findShapeGroupNode(root, context.path)?.node;
  if (!node) throw new TypeError("Shape metadata requires its exact owned node.");
  if (field === "anchor") {
    if (context.path.length !== 1)
      throw new TypeError("Nested shape groups inherit the outer root anchor.");
    const layout = requiredLayout(context);
    root.shapeFrame = {
      kind: "shape-frame-v1",
      anchor: anchorShapeFrameRect(
        anchorMode(value as ShapeFormatValues["anchor"]),
        layout.rect,
        context.metrics,
        root.shapeFrame.anchor,
      ),
    };
  } else {
    if (context.path.length !== 1 && (field === "locked" || field === "printObject"))
      throw new TypeError("Nested shape groups inherit outer root lock and print behavior.");
    const properties = normalizeShapeObjectProperties({ ...node.shapeProperties, [field]: value });
    if (properties) node.shapeProperties = properties;
    else delete node.shapeProperties;
  }
  return checkedResult(context, root, [context.path]);
}

function replaceLeafAppearance(
  previous: SheetGroupedGraphicDrawing,
  next: SheetGraphicDrawing,
): SheetGroupedGraphicDrawing {
  if (next.id !== previous.id || next.kind !== previous.kind)
    throw new TypeError("A group format edit must retain leaf identity and kind.");
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = next;
  return {
    ...appearance,
    kind: previous.kind,
    rotation: previous.rotation,
    groupFrame: previous.groupFrame,
    ...(previous.shapeProperties ? { shapeProperties: previous.shapeProperties } : {}),
    ...(previous.shapeConnector ? { shapeConnector: previous.shapeConnector } : {}),
  };
}
function batchPlan(
  context: ShapeGroupFormatContext,
  leaves: readonly ResolvedShapeGroupLeaf[],
  edit: (view: SheetGraphicDrawing) => SheetGraphicDrawing,
): ShapeGroupFormatPlan {
  if (!leaves.length)
    throw new TypeError(
      "This shape group subtree has no eligible descendants for the requested edit.",
    );
  const root = normalizeShapeGroup(context.sourceRoot);
  const canonical = new Map(
    traverseShapeGroup(root).map((entry) => [JSON.stringify(entry.path), entry]),
  );
  for (const leaf of leaves) {
    const visit = canonical.get(JSON.stringify(leaf.path));
    const owner = visit?.parentPath && canonical.get(JSON.stringify(visit.parentPath))?.node;
    if (
      !visit ||
      visit.node.kind === "shapeGroup" ||
      !owner ||
      owner.kind !== "shapeGroup" ||
      !leaf.view
    )
      throw new TypeError("A batch edit requires exact genuine leaf owner paths.");
    const index = owner.members.findIndex((child) => child.id === visit.node.id);
    owner.members[index] = replaceLeafAppearance(visit.node, edit(leaf.view));
  }
  return checkedResult(
    context,
    root,
    leaves.map((leaf) => leaf.path),
  );
}

/** Pure planning only. Command permissions, asset preflight and rich measurements belong to the host. */
export function planShapeGroupFormatIntent(
  context: ShapeGroupFormatContext,
  intent: ShapeFormatIntent | ShapeGroupFormatEdit,
  baseline: ShapeGroupFormatBaseline,
): ShapeGroupFormatPlan {
  assertCurrent(context);
  if (intent.type === "set-field") {
    if (
      [
        "sizeWidthPt",
        "sizeHeightPt",
        "rotationDeg",
        "scaleWidthPercent",
        "scaleHeightPercent",
      ].includes(intent.field)
    )
      return geometryPlan(context, intent.field, intent.value, baseline);
    if (objectFields.has(intent.field)) return metadataPlan(context, intent.field, intent.value);
    const leaves = getShapeGroupFormatFieldEligibleLeaves(context, intent.field);
    return batchPlan(context, leaves, (view) => {
      const edited = editDrawingShapeTextField(view, intent.field, intent.value);
      if (!edited) throw new TypeError("Unsupported shape group text field.");
      return edited;
    });
  }
  if (intent.type === "set-style") {
    if (intent.category === "rotation3d") {
      // This edit may be initiated by one leaf but belongs to the complete shared
      // camera authority. Never bake the camera into descendant appearance.
      const edited = applyShapeGroup3dRotationEdit(
        context.sourceRoot,
        context.rotation3dLease,
        intent.value ?? { kind: "none" },
      );
      if (intent.value === undefined) {
        // Inherit removes the exact validated source; None retains an explicit
        // disabled choice. Both leave dormant descendant camera values intact.
        const owner = findShapeGroupNode(edited.root, edited.ownerPath)!.node;
        if (owner.kind === "shapeGroup") delete owner.group3d;
        else {
          const style = { ...owner.shapeStyle };
          delete style.rotation3d;
          const normalized = normalizeShapeStyle(style);
          if (normalized) owner.shapeStyle = normalized;
          else delete owner.shapeStyle;
        }
      }
      const result = checkedResult(context, edited.root, edited.affectedLeafPaths);
      return { ...result, descendantCount: edited.affectedLeafPaths.length };
    }
    if (
      context.sourceNode.kind === "shapeGroup" &&
      intent.target === "shape" &&
      SHAPE_GROUP_EFFECT_CATEGORIES.some((category) => category === intent.category)
    ) {
      const root = normalizeShapeGroup(context.sourceRoot);
      const owner = findShapeGroupNode(root, context.path)?.node;
      if (!owner || owner.kind !== "shapeGroup")
        throw new TypeError("A container effect requires its exact group owner.");
      const draft = { ...owner.groupEffects };
      if (intent.value === undefined) delete draft[intent.category as keyof typeof draft];
      else Object.assign(draft, { [intent.category]: intent.value });
      const effects = normalizeShapeGroupEffects(draft);
      if (effects) owner.groupEffects = effects;
      else delete owner.groupEffects;
      return checkedResult(context, root, [context.path]);
    }
    // Reference behavior has a separate group-level effect owner. Do not turn a
    // group shadow into per-member shadows, or invent a container bitmap source.
    if (
      context.sourceNode.kind === "shapeGroup" &&
      !isShapeGroupMemberStyleCategory(intent.target, intent.category)
    )
      throw new TypeError(
        "Group-level effects require an independently supported group effect model.",
      );
    const leaves = getShapeGroupFormatEligibleLeaves(context, intent.target, intent.category);
    return batchPlan(context, leaves, (view) => {
      if (intent.target === "text" && intent.category === "fill")
        view = withoutDrawingShapeTextCharacterProperties(view, ["color"]);
      const text = intent.target === "text" ? materializeDrawingShapeText(view) : undefined;
      const style = { ...(text ? text.style : view.shapeStyle) };
      if (intent.value === undefined) delete style[intent.category];
      else Object.assign(style, { [intent.category]: intent.value });
      return text ? withDrawingShapeText(view, { ...text, style }) : { ...view, shapeStyle: style };
    });
  }
  if (intent.type === "set-text-margins")
    return batchPlan(context, getShapeGroupFormatEligibleLeaves(context, "text"), (view) => {
      const text = materializeDrawingShapeText(view);
      text.layout.marginsPt = { ...intent.value };
      return withDrawingShapeText(view, text);
    });
  if (intent.type === "set-line-ends" || intent.type === "set-line-end")
    return batchPlan(context, getShapeGroupLineEligibleLeaves(context), (view) => {
      const next = { ...view };
      const ends = intent.type === "set-line-end" ? { ...view.shapeLineEnds } : intent.value;
      if (intent.type === "set-line-end") {
        if (intent.endpoint !== "begin" && intent.endpoint !== "end")
          throw new TypeError("Unknown shape line endpoint.");
        if (intent.value) Object.assign(ends!, { [intent.endpoint]: intent.value });
        else delete ends![intent.endpoint];
      }
      const normalized = normalizeShapeLineEnds(ends);
      if (normalized) next.shapeLineEnds = normalized;
      else delete next.shapeLineEnds;
      return next;
    });
  throw new TypeError("Unsupported shape group format intent.");
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
/** Omitted values/categories plus explicit mixed sets prevent first-leaf impersonation. */
export function aggregateShapeGroupFormatSnapshot(
  context: ShapeGroupFormatContext,
  baseline: ShapeGroupFormatBaseline,
): ShapeGroupFormatAggregate {
  const body = getShapeGroupFormatEligibleLeaves(context, "shape");
  const text = getShapeGroupFormatEligibleLeaves(context, "text");
  const values: Partial<ShapeFormatValues> = {
    ...getShapeObjectProperties(context.sourceNode.shapeProperties),
    anchor: context.anchor,
    locked: context.locked,
    printObject: context.printObject,
  };
  const layout = context.layout;
  if (layout)
    Object.assign(values, {
      sizeWidthPt: layout.rect.width * 0.75,
      sizeHeightPt: layout.rect.height * 0.75,
      rotationDeg: layout.angleDeg,
      ...(Number.isFinite(baseline.width) && baseline.width > 0
        ? { scaleWidthPercent: (layout.rect.width / baseline.width) * 100 }
        : {}),
      ...(Number.isFinite(baseline.height) && baseline.height > 0
        ? { scaleHeightPercent: (layout.rect.height / baseline.height) * 100 }
        : {}),
    });
  const mixedFields: ShapeFormatField[] = [];
  const textValues = text.map((leaf) => ({
    ...drawingShapeTextValues(leaf.view!),
  }));
  const fields = new Set([
    ...textValues.flatMap((entry) => Object.keys(entry) as ShapeFormatField[]),
    ...text.flatMap((leaf) => drawingShapeTextCharacterValues(leaf.view!).mixedFields),
  ]);
  for (const field of fields) {
    const eligible =
      field === "textLineOrder"
        ? textValues.filter((entry) => entry.textDirection === "stacked")
        : field === "paragraphLineSpacingPt"
          ? textValues.filter((entry) => entry.paragraphLineSpacing === "exact")
          : textValues;
    if (!eligible.length) continue;
    const first = eligible[0]![field as keyof (typeof textValues)[number]];
    if (
      !text.some((leaf) =>
        drawingShapeTextCharacterValues(leaf.view!).mixedFields.includes(field),
      ) &&
      eligible.every((entry) => sameValue(entry[field as keyof typeof entry], first))
    )
      Object.assign(values, { [field]: first });
    else mixedFields.push(field);
  }
  function styles(target: ShapeFormatMode): {
    style: PictureDetailedStyle;
    mixed: ShapeFormatStyleCategory[];
  } {
    const style: PictureDetailedStyle = {};
    const mixed: ShapeFormatStyleCategory[] = [];
    for (const category of styleCategories) {
      const leaves = getShapeGroupFormatEligibleLeaves(context, target, category);
      if (!leaves.length) continue;
      const entries = leaves.map((leaf) =>
        target === "shape"
          ? resolveShapeDetailedPaintStyle(leaf.view!)
          : resolveShapeTextPaintStyle(leaf.view!),
      );
      const first = entries[0]![category];
      if (entries.every((entry) => sameValue(entry[category], first))) {
        if (first !== undefined) Object.assign(style, { [category]: first });
      } else mixed.push(category);
    }
    return { style, mixed };
  }
  const shape = styles("shape"),
    glyph = styles("text");
  // Body Shadow belongs to this selected container, even when all leaves are
  // text boxes. It never impersonates a mixed aggregate of member shadows.
  for (const category of context.sourceNode.kind === "shapeGroup"
    ? SHAPE_GROUP_EFFECT_CATEGORIES
    : []) {
    delete shape.style[category];
    shape.mixed = shape.mixed.filter((entry) => entry !== category);
    const value =
      context.sourceNode.kind === "shapeGroup"
        ? context.sourceNode.groupEffects?.[category]
        : undefined;
    if (value) Object.assign(shape.style, { [category]: value });
  }
  // Camera readback follows the actual source owner, including an active ancestor
  // of an explicitly selected leaf. Per-leaf camera values stay dormant there.
  delete shape.style.rotation3d;
  shape.mixed = shape.mixed.filter((category) => category !== "rotation3d");
  if (context.rotation3dSource.rotation3d)
    shape.style.rotation3d = context.rotation3dSource.rotation3d;
  // Desktop Text Rotation is another entry to the same body camera owner, not
  // a glyph camera. Stored independent glyph sources are deliberately untouched.
  delete glyph.style.rotation3d;
  glyph.mixed = glyph.mixed.filter((category) => category !== "rotation3d");
  if (shape.style.rotation3d) glyph.style.rotation3d = shape.style.rotation3d;
  const independentTextCameraCount = context.rotation3dSource.affectedLeafPaths.filter((path) => {
    const node = findShapeGroupNode(context.sourceRoot, path)?.node;
    return node?.kind !== "shapeGroup" && node?.shapeText?.style?.rotation3d?.kind === "value";
  }).length;
  const lineLeaves = getShapeGroupLineEligibleLeaves(context);
  const ends: ShapeLineEnds = {};
  const mixedLineEnds: ("begin" | "end")[] = [];
  for (const endpoint of ["begin", "end"] as const) {
    const first = lineLeaves[0]?.sourceNode.shapeLineEnds?.[endpoint];
    if (lineLeaves.some((leaf) => !sameValue(leaf.sourceNode.shapeLineEnds?.[endpoint], first)))
      mixedLineEnds.push(endpoint);
    else if (first) ends[endpoint] = first;
  }
  const lineEnds = normalizeShapeLineEnds(ends);
  return {
    values,
    mixedFields,
    shapeStyle: shape.style,
    textStyle: glyph.style,
    mixedStyleCategories: { shape: shape.mixed, text: glyph.mixed },
    bodyEligibleCount: body.length,
    textEligibleCount: text.length,
    descendantCount: context.leaves.length,
    independentTextCameraCount,
    rotation3dAffectedCount: context.rotation3dSource.affectedLeafPaths.length,
    rotation3dInherited: context.rotation3dSource.inherited,
    rotation3dShared:
      context.sourceNode.kind === "shapeGroup" ||
      (context.rotation3dSource.source === "group" &&
        context.rotation3dSource.rotation3d?.kind === "value"),
    ...(lineEnds ? { lineEnds } : {}),
    mixedLineEnds,
    lineEligibleCount: lineLeaves.length,
  };
}
