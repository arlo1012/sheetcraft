import {
  cloneShapeGroup,
  traverseShapeGroupVisibility,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ResolvedShapeFrame } from "@sheetcraft/core/shape-frame";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import {
  createDetailedPictureRaster,
  planDetailedPictureRaster,
  type DecodedPicturePaintImage,
  type PictureDetailedRasterReadyPlan,
} from "../../shared/images/picture-detailed-compositor";
import type { PictureEffectBounds } from "../../shared/images/picture-effect-geometry";
import type { PicturePaintResources } from "../../shared/images/picture-detailed-render";
import {
  resolveShapeGroupProjection,
  type ResolvedShapeGroupLeaf,
  type ResolvedShapeGroupOwner,
  type ResolvedShapeGroupProjection,
} from "./resolved-shape-group";
import {
  getShapeLeafPixelsOwnedBytes,
  planShapeLeafPixels,
  prepareShapeLeafPixels,
  type ShapeLeafPixelsOptions,
  type ShapeLeafPixelsPlan,
  type ShapeLeafPixelsUnavailableReason,
} from "./shape-leaf-pixels";
import {
  getShapePresentationAllocatedBytes,
  releaseShapePresentationCanvas,
  resizeShapePresentationCanvas,
} from "./shape-detailed-presentation";
import type { DrawingShapeTextRuntimeOptions } from "./shape-text-runtime";
import type { ResolvedShapeForestForRender } from "./resolved-shape-render-source";
import type { ShapeConnectorPaintLayout } from "@sheetcraft/core/shape-connector-route";

export const SHAPE_GROUP_PAINT_LIMITS = Object.freeze({
  side: 4096,
  pixels: 4_000_000,
  memoryBytes: 64 * 1024 * 1024,
  replans: 16,
});
export type ShapeGroupPaintOptions = Readonly<{
  root: ShapeGroupDrawing;
  metrics: PictureSheetMetrics;
  /** Whole-sheet relation pass; filtering owners must not remove external targets. */
  renderPass?: ResolvedShapeForestForRender;
  density: number;
  resources?: PicturePaintResources;
  /** Printing has no hit surfaces. Worksheet interaction includes every node's alpha. */
  interactive?: boolean;
  canvasFactory?: () => HTMLCanvasElement;
  textRuntimeOptions?: DrawingShapeTextRuntimeOptions;
  legacyLineHeightPx?: number;
  /** Suppress the active editor's glyphs, never its body or saved text. */
  editingTextId?: string;
}>;
type GroupPlanBase = Readonly<{
  root: ShapeGroupDrawing;
  sourceRoot: ShapeGroupDrawing;
  /** Detached canonical snapshot; no private descendant is promoted to a worksheet root. */
  snapshotRoot: ShapeGroupDrawing;
  metrics: PictureSheetMetrics;
  renderPass?: ResolvedShapeForestForRender;
  layout: ResolvedShapeFrame;
  resolvedRootLayout: ResolvedShapeFrame;
  actualDensity: number;
  logicalBounds: PictureEffectBounds;
  widthRaster: number;
  heightRaster: number;
  estimatedPeakBytes: number;
  /** Retained root canvas and, for interactive paint, all compact node masks. */
  ownedBytes: number;
  interactive: boolean;
  /** Object visibility is independent of the canonical resolved geometry. */
  visible: boolean;
  /** A visible owner may have no visible, paintable descendants. */
  empty: boolean;
  collapsed: boolean;
}>;
export type ShapeGroupPaintPlan = GroupPlanBase &
  (
    | Readonly<{ kind: "ready" }>
    | Readonly<{
        kind: "unavailable";
        reason: ShapeLeafPixelsUnavailableReason;
        missingAssetIds: readonly string[];
        message?: string;
      }>
  );
export type ShapeGroupPaintResult =
  | (Extract<ShapeGroupPaintPlan, { kind: "ready" }> &
      Readonly<{ canvas: HTMLCanvasElement; dispose: () => void }>)
  | Extract<ShapeGroupPaintPlan, { kind: "unavailable" }>;
