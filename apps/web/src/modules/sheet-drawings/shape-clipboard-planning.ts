import {
  locatePictureAxisPoint,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { materializeShapeConnectorTargets } from "@sheetcraft/core/shape-connector-materialize";
import { planCloneShapeRootsForClipboard } from "@sheetcraft/core/shape-group-copy";
import { planDeleteShapeGroupNodes } from "@sheetcraft/core/shape-group-delete";
import {
  isShapeGroupDrawing,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupNode,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import {
  resolveShapeGroup,
  type ResolvedShapeGroupNode,
} from "@sheetcraft/core/shape-group-layout";
import {
  assertShapeDrawingForestLayouts,
  isShapeGroupEligibleRoot,
  normalizeShapeDrawingForest,
  releaseShapeGroupChild,
  resolveShapeRootLayout,
} from "@sheetcraft/core/shape-group-planning";
import { anchorShapeFrameRect } from "@sheetcraft/core/shape-frame";
import { hasShapeObjectFrame, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellAddress } from "@sheetcraft/core/workbook";

export type ShapeClipboardFailure =
  | "invalid-selection"
  | "collapsed-selection"
  | "unsupported-group-scene"
  | "unsupported-owner-effects"
  | "invalid-placement"
  | "unavailable-owner"
  | "stale-owner"
  | "source-protected"
  | "target-protected"
  | "cross-sheet-cut"
  | "command-rejected";

export class ShapeClipboardError extends Error {
  constructor(readonly reason: ShapeClipboardFailure) {
    super(`Shape object clipboard: ${reason}.`);
    this.name = "ShapeClipboardError";
  }
}

export type ShapeClipboardSelection = {
  /** Detached canonical source, retained for a delayed cut's compare-and-swap. */
  readonly sourceForest: readonly SheetDrawing[];
  /** Genuine standalone roots at their original worksheet world geometry. */
  readonly roots: readonly SheetDrawing[];
  readonly selectedPaths: readonly ShapeGroupPath[];
  readonly sourceRootIds: readonly string[];
};
type SourceVisit = {
  node: SheetDrawing | ShapeGroupNode;
  path: ShapeGroupPath;
  root: SheetDrawing;
};

function dataArray<T>(value: readonly T[], maximum: number): T[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum
  )
    throw new ShapeClipboardError("invalid-selection");
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length ||
      !("value" in Object.getOwnPropertyDescriptor(value, key)!)
    )
      throw new ShapeClipboardError("invalid-selection");
  }
  const result: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) throw new ShapeClipboardError("invalid-selection");
    result.push(descriptor.value as T);
  }
  return result;
}

function below(path: ShapeGroupPath, owner: ShapeGroupPath): boolean {
  return path.length >= owner.length && owner.every((id, index) => path[index] === id);
}

/** Includes every owned ID, even a hidden descendant and an unrelated non-shape root. */
export function shapeClipboardForestIds(values: readonly SheetDrawing[]): string[] {
  return normalizeShapeDrawingForest(values).flatMap((root) =>
    isShapeGroupDrawing(root) ? traverseShapeGroup(root).map(({ node }) => node.id) : [root.id],
  );
}

