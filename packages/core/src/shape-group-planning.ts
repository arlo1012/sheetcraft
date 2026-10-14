import { toggleEquationFlipState, type EquationFlipAxis } from "./equation-flip.js";
import { resolveSheetShapeConnections } from "./shape-connector-layout.js";
import { materializeShapeGroup3dReleaseChildren } from "./shape-group-3d.js";
import type { PictureSheetMetrics } from "./picture-axis-metrics.js";
import { readPictureDataArray } from "./picture-data-array.js";
import { normalizePictureAngle, resolvePictureLayout } from "./picture-frame.js";
import { anchorShapeFrameRect, resolveShapeFrame, type ResolvedShapeFrame } from "./shape-frame.js";
import {
  cloneShapeGroupChild,
  findShapeGroupNode,
  MAX_SHAPE_GROUP_DEPTH,
  type ShapeGroupPath,
  type SheetGroupedEquationDrawing,
  isShapeGroupDrawing,
  MAX_SHAPE_GROUP_NODES,
  normalizeShapeGroup,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "./shape-group.js";
import {
  placeShapeGroupChild,
  resolveShapeGroup,
  resolveShapeGroupChildLayout,
  unionShapeGroupLayoutRects,
} from "./shape-group-layout.js";
import {
  getShapeObjectProperties,
  normalizeShapeObjectProperties,
  type ShapeObjectProperties,
} from "./shape-object-properties.js";
import {
  isFramedShapeDrawing,
  isFramedEquationDrawing,
  type SheetFramedEquationDrawing,
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "./sheet-drawings.js";

export type ShapeGroupEligibleRoot =
  | ShapeGroupDrawing
  | SheetFramedGraphicDrawing
  | SheetFramedEquationDrawing
  | (SheetGraphicDrawing & { kind: "shape" | "textBox" | "equation" });

function dataRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor))
      throw new TypeError(`${name} must contain own data fields, not accessors or symbols.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function ids(value: readonly string[]): string[] {
  const result = readPictureDataArray(value, "shape grouping targets", MAX_SHAPE_GROUP_NODES);
  if (result.some((id) => typeof id !== "string" || !id.trim()))
    throw new TypeError("Shape grouping targets require non-empty IDs.");
  return result;
}
export function isShapeGroupEligibleRoot(value: SheetDrawing): value is ShapeGroupEligibleRoot {
  return (
    value.kind === "shapeGroup" ||
    value.kind === "shape" ||
    value.kind === "textBox" ||
    value.kind === "equation"
  );
}
/** Complete source-checked forest, including ordinary drawing IDs and unselected owned trees. */
export function normalizeShapeDrawingForest(values: readonly SheetDrawing[]): SheetDrawing[] {
  const source = readPictureDataArray(values, "shape drawing forest", MAX_SHAPE_GROUP_NODES);
  for (const value of source) {
    const root = dataRecord(value, "shape drawing root");
    if (root.anchor !== undefined) dataRecord(root.anchor, "legacy drawing anchor");
  }
  const roots = normalizeSheetDrawings(source);
  let count = 0;
  for (const root of roots) {
    count += isShapeGroupDrawing(root) ? traverseShapeGroup(root).length : 1;
    if (count > MAX_SHAPE_GROUP_NODES)
      throw new RangeError("Shape drawing forest node budget exceeded.");
  }
  return roots;
}
/** Geometry only; resolving a legacy leaf never promotes its persisted representation. */
export function resolveShapeRootLayout(
  value: ShapeGroupEligibleRoot,
  metrics: PictureSheetMetrics,
): ResolvedShapeFrame {
  if (isShapeGroupDrawing(value)) return resolveShapeGroup(value, metrics).layout;
  if (isFramedShapeDrawing(value) || isFramedEquationDrawing(value))
    return resolveShapeFrame(value.shapeFrame, metrics, value.rotation);
  return resolvePictureLayout(
    {
      x: metrics.columns.visiblePrefix(value.anchor.column) + value.offsetX,
      y: metrics.rows.visiblePrefix(value.anchor.row) + value.offsetY,
      width: value.width,
      height: value.height,
    },
    value.rotation,
  );
}
/** Checks all eligible roots and descendants, even when an operation leaves them untouched. */
export function assertShapeDrawingForestLayouts(
  values: readonly SheetDrawing[],
  metrics: PictureSheetMetrics,
): void {
  for (const value of values)
    if (isShapeGroupEligibleRoot(value)) resolveShapeRootLayout(value, metrics);
}

function toMember(
  value: ShapeGroupEligibleRoot,
  parent: ResolvedShapeFrame,
  metrics: PictureSheetMetrics,
): ShapeGroupChild {
  const placement = placeShapeGroupChild(parent, resolveShapeRootLayout(value, metrics));
  if (placement.status !== "placed") throw new RangeError("Cannot group into a collapsed owner.");
  if (isShapeGroupDrawing(value)) {
    const { shapeFrame: _frame, ...group } = value;
    return {
      ...group,
      groupFrame: placement.groupFrame,
      rotation: placement.rotation,
      members: value.members.map(cloneShapeGroupChild),
    };
  }
  if (value.kind === "equation") {
    const math: SheetGroupedEquationDrawing = {
      id: value.id,
      kind: "equation",
      name: value.name,
      text: value.text,
      shape: value.shape,
      fill: value.fill,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
      color: value.color,
      fontSize: value.fontSize,
      bold: value.bold,
      italic: value.italic,
      rotation: placement.rotation,
      groupFrame: placement.groupFrame,
      ...(value.equationDocument ? { equationDocument: value.equationDocument } : {}),
      ...(value.equationFlipX ? { equationFlipX: true as const } : {}),
      ...(value.equationFlipY ? { equationFlipY: true as const } : {}),
      ...(value.hidden ? { hidden: true as const } : {}),
      ...(isFramedEquationDrawing(value) && value.shapeProperties
        ? { shapeProperties: value.shapeProperties }
        : {}),
    };
    return math;
  }
  if (isFramedShapeDrawing(value)) {
    const { shapeFrame: _frame, ...appearance } = value;
    return { ...appearance, groupFrame: placement.groupFrame, rotation: placement.rotation };
  }
  const {
    anchor: _anchor,
    offsetX: _offsetX,
    offsetY: _offsetY,
    width: _width,
    height: _height,
    ...appearance
  } = value;
  return { ...appearance, groupFrame: placement.groupFrame, rotation: placement.rotation };
}

const equationPromotionFields = [
  "id",
  "kind",
  "name",
  "text",
  "shape",
  "fill",
  "stroke",
  "strokeWidth",
  "color",
  "fontSize",
  "bold",
  "italic",
  "rotation",
  "anchor",
  "offsetX",
  "offsetY",
  "width",
  "height",
  "equationDocument",
  "equationFlipX",
  "equationFlipY",
] as const;
/** Legacy Equation grouping is a strict, explicit source/placement promotion boundary. */
function assertEquationRootPromotionSource(value: SheetDrawing): void {
  if (Object.getOwnPropertyDescriptor(value, "kind")?.value !== "equation" || "shapeFrame" in value)
    return;
  const source = dataRecord(value, "legacy Equation promotion source");
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== "string" || !(equationPromotionFields as readonly string[]).includes(key))
      throw new TypeError("Unknown or conflicting legacy Equation promotion field.");
    if (source[key] === undefined)
      throw new TypeError("Legacy Equation promotion requires defined own data fields.");
  }
  for (const key of equationPromotionFields) {
    if (!Object.hasOwn(source, key) && key in value)
      throw new TypeError("Legacy Equation promotion fields must be own data fields.");
    if (
      !Object.hasOwn(source, key) &&
      key !== "equationDocument" &&
      key !== "equationFlipX" &&
      key !== "equationFlipY"
    )
      throw new TypeError("Legacy Equation promotion requires its complete source and placement.");
  }
  const anchor = dataRecord(source.anchor, "legacy Equation promotion anchor");
  if (
    Reflect.ownKeys(anchor).some((key) => key !== "row" && key !== "column") ||
    !Object.hasOwn(anchor, "row") ||
    !Object.hasOwn(anchor, "column")
  )
    throw new TypeError("Legacy Equation promotion anchors require only own row and column data.");
}
/** Explicit object operation only; loading a legacy source never rewrites its placement. */
export function promoteEquationRootFrame(
  value: SheetDrawing,
  metrics: PictureSheetMetrics,
): SheetFramedEquationDrawing {
  if (value.kind !== "equation") throw new TypeError("Equation promotion requires a math root.");
  assertEquationRootPromotionSource(value);
  const normalized = normalizeSheetDrawing(value);
  if (normalized.kind !== "equation")
    throw new TypeError("Equation promotion changed its source kind.");
  if (isFramedEquationDrawing(normalized)) return normalized;
  const legacy = { ...normalized, kind: "equation" as const };
  const layout = resolveShapeRootLayout(legacy, metrics);
  const {
    anchor: _anchor,
    offsetX: _offsetX,
    offsetY: _offsetY,
    width: _width,
    height: _height,
    ...appearance
  } = legacy;
  const result = normalizeSheetDrawing({
    ...appearance,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "fixed",
        x: layout.rect.x,
        y: layout.rect.y,
        size: { width: layout.rect.width, height: layout.rect.height },
      },
    },
  });
  if (!isFramedEquationDrawing(result))
    throw new TypeError("Equation promotion lost its dedicated frame.");
  return result;
}
/**
 * Explicit promotion boundary. Noncontiguous selected roots retain their stack order
 * inside a new zero-rotation owner inserted at the highest selected root's slot.
 */
export function groupShapeRoots(
  values: readonly SheetDrawing[],
  selectedIds: readonly string[],
  identity: { id: string; name: string },
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const targets = ids(selectedIds);
  const raw = readPictureDataArray(values, "shape grouping roots", MAX_SHAPE_GROUP_NODES);
  for (const target of targets) {
    const matches = raw.filter(
      (value) => Object.getOwnPropertyDescriptor(value, "id")?.value === target,
    );
    if (matches.length !== 1)
      throw new TypeError("Grouping targets require unique own source IDs.");
    assertEquationRootPromotionSource(matches[0]!);
  }
  const roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  if (targets.length < 2) throw new RangeError("Grouping requires at least two shape roots.");
  const selected = new Set(targets);
  if (selected.size !== targets.length) throw new TypeError("Duplicate shape grouping targets.");
  const members = roots.filter((root) => selected.has(root.id));
  if (members.length !== selected.size || members.some((root) => !isShapeGroupEligibleRoot(root)))
    throw new TypeError("Shape grouping targets must be current eligible roots.");
  const identityFields = dataRecord(identity, "shape group identity");
  if (Reflect.ownKeys(identityFields).some((key) => key !== "id" && key !== "name"))
    throw new TypeError("Unknown shape group identity field.");
  if (
    typeof identityFields.id !== "string" ||
    !identityFields.id.trim() ||
    typeof identityFields.name !== "string"
  )
    throw new TypeError("A shape group identity requires a non-empty ID and a name.");
  for (const root of roots)
    for (const node of isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node }) => node)
      : [root])
      if (node.id === identityFields.id)
        throw new TypeError("Shape group identity collides with a drawing node.");
  const eligible = members as ShapeGroupEligibleRoot[];
  const rect = unionShapeGroupLayoutRects(
    eligible.map((root) => resolveShapeRootLayout(root, metrics).rect),
  );
  const parent = resolvePictureLayout(rect, 0);
  const group = normalizeShapeGroup({
    kind: "shapeGroup",
    id: identityFields.id,
    name: identityFields.name,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: anchorShapeFrameRect("move-and-size", rect, metrics),
    },
    rotation: 0,
    members: eligible.map((root) => toMember(root, parent, metrics)),
  });
  let last = -1;
  roots.forEach((root, index) => {
    if (selected.has(root.id)) last = index;
  });
  const result = normalizeShapeDrawingForest(
    roots.flatMap((root, index): SheetDrawing[] =>
      index === last ? [group] : selected.has(root.id) ? [] : [root],
    ),
  );
  assertShapeDrawingForestLayouts(result, metrics);
  return result;
}

/** Root lock/print policy follows the released owner; aspect and alternate text remain child-owned. */
export function inheritShapeGroupOwnerProperties(
  child: ShapeObjectProperties | undefined,
  owner: ShapeObjectProperties | undefined,
): ShapeObjectProperties | undefined {
  const behavior = getShapeObjectProperties(owner);
  return normalizeShapeObjectProperties({
    ...child,
    locked: behavior.locked,
    printObject: behavior.printObject,
  });
}
/** One child becomes a worksheet root at its current world layout, without flattening descendants. */
export function releaseShapeGroupChild(
  member: ShapeGroupChild,
  world: ResolvedShapeFrame,
  metrics: PictureSheetMetrics,
  ownerProperties?: ShapeObjectProperties,
  ownerHidden?: boolean,
): SheetDrawing {
  if (ownerHidden !== undefined && typeof ownerHidden !== "boolean")
    throw new TypeError("Released shape owner visibility must be a boolean.");
  if (world.collapsed) throw new RangeError("Expand a collapsed group before releasing its child.");
  const { groupFrame: _frame, shapeProperties: _properties, ...appearance } = member;
  const shapeProperties = inheritShapeGroupOwnerProperties(member.shapeProperties, ownerProperties);
  const shapeFrame = {
    kind: "shape-frame-v1" as const,
    anchor: anchorShapeFrameRect("move-and-size", world.rect, metrics),
  };
  return normalizeSheetDrawing({
    ...appearance,
    ...(ownerHidden === true ? { hidden: true as const } : {}),
    shapeFrame,
    rotation: world.angleDeg,
    ...(shapeProperties ? { shapeProperties } : {}),
  });
}
/** One level only, at the existing stack slot; root behavior and every child's world layout survive. */
export function ungroupShapeRoot(
  values: readonly SheetDrawing[],
  groupId: string,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const group = roots.find((root) => root.id === groupId);
  if (!group || !isShapeGroupDrawing(group))
    throw new TypeError("Ungroup target must be a current root shape group.");
  const parent = resolveShapeGroup(group, metrics).layout;
  if (parent.collapsed) throw new RangeError("Expand a collapsed group before ungrouping.");
  const children = materializeShapeGroup3dReleaseChildren(group, [group.id], group.members);
  const released = children.map((member) => {
    const world = resolveShapeGroupChildLayout(parent, member);
    if (!world) throw new RangeError("Expand a collapsed group before ungrouping.");
    return releaseShapeGroupChild(member, world, metrics, group.shapeProperties, group.hidden);
  });
  const result = normalizeShapeDrawingForest(
    roots.flatMap((root) => (root.id === groupId ? released : [root])),
  );
  assertShapeDrawingForestLayouts(result, metrics);
  return result;
}

/** Reflect only local centers/angles. Math flags remain independent of shape-body flips. */
function reflectShapeGroupMember(member: ShapeGroupChild, axis: EquationFlipAxis): void {
  const rect = member.groupFrame.rect;
  member.groupFrame = {
    ...member.groupFrame,
    rect: {
      ...rect,
      ...(axis === "horizontal"
        ? { xRatio: 1 - rect.xRatio - rect.widthRatio }
        : { yRatio: 1 - rect.yRatio - rect.heightRatio }),
    },
  };
  member.rotation = normalizePictureAngle(-member.rotation);
  if (member.kind === "shapeGroup")
    for (const child of member.members) reflectShapeGroupMember(child, axis);
  else toggleShapeOrEquationFlip(member, axis);
}
function toggleShapeOrEquationFlip(
  node: SheetDrawing | ShapeGroupChild,
  axis: EquationFlipAxis,
): void {
  if (node.kind === "equation") {
    const flags = toggleEquationFlipState(node, axis);
    delete node.equationFlipX;
    delete node.equationFlipY;
    Object.assign(node, flags);
    return;
  }
  if (node.kind !== "shape" && node.kind !== "textBox")
    throw new TypeError("Shape flips require a shape, text box or equation.");
  const key = axis === "horizontal" ? "shapeFlipX" : "shapeFlipY";
  if (node[key]) delete node[key];
  else node[key] = true;
}
function assertShapeNodeFlippable(node: SheetDrawing | ShapeGroupChild, reflected = false): void {
  if (node.kind === "shapeGroup") {
    for (const child of node.members) assertShapeNodeFlippable(child, true);
    return;
  }
  if (node.kind !== "shape" && node.kind !== "textBox" && node.kind !== "equation")
    throw new TypeError("Shape flips require a shape, text box or equation.");
  if (node.kind === "shape" && node.shapeConnector && !reflected)
    throw new TypeError("A live connector cannot use ordinary shape flip geometry.");
}
/** Atomic pure forest plan. IDs, exact owner paths and connector sources stay intact. */
export function planFlipShapeDrawingNodes(
  values: readonly SheetDrawing[],
  selectedPaths: readonly ShapeGroupPath[],
  axis: EquationFlipAxis,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  if (axis !== "horizontal" && axis !== "vertical")
    throw new TypeError("Unknown shape drawing flip axis.");
  const roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const paths = readPictureDataArray(
    selectedPaths,
    "shape flip selection",
    MAX_SHAPE_GROUP_NODES,
  ).map((path) => readPictureDataArray(path, "shape flip path", MAX_SHAPE_GROUP_DEPTH + 1));
  const targets = paths.map((path) => {
    if (!path.length || path.some((id) => typeof id !== "string" || !id.trim()))
      throw new TypeError("Shape flip paths require non-empty IDs.");
    const root = roots.find((entry) => entry.id === path[0]);
    const node =
      path.length === 1
        ? root
        : root && isShapeGroupDrawing(root)
          ? findShapeGroupNode(root, path)?.node
          : undefined;
    if (!node) throw new TypeError("Shape flip target is missing or reparented.");
    return { node, path };
  });
  const selected = new Set(targets.map(({ node }) => node.id));
  if (selected.size !== targets.length) throw new TypeError("Duplicate shape flip targets.");
  const retained = targets.filter(({ path }) => !path.slice(0, -1).some((id) => selected.has(id)));
  for (const { node } of retained) assertShapeNodeFlippable(node);
  for (const { node } of retained)
    if (node.kind === "shapeGroup")
      for (const member of node.members) reflectShapeGroupMember(member, axis);
    else toggleShapeOrEquationFlip(node, axis);
  const result = normalizeShapeDrawingForest(roots);
  assertShapeDrawingForestLayouts(result, metrics);
  const hasConnector = result.some((root) =>
    isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).some(({ node }) => node.kind === "shape" && node.shapeConnector)
      : root.kind === "shape" && root.shapeConnector,
  );
  if (hasConnector) resolveSheetShapeConnections(result, metrics);
  return result;
}