export type ShapeGroupPaintHit = Readonly<{ kind: "leaf" | "owner"; path: ShapeGroupPath }>;
type Point = Readonly<{ x: number; y: number }>;
type Matrix = Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number }>;
type PaintLayout = ResolvedShapeFrame | ShapeConnectorPaintLayout;
type NodeBase = {
  path: ShapeGroupPath;
  layout: PaintLayout | null;
  bounds: PictureEffectBounds;
  density: number;
  width: number;
  height: number;
  canvasBytes: number;
  maskBytes: number;
  peakBytes: number;
  visible: boolean;
  empty: boolean;
  collapsed: boolean;
};
type LeafPlan = NodeBase & {
  kind: "leaf";
  leaf: ResolvedShapeGroupLeaf;
  options?: ShapeLeafPixelsOptions;
  paint?: ShapeLeafPixelsPlan;
};
type OwnerPlan = NodeBase & {
  kind: "owner";
  owner: ResolvedShapeGroupOwner;
  children: { node: NodePlan; matrix: Matrix }[];
  style: PictureDetailedRasterReadyPlan["style"];
  paint?: PictureDetailedRasterReadyPlan;
};
type NodePlan = LeafPlan | OwnerPlan;
type PlanState = { tree: OwnerPlan; projection: ResolvedShapeGroupProjection };
type HitNode = {
  kind: "leaf" | "owner";
  path: ShapeGroupPath;
  bounds: PictureEffectBounds;
  density: number;
  width: number;
  height: number;
  alpha: Uint8Array;
  children: { node: HitNode; matrix: Matrix }[];
};
type OwnedNode = {
  canvas: HTMLCanvasElement;
  bounds: PictureEffectBounds;
  density: number;
  hit?: HitNode;
  release: () => void;
};
const plans = new WeakMap<object, PlanState>();
const hitTrees = new WeakMap<object, HitNode>();
let liveOwnedBytes = 0;
let livePresentationBytes = 0;
/** Remaining shared raster budget, including other group masks and presentation copies. */
export function getShapeGroupPaintAvailableBytes(): number {
  return Math.max(
    0,
    SHAPE_GROUP_PAINT_LIMITS.memoryBytes -
      liveOwnedBytes -
      getShapeLeafPixelsOwnedBytes() -
      Math.max(0, getShapePresentationAllocatedBytes() - livePresentationBytes),
  );
}
const emptyBounds = (): PictureEffectBounds => ({ left: 0, top: 0, right: 1, bottom: 1 });
const identityMatrix: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const key = (path: ShapeGroupPath) => JSON.stringify(path);

/** Value choices include zero-opacity effects. Core validates dormant and collapsed descendants too.
 * Only visible owners require the completed subtree raster; leaf effects use their own consumer. */