/** Exact stable ownership paths; stale descendants are validated before ancestor deduplication. */
export function captureShapeClipboardSelection(
  values: readonly SheetDrawing[],
  pathsValue: readonly ShapeGroupPath[],
  metrics: PictureSheetMetrics,
): ShapeClipboardSelection {
  const sourceForest = normalizeShapeDrawingForest(values);
  assertShapeDrawingForestLayouts(sourceForest, metrics);
  const paths = dataArray(pathsValue, MAX_SHAPE_GROUP_NODES).map((value) => {
    const path = dataArray(value, MAX_SHAPE_GROUP_DEPTH + 1);
    if (!path.length || path.some((id) => typeof id !== "string" || !id.trim()))
      throw new ShapeClipboardError("invalid-selection");
    return path;
  });
  if (!paths.length) throw new ShapeClipboardError("invalid-selection");
  const visits = sourceForest.flatMap<SourceVisit>((root) =>
    isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node, path }) => ({ node, path, root }))
      : [{ node: root, path: [root.id], root }],
  );
  const byId = new Map(visits.map((visit) => [visit.node.id, visit]));
  for (const path of paths) {
    const visit = byId.get(path.at(-1)!);
    if (
      !visit ||
      !isShapeGroupEligibleRoot(visit.root) ||
      visit.path.length !== path.length ||
      !below(visit.path, path)
    )
      throw new ShapeClipboardError("invalid-selection");
  }
  const selectedIds = new Set(paths.map((path) => path.at(-1)!));
  // Traverse source stack order, rather than selection-click order.
  const selected = visits.filter(
    ({ node, path }) =>
      selectedIds.has(node.id) && !path.slice(0, -1).some((id) => selectedIds.has(id)),
  );
  const selectedPaths = selected.map(({ path }) => [...path]);
  const retainedIds = new Set(selected.map(({ node }) => node.id));
  const closure = new Set(
    visits.filter(({ path }) => path.some((id) => retainedIds.has(id))).map(({ node }) => node.id),
  );
  const connections = visits.filter(
    ({ node }) => closure.has(node.id) && node.kind === "shape" && node.shapeConnector,
  );
  const externalTargets = new Set<string>();
  for (const { node } of connections)
    if (node.kind === "shape" && node.shapeConnector)
      for (const endpoint of [node.shapeConnector.begin, node.shapeConnector.end])
        if (endpoint.kind === "site" && !closure.has(endpoint.targetId))
          externalTargets.add(endpoint.targetId);
  // Detach outside tips against the FULL source forest, before an owned subtree leaves it.
  const captured = externalTargets.size
    ? materializeShapeConnectorTargets(sourceForest, [...externalTargets], metrics, {
        connectorIds: connections.map(({ node }) => node.id),
      })
    : normalizeShapeDrawingForest(sourceForest);
  const capturedRoots = new Map(captured.map((root) => [root.id, root]));
  const capturedNodes = new Map<string, SheetDrawing | ShapeGroupNode>();
  for (const root of captured)
    for (const node of isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node }) => node)
      : [root])
      capturedNodes.set(node.id, node);
  const resolvedNodes = new Map<string, ResolvedShapeGroupNode>();
  function collectResolved(node: ResolvedShapeGroupNode): void {
    resolvedNodes.set(node.node.id, node);
    if ("members" in node) for (const member of node.members) collectResolved(member);
  }
  for (const id of new Set(
    selectedPaths.filter((path) => path.length > 1).map((path) => path[0]!),
  )) {
    const root = capturedRoots.get(id)!;
    if (!isShapeGroupDrawing(root)) throw new ShapeClipboardError("invalid-selection");
    // A many-leaf selection resolves each genuine source owner once, never once per leaf.
    collectResolved(resolveShapeGroup(root, metrics));
  }
  const roots = selectedPaths.map((path): SheetDrawing => {
    const root = capturedRoots.get(path[0]!)!;
    if (!isShapeGroupEligibleRoot(root)) throw new ShapeClipboardError("invalid-selection");
    if (path.length === 1) {
      if (resolveShapeRootLayout(root, metrics).collapsed)
        throw new ShapeClipboardError("collapsed-selection");
      return root;
    }
    if (!isShapeGroupDrawing(root)) throw new ShapeClipboardError("invalid-selection");
    const target = resolvedNodes.get(path.at(-1)!);
    if (!target?.layout || target.layout.collapsed)
      throw new ShapeClipboardError("collapsed-selection");
    let hidden = false;
    for (let length = 1; length < path.length; length++) {
      const owner = capturedNodes.get(path[length - 1]!)!;
      if (owner.kind !== "shapeGroup") throw new ShapeClipboardError("invalid-selection");
      hidden ||= owner.hidden === true;
      // Core's source rule: an active group camera above the exact selected node owns its body.
      // Transferring just its values to a smaller carrier would change the shared scene pivot.
      if (owner.group3d?.rotation3d.kind === "value")
        throw new ShapeClipboardError("unsupported-group-scene");
      if (
        owner.groupEffects?.shadow?.kind === "value" ||
        owner.groupEffects?.reflection?.kind === "value" ||
        owner.groupEffects?.glow?.kind === "value"
      )
        throw new ShapeClipboardError("unsupported-owner-effects");
    }
    return releaseShapeGroupChild(
      target.node as ShapeGroupChild,
      target.layout,
      metrics,
      root.shapeProperties,
      hidden,
    );
  });
  return {
    sourceForest,
    roots: normalizeShapeDrawingForest(roots),
    selectedPaths,
    sourceRootIds: [...new Set(selectedPaths.map((path) => path[0]!))],
  };
}

