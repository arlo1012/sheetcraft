import type { ComputedRef, Ref } from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import {
  planShapeConnectorBodyTranslation,
  planShapeConnectorEndpointChange,
  planShapeConnectorRouteAdjustment,
  type ShapeConnectorEditSource,
} from "@sheetcraft/core/shape-connector-editing";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import type { ShapeGroupDrawing, ShapeGroupPath } from "@sheetcraft/core/shape-group";
import type {
  SheetDrawing as SourceSheetDrawing,
  SheetGraphicDrawing,
  SheetLegacyDrawing as SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  getFloatingImageSheetRect,
  type FloatingImageResizeDirection,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FreeShapePointAction as PointAction } from "../free-shape-edit-actions";
import {
  listFreeShapePoints,
  moveFreeShapePoint,
  setFreeShapePointType,
  toggleClosedFreeShape,
  type FreeShapePointDescriptor,
  type ShapePointEditOptions,
} from "../free-shape-point-layout";
import {
  addFreeShapePoint,
  deleteClosedFreeShapeSegment,
  deleteFreeShapePoint,
  setFreeShapeSegmentType,
} from "../free-shape-point-operations";
import type { ResolvedShapeGroupLeaf } from "../resolved-shape-group";
import type {
  ResolvedShapeForestForRender,
  ResolvedShapeRenderLeaf,
} from "../resolved-shape-render-source";
import { getShapeLineLocalEndpoints, moveStandardShapeEndpoint } from "../shape-endpoint-layout";
import { moveStandardShapeAdjustment, standardShapeFlipPoint } from "../shape-geometry";
import { moveSelectedShapeRoots } from "../shape-root-selection-planning";
import { nudgeDrawingShapeTextWarpAdjustment } from "../shape-text-warp-adjustment";

type KeyboardAndPointsFragment = {
  drawing: SheetDrawing;
};

type DrawingKeyboardAndPointsOptions<TFragment extends KeyboardAndPointsFragment> = {
  getDrawings: () => readonly SourceSheetDrawing[];
  hasApplyCollection: () => boolean;
  metrics: ComputedRef<PictureSheetMetrics | undefined>;
  renderPass: ComputedRef<ResolvedShapeForestForRender | undefined>;
  legacyDrawings: ComputedRef<readonly SheetDrawing[]>;
  fragments: ComputedRef<readonly TFragment[]>;
  selectionKey: ComputedRef<string>;
  selectedRoots: Ref<string[]>;
  selectedOwnedId: Ref<string | null>;
  pointEditingId: Ref<string | null>;
  activeVertex: Ref<number>;
  pointRejected: Ref<boolean>;
  selectionFailure: Ref<boolean>;
  connectorFailure: Ref<boolean>;
  isStandard: (drawing: SheetDrawing) => drawing is SheetGraphicDrawing;
  isSelectedView: (drawing: SheetDrawing) => boolean;
  canChange: (drawing: SheetDrawing) => boolean;
  selectRoots: (ids: string[], owned?: string | null, explicit?: boolean) => void;
  sourceOwner: (drawing: SheetDrawing) => SourceSheetDrawing | undefined;
  resolvedOwner: (drawing: SheetDrawing) => { groupLeaf?: ResolvedShapeGroupLeaf } | undefined;
  projectionById: (
    drawing: SheetDrawing,
  ) => { groupLeaf?: ResolvedShapeGroupLeaf; renderLeaf?: ResolvedShapeRenderLeaf } | undefined;
  viewLayout: (drawing: SheetDrawing) => SheetViewportLayout;
  pointEditOptions: (drawing: SheetDrawing) => ShapePointEditOptions | undefined;
  drawingGeometry: (
    drawing: SheetGraphicDrawing,
  ) => { handles: readonly { position: { x: number; y: number } }[] } | undefined;
  connectorEditSource: (drawing: SheetDrawing) => ShapeConnectorEditSource | undefined;
  connectorRoute: (drawing: SheetDrawing) => ReadyShapeConnectorRoute | undefined;
  commitConnectorPlan: (
    pass: ResolvedShapeForestForRender,
    drawing: SheetDrawing,
    next: readonly SourceSheetDrawing[],
    key: string,
  ) => void;
  commitUpdate: (next: SheetDrawing, owner: SheetDrawing) => boolean;
  moveView: (drawing: SheetDrawing, delta: { x: number; y: number }) => SheetDrawing | undefined;
  rotateRootSelection: (degrees: number) => readonly SourceSheetDrawing[] | undefined;
  runSelectionPlan: (plan: () => readonly SourceSheetDrawing[] | undefined) => boolean;
  deleteSelected: () => void;
  formatConnector: (drawing: SheetDrawing) => boolean;
  beginCanvasText: (drawing: SheetDrawing, selection: "all" | "end", text?: string) => boolean;
  shapeContext: (fragment: TFragment, event: MouseEvent | KeyboardEvent) => void;
  startGesture: (
    fragment: TFragment,
    event: PointerEvent,
    resize?: FloatingImageResizeDirection,
    mode?: "move" | "resize" | "rotate" | "adjust" | "text-warp-adjust" | "endpoint" | "point",
    index?: number,
    point?: FreeShapePointDescriptor,
  ) => void;
  onEdit: (drawing: SourceSheetDrawing) => void;
  onEditOwned: (root: ShapeGroupDrawing, path: ShapeGroupPath) => void;
  onDelete: (id: string) => void;
};