export function hasActiveShapeGroupEffects(root: ShapeGroupDrawing): boolean {
  return traverseShapeGroupVisibility(cloneShapeGroup(root)).some(
    ({ node, visible }) =>
      visible &&
      node.kind === "shapeGroup" &&
      (node.groupEffects?.shadow?.kind === "value" ||
        node.groupEffects?.reflection?.kind === "value" ||
        node.groupEffects?.glow?.kind === "value"),
  );
}
/** Shadow-only compatibility query; effect consumers use hasActiveShapeGroupEffects. */
export function hasActiveShapeGroupShadow(root: ShapeGroupDrawing): boolean {
  return traverseShapeGroupVisibility(cloneShapeGroup(root)).some(
    ({ node, visible }) =>
      visible && node.kind === "shapeGroup" && node.groupEffects?.shadow?.kind === "value",
  );
}
function freezeSnapshot(root: ShapeGroupDrawing): ShapeGroupDrawing {
  const pending: object[] = [root];
  while (pending.length) {
    const current = pending.pop()!;
    for (const value of Object.values(current))
      if (value && typeof value === "object") pending.push(value as object);
    Object.freeze(current);
  }
  return root;
}
/** inverse(world owner) * world child, using resolved sizes exactly once. */
function childToOwner(owner: PaintLayout, child: PaintLayout): Matrix {
  const radians = ((child.angleDeg - owner.angleDeg) * Math.PI) / 180;
  const a = Math.cos(radians),
    b = Math.sin(radians),
    c = -b,
    d = a;
  const inverse = (-owner.angleDeg * Math.PI) / 180;
  const dx = child.rect.x + child.rect.width / 2 - owner.rect.x - owner.rect.width / 2;
  const dy = child.rect.y + child.rect.height / 2 - owner.rect.y - owner.rect.height / 2;
  const cx = Math.cos(inverse) * dx - Math.sin(inverse) * dy + owner.rect.width / 2;
  const cy = Math.sin(inverse) * dx + Math.cos(inverse) * dy + owner.rect.height / 2;
  return {
    a,
    b,
    c,
    d,
    e: cx - (a * child.rect.width) / 2 - (c * child.rect.height) / 2,
    f: cy - (b * child.rect.width) / 2 - (d * child.rect.height) / 2,
  };
}
function transformPoint(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}
function inversePoint(matrix: Matrix, point: Point): Point {
  const x = point.x - matrix.e,
    y = point.y - matrix.f;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  return {
    x: (matrix.d * x - matrix.c * y) / determinant,
    y: (-matrix.b * x + matrix.a * y) / determinant,
  };
}
function sourceUnion(
  children: readonly { bounds: PictureEffectBounds; matrix: Matrix }[],
  density: number,
): PictureEffectBounds {
  if (!children.length) return emptyBounds();
  const points = children.flatMap(({ bounds: b, matrix }) =>
    [
      { x: b.left, y: b.top },
      { x: b.right, y: b.top },
      { x: b.right, y: b.bottom },
      { x: b.left, y: b.bottom },
    ].map((point) => transformPoint(matrix, point)),
  );
  // drawImage reconstruction can touch one sample outside a transformed child's rectangle.
  const pad = 1 / density;
  const bounds = {
    left: Math.min(...points.map((point) => point.x)) - pad,
    top: Math.min(...points.map((point) => point.y)) - pad,
    right: Math.max(...points.map((point) => point.x)) + pad,
    bottom: Math.max(...points.map((point) => point.y)) + pad,
  };
  if (
    !Object.values(bounds).every((value) => Number.isFinite(value) && Math.abs(value) <= 10_000_000)
  )
    throw new RangeError("Shape group source union exceeds its finite-coordinate budget.");
  return bounds;
}
function sizeIsBounded(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= SHAPE_GROUP_PAINT_LIMITS.side &&
    height <= SHAPE_GROUP_PAINT_LIMITS.side &&
    width * height <= SHAPE_GROUP_PAINT_LIMITS.pixels
  );
}
function availableBytes(pendingPresentationBytes = 0): number {
  const externalPresentationBytes = Math.max(
    0,
    getShapePresentationAllocatedBytes() - livePresentationBytes - pendingPresentationBytes,
  );
  const bytes =
    SHAPE_GROUP_PAINT_LIMITS.memoryBytes -
    liveOwnedBytes -
    getShapeLeafPixelsOwnedBytes() -
    externalPresentationBytes;
  if (bytes < 8192)
    throw new RangeError("Live shape group presentations exhaust their 64MiB budget.");
  return bytes;
}
function baseNode(path: ShapeGroupPath, layout: PaintLayout | null, visible: boolean): NodeBase {
  return {
    path: Object.freeze([...path]),
    layout,
    bounds: emptyBounds(),
    density: 1,
    width: 1,
    height: 1,
    canvasBytes: 0,
    maskBytes: 0,
    peakBytes: 0,
    visible,
    empty: true,
    collapsed: !layout || layout.collapsed,
  };
}
function rootMetadata(
  options: ShapeGroupPaintOptions,
  snapshotRoot: ShapeGroupDrawing,
  projection: ResolvedShapeGroupProjection,
  tree: OwnerPlan,
): GroupPlanBase {
  const pixels = tree.width * tree.height;
  return {
    root: options.root,
    sourceRoot: options.root,
    snapshotRoot,
    metrics: options.metrics,
    ...(options.renderPass ? { renderPass: options.renderPass } : {}),
    layout: projection.layout,
    resolvedRootLayout: projection.layout,
    actualDensity: tree.density,
    logicalBounds: tree.bounds,
    widthRaster: tree.width,
    heightRaster: tree.height,
    // The final independent presentation copy briefly coexists with the compositor output.
    estimatedPeakBytes: Math.max(tree.peakBytes, tree.canvasBytes + tree.maskBytes + pixels * 4),
    ownedBytes: pixels * 4 + tree.maskBytes,
    interactive: options.interactive !== false,
    visible: tree.visible,
    empty: tree.empty,
    collapsed: tree.collapsed,
  };
}

/** Whole-tree pure planning, with complete recursive retained-sibling/scratch/mask schedules.
 * Lower density always replans all descendant bounds, including reconstruction padding. */
