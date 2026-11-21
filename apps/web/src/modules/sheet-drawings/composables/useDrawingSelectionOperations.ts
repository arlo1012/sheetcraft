import type { ComputedRef, Ref } from "vue";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  isShapeGroupDrawing,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import { planDeleteShapeGroupNodes } from "@sheetcraft/core/shape-group-delete";
import {
  groupShapeRoots,
  isShapeGroupEligibleRoot,
  ungroupShapeRoot,
} from "@sheetcraft/core/shape-group-planning";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import {
  normalizeSheetDrawing,
  type SheetDrawing as SourceSheetDrawing,
  type SheetLegacyDrawing as SheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import type { Sheet } from "@sheetcraft/core/workbook";
import type {
  FloatingImageResizeDirection,
  FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { ResolvedShapeGroupLeaf } from "../resolved-shape-group";
import {
  resolveShapeForestForRender,
  type ResolvedShapeForestForRender,
} from "../resolved-shape-render-source";
import {
  ungroupOwnedShapeContainer,
  updateOwnedShapeContainer,
} from "../shape-group-container-editing";
import type { ShapeGroupFrameFragment } from "../shape-group-fragments";
import { shapePagePointFromViewport } from "../shape-page-layout";
import {
  alignSelectedShapeRoots,
  equalizeSelectedShapeRoots,
  moveSelectedShapeRoots,
  resizeSelectedShapeRoots,
  type EqualShapeDimensionsAction,
} from "../shape-root-selection-planning";
import type { ShapeAlignment, ShapeAlignmentReference } from "../shape-selection-actions";
import { standardShapeResizeRect } from "../standard-shape-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";

type SelectionResolvedDrawing = {
  source: SourceSheetDrawing;
  view: SheetDrawing;
  rect?: { x: number; y: number; width: number; height: number };
  groupLeaf?: ResolvedShapeGroupLeaf;
};

type GroupProjectionSummary = {
  layout?: { rect: { x: number; y: number; width: number; height: number }; angleDeg: number };
  owners: readonly { sourceNode: { id: string }; path: ShapeGroupPath }[];
};

type GroupContainerSummary = {
  sourceNode: { shapeProperties?: Parameters<typeof getShapeObjectProperties>[0] };
  layout?: {
    rect: { x: number; y: number; width: number; height: number };
    angleDeg: number;
  } | null;
};

export type DrawingSelectionOperationsOptions = {
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
  resolvedDrawings: ComputedRef<readonly SelectionResolvedDrawing[]>;
  legacyDrawings: ComputedRef<readonly SheetDrawing[]>;
  selectedRoots: Ref<string[]>;
  selectedOwnedId: Ref<string | null>;
  selectionKey: ComputedRef<string>;
  selectionDisabled: ComputedRef<boolean>;
  selectionFailure: Ref<boolean>;
  connectorFailure: Ref<boolean>;
  alignmentReference: Ref<ShapeAlignmentReference>;
  rootsPreview: Ref<readonly SourceSheetDrawing[] | undefined>;
  pointEditingId: Ref<string | null>;
  layerElement: Ref<HTMLElement | undefined>;
  createId: (prefix: string) => string;
  groupNameLabel: () => string;
  selectRoots: (ids: string[], owned?: string | null, explicit?: boolean) => void;
  setRootsPreview: (next: readonly SourceSheetDrawing[] | undefined) => void;
  groupProjection: (
    root: ShapeGroupDrawing,
    metrics: PictureSheetMetrics,
  ) => GroupProjectionSummary;
  groupContainer: (
    root: ShapeGroupDrawing,
    path: ShapeGroupPath,
    metrics: PictureSheetMetrics,
  ) => GroupContainerSummary;
  viewportPoint: (event: { clientX: number; clientY: number }) => { x: number; y: number };
  finishCanvasText: () => boolean;
  formatConnector: (drawing: SheetDrawing) => boolean;
  setPointerSession: (session: PointerSession | undefined) => void;
  cancelPointerSession: () => void;
  onFormatGroup: (source: ShapeGroupDrawing, path: ShapeGroupPath) => void;
  onSelect: () => void;
};

/** Owns multi-root alignment, distribution, equalize, group/ungroup, delete, rotate, root/group drag gestures, and keyboard nudging. */
export function useDrawingSelectionOperations(options: DrawingSelectionOperationsOptions) {
  const {
    metrics,
    renderPass,
    resolvedDrawings,
    legacyDrawings,
    selectedRoots,
    selectedOwnedId,
    selectionKey,
    selectionDisabled,
    selectionFailure,
    connectorFailure,
    alignmentReference,
    rootsPreview,
    pointEditingId,
    layerElement,
  } = options;

  function runSelectionPlan(
    plan: () => readonly SourceSheetDrawing[],
    key = selectionKey.value,
  ): boolean {
    const m = metrics.value;
    const applyCollection = options.getApplyCollection();
    if (key !== selectionKey.value || selectionDisabled.value || !m || !applyCollection)
      return false;
    const drawings = options.getDrawings();
    const expected = [...drawings];
    const pass = renderPass.value;
    const current = () => {
      try {
        pass?.assertCurrent(options.getDrawings(), m, options.getRevision() ?? 0);
        return true;
      } catch {
        return false;
      }
    };
    try {
      if (!current()) return false;
      const next = plan();
      if (pass)
        resolveShapeForestForRender({ drawings: next, metrics: m, revision: pass.revision });
      const liveDrawings = options.getDrawings();
      if (
        key !== selectionKey.value ||
        metrics.value !== m ||
        liveDrawings.length !== expected.length ||
        liveDrawings.some((d, i) => d !== expected[i]) ||
        !current()
      )
        return false;
      const accepted =
        applyCollection(next, expected, m, () => {
          const latest = options.getDrawings();
          return (
            key === selectionKey.value &&
            metrics.value === m &&
            !selectionDisabled.value &&
            current() &&
            latest.length === expected.length &&
            latest.every((d, i) => d === expected[i])
          );
        }) === true;
      selectionFailure.value = !accepted;
      return accepted;
    } catch {
      selectionFailure.value = true;
      return false;
    }
  }

  function alignSelected(
    action: ShapeAlignment,
    reference: ShapeAlignmentReference,
    key: string,
  ): void {
    if (selectedRoots.value.some((id) => renderPass.value?.getLeaf(id)?.connector)) {
      connectorFailure.value = true;
      return;
    }
    if (metrics.value)
      runSelectionPlan(
        () =>
          alignSelectedShapeRoots(
            options.getDrawings(),
            selectedRoots.value,
            action,
            metrics.value!,
            reference,
          ),
        key,
      );
  }

  function equalizeSelected(action: EqualShapeDimensionsAction, key: string): void {
    if (selectedRoots.value.some((id) => renderPass.value?.getLeaf(id)?.connector)) {
      connectorFailure.value = true;
      return;
    }
    if (metrics.value)
      runSelectionPlan(
        () =>
          equalizeSelectedShapeRoots(
            options.getDrawings(),
            selectedRoots.value,
            action,
            metrics.value!,
            alignmentReference.value,
          ),
        key,
      );
  }

  function selectedContainerPath(source: ShapeGroupDrawing): ShapeGroupPath {
    const own =
      selectedOwnedId.value &&
      metrics.value &&
      options
        .groupProjection(source, metrics.value)
        .owners.find((o) => o.sourceNode.id === selectedOwnedId.value);
    return own ? own.path : [source.id];
  }

  function formatGroup(source: ShapeGroupDrawing, path: ShapeGroupPath): void {
    if (options.getDrawings().find((d) => d.id === source.id) !== source || selectionDisabled.value)
      return;
    const selectedLeaf = renderPass.value?.getLeaf(path.at(-1)!);
    if (
      selectedLeaf?.connector &&
      selectedLeaf.sourceRoot === source &&
      JSON.stringify(selectedLeaf.path) === JSON.stringify(path)
    ) {
      const view = legacyDrawings.value.find(
        (drawing) => drawing.id === selectedLeaf.sourceNode.id,
      );
      if (view) options.formatConnector(view);
      return;
    }
    if (
      renderPass.value?.leaves.some(
        (leaf) =>
          leaf.sourceRoot === source &&
          leaf.connector &&
          path.every((id, index) => leaf.path[index] === id),
      )
    ) {
      connectorFailure.value = true;
      return;
    }
    options.selectRoots([source.id], path.length > 1 ? path.at(-1)! : null);
    options.onFormatGroup(source, path);
  }

  function groupSelected(key: string): void {
    if (key !== selectionKey.value || !metrics.value) return;
    const id = options.createId("shape-group");
    if (
      runSelectionPlan(
        () =>
          groupShapeRoots(
            options.getDrawings(),
            selectedRoots.value,
            { id, name: options.groupNameLabel() },
            metrics.value!,
          ),
        key,
      )
    )
      options.selectRoots([id]);
  }

  function ungroupSelected(source: ShapeGroupDrawing, path: ShapeGroupPath = [source.id]): void {
    const m = metrics.value;
    const drawings = options.getDrawings();
    if (
      !m ||
      drawings.find((d) => d.id === source.id) !== source ||
      !selectedRoots.value.includes(source.id)
    )
      return;
    if (path.length > 1) {
      if (
        runSelectionPlan(() =>
          options
            .getDrawings()
            .map((d) => (d === source ? ungroupOwnedShapeContainer(source, path, m) : d)),
        )
      )
        options.selectRoots([source.id], path.length > 2 ? path.at(-2)! : null);
    } else if (runSelectionPlan(() => ungroupShapeRoot(options.getDrawings(), source.id, m)))
      options.selectRoots(source.members.map((d) => d.id));
  }

  function deleteSelected(): void {
    const m = metrics.value;
    if (!m) return;
    const own =
      selectedOwnedId.value &&
      resolvedDrawings.value.find((d) => d.view.id === selectedOwnedId.value)?.groupLeaf;
    const selectedRoot = options.getDrawings().find((d) => d.id === selectedRoots.value[0]);
    const container =
      selectedRoot && isShapeGroupDrawing(selectedRoot)
        ? selectedContainerPath(selectedRoot)
        : undefined;
    const paths: ShapeGroupPath[] = own
      ? [own.path]
      : container && container.length > 1
        ? [container]
        : selectedRoots.value.map((id) => [id]);
    if (runSelectionPlan(() => planDeleteShapeGroupNodes(options.getDrawings(), paths, m))) {
      if (own && options.getDrawings().some((d) => d.id === own.sourceRoot.id))
        options.selectRoots([own.sourceRoot.id]);
      else options.selectRoots([]);
    }
  }

  function rotateRootSelection(degrees: number): readonly SourceSheetDrawing[] {
    const ids = new Set(selectedRoots.value);
    const drawings = options.getDrawings();
    if (drawings.some((root) => ids.has(root.id) && root.kind === "shape" && root.shapeConnector)) {
      connectorFailure.value = true;
      throw new TypeError("Connector rotation requires an endpoint edit.");
    }
    return drawings.map((root) =>
      ids.has(root.id)
        ? normalizeSheetDrawing({
            ...root,
            rotation: ((((root.rotation + degrees + 180) % 360) + 360) % 360) - 180,
          })
        : root,
    );
  }

  function startRootGesture(
    id: string,
    fragment: FloatingImageViewportFragment & { pageKey?: string },
    event: PointerEvent,
    direction?: FloatingImageResizeDirection,
    mode: "move" | "rotate" = "move",
    onClick?: () => void,
    ownedPath?: ShapeGroupPath,
  ): void {
    if (!options.finishCanvasText()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const m = metrics.value;
    const drawings = options.getDrawings();
    const root = drawings.find((d) => d.id === id);
    if (
      !m ||
      !root ||
      !isShapeGroupEligibleRoot(root) ||
      selectionDisabled.value ||
      event.button !== 0
    )
      return;
    if (
      drawings.some(
        (drawing) =>
          selectedRoots.value.includes(drawing.id) &&
          drawing.kind === "shape" &&
          drawing.shapeConnector,
      )
    ) {
      connectorFailure.value = true;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const expected = [...drawings],
      expectedData = JSON.stringify(drawings),
      key = selectionKey.value,
      selected = [...selectedRoots.value];
    const sheet = options.getSheet(),
      revision = options.getRevision(),
      viewport = options.getLayout(),
      projection = options.getPageProjection(),
      scale = options.getScale();
    const pass = renderPass.value;
    const current = () => {
      try {
        pass?.assertCurrent(options.getDrawings(), m, options.getRevision() ?? 0);
        return true;
      } catch {
        return false;
      }
    };
    const valid = () => {
      const latest = options.getDrawings();
      return (
        key === selectionKey.value &&
        !selectionDisabled.value &&
        metrics.value === m &&
        options.getSheet() === sheet &&
        options.getRevision() === revision &&
        options.getLayout() === viewport &&
        options.getPageProjection() === projection &&
        options.getScale() === scale &&
        current() &&
        latest.length === expected.length &&
        latest.every((d, i) => d === expected[i]) &&
        JSON.stringify(latest) === expectedData
      );
    };
    const translation = getPicturePaneTranslation(fragment.paneId, viewport);
    const sample = (point: MouseEvent) =>
      projection
        ? shapePagePointFromViewport(options.viewportPoint(point), viewport, projection, m)?.point
        : {
            x: options.viewportPoint(point).x - translation.x,
            y: options.viewportPoint(point).y - translation.y,
          };
    const origin = sample(event);
    if (!origin) return;
    const worldRect = {
      ...fragment.rect,
      x: fragment.rect.x - translation.x,
      y: fragment.rect.y - translation.y,
    };
    const groupLayout = isShapeGroupDrawing(root)
      ? ownedPath
        ? options.groupContainer(root, ownedPath, m).layout
        : options.groupProjection(root, m).layout
      : undefined;
    const centerRect =
      groupLayout?.rect ?? resolvedDrawings.value.find((d) => d.source === root)?.rect ?? worldRect;
    const center = {
      x: centerRect.x + centerRect.width / 2,
      y: centerRect.y + centerRect.height / 2,
    };
    const initialAngle = Math.atan2(origin.y - center.y, origin.x - center.x);
    let rejected = false;
    let moved = false;
    const updateRoots = (point: MouseEvent) => {
      if (!valid()) {
        options.cancelPointerSession();
        return;
      }
      const nextPoint = sample(point);
      if (!nextPoint) {
        rootsPreview.value = undefined;
        return;
      }
      const delta = { x: nextPoint.x - origin.x, y: nextPoint.y - origin.y };
      moved = delta.x !== 0 || delta.y !== 0;
      try {
        if (ownedPath && isShapeGroupDrawing(root) && groupLayout) {
          let angle = groupLayout.angleDeg;
          let rect = { ...groupLayout.rect };
          if (mode === "rotate") {
            angle +=
              ((Math.atan2(nextPoint.y - center.y, nextPoint.x - center.x) - initialAngle) * 180) /
              Math.PI;
            if (point.shiftKey) angle = Math.round(angle / 15) * 15;
          } else if (direction) {
            const node = options.groupContainer(root, ownedPath, m).sourceNode;
            const resized = standardShapeResizeRect(
              rect,
              angle,
              direction,
              delta,
              getShapeObjectProperties(node.shapeProperties).lockAspectRatio || point.shiftKey,
              1,
              true,
            );
            if (!resized) throw new RangeError("Nested group resize has no valid placement.");
            rect = resized;
          } else {
            rect.x += delta.x;
            rect.y += delta.y;
          }
          const next = updateOwnedShapeContainer(root, ownedPath, { rect, angleDeg: angle }, m);
          options.setRootsPreview(expected.map((d) => (d === root ? next : d)));
        } else if (mode === "rotate") {
          let degrees =
            ((Math.atan2(nextPoint.y - center.y, nextPoint.x - center.x) - initialAngle) * 180) /
            Math.PI;
          if (point.shiftKey)
            degrees = Math.round((root.rotation + degrees) / 15) * 15 - root.rotation;
          const ids = new Set(selected);
          options.setRootsPreview(
            expected.map((d) =>
              ids.has(d.id)
                ? normalizeSheetDrawing({
                    ...d,
                    rotation: ((((d.rotation + degrees + 180) % 360) + 360) % 360) - 180,
                  })
                : d,
            ),
          );
        } else
          options.setRootsPreview(
            direction
              ? resizeSelectedShapeRoots(
                  expected,
                  selected,
                  id,
                  direction,
                  delta,
                  m,
                  point.shiftKey,
                )
              : moveSelectedShapeRoots(expected, selected, delta, m),
          );
        rejected = false;
      } catch {
        rootsPreview.value = undefined;
        rejected = true;
      }
    };
    options.setPointerSession(
      startPointerSession({
        event,
        captureTarget: layerElement.value,
        onMove: updateRoots,
        onEnd: (point) => {
          updateRoots(point);
          const next = rootsPreview.value;
          rootsPreview.value = undefined;
          if (valid() && next) {
            const accepted = runSelectionPlan(() => next, key);
            if (accepted && !moved && !direction && mode === "move") onClick?.();
          } else if (valid() && rejected) selectionFailure.value = true;
        },
        onCancel: () => {
          rootsPreview.value = undefined;
        },
      }),
    );
  }

  function startGroupFrame(
    source: ShapeGroupDrawing,
    fragment: ShapeGroupFrameFragment,
    event: PointerEvent,
    direction?: FloatingImageResizeDirection,
    mode: "move" | "rotate" = "move",
    path: ShapeGroupPath = [source.id],
  ): void {
    if (!options.finishCanvasText()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (options.getDrawings().find((d) => d.id === source.id) !== source) return;
    const nestedId = path.length > 1 ? path.at(-1)! : null;
    if (nestedId !== null) {
      if (
        selectedRoots.value.length !== 1 ||
        selectedRoots.value[0] !== source.id ||
        selectedOwnedId.value !== nestedId
      )
        options.selectRoots([source.id], nestedId);
    } else if (!selectedRoots.value.includes(source.id) || selectedOwnedId.value !== null)
      options.selectRoots([source.id]);
    pointEditingId.value = null;
    options.onSelect();
    startRootGesture(
      source.id,
      fragment,
      event,
      direction,
      mode,
      undefined,
      path.length > 1 ? path : undefined,
    );
  }

  function groupKeydown(
    source: ShapeGroupDrawing,
    event: KeyboardEvent,
    path: ShapeGroupPath = [source.id],
  ): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      options.getDrawings().find((d) => d.id === source.id) !== source
    )
      return;
    if (
      !selectedRoots.value.includes(source.id) ||
      selectedOwnedId.value !== (path.length > 1 ? path.at(-1)! : null)
    )
      options.selectRoots([source.id], path.length > 1 ? path.at(-1)! : null);
    if (event.key === "F2" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      formatGroup(source, path);
      return;
    }
    if (event.key === "Escape") {
      if (path.length > 1) options.selectRoots([source.id], path.length > 2 ? path.at(-2)! : null);
      else options.selectRoots([]);
      event.stopPropagation();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      deleteSelected();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }[event.key];
    if (delta && metrics.value) {
      event.preventDefault();
      event.stopPropagation();
      if (path.length > 1)
        runSelectionPlan(() => {
          const layout = options.groupContainer(source, path, metrics.value!).layout;
          if (!layout) throw new RangeError("Nested group is collapsed.");
          const next = updateOwnedShapeContainer(
            source,
            path,
            {
              rect: { ...layout.rect, x: layout.rect.x + delta.x, y: layout.rect.y + delta.y },
              angleDeg: layout.angleDeg,
            },
            metrics.value!,
          );
          return options.getDrawings().map((d) => (d === source ? next : d));
        });
      else
        runSelectionPlan(() =>
          moveSelectedShapeRoots(options.getDrawings(), selectedRoots.value, delta, metrics.value!),
        );
    }
  }

  return {
    runSelectionPlan,
    alignSelected,
    equalizeSelected,
    selectedContainerPath,
    formatGroup,
    groupSelected,
    ungroupSelected,
    deleteSelected,
    rotateRootSelection,
    startRootGesture,
    startGroupFrame,
    groupKeydown,
  };
}