/** Translate the original sheet-space boxes to a deliberate target cell, preserving all subtrees. */
export function placeShapeClipboardRoots(
  values: readonly SheetDrawing[],
  sourceMetrics: PictureSheetMetrics,
  targetMetrics: PictureSheetMetrics,
  address: CellAddress,
): SheetDrawing[] {
  const prototype: unknown = address && Object.getPrototypeOf(address);
  if (!address || (prototype !== Object.prototype && prototype !== null))
    throw new ShapeClipboardError("invalid-placement");
  for (const key of Reflect.ownKeys(address))
    if (
      (key !== "column" && key !== "row") ||
      !("value" in Object.getOwnPropertyDescriptor(address, key)!)
    )
      throw new ShapeClipboardError("invalid-placement");
  const columnValue: unknown = Object.getOwnPropertyDescriptor(address, "column")?.value;
  const rowValue: unknown = Object.getOwnPropertyDescriptor(address, "row")?.value;
  if (
    typeof columnValue !== "number" ||
    typeof rowValue !== "number" ||
    !Number.isInteger(columnValue) ||
    !Number.isInteger(rowValue) ||
    columnValue < 0 ||
    rowValue < 0 ||
    columnValue >= targetMetrics.columns.count ||
    rowValue >= targetMetrics.rows.count
  )
    throw new ShapeClipboardError("invalid-placement");
  const roots = normalizeShapeDrawingForest(values);
  if (!roots.length || roots.some((root) => !isShapeGroupEligibleRoot(root)))
    throw new ShapeClipboardError("invalid-selection");
  const boxes = roots.map((root) => {
    if (!isShapeGroupEligibleRoot(root)) throw new ShapeClipboardError("invalid-selection");
    const layout = resolveShapeRootLayout(root, sourceMetrics);
    if (layout.collapsed) throw new ShapeClipboardError("collapsed-selection");
    return layout.rect;
  });
  const dx = targetMetrics.columns.visiblePrefix(columnValue) - Math.min(...boxes.map((r) => r.x));
  const dy = targetMetrics.rows.visiblePrefix(rowValue) - Math.min(...boxes.map((r) => r.y));
  const placed = roots.map((root, index): SheetDrawing => {
    const before = boxes[index]!;
    const rect = { ...before, x: before.x + dx, y: before.y + dy };
    if (hasShapeObjectFrame(root))
      return {
        ...root,
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: anchorShapeFrameRect(
            root.shapeFrame.anchor.mode,
            rect,
            targetMetrics,
            sourceMetrics === targetMetrics ? root.shapeFrame.anchor : undefined,
          ),
        },
      };
    const column = locatePictureAxisPoint(rect.x, targetMetrics.columns);
    const row = locatePictureAxisPoint(rect.y, targetMetrics.rows);
    const columnIndex = Math.min(column.index, targetMetrics.columns.count - 1);
    const rowIndex = Math.min(row.index, targetMetrics.rows.count - 1);
    return {
      ...root,
      anchor: { column: columnIndex, row: rowIndex },
      offsetX: rect.x - targetMetrics.columns.visiblePrefix(columnIndex),
      offsetY: rect.y - targetMetrics.rows.visiblePrefix(rowIndex),
      width: rect.width,
      height: rect.height,
    };
  });
  const result = normalizeShapeDrawingForest(placed);
  assertShapeDrawingForestLayouts(result, targetMetrics);
  return result;
}