export function planShapeGroupPaint(options: ShapeGroupPaintOptions): ShapeGroupPaintPlan {
  if (!Number.isFinite(options.density) || options.density <= 0 || options.density > 64)
    throw new RangeError("Shape group density must be positive, finite and at most 64.");
  // Both calls validate the complete genuine owned graph before any resource lookup or Canvas.
  const pass = options.renderPass;
  if (pass) pass.assertCurrent(pass.sourceForest, options.metrics, pass.revision);
  const projection = pass
    ? pass.getGroup(options.root.id)
    : resolveShapeGroupProjection(options.root, options.metrics);
  if (!projection || projection.sourceRoot !== options.root)
    throw new TypeError("Shape group paint requires the exact owner of its whole-sheet pass.");
  const snapshotRoot = freezeSnapshot(cloneShapeGroup(options.root));
  const snapshots = new Map(
    traverseShapeGroupVisibility(snapshotRoot).map((visit) => [key(visit.path), visit]),
  );
  const owners = new Map(projection.owners.map((owner) => [key(owner.path), owner]));
  const leaves = new Map(projection.leaves.map((leaf) => [key(leaf.path), leaf]));
  const identities = new Map(
    projection.leaves.map((leaf) => [
      key(leaf.path),
      Object.freeze({
        sourceRoot: options.root,
        sourceNode: leaf.sourceNode,
        path: leaf.path,
        snapshotRoot,
        ...(pass ? { contextIdentity: pass.contextIdentity } : {}),
      }),
    ]),
  );
  const interactive = options.interactive !== false;
  const budget = availableBytes();
  let density = options.density;
  for (let attempt = 0; attempt < SHAPE_GROUP_PAINT_LIMITS.replans; attempt++) {
    let minimumDensity = density;
    const unavailable: Extract<ShapeLeafPixelsPlan, { kind: "unavailable" }>[] = [];
    function visit(path: ShapeGroupPath): NodePlan {
      const snapshot = snapshots.get(key(path));
      if (!snapshot) throw new TypeError("Shape group paint lost its canonical member snapshot.");
      const owner = owners.get(key(path));
      if (!owner) {
        const leaf = leaves.get(key(path));
        if (!leaf) throw new TypeError("Shape group paint requires its exact genuine member path.");
        // Preserve the carrier's geometry, but never inspect a hidden connector or leaf appearance.
        if (!snapshot.visible)
          return {
            ...baseNode(path, leaf.layout, false),
            kind: "leaf",
            leaf,
          };
        const connector = pass?.getLeaf(leaf.sourceNode.id)?.connector;
        if (connector?.status === "unavailable")
          throw new TypeError(`Shape connector paint is unavailable: ${connector.reason}.`);
        const suspended = connector?.status === "suspended" || connector?.status === "degenerate";
        const paintLayout =
          connector?.status === "ready" ? connector.route.paintLayout : leaf.layout;
        const result: LeafPlan = {
          ...baseNode(path, paintLayout, true),
          kind: "leaf",
          leaf,
        };
        if (suspended) {
          result.collapsed = true;
          return result;
        }
        const drawing = connector?.status === "ready" ? connector.paintView : leaf.view;
        if (leaf.collapsed || !drawing || !paintLayout) return result;
        const leafOptions: ShapeLeafPixelsOptions = {
          drawing,
          ...(connector?.status === "ready" ? { connectorRoute: connector.route } : {}),
          density,
          resources: options.resources,
          angleDeg: paintLayout.angleDeg,
          sourceIdentity: identities.get(key(path)),
          textRuntimeOptions: options.textRuntimeOptions,
          legacyLineHeightPx: options.legacyLineHeightPx,
          hideText: options.editingTextId === leaf.sourceNode.id,
        };
        const paint = planShapeLeafPixels(leafOptions);
        if (paint.kind === "unavailable") unavailable.push(paint);
        minimumDensity = Math.min(minimumDensity, paint.actualDensity);
        const pixels = paint.widthRaster * paint.heightRaster;
        Object.assign(result, {
          options: leafOptions,
          paint,
          bounds: paint.logicalBounds,
          density: paint.actualDensity,
          width: paint.widthRaster,
          height: paint.heightRaster,
          canvasBytes: paint.ownedBytes,
          maskBytes: interactive ? pixels : 0,
          // A compact alpha mask briefly coexists with a full RGBA readback.
          peakBytes: Math.max(
            paint.estimatedPeakBytes,
            paint.ownedBytes + (interactive ? pixels * 5 : 0),
          ),
          empty: false,
        });
        return result;
      }
      if (snapshot.node.kind !== "shapeGroup")
        throw new TypeError("Shape group paint lost its canonical container snapshot.");
      const result: OwnerPlan = {
        ...baseNode(path, owner.layout, snapshot.visible),
        kind: "owner",
        owner,
        children: [],
        style: {
          fill: { kind: "none" },
          line: { kind: "none" },
          // Owners have no body fill or outline. Effects see the completed ordered
          // subtree source pixels, including transparent holes and nested effects.
          ...(snapshot.node.groupEffects?.shadow
            ? { shadow: snapshot.node.groupEffects.shadow }
            : {}),
          ...(snapshot.node.groupEffects?.reflection
            ? { reflection: snapshot.node.groupEffects.reflection }
            : {}),
          ...(snapshot.node.groupEffects?.glow ? { glow: snapshot.node.groupEffects.glow } : {}),
        },
      };
      // A hidden owner suppresses its entire subtree before any leaf/resource/font preflight.
      if (!result.visible) return result;
      // Actual immediate source members, in their durable bottom-to-top sibling order.
      for (const member of owner.sourceNode.members) {
        const child = visit([...path, member.id]);
        result.children.push({
          node: child,
          matrix:
            owner.layout && child.layout
              ? childToOwner(owner.layout, child.layout)
              : identityMatrix,
        });
      }
      if (owner.collapsed || !owner.layout) return result;
      const visible = result.children.filter(
        ({ node }) => node.visible && !node.collapsed && !node.empty,
      );
      if (!visible.length) {
        // Keep the existing suspended/degenerate route behavior, without collapsing hidden geometry.
        if (pass?.connections && result.children.every(({ node }) => node.collapsed))
          result.collapsed = true;
        return result;
      }
      const sourceBounds = sourceUnion(
        visible.map(({ node, matrix }) => ({ bounds: node.bounds, matrix })),
        density,
      );
      const paint = planDetailedPictureRaster({
        widthPx: owner.layout.rect.width,
        heightPx: owner.layout.rect.height,
        pixelDensity: density,
        outerAngleDeg: owner.layout.angleDeg,
        style: result.style,
        sourceBounds,
        limits: { memoryBytes: SHAPE_GROUP_PAINT_LIMITS.memoryBytes },
      });
      if (paint.kind !== "ready")
        throw new TypeError("A source-free shape container cannot own an image asset.");
      minimumDensity = Math.min(minimumDensity, paint.actualDensity);
      let retainedCanvas = 0,
        retainedMasks = 0,
        peak = 0;
      for (const { node } of visible) {
        peak = Math.max(peak, retainedCanvas + retainedMasks + node.peakBytes);
        retainedCanvas += node.canvasBytes;
        retainedMasks += node.maskBytes;
      }
      const pixels = paint.widthRaster * paint.heightRaster;
      const ownMask = interactive ? pixels : 0;
      peak = Math.max(
        peak,
        retainedCanvas + retainedMasks + paint.estimatedPeakBytes,
        pixels * 4 + retainedMasks + (interactive ? pixels * 5 : 0),
      );
      Object.assign(result, {
        paint,
        bounds: paint.logicalBounds,
        density: paint.actualDensity,
        width: paint.widthRaster,
        height: paint.heightRaster,
        canvasBytes: pixels * 4,
        maskBytes: retainedMasks + ownMask,
        peakBytes: peak,
        empty: false,
      });
      return result;
    }
    const tree = visit([snapshotRoot.id]);
    if (tree.kind !== "owner")
      throw new TypeError("Shape group paint requires a genuine root container.");
    const metadata = rootMetadata(options, snapshotRoot, projection, tree);
    if (minimumDensity < density * (1 - 1e-9)) {
      density = minimumDensity;
      continue;
    }
    if (metadata.estimatedPeakBytes > budget) {
      density *= Math.min(0.9, Math.sqrt(budget / metadata.estimatedPeakBytes) * 0.98);
      continue;
    }
    const first = unavailable[0];
    const result: ShapeGroupPaintPlan = first
      ? {
          ...metadata,
          kind: "unavailable",
          reason: first.reason,
          missingAssetIds: Object.freeze([
            ...new Set(unavailable.flatMap((entry) => entry.missingAssetIds)),
          ]),
          ...(first.message ? { message: first.message } : {}),
        }
      : { ...metadata, kind: "ready" };
    plans.set(result, { tree, projection });
    return result;
  }
  throw new RangeError("Shape group cannot fit its complete 64MiB paint and hit-mask schedule.");
}