/** Owns keyboard nudging, vertex/point editing actions, and selection handle callbacks for SheetDrawingLayer. */
export function useDrawingKeyboardAndPoints<TFragment extends KeyboardAndPointsFragment>(
  options: DrawingKeyboardAndPointsOptions<TFragment>,
) {
  function nudgeFreePoint(
    drawing: SheetGraphicDrawing,
    point: FreeShapePointDescriptor,
    delta: { x: number; y: number },
  ): void {
    if (
      options.pointEditingId.value !== drawing.id ||
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
    )
      return;
    const position = listFreeShapePoints(drawing).find(
      (p) => p.commandIndex === point.commandIndex && p.role === point.role,
    )?.position;
    const rect = getFloatingImageSheetRect(drawing, options.viewLayout(drawing));
    if (!position || !rect) return;
    const origin = pictureFrameLocalToWorld(
      rect,
      drawing.rotation,
      standardShapeFlipPoint(drawing, position),
    );
    const next = moveFreeShapePoint(
      drawing,
      point,
      { x: origin.x + delta.x, y: origin.y + delta.y },
      options.viewLayout(drawing),
      options.pointEditOptions(drawing),
    );
    if (next) options.commitUpdate(next, drawing);
  }

  const pointHandlers = new WeakMap<
    SheetGraphicDrawing,
    { key: string; handler: (action: PointAction, index: number) => boolean }
  >();

  function pointHandler(drawing: SheetGraphicDrawing) {
    const key = options.selectionKey.value;
    let entry = pointHandlers.get(drawing);
    if (!entry || entry.key !== key) {
      entry = {
        key,
        handler: (action, index) =>
          key === options.selectionKey.value &&
          options.isSelectedView(drawing) &&
          pointAction(drawing, action, index),
      };
      pointHandlers.set(drawing, entry);
    }
    return entry.handler;
  }

  function selectFreeVertex(drawing: SheetGraphicDrawing, index: number): void {
    if (
      !options.canChange(drawing) ||
      options.pointEditingId.value !== drawing.id ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing ||
      !listFreeShapePoints(drawing).some((p) => p.role === "vertex" && p.commandIndex === index)
    )
      return;
    options.activeVertex.value = index;
  }

  function pointAction(drawing: SheetGraphicDrawing, action: PointAction, index: number): boolean {
    if (
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing ||
      options.pointEditingId.value !== drawing.id
    )
      return false;
    if (action === "exit") {
      options.pointEditingId.value = null;
      options.pointRejected.value = false;
      return true;
    }
    const vertices = listFreeShapePoints(drawing).filter((p) => p.role === "vertex");
    const at = vertices.findIndex((p) => p.commandIndex === index);
    const segmentAction =
      action === "delete-segment" ||
      action === "add-segment" ||
      action === "straight-segment" ||
      action === "curved-segment";
    if (at < 0 && !segmentAction) return false;
    let next: SheetGraphicDrawing | undefined;
    if (action === "straight-segment" || action === "curved-segment")
      next = setFreeShapeSegmentType(
        drawing,
        index,
        action === "straight-segment" ? "straight" : "curved",
        options.viewLayout(drawing),
        options.pointEditOptions(drawing),
      );
    else if (action === "delete-segment") next = deleteClosedFreeShapeSegment(drawing, index);
    else if (action === "add-segment")
      next = addFreeShapePoint(
        drawing,
        index,
        options.viewLayout(drawing),
        0.5,
        options.pointEditOptions(drawing),
      );
    else if (action === "add") {
      const segment = drawing.shapePath!.commands[index + 1] ? index + 1 : undefined;
      if (segment !== undefined)
        next = addFreeShapePoint(
          drawing,
          segment,
          options.viewLayout(drawing),
          0.5,
          options.pointEditOptions(drawing),
        );
    } else if (action === "delete")
      next = deleteFreeShapePoint(
        drawing,
        index,
        options.viewLayout(drawing),
        options.pointEditOptions(drawing),
      );
    else if (action === "close" || action === "open")
      next = toggleClosedFreeShape(
        drawing,
        action === "close",
        options.viewLayout(drawing),
        index,
        options.pointEditOptions(drawing),
      );
    else
      next = setFreeShapePointType(
        drawing,
        index,
        action,
        options.viewLayout(drawing),
        options.pointEditOptions(drawing),
      );
    if (!next || !options.drawingGeometry(next)) return false;
    const nextVertices = listFreeShapePoints(next).filter((p) => p.role === "vertex");
    const nextIndex =
      action === "delete-segment"
        ? 0
        : segmentAction
          ? Math.max(
              0,
              nextVertices.findIndex((point) => point.commandIndex === index),
            )
          : action === "open"
            ? 0
            : action === "add"
              ? at + 1
              : action === "delete"
                ? Math.min(at, nextVertices.length - 1)
                : at;
    if (!options.commitUpdate(next, drawing)) return false;
    options.activeVertex.value = nextVertices[nextIndex]?.commandIndex ?? 0;
    return true;
  }

  function nudgeAdjustment(
    drawing: SheetGraphicDrawing,
    index: number,
    delta: { x: number; y: number },
  ): void {
    if (
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
    )
      return;
    const shape = options.drawingGeometry(drawing);
    const position = shape?.handles[index]?.position;
    const source = options.connectorEditSource(drawing);
    const pass = options.renderPass.value;
    const route = options.connectorRoute(drawing);
    if (source && pass && route && position) {
      try {
        const target = shapeFrameLocalToWorld(route.paintLayout.rect, route.paintLayout.angleDeg, {
          x: position.x + delta.x,
          y: position.y + delta.y,
        });
        const next = planShapeConnectorRouteAdjustment(
          pass.sourceForest,
          source,
          index,
          target,
          pass.metrics,
        );
        options.commitConnectorPlan(pass, drawing, next, options.selectionKey.value);
      } catch {
        options.selectionFailure.value = true;
      }
      return;
    }
    if (!position || !drawing.shapeGeometry) return;
    const geometry = moveStandardShapeAdjustment(
      drawing.shapeGeometry,
      drawing.width,
      drawing.height,
      index,
      {
        x: position.x + (drawing.shapeFlipX ? -delta.x : delta.x),
        y: position.y + (drawing.shapeFlipY ? -delta.y : delta.y),
      },
    );
    if (geometry) options.commitUpdate({ ...drawing, shapeGeometry: geometry }, drawing);
  }

  function nudgeWarpAdjustment(
    drawing: SheetGraphicDrawing,
    index: number,
    delta: { x: number; y: number },
  ): void {
    if (
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
    )
      return;
    const angle = (drawing.rotation * Math.PI) / 180;
    const localDelta = {
      x: Math.cos(angle) * delta.x + Math.sin(angle) * delta.y,
      y: -Math.sin(angle) * delta.x + Math.cos(angle) * delta.y,
    };
    const next = nudgeDrawingShapeTextWarpAdjustment(drawing, index, localDelta);
    if (next) options.commitUpdate(next, drawing);
  }

  function nudgeEndpoint(
    drawing: SheetGraphicDrawing,
    index: 0 | 1,
    delta: { x: number; y: number },
  ): void {
    if (
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
    )
      return;
    const source = options.connectorEditSource(drawing);
    const pass = options.renderPass.value;
    if (source && pass) {
      if (!options.hasApplyCollection()) {
        options.connectorFailure.value = true;
        return;
      }
      const connector = pass.getLeaf(drawing.id)!.connector!;
      if (connector.status !== "ready") return;
      const tip = index === 0 ? connector.route.begin : connector.route.end;
      try {
        const next = planShapeConnectorEndpointChange(
          pass.sourceForest,
          source,
          index === 0 ? "begin" : "end",
          { kind: "free", position: { x: tip.x + delta.x, y: tip.y + delta.y } },
          pass.metrics,
        );
        options.commitConnectorPlan(pass, drawing, next, options.selectionKey.value);
      } catch {
        options.selectionFailure.value = true;
      }
      return;
    }
    const position = getShapeLineLocalEndpoints(drawing)?.[index];
    const rect = getFloatingImageSheetRect(drawing, options.viewLayout(drawing));
    if (!position || !rect) return;
    const origin = pictureFrameLocalToWorld(
      rect,
      drawing.rotation,
      standardShapeFlipPoint(drawing, position),
    );
    const next = moveStandardShapeEndpoint(
      drawing,
      index,
      { x: origin.x + delta.x, y: origin.y + delta.y },
      options.viewLayout(drawing),
      false,
      options.pointEditOptions(drawing),
    );
    if (next) options.commitUpdate(next, drawing);
  }

  function nudgeRotation(drawing: SheetGraphicDrawing, degrees: number): void {
    if (
      !options.canChange(drawing) ||
      options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
    )
      return;
    const rotation = ((((drawing.rotation + degrees + 180) % 360) + 360) % 360) - 180;
    if (
      options.selectedRoots.value.length > 1 ||
      (options.resolvedOwner(drawing)?.groupLeaf && !options.selectedOwnedId.value)
    )
      options.runSelectionPlan(() => options.rotateRootSelection(degrees));
    else options.commitUpdate({ ...drawing, rotation }, drawing);
  }

  function keydown(drawing: SheetDrawing, event: KeyboardEvent): void {
    if (options.legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing) return;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const keyboardOwner = options.sourceOwner(drawing);
    if (keyboardOwner && !options.selectedRoots.value.includes(keyboardOwner.id))
      options.selectRoots(
        [keyboardOwner.id],
        options.resolvedOwner(drawing)?.groupLeaf ? drawing.id : null,
      );
    else if (
      options.resolvedOwner(drawing)?.groupLeaf &&
      options.selectedRoots.value.length === 1 &&
      options.selectedOwnedId.value &&
      options.selectedOwnedId.value !== drawing.id
    )
      options.selectedOwnedId.value = drawing.id;
    if (event.key === "Escape") {
      if (options.pointEditingId.value === drawing.id) {
        options.pointEditingId.value = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (options.selectedOwnedId.value) options.selectedOwnedId.value = null;
      else options.selectRoots([]);
      event.stopPropagation();
      return;
    }
    if (drawing.kind === "attachment" && (event.key === "Enter" || event.key === "F2")) {
      event.preventDefault();
      event.stopPropagation();
      const source = options.sourceOwner(drawing);
      if (source) options.onEdit(source);
      return;
    }
    if (!options.canChange(drawing)) return;
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      const fragment = options.fragments.value.find((f) => f.drawing === drawing);
      if (fragment) options.shapeContext(fragment, event);
      return;
    }
    if (event.key === "Process" || event.keyCode === 229 || Array.from(event.key).length === 1) {
      if (
        options.beginCanvasText(
          drawing,
          "end",
          event.key === "Process" || event.keyCode === 229 ? undefined : event.key,
        )
      ) {
        if (event.key !== "Process" && event.keyCode !== 229) event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      if (
        options.metrics.value &&
        options.hasApplyCollection() &&
        (options.selectedRoots.value.length > 1 || options.resolvedOwner(drawing)?.groupLeaf)
      )
        options.deleteSelected();
      else options.onDelete(drawing.id);
      return;
    }
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      if (options.projectionById(drawing)?.renderLeaf?.connector) {
        options.formatConnector(drawing);
        return;
      }
      if (options.beginCanvasText(drawing, "all")) return;
      const source = options.sourceOwner(drawing);
      const owned = options.resolvedOwner(drawing)?.groupLeaf;
      if (owned && options.selectedOwnedId.value === drawing.id)
        options.onEditOwned(owned.sourceRoot, owned.path);
      else if (source && source.kind !== "shapeGroup") options.onEdit(source);
      return;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 10 : 1;
      const delta = {
        x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
        y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      };
      const source = options.connectorEditSource(drawing);
      const pass = options.renderPass.value;
      if (
        source &&
        pass &&
        options.selectedRoots.value.length === 1 &&
        (!options.projectionById(drawing)?.groupLeaf ||
          options.selectedOwnedId.value === drawing.id)
      ) {
        if (!options.hasApplyCollection()) {
          options.connectorFailure.value = true;
          return;
        }
        try {
          const next = planShapeConnectorBodyTranslation(
            pass.sourceForest,
            source,
            delta,
            pass.metrics,
          );
          options.commitConnectorPlan(pass, drawing, next, options.selectionKey.value);
        } catch {
          options.selectionFailure.value = true;
        }
        return;
      }
      if (
        options.metrics.value &&
        options.hasApplyCollection() &&
        (options.selectedRoots.value.length > 1 ||
          (options.resolvedOwner(drawing)?.groupLeaf && !options.selectedOwnedId.value))
      ) {
        if (
          options.selectedRoots.value.some((id) => options.renderPass.value?.getLeaf(id)?.connector)
        ) {
          options.connectorFailure.value = true;
          return;
        }
        options.runSelectionPlan(() =>
          moveSelectedShapeRoots(
            options.getDrawings(),
            options.selectedRoots.value,
            delta,
            options.metrics.value!,
          ),
        );
        return;
      }
      const moved = options.moveView(drawing, delta);
      if (moved) options.commitUpdate(moved, drawing);
    }
  }

  function freeSelectionHandlers(fragment: TFragment) {
    const key = options.selectionKey.value;
    const drawing = fragment.drawing;
    const valid = () =>
      key === options.selectionKey.value &&
      options.isSelectedView(drawing) &&
      options.pointEditingId.value === drawing.id &&
      options.legacyDrawings.value.includes(drawing) &&
      options.isStandard(drawing);
    return {
      selectVertex: (index: number) => {
        if (valid() && options.isStandard(drawing)) selectFreeVertex(drawing, index);
      },
      move: (point: FreeShapePointDescriptor, event: PointerEvent) => {
        if (valid()) options.startGesture(fragment, event, undefined, "point", undefined, point);
      },
      nudge: (point: FreeShapePointDescriptor, delta: { x: number; y: number }) => {
        if (valid() && options.isStandard(drawing)) nudgeFreePoint(drawing, point, delta);
      },
    };
  }

  function standardSelectionHandlers(fragment: TFragment) {
    const key = options.selectionKey.value;
    const drawing = fragment.drawing;
    const valid = () =>
      key === options.selectionKey.value &&
      options.isSelectedView(drawing) &&
      options.legacyDrawings.value.includes(drawing) &&
      options.isStandard(drawing);
    return {
      resize: (direction: FloatingImageResizeDirection, event: PointerEvent) => {
        if (valid()) options.startGesture(fragment, event, direction);
      },
      rotate: (event: PointerEvent) => {
        if (valid()) options.startGesture(fragment, event, undefined, "rotate");
      },
      endpoint: (index: 0 | 1, event: PointerEvent) => {
        if (valid()) options.startGesture(fragment, event, undefined, "endpoint", index);
      },
      nudgeEndpoint: (index: 0 | 1, delta: { x: number; y: number }) => {
        if (valid() && options.isStandard(drawing)) nudgeEndpoint(drawing, index, delta);
      },
      adjust: (index: number, event: PointerEvent) => {
        if (valid()) options.startGesture(fragment, event, undefined, "adjust", index);
      },
      nudgeAdjustment: (index: number, delta: { x: number; y: number }) => {
        if (valid() && options.isStandard(drawing)) nudgeAdjustment(drawing, index, delta);
      },
      warpAdjust: (index: number, event: PointerEvent) => {
        if (valid()) options.startGesture(fragment, event, undefined, "text-warp-adjust", index);
      },
      nudgeWarpAdjustment: (index: number, delta: { x: number; y: number }) => {
        if (valid() && options.isStandard(drawing)) nudgeWarpAdjustment(drawing, index, delta);
      },
      nudgeRotation: (degrees: number) => {
        if (valid() && options.isStandard(drawing)) nudgeRotation(drawing, degrees);
      },
    };
  }

  return {
    pointHandler,
    keydown,
    freeSelectionHandlers,
    standardSelectionHandlers,
  };
}
