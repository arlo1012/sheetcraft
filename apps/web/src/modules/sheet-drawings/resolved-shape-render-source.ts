import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { locatePictureAxisPoint } from "@sheetcraft/core/picture-axis-metrics";
import { leaseShapeGroupNode } from "@sheetcraft/core/shape-group-edit";
import {
  traverseShapeGroup,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import {
  resolveSheetShapeConnections,
  type ResolvedSheetShapeConnections,
  type ResolvedSheetShapeConnector,
} from "@sheetcraft/core/shape-connector-layout";
import type {
  ReadyShapeConnectorRoute,
  ShapeConnectorPaintLayout,
} from "@sheetcraft/core/shape-connector-route";
import type { ResolvedShapeFrame } from "@sheetcraft/core/shape-frame";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import type {
  SheetDrawing,
  SheetGraphicDrawing,
  SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { normalizeSheetDrawings } from "@sheetcraft/core/sheet-drawings";
import { resolveShapeDrawing, type ResolvedShapeDrawing } from "./resolved-shape-drawing";
import {
  resolveShapeGroupProjection,
  type ResolvedShapeGroupLeaf,
  type ResolvedShapeGroupOwner,
  type ResolvedShapeGroupProjection,
} from "./resolved-shape-group";
import { prepareResolvedShapeGeometry } from "./shape-geometry";
import { assertSupportedShapeGroupScenes } from "./shape-document-support";
import {
  createShapeGroupSceneProjection,
  type ShapeGroupSceneProjection,
} from "./shape-group-scene";
import { SHAPE_TEXT_CHARACTER_LIMITS } from "@sheetcraft/core/shape-text-character-runs";
import type {
  TextBoxReferenceDisplay,
  TextBoxReferenceResolver,
} from "./textbox-reference-display";
import type { PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";

type GraphicSource = SheetGraphicDrawing | SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing;
export type ShapeConnectorRenderSource =
  | Readonly<{
      status: "ready";
      connection: ResolvedSheetShapeConnector;
      /** The Core route is the only authority for geometry, layout and ordered tips. */
      route: ReadyShapeConnectorRoute;
      paintView: SheetGraphicDrawing;
    }>
  | Readonly<{
      status: "suspended" | "degenerate";
      connection: ResolvedSheetShapeConnector;
    }>
  | Readonly<{
      status: "unavailable";
      reason: "connector-text" | "connector-3d";
      connection: ResolvedSheetShapeConnector;
    }>;

export type ResolvedShapeRenderLeaf = Readonly<{
  sourceRoot: SheetDrawing;
  sourceNode: SheetDrawing | SheetGroupedGraphicDrawing | SheetGroupedEquationDrawing;
  path: ShapeGroupPath;
  /** Editing continues to use this genuine carrier projection, never the paint view. */
  carrierRoot?: ResolvedShapeDrawing;
  carrierLeaf?: ResolvedShapeGroupLeaf;
  groupScene?: ShapeGroupSceneProjection;
  connector?: ShapeConnectorRenderSource;
  /** Paint-only current linked glyph source. Carriers above stay canonical and editable. */
  paintView?: SheetGraphicDrawing;
  /** Exact carrier ownership plus this pass/current display for raster caches. */
  paintIdentity?: object;
  textReference?: TextBoxReferenceDisplay;
}>;
export type ResolvedShapeForestForRender = Readonly<{
  sourceForest: readonly SheetDrawing[];
  sourceSnapshot: readonly SheetDrawing[];
  metrics: PictureSheetMetrics;
  revision: number;
  /** Shared once per pass; never copied into every connector or persisted. */
  contextIdentity: object;
  connections: ResolvedSheetShapeConnections | null;
  roots: readonly (ResolvedShapeDrawing | ResolvedShapeGroupProjection)[];
  leaves: readonly ResolvedShapeRenderLeaf[];
  getLeaf(id: string): ResolvedShapeRenderLeaf | undefined;
  getGroup(id: string): ResolvedShapeGroupProjection | undefined;
  /** One full-pass check at an asynchronous/edit boundary, never once per leaf. */
  assertCurrent(
    drawings: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    revision: number,
  ): void;
}>;

function freezeSnapshot<T extends object>(value: T): T {
  const pending: object[] = [value];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(current))) {
      if ("value" in descriptor && descriptor.value && typeof descriptor.value === "object")
        pending.push(descriptor.value as object);
    }
    Object.freeze(current);
  }
  return value;
}
/** Ordinary range endpoints retain optional caller data. Never freeze those aliases or
 * invoke their accessors while capturing the actual normalized drawing fields. */
