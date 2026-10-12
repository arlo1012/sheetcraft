import {
  locatePictureAxisPoint,
  type PictureAxisMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  MAX_SHAPE_FRAME_SIZE,
  MIN_SHAPE_FRAME_SIZE,
  reanchorShapeFrame,
  shapeFrameLocalToWorld,
  type ResolvedShapeFrame,
  type ShapeFrameRect,
} from "@sheetcraft/core/shape-frame";
import { isShapeGroupDrawing, MAX_SHAPE_GROUP_NODES } from "@sheetcraft/core/shape-group";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupChild,
} from "@sheetcraft/core/shape-group-layout";
import {
  assertShapeDrawingForestLayouts,
  isShapeGroupEligibleRoot,
  normalizeShapeDrawingForest,
  resolveShapeRootLayout,
  type ShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import { hasShapeObjectFrame, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { ShapeAlignment, ShapeAlignmentReference } from "./shape-selection-actions";
import { standardShapeResizeRect } from "./standard-shape-layout";

export type EqualShapeDimensionsAction = "equal-height" | "equal-width" | "equal-size";
type Point = Readonly<{ x: number; y: number }>;
type Entry = { root: ShapeGroupEligibleRoot; layout: ResolvedShapeFrame };
type Selection = { roots: SheetDrawing[]; entries: Entry[]; last: Entry };

function selectedRootIds(values: readonly string[], minimum: number): string[] {
  if (
    !Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Array.prototype ||
    values.length < minimum ||
    values.length > MAX_SHAPE_GROUP_NODES
  )
    throw new TypeError("Shape transforms require distinct selected root IDs.");
  for (const key of Reflect.ownKeys(values)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= values.length ||
      !("value" in Object.getOwnPropertyDescriptor(values, key)!)
    )
      throw new TypeError("Shape selections require ordinary indexed data.");
  }
  const result: string[] = [];
  for (let index = 0; index < values.length; index++) {
    const field = Object.getOwnPropertyDescriptor(values, String(index));
    if (!field || !("value" in field) || typeof field.value !== "string" || !field.value.trim())
      throw new TypeError("Shape selections require dense non-empty root IDs.");
    result.push(field.value);
  }
  if (new Set(result).size !== result.length)
    throw new TypeError("Duplicate selected shape root IDs.");
  return result;
}

function point(value: Point): Point {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Shape movement requires an ordinary point.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Shape movement requires an ordinary point.");
  for (const key of Reflect.ownKeys(value))
    if ((key !== "x" && key !== "y") || !("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError("Shape movement requires own coordinate data.");
  const x: unknown = Object.getOwnPropertyDescriptor(value, "x")?.value;
  const y: unknown = Object.getOwnPropertyDescriptor(value, "y")?.value;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y))
    throw new RangeError("Shape movement must be finite.");
  return { x, y };
}

function selection(
  values: readonly SheetDrawing[],
  idsValue: readonly string[],
  metrics: PictureSheetMetrics,
  minimum = 1,
): Selection {
  const roots = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(roots, metrics);
  const ids = selectedRootIds(idsValue, minimum);
  const byId = new Map(roots.map((root) => [root.id, root]));
  const entries = ids.map((id): Entry => {
    const root = byId.get(id);
    if (!root || !isShapeGroupEligibleRoot(root))
      throw new TypeError(
        "Shape transform targets must be current shape, text box or group roots.",
      );
    const layout = resolveShapeRootLayout(root, metrics);
    if (layout.collapsed) throw new RangeError("Expand a collapsed shape root before editing it.");
    return { root, layout };
  });
  return { roots, entries, last: entries[entries.length - 1]! };
}

function sameRect(left: ShapeFrameRect, right: ShapeFrameRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

/** Legacy placement keeps its own free-offset model, including terminal sheet overflow. */
function legacyOrigin(
  position: number,
  axis: PictureAxisMetrics,
): { index: number; offset: number } {
  if (position < 0) throw new RangeError("A legacy shape cannot have a negative origin.");
  const located = locatePictureAxisPoint(position, axis);
  const index = Math.min(located.index, axis.count - 1);
  return { index, offset: position - axis.visiblePrefix(index) };
}

function replaceRootRect(
  entry: Entry,
  rect: ShapeFrameRect,
  metrics: PictureSheetMetrics,
): SheetDrawing {
  const { root, layout } = entry;
  if (sameRect(layout.rect, rect)) return root;
  if (hasShapeObjectFrame(root))
    return { ...root, shapeFrame: reanchorShapeFrame(root.shapeFrame, rect, metrics) };
  const column =
    rect.x === layout.rect.x
      ? { index: root.anchor.column, offset: root.offsetX }
      : legacyOrigin(rect.x, metrics.columns);
  const row =
    rect.y === layout.rect.y
      ? { index: root.anchor.row, offset: root.offsetY }
      : legacyOrigin(rect.y, metrics.rows);
  return {
    ...root,
    anchor: { column: column.index, row: row.index },
    offsetX: column.offset,
    offsetY: row.offset,
    width: rect.width,
    height: rect.height,
  };
}

function finish(
  selected: Selection,
  rectangles: ReadonlyMap<string, ShapeFrameRect>,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const entries = new Map(selected.entries.map((entry) => [entry.root.id, entry]));
  const next = selected.roots.map((root) => {
    const rect = rectangles.get(root.id);
    return rect ? replaceRootRect(entries.get(root.id)!, rect, metrics) : root;
  });
  const result = normalizeShapeDrawingForest(next);
  assertShapeDrawingForestLayouts(result, metrics);
  return result;
}

/** One shared delta constrains the whole selection at every legacy leading boundary. */
export function moveSelectedShapeRoots(
  values: readonly SheetDrawing[],
  orderedSelectedIds: readonly string[],
  deltaValue: Point,
  metrics: PictureSheetMetrics,
): SheetDrawing[] {
  const delta = point(deltaValue);
  const selected = selection(values, orderedSelectedIds, metrics);
  const legacy = selected.entries.filter(({ root }) => !hasShapeObjectFrame(root));
  const x = Math.max(
    delta.x,
    legacy.length ? -Math.min(...legacy.map(({ layout }) => layout.rect.x)) : -Infinity,
  );
  const y = Math.max(
    delta.y,
    legacy.length ? -Math.min(...legacy.map(({ layout }) => layout.rect.y)) : -Infinity,
  );
  if (x === 0 && y === 0) return selected.roots;
  return finish(
    selected,
    new Map(
      selected.entries.map(({ root, layout }) => [
        root.id,
        { ...layout.rect, x: layout.rect.x + x, y: layout.rect.y + y },
      ]),
    ),
    metrics,
  );
}

/** Root and every descendant have the same local-axis factors, regardless of relative angles. */
function dimensions(entry: Entry, metrics: PictureSheetMetrics): ShapeFrameRect[] {
  const result = [entry.layout.rect];
  if (!isShapeGroupDrawing(entry.root)) return result;
  const pending: ResolvedShapeGroupChild[] = [...resolveShapeGroup(entry.root, metrics).members];
  while (pending.length) {
    const child = pending.pop()!;
    if (!child.layout) throw new RangeError("A selected shape group has collapsed descendants.");
    result.push(child.layout.rect);
    if ("members" in child) pending.push(...child.members);
  }
  return result;
}

function scaleRange(rectangles: readonly ShapeFrameRect[], axis: "width" | "height") {
  function safeEndpoint(size: number, bound: number, lower: boolean): number {
    const scale = bound / size;
    if (!Number.isFinite(scale) || (lower ? size * scale >= bound : size * scale <= bound))
      return scale;
    // An inverse rounded toward the outside can multiply back to 1-epsilon.
    // Move this shared bound one floating-point step inward, without rounding
    // or independently clamping any root or descendant's persisted dimensions.
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, scale);
    bits.setBigUint64(0, bits.getBigUint64(0) + (lower ? 1n : -1n));
    return bits.getFloat64(0);
  }
  return {
    lower: Math.max(
      ...rectangles.map((rect) => safeEndpoint(rect[axis], MIN_SHAPE_FRAME_SIZE, true)),
    ),
    upper: Math.min(
      ...rectangles.map((rect) => safeEndpoint(rect[axis], MAX_SHAPE_FRAME_SIZE, false)),
    ),
  };
}

/** Fix each root's own rotated opposite edge/corner. Never resize a temporary union rectangle. */
function scaledRect(
  entry: Entry,
  direction: FloatingImageResizeDirection,
  sx: number,
  sy: number,
): ShapeFrameRect {
  const { rect, angleDeg } = entry.layout;
  if (sx === 1 && sy === 1) return rect;
  const width = rect.width * sx,
    height = rect.height * sy;
  const fx = direction.includes("w") ? 1 : direction.includes("e") ? 0 : 0.5;
  const fy = direction.includes("n") ? 1 : direction.includes("s") ? 0 : 0.5;
  const fixed = shapeFrameLocalToWorld(rect, angleDeg, { x: rect.width * fx, y: rect.height * fy });
  const angle = (angleDeg * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const vx = (fx - 0.5) * width,
    vy = (fy - 0.5) * height;
  return {
    x: fixed.x - cos * vx + sin * vy - width / 2,
    y: fixed.y - sin * vx - cos * vy - height / 2,
    width,
    height,
  };
}

function assertScaledSizes(rectangles: readonly ShapeFrameRect[], sx: number, sy: number): void {
  for (const rect of rectangles)
    for (const [axis, scale] of [
      ["width", sx],
      ["height", sy],
    ] as const) {
      if (scale === 1) continue;
      const size = rect[axis] * scale;
      if (!Number.isFinite(size) || size < MIN_SHAPE_FRAME_SIZE || size > MAX_SHAPE_FRAME_SIZE)
        throw new RangeError("Shape root or descendant exceeds the edited size budget.");
    }
}

/** Geometry-only multi-resize. Group children retain their exact persisted ratios and appearance. */
export function resizeSelectedShapeRoots(
  values: readonly SheetDrawing[],
  orderedSelectedIds: readonly string[],
  activeId: string,
  direction: FloatingImageResizeDirection,
  deltaValue: Point,
  metrics: PictureSheetMetrics,
  shift = false,
): SheetDrawing[] {
  if (
    !["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction) ||
    typeof shift !== "boolean"
  )
    throw new TypeError("Invalid shape selection resize handle or modifier.");
  const delta = point(deltaValue);
  const selected = selection(values, orderedSelectedIds, metrics);
  const active = selected.entries.find(({ root }) => root.id === activeId);
  if (!active) throw new TypeError("The active resize target must be a selected shape root.");
  const horizontal = direction.includes("w") || direction.includes("e");
  const vertical = direction.includes("n") || direction.includes("s");
  const angle = (active.layout.angleDeg * Math.PI) / 180;
  const dx = Math.cos(angle) * delta.x + Math.sin(angle) * delta.y;
  const dy = -Math.sin(angle) * delta.x + Math.cos(angle) * delta.y;
  const rect = active.layout.rect;
  const changesX = horizontal && rect.width + (direction.includes("w") ? -dx : dx) !== rect.width;
  const changesY = vertical && rect.height + (direction.includes("n") ? -dy : dy) !== rect.height;
  // Preserve projected subpixel dimensions and raw anchors on zero/perpendicular/sub-ulp drags.
  if (!changesX && !changesY) return selected.roots;
  const locked =
    horizontal &&
    vertical &&
    (shift ||
      (hasShapeObjectFrame(active.root) &&
        getShapeObjectProperties(active.root.shapeProperties).lockAspectRatio));
  const requested = standardShapeResizeRect(
    rect,
    active.layout.angleDeg,
    direction,
    delta,
    locked,
    MIN_SHAPE_FRAME_SIZE,
    true,
  );
  if (!requested) throw new RangeError("The requested shape resize cannot resolve.");
  const sizes = selected.entries.flatMap((entry) => dimensions(entry, metrics));
  const rx = scaleRange(sizes, "width"),
    ry = scaleRange(sizes, "height");
  const clamp = (value: number, lower: number, upper: number) =>
    Math.min(Math.max(value, lower), upper);
  let sx = changesX || locked ? requested.width / rect.width : 1;
  let sy = changesY || locked ? requested.height / rect.height : 1;
  if (locked) {
    const lower = Math.max(rx.lower, ry.lower),
      upper = Math.min(rx.upper, ry.upper);
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper)
      throw new RangeError("The selected shape roots have no common resize size interval.");
    sx = sy = clamp(sx, lower, upper);
  } else {
    if (
      (sx !== 1 &&
        (!Number.isFinite(rx.lower) || !Number.isFinite(rx.upper) || rx.lower > rx.upper)) ||
      (sy !== 1 &&
        (!Number.isFinite(ry.lower) || !Number.isFinite(ry.upper) || ry.lower > ry.upper))
    )
      throw new RangeError("The selected shape roots have no common resize size interval.");
    if (sx !== 1) sx = clamp(sx, rx.lower, rx.upper);
    if (sy !== 1) sy = clamp(sy, ry.lower, ry.upper);
  }
  // Rotated legacy origins impose a coupled bound. Advance all shared factors
  // together from identity, rather than clamping one member's position or size.
  let progress = 1;
  for (const entry of selected.entries) {
    if (hasShapeObjectFrame(entry.root)) continue;
    const next = scaledRect(entry, direction, sx, sy);
    for (const axis of ["x", "y"] as const)
      if (next[axis] < 0)
        progress = Math.min(
          progress,
          entry.layout.rect[axis] / (entry.layout.rect[axis] - next[axis]),
        );
  }
  if (progress < 1) {
    progress = Math.max(0, progress * (1 - Number.EPSILON));
    sx = 1 + (sx - 1) * progress;
    sy = 1 + (sy - 1) * progress;
  }
  if (sx === 1 && sy === 1) return selected.roots;
  assertScaledSizes(sizes, sx, sy);
  return finish(
    selected,
    new Map(selected.entries.map((entry) => [entry.root.id, scaledRect(entry, direction, sx, sy)])),
    metrics,
  );
}

function referenceMode(reference: ShapeAlignmentReference): void {
  if (reference !== "selection" && reference !== "last-selected")
    throw new TypeError("Unknown shape alignment reference.");
}

/** Arrangement follows actual unrotated root layouts, independent of paint and descendant bounds. */
export function alignSelectedShapeRoots(
  values: readonly SheetDrawing[],
  orderedSelectedIds: readonly string[],
  action: ShapeAlignment,
  metrics: PictureSheetMetrics,
  reference: ShapeAlignmentReference = "selection",
): SheetDrawing[] {
  if (
    ![
      "left",
      "center",
      "right",
      "top",
      "middle",
      "bottom",
      "both",
      "horizontal",
      "vertical",
    ].includes(action)
  )
    throw new TypeError("Unknown shape alignment action.");
  referenceMode(reference);
  const selected = selection(values, orderedSelectedIds, metrics, 2);
  const distribution = action === "horizontal" || action === "vertical";
  if (distribution && selected.entries.length < 3) return selected.roots;
  const left = Math.min(...selected.entries.map(({ layout }) => layout.rect.x));
  const top = Math.min(...selected.entries.map(({ layout }) => layout.rect.y));
  const right = Math.max(
    ...selected.entries.map(({ layout }) => layout.rect.x + layout.rect.width),
  );
  const bottom = Math.max(
    ...selected.entries.map(({ layout }) => layout.rect.y + layout.rect.height),
  );
  const base =
    reference === "last-selected"
      ? selected.last.layout.rect
      : { x: left, y: top, width: right - left, height: bottom - top };
  const horizontal = action === "horizontal";
  // Stable ties follow worksheet stack order, not click order.
  const stack = new Map(selected.roots.map((root, index) => [root.id, index]));
  const ordered = [...selected.entries].sort(
    (a, b) =>
      (horizontal ? a.layout.rect.x - b.layout.rect.x : a.layout.rect.y - b.layout.rect.y) ||
      stack.get(a.root.id)! - stack.get(b.root.id)!,
  );
  const gap =
    ((horizontal ? right - left : bottom - top) -
      selected.entries.reduce(
        (sum, { layout }) => sum + (horizontal ? layout.rect.width : layout.rect.height),
        0,
      )) /
    (selected.entries.length - 1);
  let cursor = horizontal ? left : top;
  const rectangles = new Map<string, ShapeFrameRect>();
  for (const { root, layout } of ordered) {
    const rect = layout.rect;
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
    rectangles.set(root.id, { ...rect, x, y });
  }
  return finish(selected, rectangles, metrics);
}

/**
 * The last ordered root supplies dimensions in both reference modes. Width/height
 * honor each target's aspect lock; equal size replaces both axes without changing
 * that metadata. The published picture policy fixes unrotated layout top-left,
 * including rotated roots; this is a product policy, not a new desktop-shape claim.
 */
export function equalizeSelectedShapeRoots(
  values: readonly SheetDrawing[],
  orderedSelectedIds: readonly string[],
  action: EqualShapeDimensionsAction,
  metrics: PictureSheetMetrics,
  reference: ShapeAlignmentReference = "selection",
): SheetDrawing[] {
  if (!["equal-height", "equal-width", "equal-size"].includes(action))
    throw new TypeError("Unknown equal shape dimensions action.");
  referenceMode(reference);
  const selected = selection(values, orderedSelectedIds, metrics, 2);
  const target = selected.last.layout.rect;
  const rectangles = new Map<string, ShapeFrameRect>();
  for (const entry of selected.entries) {
    const rect = entry.layout.rect;
    let width = action === "equal-height" ? rect.width : target.width;
    let height = action === "equal-width" ? rect.height : target.height;
    const locked =
      hasShapeObjectFrame(entry.root) &&
      getShapeObjectProperties(entry.root.shapeProperties).lockAspectRatio;
    if (locked && action === "equal-width") height = rect.height * (width / rect.width);
    if (locked && action === "equal-height") width = rect.width * (height / rect.height);
    if (width === rect.width && height === rect.height) continue;
    assertScaledSizes(dimensions(entry, metrics), width / rect.width, height / rect.height);
    rectangles.set(entry.root.id, { ...rect, width, height });
  }
  return finish(selected, rectangles, metrics);
}
