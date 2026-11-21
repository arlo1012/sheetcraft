import type { ComputedRef, Ref } from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  planShapeConnectorBodyTranslation,
  planShapeConnectorEndpointChange,
  planShapeConnectorRouteAdjustment,
  type ShapeConnectorEditSource,
  type ShapeConnectorEndpointEdit,
} from "@sheetcraft/core/shape-connector-editing";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import type {
  SheetDrawing as SourceSheetDrawing,
  SheetLegacyDrawing as SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  resolveShapeForestForRender,
  type ResolvedShapeForestForRender,
} from "../resolved-shape-render-source";
import {
  getShapeConnectorSiteCandidates,
  type ShapeConnectorSiteCandidate,
} from "../shape-connector-site-picking";
import { shapePagePointFromViewport } from "../shape-page-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";

export type ConnectorGestureFragment = {
  drawing: SheetDrawing;
  paneId: FloatingImageViewportFragment["paneId"];
  connectorRoute?: ReadyShapeConnectorRoute;
};

export type DrawingConnectorGesturesOptions = {
  getDrawings: () => readonly SourceSheetDrawing[];
  getSheet: () => Sheet | undefined;
  getRevision: () => number | undefined;
  getLayout: () => SheetViewportLayout;
  getPageProjection: () => PageLayoutProjection | undefined;
  getScale: () => number;
  getApplyCollection: () =>
    | ((
        drawings: readonly SourceSheetDrawing[],
        expected: readonly SourceSheetDrawing[],
        metrics?: PictureSheetMetrics,
        guard?: () => boolean,
      ) => boolean)
    | undefined;
  metrics: ComputedRef<PictureSheetMetrics | undefined>;
  renderPass: ComputedRef<ResolvedShapeForestForRender | undefined>;
  legacyDrawings: ComputedRef<readonly SheetDrawing[]>;
  visibleNodeIds: ComputedRef<ReadonlySet<string>>;
  selectionKey: ComputedRef<string>;
  selectionDisabled: ComputedRef<boolean>;
  selectionFailure: Ref<boolean>;
  connectorFailure: Ref<boolean>;
  rootsPreview: Ref<readonly SourceSheetDrawing[] | undefined>;
  connectorSites: Ref<readonly ShapeConnectorSiteCandidate[]>;
  layerElement: Ref<HTMLElement | undefined>;
  canChange: (drawing: SheetDrawing) => boolean;
  setRootsPreview: (next: readonly SourceSheetDrawing[] | undefined) => void;
  viewportPoint: (event: { clientX: number; clientY: number }) => { x: number; y: number };
  setPointerSession: (session: PointerSession | undefined) => void;
  cancelPointerSession: () => void;
};