function detachedSnapshot<T extends object>(value: T): T {
  const clones = new Map<object, object>();
  const pending: object[] = [];
  function copy(source: object): object {
    const previous = clones.get(source);
    if (previous) return previous;
    const clone: object = Array.isArray(source) ? [] : Object.create(Object.getPrototypeOf(source));
    if (Array.isArray(source) && Array.isArray(clone)) clone.length = source.length;
    clones.set(source, clone);
    pending.push(source);
    return clone;
  }
  const result = copy(value) as T;
  while (pending.length) {
    const source = pending.pop()!;
    const clone = clones.get(source)!;
    for (const name of Object.keys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, name)!;
      if ("value" in descriptor && descriptor.value && typeof descriptor.value === "object")
        descriptor.value = copy(descriptor.value as object);
      Object.defineProperty(clone, name, descriptor);
    }
  }
  return freezeSnapshot(result);
}
function snapshotMatches(source: object, snapshot: object): boolean {
  const pending: [object, object][] = [[source, snapshot]];
  const visited = new Map<object, object>();
  while (pending.length) {
    const [current, captured] = pending.pop()!;
    const previous = visited.get(current);
    if (previous) {
      if (previous !== captured) return false;
      continue;
    }
    visited.set(current, captured);
    const keys = Object.keys(current);
    if (
      Array.isArray(current) !== Array.isArray(captured) ||
      (Array.isArray(current) && Array.isArray(captured) && current.length !== captured.length) ||
      keys.length !== Object.keys(captured).length
    )
      return false;
    for (const name of keys) {
      const a = Object.getOwnPropertyDescriptor(current, name)!;
      const b = Object.getOwnPropertyDescriptor(captured, name);
      if (!b || "value" in a !== "value" in b) return false;
      if (!("value" in a)) {
        if (a.get !== b.get || a.set !== b.set) return false;
      } else if (a.value && b.value && typeof a.value === "object" && typeof b.value === "object")
        pending.push([a.value as object, b.value as object]);
      else if (!Object.is(a.value, b.value)) return false;
    }
  }
  return true;
}
function carrierFrame(layout: ShapeConnectorPaintLayout): ResolvedShapeFrame {
  return {
    ...layout,
    rect: { ...layout.rect },
    bounds: { ...layout.bounds },
    corners: layout.corners.map((point) => ({ ...point })) as ResolvedShapeFrame["corners"],
  };
}
function graphicView(
  source: GraphicSource,
  layout: ShapeConnectorPaintLayout,
  metrics: PictureSheetMetrics,
  neutralFlips = false,
): SheetGraphicDrawing {
  // Placement, protection and relationship data never enter a disposable paint view.
  const {
    shapeFrame: _frame,
    groupFrame: _group,
    shapeProperties: _properties,
    shapeConnector: _connector,
    ...appearance
  } = source as GraphicSource & Partial<SheetFramedGraphicDrawing & SheetGroupedGraphicDrawing>;
  const column = locatePictureAxisPoint(layout.rect.x, metrics.columns);
  const row = locatePictureAxisPoint(layout.rect.y, metrics.rows);
  const view: SheetGraphicDrawing = {
    ...appearance,
    rotation: layout.angleDeg,
    anchor: { column: column.index, row: row.index },
    offsetX: layout.rect.x - metrics.columns.visiblePrefix(column.index),
    offsetY: layout.rect.y - metrics.rows.visiblePrefix(row.index),
    width: layout.rect.width,
    height: layout.rect.height,
  };
  if (neutralFlips) {
    delete view.shapeFlipX;
    delete view.shapeFlipY;
  }
  return freezeSnapshot(view);
}
/** Mathematics has source and placement, but no ordinary shape-body projection. */
function equationView(
  source: SheetGroupedEquationDrawing,
  layout: ShapeConnectorPaintLayout,
  metrics: PictureSheetMetrics,
): SheetGraphicDrawing {
  const { groupFrame: _frame, shapeProperties: _properties, ...appearance } = source;
  const column = locatePictureAxisPoint(layout.rect.x, metrics.columns);
  const row = locatePictureAxisPoint(layout.rect.y, metrics.rows);
  return freezeSnapshot({
    ...appearance,
    rotation: layout.angleDeg,
    anchor: { column: column.index, row: row.index },
    offsetX: layout.rect.x - metrics.columns.visiblePrefix(column.index),
    offsetY: layout.rect.y - metrics.rows.visiblePrefix(row.index),
    width: layout.rect.width,
    height: layout.rect.height,
  });
}
function connectorSource(
  node: GraphicSource,
  context: ResolvedSheetShapeConnections,
  metrics: PictureSheetMetrics,
): ShapeConnectorRenderSource | undefined {
  if (!node.shapeConnector) return;
  const connection = context.getConnector(node.id);
  if (!connection)
    throw new TypeError("A connector render pass requires its exact source identity.");
  if (connection.status === "suspended") return Object.freeze({ status: "suspended", connection });
  if (connection.route.status === "degenerate")
    return Object.freeze({ status: "degenerate", connection });
  // The transport stage may not silently lose labels or project a bound tip away from its site.
  if (node.text.length)
    return Object.freeze({ status: "unavailable", reason: "connector-text", connection });
  if (node.shapeStyle?.rotation3d?.kind === "value" || node.shapeStyle?.format3d?.kind === "value")
    return Object.freeze({ status: "unavailable", reason: "connector-3d", connection });
  const route = connection.route;
  if (!prepareResolvedShapeGeometry(route.geometry))
    throw new RangeError("The actual connector route exceeds its numeric paint budget.");
  return Object.freeze({
    status: "ready",
    connection,
    route,
    paintView: graphicView(node, route.paintLayout, metrics, true),
  });
}