class ReplanDensity extends Error {
  constructor(readonly density: number) {
    super("Actual owned shape pixels require a complete lower-density group replan.");
  }
}
function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Owned shape group Canvas processing is unavailable.");
  return context;
}

/** Recursive containers apply effects to their real completed ordered child pixels, including holes,
 * glyph effects and nested owner effects. Every temporary output is released in a finally block. */
export function prepareShapeGroupPaint(options: ShapeGroupPaintOptions): ShapeGroupPaintResult {
  let requestedDensity = options.density;
  for (let attempt = 0; attempt < SHAPE_GROUP_PAINT_LIMITS.replans; attempt++) {
    const plan = planShapeGroupPaint({ ...options, density: requestedDensity });
    if (plan.kind === "unavailable") return plan;
    const state = plans.get(plan)!;
    const images = new Map<string, DecodedPicturePaintImage>();
    const assetIds = new Set<string>();
    function collect(node: NodePlan): void {
      if (!node.visible || node.empty || node.collapsed) return;
      if (node.kind === "owner") node.children.forEach(({ node: child }) => collect(child));
      else if (node.paint) {
        node.paint.bodyPlan.assetIds.forEach((id) => assetIds.add(id));
        node.paint.textPlan?.assetIds.forEach((id) => assetIds.add(id));
      }
    }
    collect(state.tree);
    // All declared active source resources are ready before the first Canvas allocation.
    for (const id of assetIds) {
      const image = options.resources?.getAssetImage?.(id);
      if (image) {
        const width = "naturalWidth" in image ? image.naturalWidth : image.width;
        const height = "naturalHeight" in image ? image.naturalHeight : image.height;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)
          images.set(id, image);
      }
    }
    const missing = [...assetIds].filter((id) => !images.has(id));
    if (missing.length)
      return {
        ...plan,
        kind: "unavailable",
        reason: "asset-unavailable",
        missingAssetIds: missing,
      };
    const resources = { ...options.resources, getAssetImage: (id: string) => images.get(id) };
    options.renderPass?.assertCurrent(
      options.renderPass.sourceForest,
      options.metrics,
      options.renderPass.revision,
    );
    const budget = availableBytes();
    const made = new Set<HTMLCanvasElement>();
    const live = new Set<OwnedNode>();
    const masks = new Set<HitNode>();
    let retainedBytes = 0,
      observedPeak = plan.estimatedPeakBytes;
    let presentation: HTMLCanvasElement | undefined;
    const freshCanvas = () => {
      const canvas = options.canvasFactory?.() ?? document.createElement("canvas");
      if (made.has(canvas) || [...images.values()].includes(canvas))
        throw new TypeError("Shape group canvas factory must return a fresh, unborrowed Canvas.");
      made.add(canvas);
      return canvas;
    };
    function check(extraBytes: number, density: number): void {
      const total = retainedBytes + extraBytes;
      observedPeak = Math.max(observedPeak, total);
      if (!Number.isFinite(total) || total > budget)
        throw new ReplanDensity(density * Math.min(0.9, Math.sqrt(budget / total) * 0.98));
    }
    function own(
      canvas: HTMLCanvasElement,
      bounds: PictureEffectBounds,
      density: number,
      dispose: () => void,
    ): OwnedNode {
      if (!sizeIsBounded(canvas.width, canvas.height)) {
        dispose();
        throw new RangeError("Actual shape group output exceeds its preflight raster dimensions.");
      }
      const bytes = canvas.width * canvas.height * 4;
      try {
        check(bytes, density);
      } catch (error) {
        dispose();
        throw error;
      }
      retainedBytes += bytes;
      let released = false;
      const node: OwnedNode = {
        canvas,
        bounds,
        density,
        release: () => {
          if (released) return;
          released = true;
          retainedBytes -= bytes;
          live.delete(node);
          dispose();
        },
      };
      live.add(node);
      return node;
    }
    function captureHit(node: NodePlan, owned: OwnedNode, children: HitNode["children"]): void {
      if (!plan.interactive) return;
      const pixels = owned.canvas.width * owned.canvas.height;
      check(pixels * 5, owned.density);
      const rgba = contextOf(owned.canvas).getImageData(
        0,
        0,
        owned.canvas.width,
        owned.canvas.height,
      ).data;
      const alpha = new Uint8Array(pixels);
      for (let index = 0; index < pixels; index++) alpha[index] = rgba[index * 4 + 3]!;
      const hit: HitNode = {
        kind: node.kind,
        path: node.path,
        bounds: owned.bounds,
        density: owned.density,
        width: owned.canvas.width,
        height: owned.canvas.height,
        alpha,
        children,
      };
      owned.hit = hit;
      masks.add(hit);
      retainedBytes += pixels;
    }
    function paintNode(node: NodePlan): OwnedNode | undefined {
      if (!node.visible || node.empty || node.collapsed) return;
      if (node.kind === "leaf") {
        if (!node.options || !node.paint)
          throw new TypeError("A placed shape leaf requires its real numeric paint plan.");
        check(node.peakBytes, node.density);
        const before = retainedBytes;
        const result = prepareShapeLeafPixels({
          ...node.options,
          resources,
          canvasFactory: freshCanvas,
        });
        if (result.kind === "unavailable") throw result;
        let owned: OwnedNode | undefined;
        try {
          if (result.actualDensity < node.density * (1 - 1e-9))
            throw new ReplanDensity(result.actualDensity);
          observedPeak = Math.max(observedPeak, before + result.estimatedPeakBytes);
          if (before + result.estimatedPeakBytes > budget)
            throw new ReplanDensity(node.density * 0.8);
          owned = own(result.canvas, result.logicalBounds, result.actualDensity, result.dispose);
          captureHit(node, owned, []);
          return owned;
        } catch (error) {
          if (owned) owned.release();
          else result.dispose();
          throw error;
        }
      }
      if (!node.layout)
        throw new TypeError("A placed shape owner requires its resolved world layout.");
      const children: { owned: OwnedNode; matrix: Matrix }[] = [];
      let output: OwnedNode | undefined;
      try {
        for (const child of node.children) {
          const owned = paintNode(child.node);
          if (owned) children.push({ owned, matrix: child.matrix });
        }
        // Native contours may have changed their actual bounds/density. Recompute before
        // allocating this owner; never clip actual glyph/shadow ink to stale planned bounds.
        const sourceBounds = sourceUnion(
          children.map(({ owned, matrix }) => ({ bounds: owned.bounds, matrix })),
          node.density,
        );
        const actualPlan = planDetailedPictureRaster({
          widthPx: node.layout.rect.width,
          heightPx: node.layout.rect.height,
          pixelDensity: node.density,
          style: node.style,
          sourceBounds,
          outerAngleDeg: node.layout.angleDeg,
          limits: { memoryBytes: SHAPE_GROUP_PAINT_LIMITS.memoryBytes },
        });
        if (actualPlan.kind !== "ready")
          throw new TypeError("A shape owner cannot require a picture source asset.");
        if (actualPlan.actualDensity < node.density * (1 - 1e-9))
          throw new ReplanDensity(actualPlan.actualDensity);
        check(actualPlan.estimatedPeakBytes, actualPlan.actualDensity);
        const raster = createDetailedPictureRaster({
          widthPx: node.layout.rect.width,
          heightPx: node.layout.rect.height,
          pixelDensity: actualPlan.actualDensity,
          style: node.style,
          sourceBounds,
          outerAngleDeg: node.layout.angleDeg,
          theme: options.resources?.theme ?? DEFAULT_WORKBOOK_THEME,
          limits: { memoryBytes: SHAPE_GROUP_PAINT_LIMITS.memoryBytes },
          canvasFactory: freshCanvas,
          sourcePainter: (context) => {
            for (const { owned, matrix } of children) {
              context.save();
              try {
                context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
                const b = owned.bounds;
                context.drawImage(owned.canvas, b.left, b.top, b.right - b.left, b.bottom - b.top);
              } finally {
                context.restore();
              }
            }
          },
        });
        if (raster.kind !== "ready") throw raster;
        output = own(raster.canvas, raster.logicalBounds, raster.actualDensity, () => {
          raster.canvas.width = 0;
          raster.canvas.height = 0;
        });
        const hitChildren = children.flatMap(({ owned, matrix }) =>
          owned.hit ? [{ node: owned.hit, matrix }] : [],
        );
        // No child canvas is needed after the completed ordered composite. Its compact
        // hit mask remains, avoiding persistent RGBA copies for the entire owned tree.
        children.forEach(({ owned }) => owned.release());
        captureHit(node, output, hitChildren);
        return output;
      } catch (error) {
        output?.release();
        throw error;
      } finally {
        children.forEach(({ owned }) => owned.release());
      }
    }
    try {
      let root = paintNode(state.tree);
      if (!root) {
        const canvas = freshCanvas();
        canvas.width = 1;
        canvas.height = 1;
        root = own(canvas, emptyBounds(), 1, () => {
          canvas.width = 0;
          canvas.height = 0;
        });
      }
      const pixels = root.canvas.width * root.canvas.height;
      check(pixels * 4, root.density);
      presentation = freshCanvas();
      resizeShapePresentationCanvas(presentation, root.canvas.width, root.canvas.height);
      contextOf(presentation).drawImage(root.canvas, 0, 0);
      const bounds = root.bounds,
        density = root.density,
        hit = root.hit;
      root.release();
      const ownedBytes =
        pixels * 4 + [...masks].reduce((total, mask) => total + mask.alpha.length, 0);
      if (ownedBytes > availableBytes(pixels * 4))
        throw new RangeError("Live shape group canvases and hit masks exceed their 64MiB budget.");
      liveOwnedBytes += ownedBytes;
      livePresentationBytes += pixels * 4;
      const canvas = presentation;
      presentation = undefined;
      let disposed = false;
      const result: Extract<ShapeGroupPaintResult, { kind: "ready" }> = {
        ...plan,
        actualDensity: density,
        logicalBounds: bounds,
        widthRaster: canvas.width,
        heightRaster: canvas.height,
        estimatedPeakBytes: observedPeak,
        ownedBytes,
        canvas,
        dispose: () => {
          if (disposed) return;
          disposed = true;
          liveOwnedBytes -= ownedBytes;
          livePresentationBytes -= pixels * 4;
          hitTrees.delete(result);
          for (const mask of masks) mask.alpha = new Uint8Array();
          masks.clear();
          releaseShapePresentationCanvas(canvas);
        },
      };
      if (hit) hitTrees.set(result, hit);
      return result;
    } catch (error) {
      for (const mask of masks) mask.alpha = new Uint8Array();
      masks.clear();
      if (error instanceof ReplanDensity) {
        requestedDensity = Math.min(requestedDensity * 0.9, error.density);
        continue;
      }
      if (error && typeof error === "object" && "kind" in error && error.kind === "unavailable") {
        const failure = error as Extract<ShapeLeafPixelsPlan, { kind: "unavailable" }>;
        return {
          ...plan,
          kind: "unavailable",
          reason: failure.reason,
          missingAssetIds: failure.missingAssetIds,
          ...(failure.message ? { message: failure.message } : {}),
        };
      }
      throw error;
    } finally {
      for (const owned of live) owned.release();
      if (presentation) releaseShapePresentationCanvas(presentation);
    }
  }
  throw new RangeError(
    "Actual shape group pixels cannot stabilize their complete bounded paint schedule.",
  );
}

