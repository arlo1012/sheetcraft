import { computed, getCurrentScope, onScopeDispose, shallowRef } from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  findShapeGroupNode,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type {
  SheetDrawing,
  SheetFramedGraphicDrawing,
  SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import {
  resolveShapeForestForRender,
  type ResolvedShapeForestForRender,
} from "./resolved-shape-render-source";
import { isShapeObjectPathVisible } from "./shape-visibility";
import { getDrawingShapeTextRect } from "./shape-text-runtime";

type TextSource = SheetGraphicDrawing | SheetFramedGraphicDrawing | SheetGroupedGraphicDrawing;
export type ShapeTextEditErrorCode =
  | "owner"
  | "source"
  | "metrics"
  | "permission"
  | "busy"
  | "composition"
  | "prepare"
  | "disposed";
export type ShapeTextEditError = Readonly<{ code: ShapeTextEditErrorCode; message: string }>;
export type ShapeTextEditSnapshot = Readonly<{
  sessionId: number;
  root: SheetDrawing;
  sourceNode: TextSource;
  sourceRootId: string;
  sourceId: string;
  path: ShapeGroupPath;
  /** The captured genuine carrier view, never a persistent replacement. */
  view: SheetGraphicDrawing;
  text: string;
  draftText: string;
  composing: boolean;
  stale: boolean;
  error?: ShapeTextEditError;
}>;
export type ShapeTextEditCallbacks = Readonly<{
  sessionId: number;
  /** Session presence only; this never substitutes for the lease/permission guard. */
  isActive: () => boolean;
  update: (text: string) => boolean;
  setComposing: (composing: boolean) => boolean;
  commit: () => boolean;
  cancel: () => boolean;
}>;
export interface ShapeTextEditSessionOptions {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics: () => PictureSheetMetrics | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  /** The host prepares text/AutoFit and final connector paint before one Core command. */
  replaceCollection: (
    next: readonly SheetDrawing[],
    expectedForest: readonly SheetDrawing[],
    metrics: PictureSheetMetrics,
    finalGuard?: () => boolean,
  ) => boolean;
  onFailure?: (error: ShapeTextEditError) => void;
}
type Lease = {
  sessionId: number;
  workbook: Workbook;
  sheet: Sheet;
  generation: number;
  revision: number;
  pass: ResolvedShapeForestForRender;
  root: SheetDrawing;
  sourceNode: TextSource;
  path: ShapeGroupPath;
  view: SheetGraphicDrawing;
  text: string;
  metrics: PictureSheetMetrics;
  metricFunctions: readonly unknown[];
  geometry: string;
};
type Draft = {
  lease: Lease;
  draftText: string;
  composing: boolean;
  error?: ShapeTextEditError;
};
let sessionSequence = 0;
const error = (code: ShapeTextEditErrorCode, message: string): ShapeTextEditError =>
  Object.freeze({ code, message });
function samePath(left: ShapeGroupPath, right: ShapeGroupPath): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function metricFunctions(metrics: PictureSheetMetrics): unknown[] {
  return [metrics.columns, metrics.rows].flatMap((axis) => [
    axis.count,
    axis.nominalSize,
    axis.visibleSize,
    axis.nominalPrefix,
    axis.visiblePrefix,
  ]);
}
function geometryKey(pass: ResolvedShapeForestForRender): string {
  return JSON.stringify({
    roots: pass.roots.map((root) =>
      "rect" in root
        ? { rect: root.rect, rotation: root.view.rotation, collapsed: root.collapsed }
        : { layout: root.layout, owners: root.owners.map((owner) => owner.layout) },
    ),
    leaves: pass.leaves.map((leaf) => ({
      path: leaf.path,
      layout: leaf.carrierLeaf?.layout,
      parentLayout: leaf.carrierLeaf?.parentLayout,
    })),
  });
}
function sourceAt(root: SheetDrawing, path: ShapeGroupPath) {
  return root.kind === "shapeGroup"
    ? findShapeGroupNode(root, path)?.node
    : samePath(path, [root.id])
      ? root
      : undefined;
}
function textSource(node: ReturnType<typeof sourceAt>): node is TextSource {
  return (
    !!node && (node.kind === "shape" || node.kind === "textBox") && !("shapeConnector" in node)
  );
}
/** Clone only the canonical content and its ownership chain. Inverse world geometry is
 * deliberately absent: the host's genuine text preparation owns any AutoFit resize. */
function replaceOwnedText(root: ShapeGroupDrawing, path: ShapeGroupPath, text: string) {
  function replace(child: ShapeGroupChild, depth: number): ShapeGroupChild {
    if (child.id !== path[depth]) return child;
    if (depth === path.length - 1) {
      if (!textSource(child)) throw new TypeError("Shape text editing requires an ordinary leaf.");
      return { ...child, text };
    }
    if (child.kind !== "shapeGroup") throw new TypeError("The shape text owner path changed.");
    return { ...child, members: child.members.map((member) => replace(member, depth + 1)) };
  }
  return { ...root, members: root.members.map((child) => replace(child, 1)) };
}

/** One private uniform-text draft bound to an exact complete-forest ownership lease. */
export function useShapeTextEditSession(options: ShapeTextEditSessionOptions) {
  const active = shallowRef<Draft>();
  let disposed = false;
  let opening = false;
  let committing = false;
  let boundCallbacks: ShapeTextEditCallbacks | undefined;

  function issue(lease: Lease): ShapeTextEditError | undefined {
    try {
      if (disposed)
        return error("disposed", "This shape text editor is closed. Your draft is preserved.");
      if (
        options.getWorkbook() !== lease.workbook ||
        options.getSheet() !== lease.sheet ||
        lease.workbook.sheets.get(lease.sheet.id) !== lease.sheet ||
        options.getGeneration() !== lease.generation
      )
        return error("owner", "The worksheet owner changed. Your draft is preserved.");
      if (options.getRevision() !== lease.revision)
        return error("source", "The workbook changed. Your draft is preserved.");
      const metrics = options.getMetrics();
      if (
        metrics !== lease.metrics ||
        !lease.metricFunctions.every(
          (value, index) => value === metricFunctions(lease.metrics)[index],
        )
      )
        return error("metrics", "The worksheet geometry changed. Your draft is preserved.");
      lease.pass.assertCurrent(lease.sheet.drawings ?? [], lease.metrics, lease.revision);
      if (
        sourceAt(lease.root, lease.path) !== lease.sourceNode ||
        geometryKey(
          resolveShapeForestForRender({
            drawings: lease.pass.sourceForest,
            metrics: lease.metrics,
            revision: lease.revision,
          }),
        ) !== lease.geometry
      )
        return error("source", "The shape text target changed. Your draft is preserved.");
      if (!canEditShapeObject(lease.sheet, lease.root))
        return error(
          "permission",
          "Editing this shape is currently protected. Your draft is preserved.",
        );
      if (options.isBusy()) return error("busy", "The workbook is busy. Your draft is preserved.");
    } catch {
      return error(
        "source",
        "The shape text source changed or is unavailable. Your draft is preserved.",
      );
    }
  }
  function fail(state: Draft, reason: ShapeTextEditError): false {
    if (active.value?.lease === state.lease) active.value = { ...active.value, error: reason };
    options.onFailure?.(reason);
    return false;
  }
  const snapshot = computed<ShapeTextEditSnapshot | undefined>(() => {
    const state = active.value;
    if (!state) return;
    const lease = state.lease;
    const reason = (committing ? undefined : issue(lease)) ?? state.error;
    return Object.freeze({
      sessionId: lease.sessionId,
      root: lease.root,
      sourceNode: lease.sourceNode,
      sourceRootId: lease.root.id,
      sourceId: lease.sourceNode.id,
      path: lease.path,
      view: lease.view,
      text: lease.text,
      draftText: state.draftText,
      composing: state.composing,
      stale: !!reason && ["owner", "source", "metrics", "disposed"].includes(reason.code),
      ...(reason ? { error: reason } : {}),
    });
  });
  function begin(root: SheetDrawing, ownedPath?: ShapeGroupPath): boolean {
    if (disposed || opening || committing) return false;
    const path = Object.freeze([...(ownedPath ?? [root.id])]);
    const state = active.value;
    if (state)
      return state.lease.root === root && samePath(state.lease.path, path) && !issue(state.lease);
    opening = true;
    try {
      const workbook = options.getWorkbook(),
        sheet = options.getSheet(),
        generation = options.getGeneration();
      const node = sourceAt(root, path);
      if (
        options.isBusy() ||
        workbook.sheets.get(sheet.id) !== sheet ||
        !sheet.drawings?.includes(root) ||
        !textSource(node) ||
        !isShapeObjectPathVisible(root, path) ||
        !canEditShapeObject(sheet, root) ||
        !options.flush()
      )
        return false;
      if (
        disposed ||
        options.getWorkbook() !== workbook ||
        options.getSheet() !== sheet ||
        options.getGeneration() !== generation ||
        workbook.sheets.get(sheet.id) !== sheet ||
        sourceAt(root, path) !== node ||
        !sheet.drawings?.includes(root)
      )
        return false;
      const metrics = options.getMetrics(),
        revision = options.getRevision();
      if (!metrics || !sheet.drawings) return false;
      const pass = resolveShapeForestForRender({ drawings: sheet.drawings, metrics, revision });
      const leaf = pass.getLeaf(node.id);
      const view = leaf?.carrierLeaf?.view ?? leaf?.carrierRoot?.view;
      if (
        leaf?.sourceRoot !== root ||
        leaf.sourceNode !== node ||
        !samePath(leaf.path, path) ||
        leaf.carrierLeaf?.collapsed ||
        leaf.carrierRoot?.collapsed ||
        !view ||
        (view.kind !== "shape" && view.kind !== "textBox") ||
        !getDrawingShapeTextRect(view)
      )
        return false;
      const lease: Lease = {
        sessionId: ++sessionSequence,
        workbook,
        sheet,
        generation,
        revision,
        pass,
        root,
        sourceNode: node,
        path,
        view,
        text: node.text,
        metrics,
        metricFunctions: metricFunctions(metrics),
        geometry: geometryKey(pass),
      };
      if (issue(lease)) return false;
      active.value = { lease, draftText: node.text, composing: false };
      return true;
    } catch {
      return false;
    } finally {
      opening = false;
    }
  }
  function update(sessionId: number, draftText: string): boolean {
    const state = active.value;
    if (disposed || committing || !state || state.lease.sessionId !== sessionId) return false;
    // Even an outdated lease keeps a copyable/editable draft; it can never retarget it.
    active.value = { ...state, draftText, error: issue(state.lease) };
    return true;
  }
  function setComposing(sessionId: number, composing: boolean): boolean {
    const state = active.value;
    if (disposed || committing || !state || state.lease.sessionId !== sessionId) return false;
    active.value = { ...state, composing, error: issue(state.lease) };
    return true;
  }
  function cancel(sessionId = active.value?.lease.sessionId): boolean {
    if (!active.value || active.value.lease.sessionId !== sessionId) return false;
    active.value = undefined;
    return true;
  }
  function commit(sessionId: number): boolean {
    const state = active.value;
    if (committing || !state || state.lease.sessionId !== sessionId) return false;
    const reason = issue(state.lease);
    if (reason) return fail(state, reason);
    if (state.composing)
      return fail(state, error("composition", "Finish composing text before saving your draft."));
    if (state.draftText === state.lease.text) return cancel(sessionId);
    committing = true;
    try {
      const lease = state.lease;
      const replacement =
        lease.root.kind === "shapeGroup"
          ? replaceOwnedText(lease.root, lease.path, state.draftText)
          : { ...lease.root, text: state.draftText };
      const next = lease.pass.sourceForest.map((root) =>
        root === lease.root ? replacement : root,
      );
      const finalGuard = () => active.value === state && !state.composing && !issue(lease);
      if (!options.replaceCollection(next, lease.pass.sourceForest, lease.metrics, finalGuard))
        return fail(
          state,
          issue(lease) ??
            error(
              "prepare",
              "The shape text could not be prepared or saved. Your draft is preserved.",
            ),
        );
      // Host success means its single command applied. Never close a replacement session.
      if (active.value?.lease === lease) active.value = undefined;
      return true;
    } catch (cause) {
      return fail(
        state,
        issue(state.lease) ??
          error(
            "prepare",
            cause instanceof Error
              ? cause.message
              : "The shape text could not be saved. Your draft is preserved.",
          ),
      );
    } finally {
      committing = false;
    }
  }
  function callbacks(sessionId: number): ShapeTextEditCallbacks {
    if (boundCallbacks?.sessionId === sessionId) return boundCallbacks;
    const result = Object.freeze({
      sessionId,
      isActive: () => active.value?.lease.sessionId === sessionId,
      update: (text: string) => update(sessionId, text),
      setComposing: (value: boolean) => setComposing(sessionId, value),
      commit: () => commit(sessionId),
      cancel: () => cancel(sessionId),
    });
    // Looking up a retired ID must not replace the active editor's stable handlers.
    if (active.value?.lease.sessionId === sessionId) boundCallbacks = result;
    return result;
  }
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      if (active.value)
        active.value = {
          ...active.value,
          error: error("disposed", "This shape text editor is closed. Your draft is preserved."),
        };
    });
  return { snapshot, begin, open: begin, update, setComposing, commit, cancel, callbacks };
}