/** Owns connector edit source lookup, plan committing, site snapping, and endpoint/route/body drag gestures. */
export function useDrawingConnectorGestures(options: DrawingConnectorGesturesOptions) {
  const {
    metrics,
    renderPass,
    legacyDrawings,
    visibleNodeIds,
    selectionKey,
    selectionDisabled,
    selectionFailure,
    connectorFailure,
    rootsPreview,
    connectorSites,
    layerElement,
  } = options;

  function connectorEditSource(drawing: SheetDrawing): ShapeConnectorEditSource | undefined {
    const leaf = renderPass.value?.getLeaf(drawing.id);
    return leaf?.connector?.status === "ready"
      ? { connectorId: leaf.sourceNode.id, path: leaf.path }
      : undefined;
  }

  function commitConnectorPlan(
    pass: ResolvedShapeForestForRender,
    drawing: SheetDrawing,
    next: readonly SourceSheetDrawing[],
    key: string,
    gestureValid: () => boolean = () => true,
  ): boolean {
    const root = pass.getLeaf(drawing.id)?.sourceRoot;
    const valid = () => {
      try {
        const drawings = options.getDrawings();
        pass.assertCurrent(drawings, metrics.value!, options.getRevision() ?? 0);
        return (
          gestureValid() &&
          key === selectionKey.value &&
          renderPass.value === pass &&
          options.canChange(drawing) &&
          !selectionDisabled.value &&
          !!root &&
          drawings.find((item) => item.id === root.id) === root
        );
      } catch {
        return false;
      }
    };
    const applyCollection = options.getApplyCollection();
    if (!valid() || !applyCollection) return false;
    try {
      resolveShapeForestForRender({
        drawings: next,
        metrics: pass.metrics,
        revision: pass.revision,
      });
      const accepted = applyCollection(next, [...pass.sourceForest], pass.metrics, valid) === true;
      selectionFailure.value = !accepted;
      return accepted;
    } catch {
      selectionFailure.value = true;
      return false;
    }
  }

  function startConnectorGesture(
    fragment: ConnectorGestureFragment,
    event: PointerEvent,
    mode: "move" | "endpoint" | "adjust",
    index?: number,
  ): void {
    const drawing = fragment.drawing;
    const pass = renderPass.value;
    const source = connectorEditSource(drawing);
    const route = fragment.connectorRoute;
    const applyCollection = options.getApplyCollection();
    if (!applyCollection) {
      connectorFailure.value = true;
      return;
    }
    if (
      !pass ||
      !source ||
      !route ||
      selectionDisabled.value ||
      !options.canChange(drawing) ||
      (mode === "endpoint" && index !== 0 && index !== 1) ||
      (mode === "adjust" && (!Number.isSafeInteger(index) || !route.geometry.handles[index!]))
    )
      return;
    const key = selectionKey.value;
    const sheet = options.getSheet(),
      revision = options.getRevision(),
      viewport = options.getLayout(),
      page = options.getPageProjection(),
      scale = options.getScale();
    const valid = () => {
      try {
        pass.assertCurrent(options.getDrawings(), metrics.value!, options.getRevision() ?? 0);
        return (
          key === selectionKey.value &&
          renderPass.value === pass &&
          options.canChange(drawing) &&
          !selectionDisabled.value &&
          options.getSheet() === sheet &&
          options.getRevision() === revision &&
          options.getLayout() === viewport &&
          options.getPageProjection() === page &&
          options.getScale() === scale &&
          legacyDrawings.value.includes(drawing)
        );
      } catch {
        return false;
      }
    };
    const translation = getPicturePaneTranslation(fragment.paneId, viewport);
    const sample = (point: MouseEvent) =>
      page
        ? shapePagePointFromViewport(options.viewportPoint(point), viewport, page, pass.metrics)
            ?.point
        : {
            x: options.viewportPoint(point).x - translation.x,
            y: options.viewportPoint(point).y - translation.y,
          };
    const origin = sample(event);
    if (!origin || !valid()) return;
    const tip = index === 0 ? route.begin : route.end;
    const adjustment =
      mode === "adjust"
        ? shapeFrameLocalToWorld(
            route.paintLayout.rect,
            route.paintLayout.angleDeg,
            route.geometry.handles[index!]!.position,
          )
        : undefined;
    let planned: readonly SourceSheetDrawing[] | undefined;
    let changed = false;
    const update = (point: MouseEvent) => {
      if (!valid()) {
        options.cancelPointerSession();
        return;
      }
      const target = sample(point);
      if (!target) {
        planned = undefined;
        rootsPreview.value = undefined;
        connectorSites.value = [];
        return;
      }
      const delta = { x: target.x - origin.x, y: target.y - origin.y };
      changed = delta.x !== 0 || delta.y !== 0;
      try {
        if (mode === "endpoint") {
          const position = { x: tip.x + delta.x, y: tip.y + delta.y };
          const nearby = getShapeConnectorSiteCandidates(
            pass.connections!,
            position,
            12 / scale,
            visibleNodeIds.value,
          );
          connectorSites.value = nearby;
          const site = nearby[0];
          const endpoint: ShapeConnectorEndpointEdit = site
            ? {
                kind: "site",
                targetId: site.targetId,
                targetPath: site.path,
                preset: site.preset,
                siteIndex: site.siteIndex,
              }
            : { kind: "free", position };
          planned = changed
            ? planShapeConnectorEndpointChange(
                pass.sourceForest,
                source,
                index === 0 ? "begin" : "end",
                endpoint,
                pass.metrics,
              )
            : undefined;
        } else if (mode === "adjust") {
          planned = changed
            ? planShapeConnectorRouteAdjustment(
                pass.sourceForest,
                source,
                index!,
                { x: adjustment!.x + delta.x, y: adjustment!.y + delta.y },
                pass.metrics,
              )
            : undefined;
        } else {
          planned = changed
            ? planShapeConnectorBodyTranslation(pass.sourceForest, source, delta, pass.metrics)
            : undefined;
        }
        options.setRootsPreview(planned);
        selectionFailure.value = false;
      } catch {
        planned = undefined;
        rootsPreview.value = undefined;
        connectorSites.value = [];
        selectionFailure.value = true;
      }
    };
    options.setPointerSession(
      startPointerSession({
        event,
        captureTarget: layerElement.value,
        onMove: update,
        onEnd: (point) => {
          update(point);
          const next = planned;
          rootsPreview.value = undefined;
          connectorSites.value = [];
          if (next && changed && valid()) commitConnectorPlan(pass, drawing, next, key, valid);
        },
        onCancel: () => {
          rootsPreview.value = undefined;
          connectorSites.value = [];
        },
      }),
    );
  }

  return {
    connectorEditSource,
    commitConnectorPlan,
    startConnectorGesture,
  };
}