/** One complete collection proposal. The host commits it atomically or leaves both sides intact. */
export function planShapeClipboardPaste(options: {
  selection: ShapeClipboardSelection;
  mode: "copy" | "cut";
  targetForest: readonly SheetDrawing[];
  sourceMetrics: PictureSheetMetrics;
  targetMetrics: PictureSheetMetrics;
  address: CellAddress;
  createId: () => string;
}): { roots: SheetDrawing[]; nextForest: SheetDrawing[] } {
  const target = normalizeShapeDrawingForest(options.targetForest);
  const roots = planCloneShapeRootsForClipboard(
    options.selection.roots,
    options.selection.roots.map((root) => root.id),
    options.sourceMetrics,
    {
      createId: options.createId,
      reservedIds: [
        ...new Set([
          ...shapeClipboardForestIds(target),
          ...shapeClipboardForestIds(options.selection.sourceForest),
        ]),
      ],
    },
  );
  const placed = placeShapeClipboardRoots(
    roots,
    options.sourceMetrics,
    options.targetMetrics,
    options.address,
  );
  const surviving =
    options.mode === "cut"
      ? planDeleteShapeGroupNodes(target, options.selection.selectedPaths, options.sourceMetrics)
      : target;
  const nextForest = normalizeShapeDrawingForest([...surviving, ...placed]);
  assertShapeDrawingForestLayouts(nextForest, options.targetMetrics);
  return { roots: placed, nextForest };
}

export type ShapeClipboardCrossSheetPlan = {
  roots: SheetDrawing[];
  sourceForest: SheetDrawing[];
  targetForest: SheetDrawing[];
  /** Endpoint counts, not object counts. These associations cannot cross sheets. */
  disconnectedEndpoints: { moved: number; remaining: number; total: number };
};

/** A detached two-forest proposal. Only the host's atomic command can remove the source. */
export function planCrossSheetShapeClipboardCut(options: {
  selection: ShapeClipboardSelection;
  targetForest: readonly SheetDrawing[];
  sourceMetrics: PictureSheetMetrics;
  targetMetrics: PictureSheetMetrics;
  address: CellAddress;
  createId: () => string;
}): ShapeClipboardCrossSheetPlan {
  const source = normalizeShapeDrawingForest(options.selection.sourceForest);
  const visits = source.flatMap<SourceVisit>((root) =>
    isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).map(({ node, path }) => ({ node, path, root }))
      : [{ node: root, path: [root.id], root }],
  );
  const selected = new Set(options.selection.selectedPaths.map((path) => path.at(-1)!));
  const moved = new Set(
    visits.filter(({ path }) => path.some((id) => selected.has(id))).map(({ node }) => node.id),
  );
  let movedEndpoints = 0;
  let remainingEndpoints = 0;
  for (const { node } of visits) {
    if (node.kind !== "shape" || !node.shapeConnector) continue;
    for (const endpoint of [node.shapeConnector.begin, node.shapeConnector.end]) {
      if (endpoint.kind !== "site" || moved.has(node.id) === moved.has(endpoint.targetId)) continue;
      if (moved.has(node.id)) movedEndpoints++;
      else remainingEndpoints++;
    }
  }
  // Capture already free-materialized moved tips at the full source context.
  // Deletion separately materializes surviving tips and contracts/dissolves owners.
  const sourceForest = planDeleteShapeGroupNodes(
    source,
    options.selection.selectedPaths,
    options.sourceMetrics,
  );
  const pasted = planShapeClipboardPaste({ ...options, mode: "copy" });
  return {
    roots: pasted.roots,
    sourceForest,
    targetForest: pasted.nextForest,
    disconnectedEndpoints: {
      moved: movedEndpoints,
      remaining: remainingEndpoints,
      total: movedEndpoints + remainingEndpoints,
    },
  };
}
