import {
  isFramedShapeDrawing,
  isSheetDrawingVisible,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import {
  traverseShapeGroupVisibility,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import {
  type PictureAxisMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getDefaultRowHeight,
  getDefaultColumnWidth,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { createPicturePaintResources } from "../../shared/images/picture-paint-resources";
import {
  getPicturePaintDensity,
  type PicturePaintResources,
} from "../../shared/images/picture-detailed-render";
import type { CanvasImageCache } from "../sheet-grid/canvas/image-painter";
import {
  createSheetHiddenColumnIntervals,
  createSheetHiddenRowIntervals,
} from "../sheet-grid/data-visibility";
import { TextBoxReferenceUnavailableError } from "../sheet-drawings/textbox-reference-display";
import { resolveShapeDrawing } from "../sheet-drawings/resolved-shape-drawing";
import { resolveShapeGroupProjection } from "../sheet-drawings/resolved-shape-group";
import type {
  ResolvedShapeForestForRender,
  ShapeConnectorRenderSource,
  ResolvedShapeRenderLeaf,
} from "../sheet-drawings/resolved-shape-render-source";
import {
  getDrawingShapeGeometry,
  getStandardShapeGeometry,
} from "../sheet-drawings/shape-geometry";
import { getLegacyShapeGeometry } from "../sheet-drawings/legacy-shape-geometry";
import {
  planShapeDetailedPaint,
  prepareShapeDetailedPaint,
  ShapePaintUnavailableError,
} from "../sheet-drawings/shape-detailed-paint";
import {
  ensureDrawingShapeTextFont,
  layoutDrawingShapeText,
  ShapeTextRuntimeError,
} from "../sheet-drawings/shape-text-runtime";
import { planShapeTextPaint, prepareShapeTextPaint } from "../sheet-drawings/shape-text-paint";
import {
  projectedShapeTextBounds,
  projectShapeTextSurface,
  shapeTextFollowsBodyProjection,
} from "../sheet-drawings/shape-text-projection";
import {
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
} from "../sheet-drawings/shape-detailed-presentation";
import {
  requiresShapeGroupPaint,
  planShapeGroupPaint,
  prepareShapeGroupPaint,
} from "../sheet-drawings/shape-group-paint";

import { planShapeLeafPixels, prepareShapeLeafPixels } from "../sheet-drawings/shape-leaf-pixels";

/** A released legacy text box keeps its CSS border/plain glyph source. Only its
 * explicit 3D invokes the united leaf surface; ordinary old print paths stay intact. */
function projectedLegacyTextBox(drawing: SheetGraphicDrawing): boolean {
  return (
    drawing.kind === "textBox" &&
    !drawing.shapeText &&
    (drawing.shapeStyle?.rotation3d?.kind === "value" ||
      drawing.shapeStyle?.format3d?.kind === "value")
  );
}

type PrintableShape = SheetGraphicDrawing | SheetFramedGraphicDrawing | ShapeGroupDrawing;
type Bounds = { left: number; top: number; right: number; bottom: number };
const emptyPrintShapeForest: readonly SheetDrawing[] = Object.freeze([]);

/** An absent forest has a stable identity, distinct from deleting a captured array. */
export function getPrintShapeSourceDrawings(
  sheet: Pick<Sheet, "drawings">,
): readonly SheetDrawing[] {
  return sheet.drawings ?? emptyPrintShapeForest;
}

/** Preserve the real owners and their sheet drawing order. Other graphic kinds are separate consumers. */
export function getPrintableShapeRoots(sheet: Pick<Sheet, "drawings">): PrintableShape[] {
  return (sheet.drawings ?? []).filter(
    (drawing): drawing is PrintableShape =>
      (drawing.kind === "shape" || drawing.kind === "textBox" || drawing.kind === "shapeGroup") &&
      checked(drawing.id, () => isSheetDrawingVisible(drawing)) &&
      checked(drawing.id, () =>
        drawing.kind !== "shapeGroup" && !isFramedShapeDrawing(drawing)
          ? true
          : getShapeObjectProperties(drawing.shapeProperties).printObject,
      ),
  );
}

/** Native math remains a real ownership leaf and never enters body/text planners. */
export type PrintableEquationLeaf = Readonly<{
  sourceRoot: ShapeGroupDrawing;
  sourceNode: SheetGroupedEquationDrawing;
  path: ShapeGroupPath;
}>;

/** Print policy belongs to the outer real root; visibility follows all owners.
 * Retained member properties never override the group's effective root policy. */
export function getPrintableShapeGroupLeafIds(root: ShapeGroupDrawing): ReadonlySet<string> {
  const visits = checked(root.id, () => traverseShapeGroupVisibility(root));
  if (!getShapeObjectProperties(root.shapeProperties).printObject) return new Set();
  return new Set(
    visits
      .filter(({ node, visible }) => visible && node.kind !== "shapeGroup")
      .map(({ node }) => node.id),
  );
}

export type PrintableShapeLeaf = {
  sourceRoot: PrintableShape;
  sourceNode: PrintableShape | SheetGroupedGraphicDrawing;
  /** Stable real root/node ownership, never the disposable world view. */
  sourceIdentity: object;
  path: ShapeGroupPath;
  drawingId: string;
  drawing: SheetGraphicDrawing;
  rect: ShapeFrameRect;
  /** Exact whole-sheet Core route; the source/path identity remains the real carrier. */
  connectorRoute?: ReadyShapeConnectorRoute;
};
type PrintableLeaf = PrintableShapeLeaf | PrintableEquationLeaf;
function isPrintableEquationLeaf(leaf: PrintableLeaf): leaf is PrintableEquationLeaf {
  return leaf.sourceNode.kind === "equation";
}

const groupedPrintIdentities = new WeakMap<
  ShapeGroupDrawing,
  WeakMap<SheetGroupedGraphicDrawing, { pathKey: string; identity: object }>
>();
function groupedPrintIdentity(
  root: ShapeGroupDrawing,
  node: SheetGroupedGraphicDrawing,
  path: ShapeGroupPath,
): object {
  let members = groupedPrintIdentities.get(root);
  if (!members) groupedPrintIdentities.set(root, (members = new WeakMap()));
  const pathKey = JSON.stringify(path);
  let cached = members.get(node);
  if (!cached || cached.pathKey !== pathKey) {
    cached = {
      pathKey,
      identity: Object.freeze({
        sourceRoot: root,
        sourceNode: node,
        path: Object.freeze([...path]),
      }),
    };
    members.set(node, cached);
  }
  return cached.identity;
}

/** Real leaf order follows worksheet owners, then each owner's depth-first sibling order.
 * Projection validates the entire canonical tree even when the root is collapsed. */
export function* getPrintableShapeLeaves(
  sheet: Pick<Sheet, "drawings">,
  metrics: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
): Generator<PrintableShapeLeaf> {
  assertPrintShapeRenderPass(sheet, metrics, renderPass);
  for (const sourceRoot of getPrintableShapeRoots(sheet))
    for (const leaf of printableLeavesForRoot(sourceRoot, metrics, renderPass))
      if (!isPrintableEquationLeaf(leaf)) yield leaf;
}

/** Every pass includes nonprinting relation targets. Never resolve a filtered owner subset. */
export function assertPrintShapeRenderPass(
  sheet: Pick<Sheet, "drawings">,
  metrics: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
  revision = renderPass?.revision,
): void {
  if (renderPass)
    checked("render-pass", () =>
      renderPass.assertCurrent(getPrintShapeSourceDrawings(sheet), metrics, revision!),
    );
}
function connectorPaintSource(connector: ShapeConnectorRenderSource | undefined) {
  if (connector?.status === "unavailable")
    throw new Error(`The actual connector appearance is unavailable: ${connector.reason}.`);
  return connector?.status === "ready" ? connector : undefined;
}
function requireLinkedTextPaint(
  source: SheetGraphicDrawing | SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing,
  leaf: ResolvedShapeRenderLeaf | undefined,
): SheetGraphicDrawing | undefined {
  if (source.kind !== "textBox" || !source.textReference) return;
  if (leaf?.textReference?.status !== "ready")
    throw new TextBoxReferenceUnavailableError(
      leaf?.textReference?.status === "unavailable" ? leaf.textReference : undefined,
    );
  // A collapsed group leaf may have no world placement, but its text status
  // must still be checked before culling. Its canonical carrier remains intact.
  return leaf.paintView;
}
function* printableLeavesForRoot(
  sourceRoot: PrintableShape,
  metrics: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
): Generator<PrintableLeaf> {
  if (sourceRoot.kind === "shapeGroup") {
    const visibleIds = getPrintableShapeGroupLeafIds(sourceRoot);
    const projection = checked(sourceRoot.id, () => {
      const result = renderPass
        ? renderPass.getGroup(sourceRoot.id)
        : resolveShapeGroupProjection(sourceRoot, metrics);
      if (!result || result.sourceRoot !== sourceRoot)
        throw new TypeError("Printing requires the exact group owner of its whole-sheet pass.");
      return result;
    });
    for (const leaf of projection.leaves) {
      const sourceNode = leaf.sourceNode;
      // Hidden members remain valid relation targets, but never enter connector/font/paint preflight.
      if (!visibleIds.has(sourceNode.id)) continue;
      if (sourceNode.kind === "equation") {
        if (leaf.collapsed || !leaf.view || !leaf.layout) continue;
        yield { sourceRoot, sourceNode, path: leaf.path };
        continue;
      }
      const passLeaf = renderPass?.getLeaf(sourceNode.id);
      const textPaint = checked(leaf.path.join("/"), () =>
        requireLinkedTextPaint(sourceNode, passLeaf),
      );
      const connector = passLeaf?.connector;
      if (connector?.status === "suspended" || connector?.status === "degenerate") continue;
      const paint = checked(leaf.path.join("/"), () => connectorPaintSource(connector));
      if (!paint && (leaf.collapsed || !leaf.view || !leaf.layout)) continue;
      yield {
        sourceRoot,
        sourceNode,
        sourceIdentity:
          passLeaf?.paintIdentity ?? groupedPrintIdentity(sourceRoot, sourceNode, leaf.path),
        path: leaf.path,
        drawingId: leaf.path.join("/"),
        drawing: paint?.paintView ?? textPaint ?? leaf.view!,
        rect: paint?.route.paintLayout.rect ?? leaf.layout!.rect,
        ...(paint ? { connectorRoute: paint.route } : {}),
      };
    }
    return;
  }
  const passLeaf = renderPass?.getLeaf(sourceRoot.id);
  const resolved = checked(sourceRoot.id, () => {
    if (!renderPass) return resolveShapeDrawing(sourceRoot, metrics);
    if (passLeaf?.sourceRoot !== sourceRoot || !passLeaf.carrierRoot)
      throw new TypeError("Printing requires the exact shape owner of its whole-sheet pass.");
    return passLeaf.carrierRoot;
  });
  const textPaint = checked(sourceRoot.id, () => requireLinkedTextPaint(sourceRoot, passLeaf));
  const connector = passLeaf?.connector;
  if (connector?.status === "suspended" || connector?.status === "degenerate") return;
  const paint = checked(sourceRoot.id, () => connectorPaintSource(connector));
  if (!paint && resolved.collapsed) return;
  yield {
    sourceRoot,
    sourceNode: sourceRoot,
    sourceIdentity: passLeaf?.paintIdentity ?? sourceRoot,
    path: [sourceRoot.id],
    drawingId: sourceRoot.id,
    drawing: paint?.paintView ?? textPaint ?? (resolved.view as SheetGraphicDrawing),
    rect: paint?.route.paintLayout.rect ?? resolved.rect,
    ...(paint ? { connectorRoute: paint.route } : {}),
  };
}

function* printablePaintEntries(
  sheet: Pick<Sheet, "drawings">,
  metrics: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
) {
  assertPrintShapeRenderPass(sheet, metrics, renderPass);
  for (const root of getPrintableShapeRoots(sheet)) {
    if (root.kind === "shapeGroup" && checked(root.id, () => requiresShapeGroupPaint(root))) {
      const leaves = [...printableLeavesForRoot(root, metrics, renderPass)];
      if (leaves.some((leaf) => leaf.sourceNode.kind === "equation"))
        throw new ShapePrintError(
          root.id,
          new Error("Equation group effects are unavailable for printing."),
        );
      if (leaves.length) yield { kind: "group" as const, root };
    } else {
      for (const leaf of printableLeavesForRoot(root, metrics, renderPass))
        if (isPrintableEquationLeaf(leaf)) yield { kind: "equation" as const, leaf };
        else yield { kind: "leaf" as const, leaf };
    }
  }
}

/** Sparse continuous worksheet geometry, including actual filter/outline visibility, never page gaps. */
export function createPrintShapeMetrics(
  sheet: Sheet,
  evaluator: SheetEvaluator,
): PictureSheetMetrics {
  const geometry = createSheetGeometry({
    rowCount: MAX_SHEET_ROWS,
    columnCount: MAX_SHEET_COLUMNS,
    rowHeight: getDefaultRowHeight(sheet),
    columnWidth: getDefaultColumnWidth(sheet),
    rowHeights: sheet.rowHeights,
    columnWidths: sheet.columnWidths,
    hiddenRows: sheet.hiddenRows,
    hiddenColumns: [
      ...(sheet.hiddenColumns ?? []),
      ...createSheetHiddenColumnIntervals(sheet).flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ),
    ],
  });
  const rows = createRowVisibilityIndex({
    rowCount: MAX_SHEET_ROWS,
    defaultRowHeight: getDefaultRowHeight(sheet),
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
    hiddenIntervals: createSheetHiddenRowIntervals(sheet, evaluator),
  });
  return createPictureViewMetrics(sheet, geometry, rows);
}

export class ShapePrintError extends Error {
  readonly code = "shape-print-unavailable";
  constructor(
    readonly drawingId: string,
    cause: unknown,
  ) {
    super(
      `Cannot print shape ${JSON.stringify(drawingId)}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ShapePrintError";
  }
}
function checked<T>(id: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw error instanceof ShapePrintError ? error : new ShapePrintError(id, error);
  }
}
function geometryFor(drawing: SheetGraphicDrawing) {
  const geometry =
    getDrawingShapeGeometry(drawing) ??
    (!drawing.shapeGeometry && !drawing.shapePath
      ? drawing.kind === "textBox"
        ? getStandardShapeGeometry({ preset: "rect" }, drawing.width, drawing.height)
        : getLegacyShapeGeometry(drawing.shape, drawing.width, drawing.height)
      : undefined);
  if (!geometry) throw new Error("The actual numeric shape geometry is unavailable.");
  return geometry;
}
function worldBounds(
  drawing: SheetGraphicDrawing,
  rect: ShapeFrameRect,
  local: Bounds,
  flip: boolean,
): Bounds {
  const points = [
    { x: local.left, y: local.top },
    { x: local.right, y: local.top },
    { x: local.right, y: local.bottom },
    { x: local.left, y: local.bottom },
  ].map((point) =>
    shapeFrameLocalToWorld(rect, drawing.rotation, {
      x: flip && drawing.shapeFlipX ? drawing.width - point.x : point.x,
      y: flip && drawing.shapeFlipY ? drawing.height - point.y : point.y,
    }),
  );
  return {
    left: Math.min(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
}
function union(left: Bounds, right: Bounds): Bounds {
  return {
    left: Math.min(left.left, right.left),
    top: Math.min(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
  };
}
function groupWorldBounds(rect: ShapeFrameRect, angle: number, local: Bounds): Bounds {
  const points = [
    { x: local.left, y: local.top },
    { x: local.right, y: local.top },
    { x: local.right, y: local.bottom },
    { x: local.left, y: local.bottom },
  ].map((point) => shapeFrameLocalToWorld(rect, angle, point));
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}
function axisCount(position: number, metrics: PictureAxisMetrics): number {
  let low = 0,
    high = metrics.count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (metrics.visiblePrefix(middle) < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Real body/path tails and ready native glyph bounds determine shape-only pagination.
 * Pending fonts defer only their bounds; the final print owner awaits readiness and
 * recreates the document before choosing pages. Paint itself never suppresses failure. */
export function getPrintShapeContentExtent(
  sheet: Sheet,
  metrics: PictureSheetMetrics,
  theme?: WorkbookTheme,
  resources?: PicturePaintResources,
  requireReadyGroupPaint = false,
  renderPass?: ResolvedShapeForestForRender,
) {
  let rowCount = 0,
    columnCount = 0;
  const activeRoots = new Set<ShapeGroupDrawing>();
  for (const entry of printablePaintEntries(sheet, metrics, renderPass)) {
    if (entry.kind !== "group") continue;
    checked(entry.root.id, () => {
      const plan = planShapeGroupPaint({
        root: entry.root,
        metrics,
        renderPass,
        density: 1,
        resources: { ...resources, theme },
      });
      if (plan.kind === "unavailable") {
        if (requireReadyGroupPaint)
          throw new Error("Complete group bounds require ready fonts and paint resources.");
        return;
      }
      activeRoots.add(entry.root);
      if (!plan.visible || plan.empty || plan.collapsed || plan.layout.collapsed) return;
      const bounds = groupWorldBounds(
        plan.layout.rect,
        plan.layout.angleDeg,
        union(plan.logicalBounds, {
          left: 0,
          top: 0,
          right: plan.layout.rect.width,
          bottom: plan.layout.rect.height,
        }),
      );
      columnCount = Math.max(columnCount, axisCount(bounds.right, metrics.columns));
      rowCount = Math.max(rowCount, axisCount(bounds.bottom, metrics.rows));
    });
  }
  for (const leaf of getPrintableShapeLeaves(sheet, metrics, renderPass))
    checked(leaf.drawingId, () => {
      if (leaf.sourceRoot.kind === "shapeGroup" && activeRoots.has(leaf.sourceRoot)) return;
      const { drawing, rect } = leaf;
      if (projectedLegacyTextBox(drawing)) {
        const plan = planShapeLeafPixels({
          drawing,
          density: 1,
          resources: { theme },
          sourceIdentity: leaf.sourceIdentity,
        });
        if (plan.kind !== "ready") {
          if (plan.reason === "text-unavailable" && !requireReadyGroupPaint) return;
          throw new Error("The projected text box appearance is unavailable for print bounds.");
        }
        const bounds = worldBounds(drawing, rect, plan.logicalBounds, false);
        columnCount = Math.max(columnCount, axisCount(bounds.right, metrics.columns));
        rowCount = Math.max(rowCount, axisCount(bounds.bottom, metrics.rows));
        return;
      }
      const plan = planShapeDetailedPaint({
        drawing,
        geometry: leaf.connectorRoute?.geometry ?? geometryFor(drawing),
        connectorRoute: leaf.connectorRoute,
        density: 1,
        resources: { theme },
      });
      let bounds = worldBounds(
        drawing,
        rect,
        union(plan.logicalBounds, {
          left: 0,
          top: 0,
          right: drawing.width,
          bottom: drawing.height,
        }),
        true,
      );
      if (drawing.text) {
        try {
          const textPlan = planShapeTextPaint({
            drawing,
            layout: layoutDrawingShapeText(drawing),
            density: 1,
            resources: { theme },
          });
          bounds = union(
            bounds,
            worldBounds(drawing, rect, projectedShapeTextBounds(drawing, textPlan, theme), false),
          );
        } catch (error) {
          if (!(error instanceof ShapeTextRuntimeError) || error.code !== "font-not-ready")
            throw error;
        }
      }
      columnCount = Math.max(columnCount, axisCount(bounds.right, metrics.columns));
      rowCount = Math.max(rowCount, axisCount(bounds.bottom, metrics.rows));
    });
  return { rowCount, columnCount };
}

export async function preparePrintShapeFonts(
  sheet: Sheet,
  metrics: PictureSheetMetrics,
  renderPass?: ResolvedShapeForestForRender,
): Promise<void> {
  const fonts: Promise<void>[] = [];
  for (const leaf of getPrintableShapeLeaves(sheet, metrics, renderPass)) {
    if (!leaf.drawing.text) continue;
    fonts.push(
      ensureDrawingShapeTextFont(leaf.drawing).catch((error: unknown) => {
        throw new ShapePrintError(leaf.drawingId, error);
      }),
    );
  }
  await Promise.all(fonts);
  assertPrintShapeRenderPass(sheet, metrics, renderPass);
}

/** The genuine shape raster pipeline. It owns no document assets or source geometry mutations. */
export function paintPrintShapes(
  context: CanvasRenderingContext2D,
  options: {
    sheet: Sheet;
    metrics: PictureSheetMetrics;
    viewport: ShapeFrameRect;
    theme?: WorkbookTheme;
    assetUrls?: ReadonlyMap<string, string>;
    images: CanvasImageCache;
    density?: number;
    renderPass?: ResolvedShapeForestForRender;
    /** Called before the first paint entry of each real root, retaining mixed
     * equation/shape z-order without filtering relation targets from the pass. */
    beforeRoot?: (root: SheetDrawing) => void;
    /** Native math dispatch at its exact bottom-to-top DFS leaf position. */
    paintEquationLeaf?: (leaf: PrintableEquationLeaf) => void;
  },
): void {
  const resources = createPicturePaintResources(options.theme, options.assetUrls, options.images);
  const density = options.density ?? getPicturePaintDensity(context);
  context.save();
  try {
    context.beginPath();
    context.rect(0, 0, options.viewport.width, options.viewport.height);
    context.clip();
    let previousRoot: SheetDrawing | undefined;
    for (const entry of printablePaintEntries(options.sheet, options.metrics, options.renderPass)) {
      const root = entry.kind === "group" ? entry.root : entry.leaf.sourceRoot;
      if (root !== previousRoot) {
        options.beforeRoot?.(root);
        previousRoot = root;
      }
      if (entry.kind === "equation") {
        if (!options.paintEquationLeaf)
          throw new ShapePrintError(
            root.id,
            new Error("A native Equation print consumer is required."),
          );
        options.paintEquationLeaf(entry.leaf);
        continue;
      }
      if (entry.kind === "group") {
        checked(entry.root.id, () => {
          const result = prepareShapeGroupPaint({
            root: entry.root,
            metrics: options.metrics,
            renderPass: options.renderPass,
            density,
            resources,
            interactive: false,
          });
          if (result.kind !== "ready")
            throw new Error("The complete group appearance is unavailable for printing.");
          try {
            if (!result.visible || result.empty || result.collapsed || result.layout.collapsed)
              return;
            const rect = result.layout.rect;
            const bounds = groupWorldBounds(rect, result.layout.angleDeg, result.logicalBounds);
            if (
              bounds.right <= options.viewport.x ||
              bounds.bottom <= options.viewport.y ||
              bounds.left >= options.viewport.x + options.viewport.width ||
              bounds.top >= options.viewport.y + options.viewport.height
            )
              return;
            context.save();
            try {
              context.translate(
                rect.x + rect.width / 2 - options.viewport.x,
                rect.y + rect.height / 2 - options.viewport.y,
              );
              context.rotate((result.layout.angleDeg * Math.PI) / 180);
              context.translate(-rect.width / 2, -rect.height / 2);
              drawRaster(context, result.canvas, result.logicalBounds, result.actualDensity);
            } finally {
              context.restore();
            }
          } finally {
            result.dispose();
          }
        });
        continue;
      }
      const leaf = entry.leaf;
      checked(leaf.drawingId, () => {
        const { drawing, rect, sourceIdentity } = leaf;
        if (projectedLegacyTextBox(drawing)) {
          const result = prepareShapeLeafPixels({ drawing, density, resources, sourceIdentity });
          if (result.kind !== "ready")
            throw new Error("The projected text box appearance is unavailable for printing.");
          try {
            const bounds = worldBounds(drawing, rect, result.logicalBounds, false);
            if (
              bounds.right <= options.viewport.x ||
              bounds.bottom <= options.viewport.y ||
              bounds.left >= options.viewport.x + options.viewport.width ||
              bounds.top >= options.viewport.y + options.viewport.height
            )
              return;
            context.save();
            try {
              context.translate(
                rect.x + drawing.width / 2 - options.viewport.x,
                rect.y + drawing.height / 2 - options.viewport.y,
              );
              context.rotate((drawing.rotation * Math.PI) / 180);
              context.translate(-drawing.width / 2, -drawing.height / 2);
              drawRaster(context, result.canvas, result.logicalBounds, result.actualDensity);
            } finally {
              context.restore();
            }
          } finally {
            result.dispose();
          }
          return;
        }
        const bodyOptions = {
          drawing,
          geometry: leaf.connectorRoute?.geometry ?? geometryFor(drawing),
          connectorRoute: leaf.connectorRoute,
          density,
          resources,
          sourceIdentity,
        };
        const bodyPlan = planShapeDetailedPaint(bodyOptions);
        if (bodyPlan.kind !== "ready") throw new ShapePaintUnavailableError(bodyPlan);
        let bounds = worldBounds(drawing, rect, bodyPlan.logicalBounds, true);
        // Resolve every printable text source before culling. Unknown/missing fonts
        // cannot be silently hidden by a page clip or replaced with fallback glyphs.
        const layout = drawing.text ? layoutDrawingShapeText(drawing) : undefined;
        if (layout) {
          const textPlan = planShapeTextPaint({ drawing, layout, density, resources });
          if (textPlan.kind !== "ready") throw new ShapePaintUnavailableError(textPlan);
          bounds = union(
            bounds,
            worldBounds(
              drawing,
              rect,
              projectedShapeTextBounds(drawing, textPlan, options.theme),
              false,
            ),
          );
        }
        if (
          bounds.right <= options.viewport.x ||
          bounds.bottom <= options.viewport.y ||
          bounds.left >= options.viewport.x + options.viewport.width ||
          bounds.top >= options.viewport.y + options.viewport.height
        )
          return;
        context.save();
        try {
          context.translate(
            rect.x + drawing.width / 2 - options.viewport.x,
            rect.y + drawing.height / 2 - options.viewport.y,
          );
          context.rotate((drawing.rotation * Math.PI) / 180);
          context.translate(-drawing.width / 2, -drawing.height / 2);
          const body = prepareShapeDetailedPaint(bodyOptions);
          if (body.kind !== "ready") throw new ShapePaintUnavailableError(body);
          context.save();
          try {
            context.translate(
              drawing.shapeFlipX ? drawing.width : 0,
              drawing.shapeFlipY ? drawing.height : 0,
            );
            context.scale(drawing.shapeFlipX ? -1 : 1, drawing.shapeFlipY ? -1 : 1);
            drawRaster(context, body.canvas, body.logicalBounds, body.actualDensity);
          } finally {
            context.restore();
          }
          if (layout)
            paintText(context, drawing, layout, density, resources, options.theme, sourceIdentity);
        } finally {
          context.restore();
        }
      });
    }
    assertPrintShapeRenderPass(options.sheet, options.metrics, options.renderPass);
  } finally {
    context.restore();
  }
}
function drawRaster(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  bounds: Bounds,
  density: number,
): void {
  if (canvas.width <= 0 || canvas.height <= 0 || !Number.isFinite(density) || density <= 0)
    throw new Error("The prepared shape pixel surface is unavailable.");
  context.drawImage(
    canvas,
    bounds.left,
    bounds.top,
    canvas.width / density,
    canvas.height / density,
  );
}
function paintText(
  context: CanvasRenderingContext2D,
  drawing: SheetGraphicDrawing,
  layout: ReturnType<typeof layoutDrawingShapeText>,
  density: number,
  resources: PicturePaintResources,
  theme: WorkbookTheme | undefined,
  sourceIdentity: object,
): void {
  const text = prepareShapeTextPaint({
    drawing,
    layout,
    density,
    resources,
    sourceIdentity,
  });
  if (text.kind !== "ready") throw new ShapePaintUnavailableError(text);
  try {
    if (!shapeTextFollowsBodyProjection(drawing)) {
      drawRaster(context, text.canvas, text.logicalBounds, text.actualDensity);
      return;
    }
    const projected = projectShapeTextSurface(drawing, text, theme);
    const canvas = document.createElement("canvas");
    try {
      resizeShapePresentationCanvas(canvas, projected.surface.width, projected.surface.height);
      const paint = canvas.getContext("2d");
      if (!paint) throw new Error("Projected shape text canvas is unavailable.");
      const pixels = paint.createImageData(projected.surface.width, projected.surface.height);
      pixels.data.set(projected.surface.data);
      paint.putImageData(pixels, 0, 0);
      drawRaster(
        context,
        canvas,
        {
          left: projected.left / text.actualDensity,
          top: projected.top / text.actualDensity,
          right: 0,
          bottom: 0,
        },
        text.actualDensity,
      );
    } finally {
      releaseShapePresentationCanvas(canvas);
    }
  } finally {
    text.dispose();
  }
}