/** One complete synchronous relation pass. Static-only documents keep their original admission. */
export function resolveShapeForestForRender(options: {
  drawings: readonly SheetDrawing[];
  metrics: PictureSheetMetrics;
  revision: number;
  textBoxReferenceResolver?: TextBoxReferenceResolver;
}): ResolvedShapeForestForRender {
  const { drawings, metrics, revision } = options;
  let referenceResolver: TextBoxReferenceResolver | undefined;
  let resolverFailure: unknown;
  try {
    referenceResolver =
      options.textBoxReferenceResolver?.createPass?.() ?? options.textBoxReferenceResolver;
  } catch (error) {
    resolverFailure = error;
  }
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new RangeError("A shape render pass requires a non-negative safe revision.");
  const snapshot = detachedSnapshot(normalizeSheetDrawings(drawings));
  // Both static and connector relation branches must share source-stage admission.
  assertSupportedShapeGroupScenes("shape-render-pass", snapshot);
  const sourceRoots = [...drawings];
  const sourceNodes = sourceRoots.map((root) =>
    root.kind === "shapeGroup"
      ? traverseShapeGroup(root).map(({ node, path }) => ({ node, path: [...path] }))
      : [{ node: root, path: [root.id] }],
  );
  const hasConnector = snapshot.some((root) =>
    root.kind === "shapeGroup"
      ? traverseShapeGroup(root).some(({ node }) => "shapeConnector" in node)
      : "shapeConnector" in root,
  );
  const connections = hasConnector ? resolveSheetShapeConnections(snapshot, metrics) : null;
  const roots: (ResolvedShapeDrawing | ResolvedShapeGroupProjection)[] = [];
  const leaves: ResolvedShapeRenderLeaf[] = [];
  const groups = new Map<string, ResolvedShapeGroupProjection>();
  const leafIndex = new Map<string, ResolvedShapeRenderLeaf>();
  const contextIdentity = Object.freeze({});
  function addLeaf(leaf: ResolvedShapeRenderLeaf): void {
    let linked: {
      paintView?: SheetGraphicDrawing;
      paintIdentity?: object;
      textReference?: TextBoxReferenceDisplay;
    } = {};
    if (leaf.sourceNode.kind === "textBox" && leaf.sourceNode.textReference) {
      let display: TextBoxReferenceDisplay;
      try {
        if (resolverFailure) throw resolverFailure;
        display = referenceResolver
          ? referenceResolver.resolve(leaf.sourceNode.textReference)
          : Object.freeze({
              status: "unavailable",
              reason: "evaluator-unavailable",
              message: "Linked text requires its workbook display resolver.",
            });
        if (
          display.status === "ready" &&
          display.text.length > SHAPE_TEXT_CHARACTER_LIMITS.textUnits
        )
          display = Object.freeze({
            status: "unavailable",
            reason: "display-budget",
            message: "Linked text exceeds the shape text-unit budget.",
          });
      } catch (error) {
        display = Object.freeze({
          status: "unavailable",
          reason: "evaluation-failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      linked = { textReference: display };
      const view = leaf.carrierLeaf?.view ?? leaf.carrierRoot?.view;
      if (display.status === "ready" && view?.kind === "textBox") {
        const { textReference: _reference, ...appearance } = view;
        // Detach before freezing: legacy carrier views may be the user's actual
        // drawing, and no paint pass may freeze or change its nested fields.
        linked.paintView = detachedSnapshot({ ...appearance, text: display.text });
        linked.paintIdentity = Object.freeze({
          sourceRoot: leaf.sourceRoot,
          sourceNode: leaf.sourceNode,
          path: leaf.path,
          contextIdentity,
          display,
        });
      }
    }
    const value = Object.freeze({ ...leaf, ...linked });
    leaves.push(value);
    leafIndex.set(leaf.sourceNode.id, value);
  }
  for (let index = 0; index < snapshot.length; index++) {
    const captured = snapshot[index]!;
    const sourceRoot = drawings[index]!;
    if (captured.kind !== "shapeGroup") {
      let carrier: ResolvedShapeDrawing;
      let connector: ShapeConnectorRenderSource | undefined;
      if (captured.kind === "shape" && captured.shapeConnector) {
        const layout = connections!.getNode(captured.id)!.carrierLayout;
        if (!layout) throw new TypeError("A root connector requires its real carrier layout.");
        carrier = {
          source: sourceRoot,
          metrics,
          view: graphicView(captured, layout, metrics),
          rect: layout.rect,
          collapsed: layout.collapsed,
        };
        connector = connectorSource(captured, connections!, metrics);
      } else carrier = resolveShapeDrawing(sourceRoot, metrics);
      roots.push(carrier);
      addLeaf({
        sourceRoot,
        sourceNode: sourceRoot,
        path: Object.freeze([captured.id]),
        carrierRoot: carrier,
        ...(connector ? { connector } : {}),
      });
      continue;
    }
    if (sourceRoot.kind !== "shapeGroup")
      throw new TypeError("Shape source owner changed during resolution.");
    if (!connections) {
      const projection = resolveShapeGroupProjection(sourceRoot, metrics);
      roots.push(projection);
      groups.set(sourceRoot.id, projection);
      for (const leaf of projection.leaves)
        addLeaf({
          sourceRoot,
          sourceNode: leaf.sourceNode,
          path: leaf.path,
          carrierLeaf: leaf,
          ...(leaf.groupScene ? { groupScene: leaf.groupScene } : {}),
        });
      continue;
    }
    const currentNodes = new Map(traverseShapeGroup(sourceRoot).map(({ node }) => [node.id, node]));
    const ownedLeaves: ResolvedShapeGroupLeaf[] = [];
    const owners: ResolvedShapeGroupOwner[] = [];
    const cameraOwners = new Map<
      string,
      { path: ShapeGroupPath; layout: ResolvedShapeFrame | null; rotation3d: PictureRotation3d }
    >();
    for (const { node, path } of traverseShapeGroup(captured)) {
      const current = currentNodes.get(node.id);
      const resolved = connections.getNodeAtPath(path);
      if (!current || current.kind !== node.kind || !resolved)
        throw new TypeError("A shape render pass requires its exact owner path.");
      const layout = resolved.carrierLayout ? carrierFrame(resolved.carrierLayout) : null;
      const parentPath = resolved.parentPath;
      const parent = parentPath && connections.getNodeAtPath(parentPath)?.carrierLayout;
      const parentLayout = parent ? carrierFrame(parent) : null;
      const collapsed = !layout || layout.collapsed;
      if (node.kind === "shapeGroup" && current.kind === "shapeGroup") {
        if (node.group3d?.rotation3d.kind === "value")
          cameraOwners.set(JSON.stringify(path), {
            path,
            layout,
            rotation3d: node.group3d.rotation3d.value,
          });
        owners.push({
          sourceRoot,
          sourceNode: current,
          path,
          parentPath,
          parentLayout,
          layout,
          collapsed,
        });
        continue;
      }
      if (node.kind === "shapeGroup" || current.kind === "shapeGroup" || !parentPath)
        throw new TypeError("A shape render leaf requires its immediate owner.");
      let lease: ResolvedShapeGroupLeaf["lease"] | undefined;
      let camera: ReturnType<typeof cameraOwners.get>;
      for (let length = 1; length < path.length && !camera; length++)
        camera = cameraOwners.get(JSON.stringify(path.slice(0, length)));
      const groupScene =
        camera?.layout && layout && !collapsed
          ? createShapeGroupSceneProjection(camera.path, camera.layout, layout, camera.rotation3d)
          : undefined;
      const leaf: ResolvedShapeGroupLeaf = {
        sourceRoot,
        sourceNode: current,
        metrics,
        path,
        parentPath,
        parentLayout,
        layout,
        collapsed,
        get lease() {
          return (lease ??= leaseShapeGroupNode(captured, path));
        },
        view: resolved.carrierLayout
          ? node.kind === "equation"
            ? equationView(node, resolved.carrierLayout, metrics)
            : graphicView(node, resolved.carrierLayout, metrics)
          : null,
        ...(groupScene ? { groupScene } : {}),
      };
      ownedLeaves.push(leaf);
      const connector =
        node.kind === "equation" ? undefined : connectorSource(node, connections, metrics);
      addLeaf({
        sourceRoot,
        sourceNode: current,
        path,
        carrierLeaf: leaf,
        ...(groupScene ? { groupScene } : {}),
        ...(connector ? { connector } : {}),
      });
    }
    const rootLayout = connections.getNode(sourceRoot.id)!.carrierLayout;
    if (!rootLayout) throw new TypeError("A shape owner requires its real carrier layout.");
    const properties = getShapeObjectProperties(captured.shapeProperties);
    const projection: ResolvedShapeGroupProjection = {
      sourceRoot,
      metrics,
      layout: carrierFrame(rootLayout),
      locked: properties.locked,
      printObject: properties.printObject,
      leaves: Object.freeze(ownedLeaves),
      owners: Object.freeze(owners),
    };
    roots.push(projection);
    groups.set(sourceRoot.id, projection);
  }
  return Object.freeze({
    sourceForest: drawings,
    sourceSnapshot: snapshot,
    metrics,
    revision,
    contextIdentity,
    connections,
    roots: Object.freeze(roots),
    leaves: Object.freeze(leaves),
    getLeaf: (id: string) => leafIndex.get(id),
    getGroup: (id: string) => groups.get(id),
    assertCurrent(
      current: readonly SheetDrawing[],
      currentMetrics: PictureSheetMetrics,
      currentRevision: number,
    ) {
      if (
        current !== drawings ||
        currentMetrics !== metrics ||
        currentRevision !== revision ||
        current.length !== sourceRoots.length
      )
        throw new TypeError(
          "The shape render pass belongs to an outdated source or metrics snapshot.",
        );
      for (let index = 0; index < current.length; index++)
        if (current[index] !== sourceRoots[index])
          throw new TypeError("The shape render pass has outdated source-root identities.");
      if (!snapshotMatches(normalizeSheetDrawings(current), snapshot))
        throw new TypeError("The shape render pass belongs to an outdated source snapshot.");
      for (let index = 0; index < current.length; index++) {
        const root = current[index]!;
        const visits =
          root.kind === "shapeGroup" ? traverseShapeGroup(root) : [{ node: root, path: [root.id] }];
        const expected = sourceNodes[index]!;
        if (
          visits.length !== expected.length ||
          visits.some(({ node, path }, visitIndex) => {
            const captured = expected[visitIndex]!;
            return (
              node !== captured.node ||
              path.length !== captured.path.length ||
              path.some((id, pathIndex) => id !== captured.path[pathIndex])
            );
          })
        )
          throw new TypeError("The shape render pass has outdated owner-node identities.");
      }
      if (
        connections &&
        resolveSheetShapeConnections(current, currentMetrics).resolutionKey !==
          connections.resolutionKey
      )
        throw new TypeError("The shape render pass has outdated numeric dependencies.");
    },
  });
}