/** Command admission proves actual native glyph pixels and aggregate composition, then
 * releases the proof. A pure plan alone cannot prove native contour complexity. */
export function preflightShapeGroupPaint(options: ShapeGroupPaintOptions): ShapeGroupPaintPlan {
  const result = prepareShapeGroupPaint({ ...options, interactive: false });
  if (result.kind === "unavailable") return result;
  try {
    const { canvas: _canvas, dispose: _dispose, ...metadata } = result;
    return metadata;
  } finally {
    result.dispose();
  }
}

/** Root alpha gates every hit; reverse sibling order preserves real occlusion. An owner
 * effect-only pixel selects that exact owner path, while transparent gaps reach the grid.
 * Reflected pixels never acquire a mirrored descendant path. */
export function hitShapeGroupPaint(
  result: ShapeGroupPaintResult,
  rootLocalPoint: Point,
): ShapeGroupPaintHit | undefined {
  if (
    result.kind !== "ready" ||
    !Number.isFinite(rootLocalPoint.x) ||
    !Number.isFinite(rootLocalPoint.y)
  )
    return;
  const root = hitTrees.get(result);
  if (!root) return;
  function visit(node: HitNode, point: Point): ShapeGroupPaintHit | undefined {
    const x = Math.floor((point.x - node.bounds.left) * node.density);
    const y = Math.floor((point.y - node.bounds.top) * node.density);
    if (
      x < 0 ||
      y < 0 ||
      x >= node.width ||
      y >= node.height ||
      (node.alpha[y * node.width + x] ?? 0) <= 1
    )
      return;
    for (let index = node.children.length - 1; index >= 0; index--) {
      const child = node.children[index]!;
      const hit = visit(child.node, inversePoint(child.matrix, point));
      if (hit) return hit;
    }
    return { kind: node.kind, path: node.path };
  }
  return visit(root, rootLocalPoint);
}
