<script setup lang="ts">
import EquationCanvasEditor from "../equation/EquationCanvasEditor.vue";
import type {
  EquationEditSnapshot,
  EquationEditCallbacks,
} from "../equation/useEquationEditSession";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
} from "@sheetcraft/core/shape-group";
import {
  groupShapeRoots,
  ungroupShapeRoot,
  isShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import { planDeleteShapeGroupNodes } from "@sheetcraft/core/shape-group-delete";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  planShapeConnectorBodyTranslation,
  planShapeConnectorEndpointChange,
  planShapeConnectorRouteAdjustment,
  type ShapeConnectorEditSource,
  type ShapeConnectorEndpointEdit,
} from "@sheetcraft/core/shape-connector-editing";
import type { ReadyShapeConnectorRoute } from "@sheetcraft/core/shape-connector-route";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import {
  resolveShapeForestForRender,
  type ResolvedShapeForestForRender,
  type ResolvedShapeRenderLeaf,
} from "../resolved-shape-render-source";
import {
  getShapeConnectorSiteCandidates,
  type ShapeConnectorSiteCandidate,
} from "../shape-connector-site-picking";
import {
  resolveShapeGroupProjection,
  updateResolvedShapeGroupLeaf,
  type ResolvedShapeGroupLeaf,
} from "../resolved-shape-group";
import {
  getShapeGroupFrameFragments,
  type ShapeGroupFrameFragment,
} from "../shape-group-fragments";
import {
  moveSelectedShapeRoots,
  resizeSelectedShapeRoots,
  alignSelectedShapeRoots,
  equalizeSelectedShapeRoots,
  type EqualShapeDimensionsAction,
} from "../shape-root-selection-planning";
import {
  updateOwnedShapeContainer,
  ungroupOwnedShapeContainer,
} from "../shape-group-container-editing";
import { resolveShapeGroupFormatContext } from "../shape-group-format-planning";
import { readShapeObjectControlPaths } from "../shape-object-control-planning";
import { getVisibleShapeNodeIds } from "../shape-visibility";
import type { ShapeAlignment, ShapeAlignmentReference } from "../shape-selection-actions";
import { createBrowserIdFactory } from "../../../shared/runtime/browser-id-factory";
import { useAppI18n } from "../../../shared/i18n";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import type { ShapeTextEditSnapshot, ShapeTextEditCallbacks } from "../useShapeTextEditSession";
import type { ShapeCanvasTextEditRequest } from "../shape-canvas-text-edit-contract";
import { shapeTextEditorPlacement } from "../shape-text-editor-placement";
import { getDrawingShapeTextRect } from "../shape-text-runtime";
import {
  moveDrawingShapeTextWarpAdjustment,
  nudgeDrawingShapeTextWarpAdjustment,
} from "../shape-text-warp-adjustment";
import ShapeCanvasTextEditor from "./ShapeCanvasTextEditor.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { createContextMenuPoint, useContextMenu } from "../../../shared/menu/useContextMenu";
import SheetShapeSelectionToolbar from "./SheetShapeSelectionToolbar.vue";
import ShapeGroupSelection from "./ShapeGroupSelection.vue";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import { isDrawingClipboardEligibleRoot } from "../drawing-clipboard-eligibility";
import { getShapeObjectProperties } from "@sheetcraft/core/shape-object-properties";
import { resolveShapeDrawing, updateResolvedShapeDrawing } from "../resolved-shape-drawing";
import { shapeViewLayout, shapeViewAtRect } from "../shape-view-layout";
import { cellTextFontRevision } from "../../../shared/cell-text/text-metrics";
import {
  isFramedShapeDrawing,
  hasShapeObjectFrame,
  type SheetLegacyDrawing as SheetDrawing,
  type SheetDrawing as SourceSheetDrawing,
  type SheetGraphicDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  getFloatingImageViewportFragments,
  getFloatingImageSheetRect,
  moveFloatingImageBy,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import {
  getShapePageFragments,
  projectShapePointToViewport,
  shapePagePointFromViewport,
} from "../shape-page-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import SheetObjectSelection from "../../../shared/sheet-objects/SheetObjectSelection.vue";
import FreeShapePointSelection from "./FreeShapePointSelection.vue";
import StandardShapeSelection from "./StandardShapeSelection.vue";
import {
  getDrawingShapeGeometry,
  moveStandardShapeAdjustment,
  standardShapeWorldToLocal,
  standardShapeFlipPoint,
} from "../shape-geometry";
import {
  getStandardShapeViewportFragments,
  resizeStandardShapeBy,
  standardShapeResizeRect,
} from "../standard-shape-layout";
import { getShapeLineLocalEndpoints, moveStandardShapeEndpoint } from "../shape-endpoint-layout";
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
  deleteFreeShapePoint,
  deleteClosedFreeShapeSegment,
  setFreeShapeSegmentType,
} from "../free-shape-point-operations";
import type { FreeShapePointAction as PointAction } from "../free-shape-edit-actions";
import DrawingContent from "./DrawingContent.vue";
import ShapeGroupDetailedContent from "./ShapeGroupDetailedContent.vue";
import {
  requiresShapeGroupPaint,
  hitShapeGroupPaint,
  type ShapeGroupPaintResult,
} from "../shape-group-paint";
import { shapeDrawingContainsWorldPoint } from "../shape-line-paint";
import {
  detailedShapeContainsWorldPoint,
  type ShapeDetailedPresentation,
} from "../shape-detailed-presentation";
import type { TextBoxReferenceResolver } from "../textbox-reference-display";
const props = defineProps<{
  drawings: readonly SourceSheetDrawing[];
  applyUpdate?: (drawing: SourceSheetDrawing, expected: SourceSheetDrawing) => boolean;
  applyCollection?: (
    drawings: readonly SourceSheetDrawing[],
    expected: readonly SourceSheetDrawing[],
    metrics?: PictureSheetMetrics,
    guard?: () => boolean,
  ) => boolean;
  metrics?: PictureSheetMetrics;
  pageProjection?: PageLayoutProjection;
  selectedDrawingId?: string | null;
  sheet?: Sheet;
  evaluator?: SheetEvaluator;
  revision?: number;
  theme?: WorkbookTheme;
  imageAssetUrls?: ReadonlyMap<string, string>;
  locale?: string;
  dateSystem?: "1900" | "1904";
  layout: SheetViewportLayout;
  scale: number;
  readOnly: boolean;
  copyObjects?: (paths: readonly ShapeGroupPath[]) => boolean;
  cutObjects?: (paths: readonly ShapeGroupPath[]) => boolean;
  pasteObjects?: () => boolean;
  canPasteObjects?: boolean;
  equationPlaceholdersHidden?: boolean;
  equationEditSnapshot?: EquationEditSnapshot;
  equationEditCallbacks?: EquationEditCallbacks;
  textEditSnapshot?: ShapeTextEditSnapshot | null;
  textEditCallbacks?: ShapeTextEditCallbacks;
  startTextEdit?: (request: ShapeCanvasTextEditRequest) => boolean;
  textEditSelection?: { start: number; end: number };
  textBoxReferenceResolver?: TextBoxReferenceResolver;
  openTextBoxReference?: (root: SourceSheetDrawing, path?: ShapeGroupPath) => boolean;
}>();
const emit = defineEmits<{
  update: [drawing: SourceSheetDrawing];
  delete: [id: string];
  edit: [drawing: SourceSheetDrawing];
  editOwned: [root: ShapeGroupDrawing, path: ShapeGroupPath];
  formatGroup: [root: ShapeGroupDrawing, path: ShapeGroupPath];
  groupSelectionChange: [rootId: string | null, path: ShapeGroupPath | null];
  select: [];
  selectionChange: [id: string | null];
  objectSelectionChange: [paths: readonly ShapeGroupPath[]];
  format: [drawing: SheetGraphicDrawing | SheetFramedGraphicDrawing];
  backgroundPointer: [event: PointerEvent];
  controlChange: [id: string, value: unknown];
  clipboardCopy: [];
}>();
const { t } = useAppI18n();
const createId = createBrowserIdFactory();
const selectedRoots = shallowRef<string[]>([]);
let selectionRevision = 0;
const selectedOwnedId = ref<string | null>(null);
const selectionFailure = ref(false);
const connectorFailure = ref(false);
const alignmentReference = ref<ShapeAlignmentReference>("selection");
const selectionEpoch = ref(0);
const rootsPreview = shallowRef<readonly SourceSheetDrawing[]>();
const rasterDensity = computed(() =>
  Math.max(
    1,
    Math.min(8, props.scale * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)),
  ),
);
const layerElement = ref<HTMLElement>();
const selectedId = ref<string | null>(null);
watch(selectedId, (id) => emit("selectionChange", id), { flush: "sync" });
const pointEditingId = ref<string | null>(null);
const activeVertex = ref(0);
const pointRejected = ref(false);
watch(
  () => props.selectedDrawingId,
  (id) => {
    if ((id ?? null) !== selectedId.value || !selectedRoots.value.length) {
      selectedRoots.value = id ? [id] : [];
      selectedOwnedId.value = null;
      selectedId.value = id ?? null;
    }
    if (pointEditingId.value && pointEditingId.value !== id) pointEditingId.value = null;
    if (id)
      void nextTick(() => {
        if (props.textEditSnapshot) return;
        const element = [
          ...(layerElement.value?.querySelectorAll<HTMLElement>("[data-sheet-drawing-id]") ?? []),
        ].find((item) => item.dataset.sheetDrawingId === id);
        element?.focus({ preventScroll: true });
      });
  },
  { immediate: true },
);
watch(
  () => [selectedId.value, selectedOwnedId.value],
  ([root, owned]) => {
    const id = owned ?? root;
    if (!id) return;
    void nextTick(() => {
      if (props.textEditSnapshot) return;
      if ((selectedOwnedId.value ?? selectedId.value) !== id) return;
      const target = [
        ...(layerElement.value?.querySelectorAll<HTMLElement>("[data-sheet-drawing-id]") ?? []),
      ].find((el) => el.dataset.sheetDrawingId === id);
      target?.focus({ preventScroll: true });
    });
  },
);
function isStandard(drawing: SheetDrawing): drawing is SheetGraphicDrawing {
  return (
    (drawing.kind === "shape" &&
      !!(drawing.shapeGeometry || drawing.shapePath || drawing.shapeStyle || drawing.shapeText)) ||
    (drawing.kind === "textBox" && !!drawing.shapeText) ||
    ((drawing.kind === "shape" || drawing.kind === "textBox") && hasContinuousView(drawing))
  );
}
const metrics = computed(() => {
  void props.revision;
  return props.metrics ?? (props.sheet ? createPictureSheetMetrics(props.sheet) : undefined);
});
// Resolve the complete relation forest before any group, pane or visibility filter.
// Static documents retain their existing resolution and admission budgets.
const renderState = computed(() => {
  const connected = props.drawings.some((root) =>
    isShapeGroupDrawing(root)
      ? traverseShapeGroup(root).some(
          ({ node }) => "shapeConnector" in node || "textReference" in node,
        )
      : "shapeConnector" in root || "textReference" in root,
  );
  if (!connected) return { pass: undefined, unavailable: false };
  try {
    if (!metrics.value) throw new TypeError("Connector placement requires worksheet metrics.");
    return {
      pass: resolveShapeForestForRender({
        drawings: props.drawings,
        metrics: metrics.value,
        revision: props.revision ?? 0,
        textBoxReferenceResolver: props.textBoxReferenceResolver,
      }),
      unavailable: false,
    };
  } catch {
    // Effective filter/outline/AutoFit metrics may differ from the persisted
    // worksheet metrics. Refuse this whole pass; never paint source carriers.
    return { pass: undefined, unavailable: true };
  }
});
const renderPass = computed(() => renderState.value.pass);
const renderUnavailable = computed(() => renderState.value.unavailable);

type DrawingProjection = {
  source: SourceSheetDrawing;
  view: SheetDrawing;
  metrics: PictureSheetMetrics | undefined;
  rect?: { x: number; y: number; width: number; height: number };
  collapsed: boolean;
  groupLeaf?: ResolvedShapeGroupLeaf;
  renderLeaf?: ResolvedShapeRenderLeaf;
};
const resolvedDrawings = computed<DrawingProjection[]>(() => {
  if (renderUnavailable.value) return [];
  const currentMetrics = metrics.value;
  const pass = renderPass.value;
  if (pass)
    return pass.leaves.flatMap((leaf): DrawingProjection[] => {
      const carrier = leaf.carrierLeaf ?? leaf.carrierRoot;
      if (!carrier?.view) return [];
      return [
        {
          source: leaf.sourceRoot,
          view: leaf.connector?.status === "ready" ? leaf.connector.paintView : carrier.view,
          metrics: currentMetrics,
          rect: leaf.carrierLeaf?.layout?.rect ?? leaf.carrierRoot?.rect,
          collapsed: carrier.collapsed,
          groupLeaf: leaf.carrierLeaf,
          renderLeaf: leaf,
        },
      ];
    });
  return props.drawings.flatMap((source): DrawingProjection[] => {
    if (isShapeGroupDrawing(source)) {
      if (!currentMetrics) throw new Error("Shape group placement requires worksheet metrics.");
      return resolveShapeGroupProjection(source, currentMetrics).leaves.flatMap((leaf) =>
        leaf.view
          ? [
              {
                source,
                view: leaf.view,
                metrics: currentMetrics,
                rect: leaf.layout!.rect,
                collapsed: leaf.collapsed,
                groupLeaf: leaf,
              },
            ]
          : [],
      );
    }
    if (hasShapeObjectFrame(source) && !currentMetrics)
      throw new Error("Shape placement requires current worksheet metrics.");
    return [
      currentMetrics
        ? resolveShapeDrawing(source, currentMetrics)
        : { source, view: source as SheetDrawing, metrics: undefined, collapsed: false },
    ];
  });
});
const legacyDrawings = computed(() => resolvedDrawings.value.map((item) => item.view));
function candidateForView(next: SheetDrawing, resolved: DrawingProjection): SourceSheetDrawing {
  if (resolved.renderLeaf?.connector)
    throw new TypeError("Connector paint views cannot enter carrier update inverses.");
  return resolved.groupLeaf && resolved.metrics
    ? updateResolvedShapeGroupLeaf(
        resolved.groupLeaf,
        next as SheetGraphicDrawing,
        resolved.metrics,
      )
    : resolved.metrics && resolved.rect
      ? updateResolvedShapeDrawing(
          resolved as Parameters<typeof updateResolvedShapeDrawing>[0],
          next,
          resolved.metrics,
        )
      : next;
}
const displayedRenderPass = computed(() => {
  const base = renderPass.value;
  if (!base) return undefined;
  let forest = rootsPreview.value ?? props.drawings;
  if (!rootsPreview.value && preview.value) {
    const owner = projectionById(preview.value);
    if (owner) {
      const next = candidateForView(preview.value, owner);
      forest = props.drawings.map((root) => (root === owner.source ? next : root));
    }
  }
  return forest === props.drawings
    ? base
    : resolveShapeForestForRender({
        drawings: forest,
        metrics: base.metrics,
        revision: base.revision,
        textBoxReferenceResolver: props.textBoxReferenceResolver,
      });
});
const previewViews = computed(() => {
  const output = new Map<string, SheetDrawing>();
  if (renderUnavailable.value) return output;
  const m = metrics.value;
  const pass = displayedRenderPass.value;
  if (pass) {
    for (const leaf of pass.leaves) {
      const view =
        leaf.connector?.status === "ready"
          ? leaf.connector.paintView
          : (leaf.carrierLeaf?.view ?? leaf.carrierRoot?.view);
      if (view) output.set(view.id, view);
    }
    return output;
  }
  if (!rootsPreview.value || !m) return output;
  for (const root of rootsPreview.value) {
    if (isShapeGroupDrawing(root)) {
      for (const leaf of resolveShapeGroupProjection(root, m).leaves)
        if (leaf.view) output.set(leaf.view.id, leaf.view);
    } else output.set(root.id, resolveShapeDrawing(root, m).view);
  }
  return output;
});
function resolvedOwner(drawing: SheetDrawing) {
  return resolvedDrawings.value.find((item) => item.view === drawing);
}
function projectionById(drawing: SheetDrawing) {
  return resolvedDrawings.value.find((item) => item.view.id === drawing.id);
}
function canonicalOwner(drawing: SheetDrawing): boolean {
  const item = projectionById(drawing);
  return (
    !!item && (!!item.renderLeaf?.connector || !!item.groupLeaf || hasShapeObjectFrame(item.source))
  );
}
function hasContinuousView(drawing: SheetDrawing): boolean {
  return (
    canonicalOwner(drawing) ||
    (!!props.pageProjection &&
      (drawing.kind === "shape" || drawing.kind === "textBox") &&
      !!metrics.value)
  );
}
function isSelectedView(drawing: SheetDrawing): boolean {
  const owner = projectionById(drawing);
  return owner?.groupLeaf
    ? selectedRoots.value.length === 1 &&
        selectedRoots.value[0] === owner.source.id &&
        selectedOwnedId.value === drawing.id
    : selectedRoots.value.includes(drawing.id);
}
function selectRoots(ids: string[], owned: string | null = null, explicit = true) {
  if (explicit) selectionRevision++;
  selectedRoots.value = ids;
  selectedOwnedId.value = owned;
  selectedId.value = ids.at(-1) ?? null;
  pointEditingId.value = null;
  selectionFailure.value = false;
  connectorFailure.value = false;
}
function chooseDrawing(
  drawing: SheetDrawing,
  event: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
): boolean {
  const entry = resolvedOwner(drawing);
  if (!entry) return false;
  const id = entry.source.id;
  if (
    (event.ctrlKey || event.metaKey || event.shiftKey) &&
    isShapeGroupEligibleRoot(entry.source)
  ) {
    const next = selectedRoots.value.filter((key) =>
      props.drawings.some((root) => root.id === key && isShapeGroupEligibleRoot(root)),
    );
    selectRoots(next.includes(id) ? next.filter((key) => key !== id) : [...next, id]);
    return false;
  }
  if (selectedRoots.value.length > 1 && selectedRoots.value.includes(id)) return true;
  const owned =
    entry.groupLeaf &&
    selectedRoots.value.length === 1 &&
    selectedRoots.value[0] === id &&
    selectedOwnedId.value
      ? drawing.id
      : null;
  if (
    selectedRoots.value.length !== 1 ||
    selectedRoots.value[0] !== id ||
    selectedOwnedId.value !== owned
  )
    selectRoots([id], owned);
  return true;
}
function legacyHitSurface(drawing: SheetDrawing): boolean {
  return (
    hasContinuousView(drawing) &&
    ((drawing.kind === "shape" &&
      !drawing.shapeGeometry &&
      !drawing.shapePath &&
      !drawing.shapeStyle &&
      !drawing.shapeText) ||
      (drawing.kind === "textBox" && !drawing.shapeText))
  );
}
function drawingGeometry(drawing: SheetGraphicDrawing) {
  return getDrawingShapeGeometry(
    drawing,
    hasContinuousView(drawing),
    connectorRoute(drawing)?.geometry,
  );
}
function connectorRoute(drawing: SheetDrawing): ReadyShapeConnectorRoute | undefined {
  const connector = (displayedRenderPass.value ?? renderPass.value)?.getLeaf(drawing.id)?.connector;
  return connector?.status === "ready" ? connector.route : undefined;
}
function connectorBoundState(drawing: SheetDrawing): readonly [boolean, boolean] | undefined {
  const connector = displayedRenderPass.value?.getLeaf(drawing.id)?.connector;
  return connector?.status === "ready"
    ? [connector.connection.begin.kind === "site", connector.connection.end.kind === "site"]
    : undefined;
}
function sourceOwner(drawing: SheetDrawing): SourceSheetDrawing | undefined {
  return projectionById(drawing)?.source;
}
function pointEditOptions(drawing: SheetDrawing): ShapePointEditOptions | undefined {
  const resolved = resolvedOwner(drawing);
  return resolved &&
    (isFramedShapeDrawing(resolved.source) || !!resolved.groupLeaf) &&
    resolved.metrics
    ? { metrics: resolved.metrics }
    : undefined;
}
function canChange(drawing: SheetDrawing): boolean {
  const source = sourceOwner(drawing);
  return !!source && !props.readOnly && (!props.sheet || canEditShapeObject(props.sheet, source));
}
function viewLayout(drawing: SheetDrawing): SheetViewportLayout {
  const resolved = projectionById(drawing);
  return resolved && hasContinuousView(drawing) && resolved.metrics
    ? shapeViewLayout(props.layout, resolved.metrics)
    : props.layout;
}
function moveView(drawing: SheetDrawing, delta: { x: number; y: number }) {
  const resolved = resolvedOwner(drawing);
  if (
    resolved &&
    (hasShapeObjectFrame(resolved.source) || !!resolved.groupLeaf) &&
    resolved.metrics &&
    resolved.rect
  )
    return shapeViewAtRect(
      drawing,
      { ...resolved.rect, x: resolved.rect.x + delta.x, y: resolved.rect.y + delta.y },
      resolved.metrics,
    );
  return moveFloatingImageBy(drawing, delta, viewLayout(drawing));
}
function resizeView(
  drawing: SheetDrawing,
  direction: FloatingImageResizeDirection,
  delta: { x: number; y: number },
  shift: boolean,
) {
  const resolved = resolvedOwner(drawing);
  if (
    resolved &&
    (hasShapeObjectFrame(resolved.source) || !!resolved.groupLeaf) &&
    resolved.metrics &&
    resolved.rect
  ) {
    const next = standardShapeResizeRect(
      resolved.rect,
      drawing.rotation,
      direction,
      delta,
      getShapeObjectProperties(
        resolved.groupLeaf?.sourceNode.shapeProperties ??
          (hasShapeObjectFrame(resolved.source) ? resolved.source.shapeProperties : undefined),
      ).lockAspectRatio || shift,
      1,
      true,
    );
    return next ? shapeViewAtRect(drawing, next, resolved.metrics) : undefined;
  }
  return isStandard(drawing)
    ? resizeStandardShapeBy(drawing, direction, delta, viewLayout(drawing), shift)
    : resizeFloatingImageBy(drawing, direction, delta, viewLayout(drawing), {
        minSize: 16,
        maxSize: 16384,
      });
}
const detailedPresentations = new Map<string, ShapeDetailedPresentation>();
function acceptDetailedPaint(
  fragment: DrawingFragment,
  presentation: ShapeDetailedPresentation | undefined,
) {
  if (
    !fragments.value.some(
      (current) =>
        current.drawing === fragment.drawing &&
        current.paneId === fragment.paneId &&
        current.pageKey === fragment.pageKey,
    ) ||
    !passIsCurrent(fragment.renderPass)
  )
    return;
  const key = `${fragment.drawing.id}:${fragment.pageKey ?? fragment.paneId}`;
  const paintDrawing =
    fragment.renderPass?.getLeaf(fragment.drawing.id)?.paintView ?? fragment.drawing;
  if (presentation?.drawing === paintDrawing) detailedPresentations.set(key, presentation);
  else detailedPresentations.delete(key);
}
type DrawingFragment = FloatingImageViewportFragment & {
  drawing: SheetDrawing;
  standard: boolean;
  pageKey?: string;
  pageClip?: FloatingImageViewportFragment["rect"];
  connectorRoute?: ReadyShapeConnectorRoute;
  renderPass?: ResolvedShapeForestForRender;
};
const preview = shallowRef<SheetDrawing>();
let session: PointerSession | undefined;
function passIsCurrent(pass: ResolvedShapeForestForRender | undefined): boolean {
  if (!pass) return true;
  try {
    const base = renderPass.value;
    base?.assertCurrent(props.drawings, metrics.value!, props.revision ?? 0);
    if (pass !== displayedRenderPass.value) return false;
    pass.assertCurrent(pass.sourceForest, metrics.value!, props.revision ?? 0);
    return true;
  } catch {
    return false;
  }
}
function groupProjection(root: ShapeGroupDrawing, m: PictureSheetMetrics) {
  const sourcePass = renderPass.value;
  if (!sourcePass) return resolveShapeGroupProjection(root, m);
  const displayed = displayedRenderPass.value?.getGroup(root.id);
  const source = sourcePass.getGroup(root.id);
  const group =
    displayed?.sourceRoot === root ? displayed : source?.sourceRoot === root ? source : undefined;
  if (!group || group.metrics !== m)
    throw new TypeError("Group placement requires its exact full-forest pass.");
  return group;
}
function groupContainer(root: ShapeGroupDrawing, path: ShapeGroupPath, m: PictureSheetMetrics) {
  if (!renderPass.value) return resolveShapeGroupFormatContext(root, path, m);
  const owner = groupProjection(root, m).owners.find(
    (candidate) =>
      candidate.path.length === path.length && candidate.path.every((id, i) => id === path[i]),
  );
  if (!owner) throw new TypeError("Group editing requires its exact owner path.");
  return owner;
}
function setRootsPreview(next: readonly SourceSheetDrawing[] | undefined): void {
  if (next && renderPass.value)
    resolveShapeForestForRender({
      drawings: next,
      metrics: metrics.value!,
      revision: props.revision ?? 0,
    });
  rootsPreview.value = next;
}
function setViewPreview(next: SheetDrawing | undefined): void {
  try {
    if (next && renderPass.value) {
      const owner = projectionById(next);
      if (!owner) throw new TypeError("Drawing preview requires its source owner.");
      const candidate = candidateForView(next, owner);
      resolveShapeForestForRender({
        drawings: props.drawings.map((root) => (root === owner.source ? candidate : root)),
        metrics: metrics.value!,
        revision: props.revision ?? 0,
      });
    }
    preview.value = next;
  } catch {
    preview.value = undefined;
    selectionFailure.value = true;
  }
}
type GroupPaintEntry = {
  source: ShapeGroupDrawing;
  displayed: ShapeGroupDrawing;
  metrics: PictureSheetMetrics;
  stackIndex: number;
  renderPass?: ResolvedShapeForestForRender;
};
const visibleNodeIds = computed(() =>
  getVisibleShapeNodeIds(
    displayedRenderPass.value?.sourceForest ?? rootsPreview.value ?? props.drawings,
  ),
);
const groupPaintEntries = computed<GroupPaintEntry[]>(() => {
  if (renderUnavailable.value) return [];
  const m = metrics.value;
  if (!m) return [];
  const pass = displayedRenderPass.value;
  return props.drawings.flatMap((source, stackIndex) => {
    if (!isShapeGroupDrawing(source) || !visibleNodeIds.value.has(source.id)) return [];
    let displayed =
      pass?.sourceForest.find((root) => root.id === source.id) ??
      rootsPreview.value?.find((root) => root.id === source.id) ??
      source;
    if (!isShapeGroupDrawing(displayed)) return [];
    if (preview.value && !pass) {
      const leaf = resolveShapeGroupProjection(displayed, m).leaves.find(
        (leaf) => leaf.sourceNode.id === preview.value?.id,
      );
      if (leaf && (preview.value.kind === "shape" || preview.value.kind === "textBox"))
        displayed = updateResolvedShapeGroupLeaf(leaf, preview.value, m);
    }
    return requiresShapeGroupPaint(displayed) && !groupProjection(displayed, m).layout.collapsed
      ? [{ source, displayed, metrics: m, stackIndex, renderPass: pass }]
      : [];
  });
});
const groupPresentations = new Map<string, Extract<ShapeGroupPaintResult, { kind: "ready" }>>();
function groupPaintEntry(drawing: SheetDrawing): GroupPaintEntry | undefined {
  const source = sourceOwner(drawing);
  return groupPaintEntries.value.find((entry) => entry.source === source);
}
function acceptGroupPaint(
  entry: GroupPaintEntry,
  result: Extract<ShapeGroupPaintResult, { kind: "ready" }> | undefined,
): void {
  if (
    !groupPaintEntries.value.some(
      (current) =>
        current.source === entry.source &&
        current.displayed === entry.displayed &&
        current.metrics === entry.metrics &&
        current.renderPass === entry.renderPass,
    )
  )
    return;
  if (
    result?.sourceRoot === entry.displayed &&
    result.metrics === entry.metrics &&
    result.renderPass === entry.renderPass &&
    passIsCurrent(entry.renderPass)
  )
    groupPresentations.set(entry.source.id, result);
  else groupPresentations.delete(entry.source.id);
}
watch(groupPaintEntries, (entries) => {
  for (const [id, result] of groupPresentations)
    if (
      !entries.some(
        (entry) =>
          entry.source.id === id &&
          entry.displayed === result.sourceRoot &&
          entry.metrics === result.metrics &&
          entry.renderPass === result.renderPass,
      )
    )
      groupPresentations.delete(id);
});
function drawingStackStyle(drawing: SheetDrawing): CSSProperties {
  const source = sourceOwner(drawing);
  return {
    zIndex:
      Math.max(
        0,
        props.drawings.findIndex((root) => root === source),
      ) *
        3 +
      1,
  };
}
function groupHit(entry: GroupPaintEntry, fragment: ShapeGroupFrameFragment, event: MouseEvent) {
  const result = groupPresentations.get(entry.source.id);
  if (
    !result ||
    result.sourceRoot !== entry.displayed ||
    result.metrics !== entry.metrics ||
    result.renderPass !== entry.renderPass ||
    !passIsCurrent(entry.renderPass)
  )
    return;
  return hitShapeGroupPaint(
    result,
    standardShapeWorldToLocal(fragment.rect, entry.displayed.rotation, viewportPoint(event)),
  );
}
function groupLeafFragment(
  entry: GroupPaintEntry,
  fragment: ShapeGroupFrameFragment,
  id: string,
): DrawingFragment | undefined {
  return fragments.value.find(
    (candidate) =>
      candidate.drawing.id === id &&
      sourceOwner(candidate.drawing) === entry.source &&
      candidate.paneId === fragment.paneId &&
      candidate.pageKey === fragment.pageKey,
  );
}
function startGroupPixels(
  entry: GroupPaintEntry,
  fragment: ShapeGroupFrameFragment,
  event: PointerEvent,
): void {
  if (!finishCanvasText()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const hit = groupHit(entry, fragment, event);
  if (!hit) {
    if (event.target instanceof Element && event.target.closest('[role="status"]'))
      startGroupFrame(entry.source, fragment, event);
    else emit("backgroundPointer", event);
    return;
  }
  if (hit.kind === "owner" && (event.ctrlKey || event.metaKey || event.shiftKey)) {
    event.preventDefault();
    event.stopPropagation();
    const selected = selectedRoots.value.filter((id) =>
      props.drawings.some((root) => root.id === id && isShapeGroupEligibleRoot(root)),
    );
    selectRoots(
      selected.includes(entry.source.id)
        ? selected.filter((id) => id !== entry.source.id)
        : [...selected, entry.source.id],
    );
    emit("select");
    return;
  }
  if (hit.kind === "leaf") {
    const target = groupLeafFragment(entry, fragment, hit.path.at(-1)!);
    if (target) start(target, event);
    return;
  }
  startGroupFrame(entry.source, fragment, event, undefined, "move", hit.path);
}
function editGroupPixels(
  entry: GroupPaintEntry,
  fragment: ShapeGroupFrameFragment,
  event: MouseEvent,
): void {
  const hit = groupHit(entry, fragment, event);
  if (!hit) return;
  if (hit.kind === "owner") formatGroup(entry.source, hit.path);
  else {
    const target = groupLeafFragment(entry, fragment, hit.path.at(-1)!);
    if (target) edit(target, event);
  }
}
function groupPixelContext(
  entry: GroupPaintEntry,
  fragment: ShapeGroupFrameFragment,
  event: MouseEvent,
): void {
  const hit = groupHit(entry, fragment, event);
  if (!hit) return;
  if (hit.kind === "leaf") {
    const target = groupLeafFragment(entry, fragment, hit.path.at(-1)!);
    if (target) shapeContext(target, event);
  } else {
    groupClipboardContext(entry.source, hit.path, event);
  }
}
const fragments = computed<DrawingFragment[]>(
  () => (
    void cellTextFontRevision.value,
    legacyDrawings.value.flatMap((original) => {
      if (!visibleNodeIds.value.has(original.id) || resolvedOwner(original)?.collapsed) return [];
      const pass = displayedRenderPass.value;
      const leaf = pass?.getLeaf(original.id);
      if (leaf?.connector && leaf.connector.status !== "ready") return [];
      const drawing =
        !pass && preview.value?.id === original.id
          ? preview.value
          : (previewViews.value.get(original.id) ?? original);
      const route = leaf?.connector?.status === "ready" ? leaf.connector.route : undefined;
      const paintDrawing = leaf?.paintView ?? drawing;
      const currentLayout = viewLayout(drawing);
      const standard = isStandard(drawing);
      const shape = standard && drawingGeometry(drawing);
      const resolved = resolvedOwner(original);
      const projected =
        props.pageProjection &&
        standard &&
        resolved?.metrics &&
        (drawing.kind === "shape" || drawing.kind === "textBox")
          ? getShapePageFragments(
              paintDrawing as SheetGraphicDrawing,
              props.layout,
              props.pageProjection,
              resolved.metrics,
              isSelectedView(drawing),
              route,
            )
          : standard && shape
            ? getStandardShapeViewportFragments(
                paintDrawing as SheetGraphicDrawing,
                currentLayout,
                isSelectedView(drawing),
                hasContinuousView(drawing),
                route,
              )
            : getFloatingImageViewportFragments(drawing, currentLayout);
      return projected.map((fragment) => ({
        ...fragment,
        drawing,
        standard,
        connectorRoute: route,
        renderPass: pass,
      }));
    })
  ),
);
const formatTarget = computed(() => {
  const visible = fragments.value.filter(
    (f) =>
      isSelectedView(f.drawing) &&
      selectedRoots.value.length === 1 &&
      (!projectionById(f.drawing)?.groupLeaf ||
        (selectedOwnedId.value === f.drawing.id &&
          !!projectionById(f.drawing)?.renderLeaf?.connector)) &&
      (f.drawing.kind === "shape" || f.drawing.kind === "textBox") &&
      f.drawing.id !== pointEditingId.value,
  );
  return visible.sort(
    (a, b) =>
      b.clippedRect.width * b.clippedRect.height - a.clippedRect.width * a.clippedRect.height,
  )[0];
});
const formatTriggerStyle = computed(() => {
  const f = formatTarget.value;
  if (!f) return {};
  const clip = f.pageClip ?? props.layout.panes[f.paneId].clip;
  return {
    left: `${Math.max(clip.x + 4, Math.min(clip.x + clip.width - 32, f.rect.x + f.rect.width + 12))}px`,
    top: `${Math.max(clip.y + 4, Math.min(clip.y + clip.height - 32, f.rect.y))}px`,
  };
});
function formatSelected() {
  const d = formatTarget.value?.drawing;
  if (d && projectionById(d)?.renderLeaf?.connector) {
    formatConnector(d);
    return;
  }
  if (
    (d?.kind === "shape" || d?.kind === "textBox") &&
    canChange(d) &&
    legacyDrawings.value.find((item) => item.id === d.id) === d
  ) {
    const source = sourceOwner(d);
    if (source && (source.kind === "shape" || source.kind === "textBox")) emit("format", source);
  }
}
function beginCanvasText(drawing: SheetDrawing, selection: "all" | "end", text?: string): boolean {
  if (
    !props.startTextEdit ||
    !visibleNodeIds.value.has(drawing.id) ||
    !canChange(drawing) ||
    (drawing.kind !== "shape" && drawing.kind !== "textBox") ||
    projectionById(drawing)?.renderLeaf?.connector
  )
    return false;
  const owner = projectionById(drawing),
    source = sourceOwner(drawing);
  if (!owner || !source || legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing)
    return false;
  if (drawing.kind === "textBox" && drawing.textReference)
    return props.openTextBoxReference?.(source, owner.groupLeaf?.path) === true;
  selectRoots([source.id], owner.groupLeaf ? drawing.id : null);
  pointEditingId.value = null;
  session?.cancel();
  if (
    !props.startTextEdit({
      root: source,
      path: owner.groupLeaf?.path,
      selection,
      ...(text !== undefined ? { text } : {}),
    })
  )
    return false;
  emit("select");
  return true;
}
const equationEditorFragmentKey = computed(() => {
  const state = props.equationEditSnapshot;
  if (!state || !props.equationEditCallbacks?.isActive()) return;
  const candidate = fragments.value
    .filter((f) => f.drawing.id === state.ownerId && sourceOwner(f.drawing) === state.root)
    .sort(
      (a, b) =>
        b.clippedRect.width * b.clippedRect.height - a.clippedRect.width * a.clippedRect.height,
    )[0];
  return candidate && `${candidate.drawing.id}-${candidate.pageKey ?? candidate.paneId}`;
});
function equationPaintView(drawing: SheetDrawing): SheetDrawing {
  const state = props.equationEditSnapshot;
  return state && drawing.id === state.ownerId && sourceOwner(drawing) === state.root
    ? state.view
    : drawing;
}
const canvasTextEditor = ref<InstanceType<typeof ShapeCanvasTextEditor>>();
const canvasTextPlacement = computed(() => {
  const state = props.textEditSnapshot;
  if (!state || !visibleNodeIds.value.has(state.sourceId)) return;
  const candidates = fragments.value.filter(
    (f) => f.drawing.id === state.sourceId && sourceOwner(f.drawing) === state.root,
  );
  const fragment = candidates.sort(
    (a, b) =>
      b.clippedRect.width * b.clippedRect.height - a.clippedRect.width * a.clippedRect.height,
  )[0];
  const pane = Object.values(props.layout.panes).sort(
    (a, b) => b.clip.width * b.clip.height - a.clip.width * a.clip.height,
  )[0];
  const clip =
    fragment?.pageClip ?? (fragment ? props.layout.panes[fragment.paneId].clip : pane?.clip);
  if (!clip) return;
  const placement = fragment && shapeTextEditorPlacement(state.view, fragment);
  return {
    clip: {
      left: `${clip.x}px`,
      top: `${clip.y}px`,
      width: `${clip.width}px`,
      height: `${clip.height}px`,
    },
    frame: placement
      ? {
          ...placement.frame,
          left: `${fragment!.rect.x - clip.x}px`,
          top: `${fragment!.rect.y - clip.y}px`,
        }
      : {
          left: "16px",
          top: "16px",
          width: `${Math.max(80, Math.min(420, clip.width - 32))}px`,
          height: "160px",
        },
    input: placement?.input ?? { left: "0px", top: "0px", width: "100%", height: "100%" },
  };
});
function restoreCanvasTextObjectFocus(id: string, sheet: Sheet | undefined): void {
  void nextTick(() => {
    if (props.sheet !== sheet || props.textEditSnapshot) return;
    Array.from(layerElement.value?.querySelectorAll<HTMLElement>("[data-sheet-drawing-id]") ?? [])
      .find((element) => element.dataset.sheetDrawingId === id)
      ?.focus({ preventScroll: true });
  });
}
function finishCanvasText(restoreObjectFocus = false): boolean {
  const state = props.textEditSnapshot,
    callbacks = props.textEditCallbacks;
  if (!state) return true;
  if (callbacks && !callbacks.isActive()) return true;
  if (!callbacks || callbacks.sessionId !== state.sessionId || !callbacks.commit()) {
    void nextTick(() => canvasTextEditor.value?.focus());
    return false;
  }
  if (restoreObjectFocus) restoreCanvasTextObjectFocus(state.sourceId, props.sheet);
  return true;
}
const canvasTextOwnerActions = computed(() => {
  const state = props.textEditSnapshot,
    callbacks = props.textEditCallbacks,
    sheet = props.sheet;
  const current = () =>
    !!state &&
    !!callbacks &&
    callbacks.isActive() &&
    props.sheet === sheet &&
    props.textEditCallbacks === callbacks &&
    props.textEditSnapshot?.sessionId === state.sessionId &&
    callbacks.sessionId === state.sessionId;
  const finish = (restoreFocus: boolean): boolean => {
    if (!current() || !state || !callbacks) return false;
    if (!callbacks.commit()) {
      void nextTick(() => canvasTextEditor.value?.focus());
      return false;
    }
    if (restoreFocus) restoreCanvasTextObjectFocus(state.sourceId, sheet);
    return true;
  };
  return {
    commit: () => finish(true),
    escape: () => finish(true),
    blur: () => finish(false),
    cancel: () => {
      if (current() && state && callbacks?.cancel())
        restoreCanvasTextObjectFocus(state.sourceId, sheet);
    },
  };
});
function hideCanvasText(drawing: SheetDrawing): boolean {
  const state = props.textEditSnapshot;
  return (
    !!state && !state.stale && state.sourceId === drawing.id && sourceOwner(drawing) === state.root
  );
}
function formatConnector(drawing: SheetDrawing): boolean {
  const pass = renderPass.value,
    leaf = pass?.getLeaf(drawing.id);
  if (
    !pass ||
    leaf?.connector?.status !== "ready" ||
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
  )
    return false;
  try {
    pass.assertCurrent(props.drawings, metrics.value!, props.revision ?? 0);
    selectRoots([leaf.sourceRoot.id], leaf.path.length > 1 ? drawing.id : null);
    if (isShapeGroupDrawing(leaf.sourceRoot)) emit("formatGroup", leaf.sourceRoot, leaf.path);
    else if (leaf.sourceRoot.kind === "shape") emit("format", leaf.sourceRoot);
    else return false;
    connectorFailure.value = false;
    return true;
  } catch {
    connectorFailure.value = true;
    return false;
  }
}
function commitUpdate(next: SheetDrawing, owner: SheetDrawing): boolean {
  if (projectionById(owner)?.renderLeaf?.connector) {
    connectorFailure.value = true;
    return false;
  }
  if (
    !canChange(owner) ||
    legacyDrawings.value.find((item) => item.id === owner.id) !== owner ||
    (isStandard(next) && !drawingGeometry(next))
  )
    return false;
  if (next === owner) {
    pointRejected.value = false;
    return true;
  }
  let accepted = false;
  try {
    const resolved = resolvedOwner(owner);
    const source = resolved?.source;
    if (!source) return false;
    const pass = renderPass.value;
    pass?.assertCurrent(props.drawings, metrics.value!, props.revision ?? 0);
    const candidate = candidateForView(next, resolved!);
    if (pass)
      resolveShapeForestForRender({
        drawings: props.drawings.map((root) => (root === source ? candidate : root)),
        metrics: pass.metrics,
        revision: pass.revision,
      });
    if (props.applyUpdate) accepted = props.applyUpdate(candidate, source) === true;
    else {
      emit("update", candidate);
      accepted = true;
    }
  } catch {
    accepted = false;
  }
  if (pointEditingId.value === owner.id) pointRejected.value = !accepted;
  return accepted;
}
const selectionKey = computed(
  () =>
    `${props.sheet?.id ?? "sheet"}:${props.revision ?? 0}:${selectionEpoch.value}:${selectedRoots.value.join("|")}:${selectedOwnedId.value ?? ""}`,
);
const selectionDisabled = computed(
  () =>
    renderUnavailable.value ||
    !props.applyCollection ||
    !metrics.value ||
    props.readOnly ||
    (selectedOwnedId.value !== null && !visibleNodeIds.value.has(selectedOwnedId.value)) ||
    selectedRoots.value.some((id) => {
      const root = props.drawings.find((d) => d.id === id);
      return (
        !root ||
        !visibleNodeIds.value.has(id) ||
        !isShapeGroupEligibleRoot(root) ||
        (!!props.sheet && !canEditShapeObject(props.sheet, root))
      );
    }),
);
function objectSelectionPaths(): ShapeGroupPath[] {
  if (selectedRoots.value.length === 1 && selectedOwnedId.value) {
    const root = props.drawings.find((node) => node.id === selectedRoots.value[0]);
    if (root && isShapeGroupDrawing(root)) {
      const visit = traverseShapeGroup(root).find(({ node }) => node.id === selectedOwnedId.value);
      if (visit) return [[...visit.path]];
    }
  }
  return selectedRoots.value
    .filter((id) =>
      props.drawings.some((node) => node.id === id && isDrawingClipboardEligibleRoot(node)),
    )
    .map((id) => [id]);
}
watch(
  [() => props.sheet, () => JSON.stringify(objectSelectionPaths())],
  () => emit("objectSelectionChange", objectSelectionPaths()),
  { immediate: true, flush: "post" },
);
function selectObjectPaths(pathValues: readonly ShapeGroupPath[]): boolean {
  if (!finishCanvasText() || props.readOnly) return false;
  try {
    const paths = readShapeObjectControlPaths(pathValues);
    const roots = paths.map((path) => props.drawings.find((node) => node.id === path[0]));
    if (
      roots.some(
        (root) =>
          !root ||
          !isDrawingClipboardEligibleRoot(root) ||
          (props.sheet && !canEditShapeObject(props.sheet, root)),
      )
    )
      return false;
    if (paths.some((path) => path.length > 1)) {
      if (paths.length !== 1 || !isShapeGroupDrawing(roots[0]!)) return false;
      const target = traverseShapeGroup(roots[0]!).find(
        ({ path }) => JSON.stringify(path) === JSON.stringify(paths[0]),
      );
      if (!target) return false;
      selectRoots([roots[0]!.id], target.node.id);
    } else selectRoots(roots.map((root) => root!.id));
    emit("select");
    return true;
  } catch {
    return false;
  }
}
defineExpose({
  selectObjectPaths,
  getObjectSelectionPaths: objectSelectionPaths,
  getObjectSelectionRevision: () => selectionRevision,
});
const groupFragments = computed(() => {
  if (
    renderUnavailable.value ||
    (selectedOwnedId.value && !visibleNodeIds.value.has(selectedOwnedId.value))
  )
    return [];
  const m = metrics.value;
  if (!m) return [];
  return props.drawings.flatMap((source) => {
    if (
      !isShapeGroupDrawing(source) ||
      !selectedRoots.value.includes(source.id) ||
      !visibleNodeIds.value.has(source.id)
    )
      return [];
    const displayed =
      displayedRenderPass.value?.sourceForest.find((d) => d.id === source.id) ??
      rootsPreview.value?.find((d) => d.id === source.id) ??
      source;
    if (!isShapeGroupDrawing(displayed)) return [];
    const projected = groupProjection(displayed, m);
    return projected.owners.flatMap((owner) =>
      owner.layout && visibleNodeIds.value.has(owner.sourceNode.id)
        ? getShapeGroupFrameFragments(owner.layout, props.layout, m, props.pageProjection).map(
            (fragment) => ({ source, owner, layout: owner.layout!, fragment }),
          )
        : [],
    );
  });
});
watch(
  () => [selectedRoots.value, selectedOwnedId.value, props.drawings] as const,
  () => {
    const root =
      selectedRoots.value.length === 1
        ? props.drawings.find((d) => d.id === selectedRoots.value[0])
        : undefined;
    if (renderUnavailable.value || !root || !isShapeGroupDrawing(root) || !metrics.value) {
      emit("groupSelectionChange", null, null);
      return;
    }
    const projection = groupProjection(root, metrics.value);
    const node = selectedOwnedId.value
      ? [...projection.owners, ...projection.leaves].find(
          (n) => n.sourceNode.id === selectedOwnedId.value,
        )
      : projection.owners[0];
    emit("groupSelectionChange", root.id, node?.path ?? null);
  },
  { flush: "sync" },
);
const toolbarAnchor = computed<FloatingReference | null>(() => {
  if (
    selectedRoots.value.length < 2 ||
    !layerElement.value ||
    selectedRoots.value.some((id) => !visibleNodeIds.value.has(id))
  )
    return null;
  const visible = [
    ...fragments.value
      .filter((f) => selectedRoots.value.includes(projectionById(f.drawing)?.source.id ?? ""))
      .map((f) => f.clippedRect),
    ...groupFragments.value.map((f) => f.fragment.clippedRect),
  ];
  if (!visible.length) return null;
  const x = Math.min(...visible.map((f) => f.x)),
    y = Math.min(...visible.map((f) => f.y));
  const right = Math.max(...visible.map((f) => f.x + f.width)),
    bottom = Math.max(...visible.map((f) => f.y + f.height));
  return {
    contextElement: layerElement.value,
    getBoundingClientRect: () => {
      const host = layerElement.value?.getBoundingClientRect();
      const left = (host?.left ?? 0) + x * props.scale,
        top = (host?.top ?? 0) + y * props.scale;
      return new DOMRect(left, top, (right - x) * props.scale, (bottom - y) * props.scale);
    },
  };
});
function runSelectionPlan(
  plan: () => readonly SourceSheetDrawing[],
  key = selectionKey.value,
): boolean {
  const m = metrics.value;
  if (key !== selectionKey.value || selectionDisabled.value || !m || !props.applyCollection)
    return false;
  const expected = [...props.drawings];
  const pass = renderPass.value;
  const current = () => {
    try {
      pass?.assertCurrent(props.drawings, m, props.revision ?? 0);
      return true;
    } catch {
      return false;
    }
  };
  try {
    if (!current()) return false;
    const next = plan();
    if (pass) resolveShapeForestForRender({ drawings: next, metrics: m, revision: pass.revision });
    if (
      key !== selectionKey.value ||
      metrics.value !== m ||
      props.drawings.length !== expected.length ||
      props.drawings.some((d, i) => d !== expected[i]) ||
      !current()
    )
      return false;
    const accepted =
      props.applyCollection(
        next,
        expected,
        m,
        () =>
          key === selectionKey.value &&
          metrics.value === m &&
          !selectionDisabled.value &&
          current() &&
          props.drawings.length === expected.length &&
          props.drawings.every((d, i) => d === expected[i]),
      ) === true;
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
          props.drawings,
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
          props.drawings,
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
    groupProjection(source, metrics.value).owners.find(
      (o) => o.sourceNode.id === selectedOwnedId.value,
    );
  return own ? own.path : [source.id];
}
function formatGroup(source: ShapeGroupDrawing, path: ShapeGroupPath): void {
  if (props.drawings.find((d) => d.id === source.id) !== source || selectionDisabled.value) return;
  const selectedLeaf = renderPass.value?.getLeaf(path.at(-1)!);
  if (
    selectedLeaf?.connector &&
    selectedLeaf.sourceRoot === source &&
    JSON.stringify(selectedLeaf.path) === JSON.stringify(path)
  ) {
    const view = legacyDrawings.value.find((drawing) => drawing.id === selectedLeaf.sourceNode.id);
    if (view) formatConnector(view);
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
  selectRoots([source.id], path.length > 1 ? path.at(-1)! : null);
  emit("formatGroup", source, path);
}
function groupSelected(key: string): void {
  if (key !== selectionKey.value || !metrics.value) return;
  const id = createId("shape-group");
  if (
    runSelectionPlan(
      () =>
        groupShapeRoots(
          props.drawings,
          selectedRoots.value,
          { id, name: t("drawing.groupName") },
          metrics.value!,
        ),
      key,
    )
  )
    selectRoots([id]);
}
function ungroupSelected(source: ShapeGroupDrawing, path: ShapeGroupPath = [source.id]): void {
  const m = metrics.value;
  if (
    !m ||
    props.drawings.find((d) => d.id === source.id) !== source ||
    !selectedRoots.value.includes(source.id)
  )
    return;
  if (path.length > 1) {
    if (
      runSelectionPlan(() =>
        props.drawings.map((d) => (d === source ? ungroupOwnedShapeContainer(source, path, m) : d)),
      )
    )
      selectRoots([source.id], path.length > 2 ? path.at(-2)! : null);
  } else if (runSelectionPlan(() => ungroupShapeRoot(props.drawings, source.id, m)))
    selectRoots(source.members.map((d) => d.id));
}
function deleteSelected(): void {
  const m = metrics.value;
  if (!m) return;
  const own =
    selectedOwnedId.value &&
    resolvedDrawings.value.find((d) => d.view.id === selectedOwnedId.value)?.groupLeaf;
  const selectedRoot = props.drawings.find((d) => d.id === selectedRoots.value[0]);
  const container =
    selectedRoot && isShapeGroupDrawing(selectedRoot)
      ? selectedContainerPath(selectedRoot)
      : undefined;
  const paths: ShapeGroupPath[] = own
    ? [own.path]
    : container && container.length > 1
      ? [container]
      : selectedRoots.value.map((id) => [id]);
  if (runSelectionPlan(() => planDeleteShapeGroupNodes(props.drawings, paths, m))) {
    if (own && props.drawings.some((d) => d.id === own.sourceRoot.id))
      selectRoots([own.sourceRoot.id]);
    else selectRoots([]);
  }
}
function rotateRootSelection(degrees: number): readonly SourceSheetDrawing[] {
  const ids = new Set(selectedRoots.value);
  if (
    props.drawings.some((root) => ids.has(root.id) && root.kind === "shape" && root.shapeConnector)
  ) {
    connectorFailure.value = true;
    throw new TypeError("Connector rotation requires an endpoint edit.");
  }
  return props.drawings.map((root) =>
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
  if (!finishCanvasText()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const m = metrics.value;
  const root = props.drawings.find((d) => d.id === id);
  if (
    !m ||
    !root ||
    !isShapeGroupEligibleRoot(root) ||
    selectionDisabled.value ||
    event.button !== 0
  )
    return;
  if (
    props.drawings.some(
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
  const expected = [...props.drawings],
    expectedData = JSON.stringify(props.drawings),
    key = selectionKey.value,
    selected = [...selectedRoots.value];
  const sheet = props.sheet,
    revision = props.revision,
    viewport = props.layout,
    projection = props.pageProjection,
    scale = props.scale;
  const pass = renderPass.value;
  const current = () => {
    try {
      pass?.assertCurrent(props.drawings, m, props.revision ?? 0);
      return true;
    } catch {
      return false;
    }
  };
  const valid = () =>
    key === selectionKey.value &&
    !selectionDisabled.value &&
    metrics.value === m &&
    props.sheet === sheet &&
    props.revision === revision &&
    props.layout === viewport &&
    props.pageProjection === projection &&
    props.scale === scale &&
    current() &&
    props.drawings.length === expected.length &&
    props.drawings.every((d, i) => d === expected[i]) &&
    JSON.stringify(props.drawings) === expectedData;
  const translation = getPicturePaneTranslation(fragment.paneId, viewport);
  const sample = (point: MouseEvent) =>
    projection
      ? shapePagePointFromViewport(viewportPoint(point), viewport, projection, m)?.point
      : { x: viewportPoint(point).x - translation.x, y: viewportPoint(point).y - translation.y };
  const origin = sample(event);
  if (!origin) return;
  const worldRect = {
    ...fragment.rect,
    x: fragment.rect.x - translation.x,
    y: fragment.rect.y - translation.y,
  };
  const groupLayout = isShapeGroupDrawing(root)
    ? ownedPath
      ? groupContainer(root, ownedPath, m).layout
      : groupProjection(root, m).layout
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
      session?.cancel();
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
          const node = groupContainer(root, ownedPath, m).sourceNode;
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
        setRootsPreview(expected.map((d) => (d === root ? next : d)));
      } else if (mode === "rotate") {
        let degrees =
          ((Math.atan2(nextPoint.y - center.y, nextPoint.x - center.x) - initialAngle) * 180) /
          Math.PI;
        if (point.shiftKey)
          degrees = Math.round((root.rotation + degrees) / 15) * 15 - root.rotation;
        const ids = new Set(selected);
        setRootsPreview(
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
        setRootsPreview(
          direction
            ? resizeSelectedShapeRoots(expected, selected, id, direction, delta, m, point.shiftKey)
            : moveSelectedShapeRoots(expected, selected, delta, m),
        );
      rejected = false;
    } catch {
      rootsPreview.value = undefined;
      rejected = true;
    }
  };
  session = startPointerSession({
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
  });
}
function startGroupFrame(
  source: ShapeGroupDrawing,
  fragment: ShapeGroupFrameFragment,
  event: PointerEvent,
  direction?: FloatingImageResizeDirection,
  mode: "move" | "rotate" = "move",
  path: ShapeGroupPath = [source.id],
): void {
  if (!finishCanvasText()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (props.drawings.find((d) => d.id === source.id) !== source) return;
  const nestedId = path.length > 1 ? path.at(-1)! : null;
  if (nestedId !== null) {
    if (
      selectedRoots.value.length !== 1 ||
      selectedRoots.value[0] !== source.id ||
      selectedOwnedId.value !== nestedId
    )
      selectRoots([source.id], nestedId);
  } else if (!selectedRoots.value.includes(source.id) || selectedOwnedId.value !== null)
    selectRoots([source.id]);
  pointEditingId.value = null;
  emit("select");
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
    props.drawings.find((d) => d.id === source.id) !== source
  )
    return;
  if (
    !selectedRoots.value.includes(source.id) ||
    selectedOwnedId.value !== (path.length > 1 ? path.at(-1)! : null)
  )
    selectRoots([source.id], path.length > 1 ? path.at(-1)! : null);
  if (event.key === "F2" || event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    formatGroup(source, path);
    return;
  }
  if (event.key === "Escape") {
    if (path.length > 1) selectRoots([source.id], path.length > 2 ? path.at(-2)! : null);
    else selectRoots([]);
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
        const layout = groupContainer(source, path, metrics.value!).layout;
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
        return props.drawings.map((d) => (d === source ? next : d));
      });
    else
      runSelectionPlan(() =>
        moveSelectedShapeRoots(props.drawings, selectedRoots.value, delta, metrics.value!),
      );
  }
}
watch(
  () => [
    props.drawings,
    props.sheet,
    props.revision,
    metrics.value,
    props.layout,
    props.pageProjection,
    props.scale,
    selectedRoots.value,
    selectedOwnedId.value,
  ],
  () => {
    selectionEpoch.value++;
    session?.cancel();
    rootsPreview.value = undefined;
    connectorSites.value = [];
  },
  { flush: "sync" },
);

function fragmentStyle(
  fragment: FloatingImageViewportFragment & { pageClip?: FloatingImageViewportFragment["rect"] },
): CSSProperties {
  const clip = fragment.pageClip;
  const clipX = clip ? clip.x - fragment.clippedRect.x : 0;
  const clipY = clip ? clip.y - fragment.clippedRect.y : 0;
  return {
    clipPath: clip
      ? `polygon(${clipX}px ${clipY}px, ${clipX + clip.width}px ${clipY}px, ${clipX + clip.width}px ${clipY + clip.height}px, ${clipX}px ${clipY + clip.height}px)`
      : undefined,
    left: `${fragment.clippedRect.x}px`,
    top: `${fragment.clippedRect.y}px`,
    width: `${fragment.clippedRect.width}px`,
    height: `${fragment.clippedRect.height}px`,
  };
}
function contentStyle(fragment: FloatingImageViewportFragment): CSSProperties {
  return {
    left: `${fragment.rect.x - fragment.clippedRect.x}px`,
    top: `${fragment.rect.y - fragment.clippedRect.y}px`,
    width: `${fragment.rect.width}px`,
    height: `${fragment.rect.height}px`,
  };
}
function viewportPoint(event: { clientX: number; clientY: number }): {
  x: number;
  y: number;
} {
  const bounds = layerElement.value?.getBoundingClientRect();
  return {
    x: (event.clientX - (bounds?.left ?? 0)) / props.scale,
    y: (event.clientY - (bounds?.top ?? 0)) / props.scale,
  };
}
function hits(fragment: DrawingFragment, event: MouseEvent): boolean {
  if (!passIsCurrent(fragment.renderPass)) return false;
  const composed = groupPaintEntry(fragment.drawing);
  if (composed) {
    const result = groupPresentations.get(composed.source.id);
    if (
      !result ||
      result.sourceRoot !== composed.displayed ||
      result.renderPass !== composed.renderPass ||
      !passIsCurrent(composed.renderPass)
    )
      return false;
    const displayedLeaf = composed.renderPass?.getLeaf(fragment.drawing.id);
    const rect =
      displayedLeaf?.connector?.status === "ready"
        ? displayedLeaf.connector.route.paintLayout.rect
        : (displayedLeaf?.carrierLeaf?.layout?.rect ?? resolvedOwner(fragment.drawing)?.rect);
    const translation = {
      x: fragment.rect.x - (rect?.x ?? fragment.rect.x),
      y: fragment.rect.y - (rect?.y ?? fragment.rect.y),
    };
    const frame = {
      ...result.layout.rect,
      x: result.layout.rect.x + translation.x,
      y: result.layout.rect.y + translation.y,
    };
    const hit = hitShapeGroupPaint(
      result,
      standardShapeWorldToLocal(frame, composed.displayed.rotation, viewportPoint(event)),
    );
    return hit?.kind === "leaf" && hit.path.at(-1) === fragment.drawing.id;
  }
  if (!fragment.standard) return true;
  if (!isStandard(fragment.drawing)) return false;
  const shape = drawingGeometry(fragment.drawing);
  if (!shape) return event.target instanceof Element && !!event.target.closest('[role="status"]');
  if (
    hasContinuousView(fragment.drawing) &&
    !fragment.drawing.shapeText &&
    !fragment.drawing.shapeStyle &&
    event.target instanceof Element &&
    event.target.closest(".drawing-content__text")
  )
    return true;
  if (fragment.drawing.shapeStyle || fragment.drawing.shapeText) {
    if (
      event.target instanceof Element &&
      event.target.closest('[role="status"], [data-standard-shape-text]')
    )
      return true;
    const glyphOrDetailedHit = detailedShapeContainsWorldPoint(
      fragment.renderPass?.getLeaf(fragment.drawing.id)?.paintView ?? fragment.drawing,
      fragment.rect,
      viewportPoint(event),
      detailedPresentations.get(`${fragment.drawing.id}:${fragment.pageKey ?? fragment.paneId}`),
    );
    if (fragment.drawing.shapeStyle || glyphOrDetailedHit) return glyphOrDetailedHit;
    // A text model does not replace the unformatted body's real SVG geometry.
    // The independent glyph alpha adds hit coverage, including visible overflow.
  }
  return shapeDrawingContainsWorldPoint(
    fragment.drawing,
    shape,
    fragment.rect,
    viewportPoint(event),
    fragment.connectorRoute,
  );
}
const connectorSites = shallowRef<readonly ShapeConnectorSiteCandidate[]>([]);
const connectorSitePorts = computed(() => {
  const m = metrics.value;
  if (!m) return [];
  return connectorSites.value.flatMap((site) => {
    if (!visibleNodeIds.value.has(site.targetId)) return [];
    if (props.pageProjection) {
      const projected = projectShapePointToViewport(
        site.position,
        props.layout,
        props.pageProjection,
        m,
      );
      return projected
        ? [
            {
              site,
              point: projected.point,
              key: `${site.targetId}:${site.siteIndex}:${projected.pageKey}`,
            },
          ]
        : [];
    }
    return (Object.keys(props.layout.panes) as DrawingFragment["paneId"][]).flatMap((paneId) => {
      const translation = getPicturePaneTranslation(paneId, props.layout);
      const point = { x: site.position.x + translation.x, y: site.position.y + translation.y };
      const clip = props.layout.panes[paneId].clip;
      return point.x >= clip.x &&
        point.x < clip.x + clip.width &&
        point.y >= clip.y &&
        point.y < clip.y + clip.height
        ? [{ site, point, key: `${site.targetId}:${site.siteIndex}:${paneId}` }]
        : [];
    });
  });
});
const unavailableConnectors = computed(
  () =>
    displayedRenderPass.value?.leaves.flatMap((leaf) =>
      visibleNodeIds.value.has(leaf.sourceNode.id) &&
      leaf.connector &&
      leaf.connector.status !== "ready"
        ? [
            {
              id: leaf.sourceNode.id,
              status: leaf.connector.status,
              reason: leaf.connector.status === "unavailable" ? leaf.connector.reason : undefined,
            },
          ]
        : [],
    ) ?? [],
);
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
      pass.assertCurrent(props.drawings, metrics.value!, props.revision ?? 0);
      return (
        gestureValid() &&
        key === selectionKey.value &&
        renderPass.value === pass &&
        canChange(drawing) &&
        !selectionDisabled.value &&
        !!root &&
        props.drawings.find((item) => item.id === root.id) === root
      );
    } catch {
      return false;
    }
  };
  if (!valid() || !props.applyCollection) return false;
  try {
    resolveShapeForestForRender({ drawings: next, metrics: pass.metrics, revision: pass.revision });
    const accepted =
      props.applyCollection(next, [...pass.sourceForest], pass.metrics, valid) === true;
    selectionFailure.value = !accepted;
    return accepted;
  } catch {
    selectionFailure.value = true;
    return false;
  }
}
function startConnectorGesture(
  fragment: DrawingFragment,
  event: PointerEvent,
  mode: "move" | "endpoint" | "adjust",
  index?: number,
): void {
  const drawing = fragment.drawing;
  const pass = renderPass.value;
  const source = connectorEditSource(drawing);
  const route = fragment.connectorRoute;
  if (!props.applyCollection) {
    connectorFailure.value = true;
    return;
  }
  if (
    !pass ||
    !source ||
    !route ||
    !props.applyCollection ||
    selectionDisabled.value ||
    !canChange(drawing) ||
    (mode === "endpoint" && index !== 0 && index !== 1) ||
    (mode === "adjust" && (!Number.isSafeInteger(index) || !route.geometry.handles[index!]))
  )
    return;
  const key = selectionKey.value;
  const sheet = props.sheet,
    revision = props.revision,
    viewport = props.layout,
    page = props.pageProjection,
    scale = props.scale;
  const valid = () => {
    try {
      pass.assertCurrent(props.drawings, metrics.value!, props.revision ?? 0);
      return (
        key === selectionKey.value &&
        renderPass.value === pass &&
        canChange(drawing) &&
        !selectionDisabled.value &&
        props.sheet === sheet &&
        props.revision === revision &&
        props.layout === viewport &&
        props.pageProjection === page &&
        props.scale === scale &&
        legacyDrawings.value.includes(drawing)
      );
    } catch {
      return false;
    }
  };
  const translation = getPicturePaneTranslation(fragment.paneId, viewport);
  const sample = (point: MouseEvent) =>
    page
      ? shapePagePointFromViewport(viewportPoint(point), viewport, page, pass.metrics)?.point
      : { x: viewportPoint(point).x - translation.x, y: viewportPoint(point).y - translation.y };
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
      session?.cancel();
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
      setRootsPreview(planned);
      selectionFailure.value = false;
    } catch {
      planned = undefined;
      rootsPreview.value = undefined;
      connectorSites.value = [];
      selectionFailure.value = true;
    }
  };
  session = startPointerSession({
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
  });
}
function start(
  fragment: DrawingFragment,
  event: PointerEvent,
  direction?: FloatingImageResizeDirection,
  mode: "move" | "rotate" | "adjust" | "text-warp-adjust" | "endpoint" | "point" = "move",
  index?: number,
  freePoint?: FreeShapePointDescriptor,
): void {
  if (
    props.equationEditSnapshot &&
    props.equationEditCallbacks?.isActive() &&
    !props.equationEditCallbacks.commit()
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (props.textEditSnapshot && !finishCanvasText()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const drawing = fragment.drawing;
  const owner = legacyDrawings.value.find((item) => item.id === drawing.id);
  if (!owner || owner !== drawing || (mode === "point" && pointEditingId.value !== drawing.id))
    return;
  if (event.button !== 0) return;
  if (!direction && mode === "move" && !hits(fragment, event)) {
    emit("backgroundPointer", event);
    return;
  }
  const maySelectMember =
    !!resolvedOwner(drawing)?.groupLeaf &&
    selectedRoots.value.length === 1 &&
    selectedRoots.value[0] === sourceOwner(drawing)?.id &&
    !selectedOwnedId.value;
  event.preventDefault();
  event.stopPropagation();
  if (!direction && mode === "move" && !chooseDrawing(drawing, event)) {
    emit("select");
    return;
  }
  emit("select");
  (event.currentTarget as HTMLElement)?.focus?.();
  if (!canChange(drawing)) return;
  const connector = projectionById(drawing)?.renderLeaf?.connector;
  if (connector && (direction || !["move", "endpoint", "adjust"].includes(mode))) {
    connectorFailure.value = true;
    return;
  }
  if (
    connector &&
    selectedRoots.value.length === 1 &&
    (!projectionById(drawing)?.groupLeaf || selectedOwnedId.value === drawing.id)
  ) {
    startConnectorGesture(fragment, event, mode as "move" | "endpoint" | "adjust", index);
    return;
  }
  if (
    (selectedRoots.value.length > 1 ||
      (projectionById(drawing)?.groupLeaf && !selectedOwnedId.value)) &&
    (mode === "move" || mode === "rotate")
  ) {
    startRootGesture(
      projectionById(drawing)!.source.id,
      fragment,
      event,
      direction,
      mode,
      maySelectMember && !direction && mode === "move"
        ? () => {
            selectedOwnedId.value = drawing.id;
          }
        : undefined,
    );

    return;
  }
  const gestureKey = selectionKey.value;
  const pass = renderPass.value;
  const current = () => {
    try {
      pass?.assertCurrent(props.drawings, metrics.value!, props.revision ?? 0);
      return true;
    } catch {
      return false;
    }
  };
  const sheet = props.sheet,
    revision = props.revision,
    layout = props.layout,
    currentLayout = viewLayout(drawing),
    currentMetrics = metrics.value,
    currentProjection = props.pageProjection,
    projection = fragment.pageKey ? currentProjection : undefined,
    scale = props.scale;
  const valid = () =>
    gestureKey === selectionKey.value &&
    canChange(drawing) &&
    (mode !== "point" || pointEditingId.value === drawing.id) &&
    props.sheet === sheet &&
    props.revision === revision &&
    props.layout === layout &&
    props.pageProjection === currentProjection &&
    metrics.value === currentMetrics &&
    props.scale === scale &&
    current() &&
    legacyDrawings.value.find((item) => item.id === drawing.id) === owner;
  const gesturePoint = (next: MouseEvent) =>
    projection
      ? shapePagePointFromViewport(viewportPoint(next), layout, projection, currentMetrics!)?.point
      : viewportPoint(next);
  const origin = gesturePoint(event);
  const referenceRect = projection
    ? getFloatingImageSheetRect(drawing, currentLayout)
    : fragment.rect;
  if (!origin || !referenceRect) return;
  const center = {
    x: referenceRect.x + drawing.width / 2,
    y: referenceRect.y + drawing.height / 2,
  };
  const endpoint =
    isStandard(drawing) && mode === "endpoint" && (index === 0 || index === 1)
      ? getShapeLineLocalEndpoints(drawing)?.[index]
      : undefined;
  const freePosition =
    isStandard(drawing) && mode === "point" && freePoint
      ? listFreeShapePoints(drawing).find(
          (p) => p.commandIndex === freePoint.commandIndex && p.role === freePoint.role,
        )?.position
      : undefined;
  const freeOrigin =
    freePosition && isStandard(drawing)
      ? pictureFrameLocalToWorld(
          referenceRect,
          drawing.rotation,
          standardShapeFlipPoint(drawing, freePosition),
        )
      : undefined;
  const endpointOrigin =
    endpoint && isStandard(drawing)
      ? pictureFrameLocalToWorld(
          referenceRect,
          drawing.rotation,
          standardShapeFlipPoint(drawing, endpoint),
        )
      : undefined;
  const paneTranslation = projection
    ? { x: 0, y: 0 }
    : getPicturePaneTranslation(fragment.paneId, layout);
  const initialAngle = Math.atan2(origin.y - center.y, origin.x - center.x);
  const update = (point: PointerEvent | MouseEvent) => {
    if (!valid()) {
      session?.cancel();
      return;
    }
    const target = gesturePoint(point);
    if (!target) {
      preview.value = undefined;
      return;
    }
    const delta = { x: target.x - origin.x, y: target.y - origin.y };
    let nextView: SheetDrawing | undefined;
    if (isStandard(drawing) && mode === "rotate") {
      let rotation =
        drawing.rotation +
        ((Math.atan2(target.y - center.y, target.x - center.x) - initialAngle) * 180) / Math.PI;
      if (point.shiftKey) rotation = Math.round(rotation / 15) * 15;
      rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
      nextView = { ...drawing, rotation };
    } else if (
      isStandard(drawing) &&
      mode === "endpoint" &&
      endpointOrigin &&
      (index === 0 || index === 1)
    ) {
      nextView = moveStandardShapeEndpoint(
        drawing,
        index,
        {
          x: endpointOrigin.x + delta.x - paneTranslation.x,
          y: endpointOrigin.y + delta.y - paneTranslation.y,
        },
        currentLayout,
        point.shiftKey,
        pointEditOptions(drawing),
      );
    } else if (isStandard(drawing) && mode === "point" && freePoint && freeOrigin) {
      nextView = moveFreeShapePoint(
        drawing,
        freePoint,
        {
          x: freeOrigin.x + delta.x - paneTranslation.x,
          y: freeOrigin.y + delta.y - paneTranslation.y,
        },
        currentLayout,
        pointEditOptions(drawing),
      );
    } else if (isStandard(drawing) && mode === "text-warp-adjust" && index !== undefined) {
      nextView = moveDrawingShapeTextWarpAdjustment(
        drawing,
        index,
        standardShapeWorldToLocal(referenceRect, drawing.rotation, target),
      );
    } else if (isStandard(drawing) && mode === "adjust" && index !== undefined) {
      const local = standardShapeFlipPoint(
        drawing,
        standardShapeWorldToLocal(referenceRect, drawing.rotation, target),
      );
      const geometry = moveStandardShapeAdjustment(
        drawing.shapeGeometry!,
        drawing.width,
        drawing.height,
        index,
        local,
      );
      nextView = geometry ? { ...drawing, shapeGeometry: geometry } : undefined;
    } else
      nextView = direction
        ? (resizeView(drawing, direction, delta, point.shiftKey) ?? undefined)
        : (moveView(drawing, delta) ?? undefined);
    setViewPreview(nextView);
  };
  session = startPointerSession({
    event,
    // A page fragment may disappear during preview; capture belongs to the stable layer.
    captureTarget: projection ? layerElement.value : (event.currentTarget as HTMLElement),
    onMove: update,
    onEnd: (point) => {
      update(point);
      const next = preview.value;
      preview.value = undefined;
      if (valid() && next) commitUpdate(next, owner);
    },
    onCancel: () => {
      preview.value = undefined;
    },
  });
}
function edit(fragment: DrawingFragment, event: MouseEvent): void {
  if (legacyDrawings.value.find((item) => item.id === fragment.drawing.id) !== fragment.drawing)
    return;
  if (
    (!canChange(fragment.drawing) && fragment.drawing.kind !== "attachment") ||
    !hits(fragment, event)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (projectionById(fragment.drawing)?.renderLeaf?.connector) {
    formatConnector(fragment.drawing);
    return;
  }
  if (isStandard(fragment.drawing) && fragment.drawing.shapePath) {
    selectRoots(
      [sourceOwner(fragment.drawing)!.id],
      resolvedOwner(fragment.drawing)?.groupLeaf ? fragment.drawing.id : null,
    );
    pointEditingId.value = fragment.drawing.id;
    activeVertex.value = 0;
    emit("select");
  } else {
    if (beginCanvasText(fragment.drawing, "end")) return;
    const source = sourceOwner(fragment.drawing);
    const owned = resolvedOwner(fragment.drawing)?.groupLeaf;
    if (owned) emit("editOwned", owned.sourceRoot, owned.path);
    else if (source) emit("edit", source);
  }
}
function pointContext(fragment: DrawingFragment, event: MouseEvent): void {
  if (
    !isStandard(fragment.drawing) ||
    !fragment.drawing.shapePath ||
    !canChange(fragment.drawing) ||
    legacyDrawings.value.find((item) => item.id === fragment.drawing.id) !== fragment.drawing ||
    !hits(fragment, event)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  selectRoots(
    [sourceOwner(fragment.drawing)!.id],
    resolvedOwner(fragment.drawing)?.groupLeaf ? fragment.drawing.id : null,
  );
  pointEditingId.value = fragment.drawing.id;
  activeVertex.value = 0;
  emit("select");
}
const shapeTextMenu = shallowRef<{
  key: string;
  canText: boolean;
  kind: "shape" | "textBox" | "shapeGroup";
  canObject: boolean;
  actions: {
    object: () => boolean;
    text: () => boolean;
    format: () => boolean;
    points?: () => boolean;
    copy?: () => boolean;
    cut?: () => boolean;
    paste?: () => boolean;
    reference?: () => boolean;
  };
}>();
const shapeTextMenuAnchor = shallowRef<FloatingReference | null>(null);
const shapeTextMenuSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const { floatingStyles: shapeTextMenuStyles, dismiss: dismissShapeTextMenu } = useContextMenu({
  anchor: shapeTextMenuAnchor,
  panelRef: computed(() => shapeTextMenuSurface.value?.rootElement ?? null),
  surfaceRef: shapeTextMenuSurface,
  open: computed(() => !!shapeTextMenu.value),
  onDismiss: () => {
    shapeTextMenu.value = undefined;
  },
});
function clipboardMenuActions(paths: readonly ShapeGroupPath[], valid: () => boolean) {
  const copy = props.copyObjects,
    cut = props.cutObjects,
    paste = props.pasteObjects;
  const captured = paths.map((path) => [...path]);
  const run = (callback: (() => boolean) | undefined): boolean => {
    if (!valid() || !callback || !finishCanvasText() || !valid()) return false;
    const accepted = callback();
    if (accepted) dismissShapeTextMenu("programmatic", false);
    else selectionFailure.value = true;
    return accepted;
  };
  return {
    ...(copy ? { copy: () => copy === props.copyObjects && run(() => copy(captured)) } : {}),
    ...(cut ? { cut: () => cut === props.cutObjects && run(() => cut(captured)) } : {}),
    ...(paste
      ? {
          paste: () => paste === props.pasteObjects && props.canPasteObjects === true && run(paste),
        }
      : {}),
  };
}
function groupClipboardContext(
  root: ShapeGroupDrawing,
  path: ShapeGroupPath,
  event: MouseEvent,
): void {
  if (
    !props.drawings.includes(root) ||
    !props.sheet ||
    !canEditShapeObject(props.sheet, root) ||
    props.readOnly
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  selectRoots([root.id], path.length > 1 ? path.at(-1)! : null);
  const key = selectionKey.value,
    m = metrics.value,
    rev = props.revision;
  const menu: NonNullable<typeof shapeTextMenu.value> = {
    key,
    kind: "shapeGroup",
    canObject: false,
    canText: false,
    actions: {
      object: () => false,
      text: () => false,
      format: () => {
        if (!valid()) return false;
        formatGroup(root, path);
        dismissShapeTextMenu("programmatic", false);
        return true;
      },
      ...clipboardMenuActions([path], valid),
    },
  };
  function valid(): boolean {
    return (
      shapeTextMenu.value === menu &&
      key === selectionKey.value &&
      metrics.value === m &&
      props.revision === rev &&
      props.drawings.includes(root) &&
      !props.readOnly &&
      !!props.sheet &&
      canEditShapeObject(props.sheet, root)
    );
  }
  shapeTextMenuAnchor.value = createContextMenuPoint(event, event.currentTarget as Element | null);
  shapeTextMenu.value = menu;
}
function shapeContext(fragment: DrawingFragment, event: MouseEvent | KeyboardEvent): void {
  const drawing = fragment.drawing;
  if (!props.startTextEdit) {
    if (event instanceof MouseEvent) pointContext(fragment, event);
    return;
  }
  if (
    (drawing.kind !== "shape" && drawing.kind !== "textBox") ||
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing ||
    (event instanceof MouseEvent && !hits(fragment, event))
  )
    return;
  const source = sourceOwner(drawing),
    owned = resolvedOwner(drawing)?.groupLeaf;
  if (!source) return;
  event.preventDefault();
  event.stopPropagation();
  if (
    !selectedRoots.value.includes(source.id) ||
    (selectedOwnedId.value && selectedOwnedId.value !== drawing.id)
  )
    selectRoots([source.id], owned ? drawing.id : null);
  const capturedPaths = objectSelectionPaths();
  const key = selectionKey.value,
    m = metrics.value,
    rev = props.revision;
  const textRect = getDrawingShapeTextRect(drawing);
  const menu: NonNullable<typeof shapeTextMenu.value> = {
    key,
    kind: drawing.kind,
    canObject: !projectionById(drawing)?.renderLeaf?.connector,
    canText:
      !projectionById(drawing)?.renderLeaf?.connector &&
      !(drawing.kind === "textBox" && drawing.textReference) &&
      !!textRect &&
      textRect.width > 0 &&
      textRect.height > 0,
    actions: {
      ...clipboardMenuActions(capturedPaths, valid),
      object: () => {
        if (!valid() || !menu.canObject || !finishCanvasText() || !valid()) return false;
        if (owned) emit("editOwned", owned.sourceRoot, owned.path);
        else emit("edit", source);
        dismissShapeTextMenu("programmatic", false);
        return true;
      },
      text: () => {
        if (!valid() || !beginCanvasText(drawing, "all")) return false;
        dismissShapeTextMenu("programmatic", false);
        return true;
      },
      format: () => {
        if (!valid()) return false;
        if (projectionById(drawing)?.renderLeaf?.connector) {
          if (!formatConnector(drawing)) return false;
        } else if (owned) emit("formatGroup", owned.sourceRoot, owned.path);
        else if (source.kind === "shape" || source.kind === "textBox") emit("format", source);
        else return false;
        dismissShapeTextMenu("programmatic", false);
        return true;
      },
      ...(drawing.kind === "textBox" && props.openTextBoxReference
        ? {
            reference: () => {
              if (!valid() || !finishCanvasText() || !valid()) return false;
              const opened = props.openTextBoxReference?.(source, owned?.path) === true;
              if (opened) dismissShapeTextMenu("programmatic", false);
              return opened;
            },
          }
        : {}),
      ...(drawing.kind === "shape" && drawing.shapePath
        ? {
            points: () => {
              if (!valid()) return false;
              pointEditingId.value = drawing.id;
              activeVertex.value = 0;
              dismissShapeTextMenu("programmatic", false);
              emit("select");
              return true;
            },
          }
        : {}),
    },
  };
  function valid() {
    return (
      shapeTextMenu.value === menu &&
      key === selectionKey.value &&
      metrics.value === m &&
      props.revision === rev &&
      canChange(drawing) &&
      legacyDrawings.value.includes(drawing) &&
      sourceOwner(drawing) === source
    );
  }
  shapeTextMenuAnchor.value =
    event instanceof MouseEvent
      ? createContextMenuPoint(event, event.currentTarget as Element | null)
      : event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : null;
  shapeTextMenu.value = menu;
}
watch(
  () => [props.drawings, props.sheet, props.revision, metrics.value, props.readOnly],
  () => {
    shapeTextMenu.value = undefined;
  },
);
watch(selectionKey, (key) => {
  if (shapeTextMenu.value?.key !== key) shapeTextMenu.value = undefined;
});
function nudgeFreePoint(
  drawing: SheetGraphicDrawing,
  point: FreeShapePointDescriptor,
  delta: { x: number; y: number },
): void {
  if (
    pointEditingId.value !== drawing.id ||
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
  )
    return;
  const position = listFreeShapePoints(drawing).find(
      (p) => p.commandIndex === point.commandIndex && p.role === point.role,
    )?.position,
    rect = getFloatingImageSheetRect(drawing, viewLayout(drawing));
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
    viewLayout(drawing),
    pointEditOptions(drawing),
  );
  if (next) commitUpdate(next, drawing);
}
const pointHandlers = new WeakMap<
  SheetGraphicDrawing,
  { key: string; handler: (action: PointAction, index: number) => boolean }
>();
function pointHandler(drawing: SheetGraphicDrawing) {
  const key = selectionKey.value;
  let entry = pointHandlers.get(drawing);
  if (!entry || entry.key !== key) {
    entry = {
      key,
      handler: (action, index) =>
        key === selectionKey.value &&
        isSelectedView(drawing) &&
        pointAction(drawing, action, index),
    };
    pointHandlers.set(drawing, entry);
  }
  return entry.handler;
}
function selectFreeVertex(drawing: SheetGraphicDrawing, index: number): void {
  if (
    !canChange(drawing) ||
    pointEditingId.value !== drawing.id ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing ||
    !listFreeShapePoints(drawing).some((p) => p.role === "vertex" && p.commandIndex === index)
  )
    return;
  activeVertex.value = index;
}
function pointAction(drawing: SheetGraphicDrawing, action: PointAction, index: number): boolean {
  if (
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing ||
    pointEditingId.value !== drawing.id
  )
    return false;
  if (action === "exit") {
    pointEditingId.value = null;
    pointRejected.value = false;
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
      viewLayout(drawing),
      pointEditOptions(drawing),
    );
  else if (action === "delete-segment") next = deleteClosedFreeShapeSegment(drawing, index);
  else if (action === "add-segment")
    next = addFreeShapePoint(drawing, index, viewLayout(drawing), 0.5, pointEditOptions(drawing));
  else if (action === "add") {
    const segment = drawing.shapePath!.commands[index + 1] ? index + 1 : undefined;
    if (segment !== undefined)
      next = addFreeShapePoint(
        drawing,
        segment,
        viewLayout(drawing),
        0.5,
        pointEditOptions(drawing),
      );
  } else if (action === "delete")
    next = deleteFreeShapePoint(drawing, index, viewLayout(drawing), pointEditOptions(drawing));
  else if (action === "close" || action === "open")
    next = toggleClosedFreeShape(
      drawing,
      action === "close",
      viewLayout(drawing),
      index,
      pointEditOptions(drawing),
    );
  else
    next = setFreeShapePointType(
      drawing,
      index,
      action,
      viewLayout(drawing),
      pointEditOptions(drawing),
    );
  if (!next || !drawingGeometry(next)) return false;
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
  if (!commitUpdate(next, drawing)) return false;
  activeVertex.value = nextVertices[nextIndex]?.commandIndex ?? 0;
  return true;
}
function nudgeAdjustment(
  drawing: SheetGraphicDrawing,
  index: number,
  delta: { x: number; y: number },
): void {
  if (
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
  )
    return;
  const shape = drawingGeometry(drawing);
  const position = shape?.handles[index]?.position;
  const source = connectorEditSource(drawing),
    pass = renderPass.value,
    route = connectorRoute(drawing);
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
      commitConnectorPlan(pass, drawing, next, selectionKey.value);
    } catch {
      selectionFailure.value = true;
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
  if (geometry) commitUpdate({ ...drawing, shapeGeometry: geometry }, drawing);
}
function nudgeWarpAdjustment(
  drawing: SheetGraphicDrawing,
  index: number,
  delta: { x: number; y: number },
): void {
  if (
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
  )
    return;
  const angle = (drawing.rotation * Math.PI) / 180;
  const localDelta = {
    x: Math.cos(angle) * delta.x + Math.sin(angle) * delta.y,
    y: -Math.sin(angle) * delta.x + Math.cos(angle) * delta.y,
  };
  const next = nudgeDrawingShapeTextWarpAdjustment(drawing, index, localDelta);
  if (next) commitUpdate(next, drawing);
}
function nudgeEndpoint(
  drawing: SheetGraphicDrawing,
  index: 0 | 1,
  delta: { x: number; y: number },
): void {
  if (
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
  )
    return;
  const source = connectorEditSource(drawing);
  const pass = renderPass.value;
  if (source && pass) {
    if (!props.applyCollection) {
      connectorFailure.value = true;
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
      commitConnectorPlan(pass, drawing, next, selectionKey.value);
    } catch {
      selectionFailure.value = true;
    }
    return;
  }
  const position = getShapeLineLocalEndpoints(drawing)?.[index];
  const rect = getFloatingImageSheetRect(drawing, viewLayout(drawing));
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
    viewLayout(drawing),
    false,
    pointEditOptions(drawing),
  );
  if (next) commitUpdate(next, drawing);
}
function nudgeRotation(drawing: SheetGraphicDrawing, degrees: number): void {
  if (
    !canChange(drawing) ||
    legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing
  )
    return;
  const rotation = ((((drawing.rotation + degrees + 180) % 360) + 360) % 360) - 180;
  if (
    selectedRoots.value.length > 1 ||
    (resolvedOwner(drawing)?.groupLeaf && !selectedOwnedId.value)
  )
    runSelectionPlan(() => rotateRootSelection(degrees));
  else commitUpdate({ ...drawing, rotation }, drawing);
}
function keydown(drawing: SheetDrawing, event: KeyboardEvent) {
  if (legacyDrawings.value.find((item) => item.id === drawing.id) !== drawing) return;
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
    return;
  const keyboardOwner = sourceOwner(drawing);
  if (keyboardOwner && !selectedRoots.value.includes(keyboardOwner.id))
    selectRoots([keyboardOwner.id], resolvedOwner(drawing)?.groupLeaf ? drawing.id : null);
  else if (
    resolvedOwner(drawing)?.groupLeaf &&
    selectedRoots.value.length === 1 &&
    selectedOwnedId.value &&
    selectedOwnedId.value !== drawing.id
  )
    selectedOwnedId.value = drawing.id;
  if (event.key === "Escape") {
    if (pointEditingId.value === drawing.id) {
      pointEditingId.value = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selectedOwnedId.value) selectedOwnedId.value = null;
    else selectRoots([]);
    event.stopPropagation();
    return;
  }
  if (drawing.kind === "attachment" && (event.key === "Enter" || event.key === "F2")) {
    event.preventDefault();
    event.stopPropagation();
    const source = sourceOwner(drawing);
    if (source) emit("edit", source);
    return;
  }
  if (!canChange(drawing)) return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    const fragment = fragments.value.find((f) => f.drawing === drawing);
    if (fragment) shapeContext(fragment, event);
    return;
  }
  if (event.key === "Process" || event.keyCode === 229 || Array.from(event.key).length === 1) {
    if (
      beginCanvasText(
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
      metrics.value &&
      props.applyCollection &&
      (selectedRoots.value.length > 1 || resolvedOwner(drawing)?.groupLeaf)
    )
      deleteSelected();
    else emit("delete", drawing.id);
    return;
  }
  if (event.key === "Enter" || event.key === "F2") {
    event.preventDefault();
    event.stopPropagation();
    if (projectionById(drawing)?.renderLeaf?.connector) {
      formatConnector(drawing);
      return;
    }
    if (beginCanvasText(drawing, "all")) return;
    const source = sourceOwner(drawing),
      owned = resolvedOwner(drawing)?.groupLeaf;
    if (owned && selectedOwnedId.value === drawing.id)
      emit("editOwned", owned.sourceRoot, owned.path);
    else if (source && source.kind !== "shapeGroup") emit("edit", source);
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
    const source = connectorEditSource(drawing);
    const pass = renderPass.value;
    if (
      source &&
      pass &&
      selectedRoots.value.length === 1 &&
      (!projectionById(drawing)?.groupLeaf || selectedOwnedId.value === drawing.id)
    ) {
      if (!props.applyCollection) {
        connectorFailure.value = true;
        return;
      }
      try {
        const next = planShapeConnectorBodyTranslation(
          pass.sourceForest,
          source,
          delta,
          pass.metrics,
        );
        commitConnectorPlan(pass, drawing, next, selectionKey.value);
      } catch {
        selectionFailure.value = true;
      }
      return;
    }
    if (
      metrics.value &&
      props.applyCollection &&
      (selectedRoots.value.length > 1 ||
        (resolvedOwner(drawing)?.groupLeaf && !selectedOwnedId.value))
    ) {
      if (selectedRoots.value.some((id) => renderPass.value?.getLeaf(id)?.connector)) {
        connectorFailure.value = true;
        return;
      }
      runSelectionPlan(() =>
        moveSelectedShapeRoots(props.drawings, selectedRoots.value, delta, metrics.value!),
      );
      return;
    }
    const moved = moveView(drawing, {
      x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
    });
    if (moved) commitUpdate(moved, drawing);
  }
}
function freeSelectionHandlers(fragment: DrawingFragment) {
  const key = selectionKey.value,
    drawing = fragment.drawing;
  const valid = () =>
    key === selectionKey.value &&
    isSelectedView(drawing) &&
    pointEditingId.value === drawing.id &&
    legacyDrawings.value.includes(drawing) &&
    isStandard(drawing);
  return {
    selectVertex: (index: number) => {
      if (valid() && isStandard(drawing)) selectFreeVertex(drawing, index);
    },
    move: (point: FreeShapePointDescriptor, event: PointerEvent) => {
      if (valid()) start(fragment, event, undefined, "point", undefined, point);
    },
    nudge: (point: FreeShapePointDescriptor, delta: { x: number; y: number }) => {
      if (valid() && isStandard(drawing)) nudgeFreePoint(drawing, point, delta);
    },
  };
}
function standardSelectionHandlers(fragment: DrawingFragment) {
  const key = selectionKey.value,
    drawing = fragment.drawing;
  const valid = () =>
    key === selectionKey.value &&
    isSelectedView(drawing) &&
    legacyDrawings.value.includes(drawing) &&
    isStandard(drawing);
  return {
    resize: (direction: FloatingImageResizeDirection, event: PointerEvent) => {
      if (valid()) start(fragment, event, direction);
    },
    rotate: (event: PointerEvent) => {
      if (valid()) start(fragment, event, undefined, "rotate");
    },
    endpoint: (index: 0 | 1, event: PointerEvent) => {
      if (valid()) start(fragment, event, undefined, "endpoint", index);
    },
    nudgeEndpoint: (index: 0 | 1, delta: { x: number; y: number }) => {
      if (valid() && isStandard(drawing)) nudgeEndpoint(drawing, index, delta);
    },
    adjust: (index: number, event: PointerEvent) => {
      if (valid()) start(fragment, event, undefined, "adjust", index);
    },
    nudgeAdjustment: (index: number, delta: { x: number; y: number }) => {
      if (valid() && isStandard(drawing)) nudgeAdjustment(drawing, index, delta);
    },
    warpAdjust: (index: number, event: PointerEvent) => {
      if (valid()) start(fragment, event, undefined, "text-warp-adjust", index);
    },
    nudgeWarpAdjustment: (index: number, delta: { x: number; y: number }) => {
      if (valid() && isStandard(drawing)) nudgeWarpAdjustment(drawing, index, delta);
    },
    nudgeRotation: (degrees: number) => {
      if (valid() && isStandard(drawing)) nudgeRotation(drawing, degrees);
    },
  };
}
function clearOutside(event: PointerEvent) {
  if (
    event.target instanceof Element &&
    !event.target.closest("[data-sheet-drawing-id]") &&
    !event.target.closest(
      '[role="dialog"],[role="menu"],[role="listbox"],[data-chart-tools-toolbar],.chart-element-options-popup,[data-shape-format-pane],[data-shape-format-trigger],[data-shape-selection-toolbar],[data-shape-selection-reference-menu],[data-shape-group-selection],[data-shape-canvas-text-editor],[data-shape-canvas-text-toolbar],[data-shape-tools-toolbar],[data-shape-selection-pane]',
    )
  ) {
    selectRoots([]);
  }
}
onMounted(() => document.addEventListener("pointerdown", clearOutside));
onBeforeUnmount(() => {
  detailedPresentations.clear();
  groupPresentations.clear();
  session?.cancel();
  document.removeEventListener("pointerdown", clearOutside);
});
watch(pointEditingId, () => {
  session?.cancel();
  preview.value = undefined;
  pointRejected.value = false;
});
watch(
  () => props.readOnly,
  (value) => {
    if (value) {
      session?.cancel();
      pointEditingId.value = null;
    }
  },
);
watch(
  () => [
    props.sheet,
    props.revision,
    props.layout,
    props.scale,
    props.pageProjection,
    metrics.value,
  ],
  () => {
    session?.cancel();
    preview.value = undefined;
  },
);
watch(
  () => props.sheet,
  () => {
    pointEditingId.value = null;
  },
);
watch(
  () => legacyDrawings.value,
  () => {
    session?.cancel();
    preview.value = undefined;
    const editing = legacyDrawings.value.find((drawing) => drawing.id === pointEditingId.value);
    if (editing?.kind !== "shape" || !editing.shapePath) pointEditingId.value = null;
    else if (
      !listFreeShapePoints(editing).some(
        (p) => p.role === "vertex" && p.commandIndex === activeVertex.value,
      )
    )
      activeVertex.value = 0;
    const surviving = selectedRoots.value.filter((id) => props.drawings.some((d) => d.id === id));
    if (surviving.length !== selectedRoots.value.length) selectRoots(surviving, null, false);
    if (
      selectedOwnedId.value &&
      (renderUnavailable.value ||
        (!legacyDrawings.value.some((d) => d.id === selectedOwnedId.value) &&
          !props.drawings.some(
            (d) =>
              isShapeGroupDrawing(d) &&
              metrics.value &&
              groupProjection(d, metrics.value).owners.some(
                (o) => o.sourceNode.id === selectedOwnedId.value,
              ),
          )))
    )
      selectedOwnedId.value = null;
  },
);
</script>
<template>
  <div ref="layerElement" class="sheet-drawing-layer">
    <div
      v-if="renderUnavailable"
      role="status"
      class="sheet-drawing-layer__connector-status"
      data-shape-connector-layout-unavailable
    >
      {{
        locale === "zh-CN"
          ? "当前连接布局超出安全绘制范围，形状暂未显示。数据已保留，请撤销尺寸或可见性变化。"
          : "This connected layout cannot be rendered safely. Shapes are temporarily hidden and all data is preserved. Undo the size or visibility change."
      }}
    </div>
    <div
      v-if="connectorFailure"
      role="status"
      class="sheet-drawing-layer__point-feedback"
      data-shape-connector-operation-unavailable
    >
      {{
        locale === "zh-CN"
          ? "此连接线操作暂不可用。请使用端点、路线调整柄或格式窗格；连接关系已保留。"
          : "This connector operation is unavailable. Use endpoints, route handles or the format pane. Connections are preserved."
      }}
    </div>
    <div
      v-for="connector in unavailableConnectors"
      :key="`connector-status-${connector.id}`"
      role="status"
      class="sheet-drawing-layer__connector-status"
      :data-shape-connector-status="connector.status"
      :data-shape-connector-id="connector.id"
      :data-shape-connector-unavailable-reason="connector.reason"
    >
      {{
        locale === "zh-CN"
          ? connector.status === "suspended"
            ? "连接线暂停：请展开其对象或目标。"
            : connector.status === "degenerate"
              ? "连接线端点重合，暂无可见线段。"
              : "连接线文字或三维显示暂不可用。原始数据已保留。"
          : connector.status === "suspended"
            ? "Connector suspended. Expand its carrier or target."
            : connector.status === "degenerate"
              ? "Connector endpoints coincide. There is no visible segment."
              : "Connector text or 3D presentation is unavailable. Source data is preserved."
      }}
    </div>
    <span
      v-for="port in connectorSitePorts"
      :key="port.key"
      class="sheet-drawing-layer__connector-port"
      :data-shape-connector-target="port.site.targetId"
      :data-shape-connector-site="port.site.siteIndex"
      :style="{ left: `${port.point.x}px`, top: `${port.point.y}px` }"
      aria-hidden="true"
    />
    <SheetShapeSelectionToolbar
      v-if="toolbarAnchor"
      :anchor="toolbarAnchor"
      :selection-key="selectionKey"
      :count="selectedRoots.length"
      :disabled="selectionDisabled"
      :can-group="
        !!applyCollection && (!sheet?.properties.protected || !!sheet.protection?.editObjects)
      "
      :alignment-reference="alignmentReference"
      :label="t('drawing.selectionShortcuts')"
      :failure="selectionFailure ? t('drawing.collectionRejected') : undefined"
      @align="alignSelected"
      @equalize="equalizeSelected"
      @group="groupSelected"
      @reference="
        (reference, key) => {
          if (key === selectionKey) alignmentReference = reference;
        }
      "
      @dismiss="
        (key) => {
          if (key === selectionKey) selectRoots([]);
        }
      "
    />
    <div
      v-if="selectionFailure && !toolbarAnchor"
      role="status"
      class="sheet-drawing-layer__point-feedback"
      data-shape-collection-rejected
    >
      {{ t("drawing.collectionRejected") }}
    </div>
    <button
      v-if="formatTarget && canChange(formatTarget.drawing)"
      type="button"
      class="sheet-drawing-layer__format"
      :style="formatTriggerStyle"
      data-shape-format-trigger
      :aria-label="locale === 'zh-CN' ? '设置形状格式' : 'Format Shape'"
      :title="locale === 'zh-CN' ? '设置形状格式' : 'Format Shape'"
      @pointerdown.stop
      @click.stop="formatSelected"
    >
      ⋯
    </button>
    <div
      v-if="pointEditingId && pointRejected"
      role="status"
      class="sheet-drawing-layer__point-feedback"
      data-free-shape-update-rejected
    >
      {{
        locale === "zh-CN"
          ? "无法应用此顶点更改，当前路径和撤销记录已保留。"
          : "This point change could not be applied. Your path and undo history are preserved."
      }}
    </div>
    <div
      v-for="fragment in fragments"
      :key="`${fragment.drawing.id}-${fragment.pageKey ?? fragment.paneId}`"
      class="sheet-drawing-layer__object"
      :class="{
        'is-standard': fragment.standard,
        'is-composed-group-leaf': !!groupPaintEntry(fragment.drawing),
      }"
      :data-sheet-drawing-id="fragment.drawing.id"
      :style="[fragmentStyle(fragment), drawingStackStyle(fragment.drawing)]"
      tabindex="0"
      role="group"
      :aria-label="
        (sourceOwner(fragment.drawing) && isFramedShapeDrawing(sourceOwner(fragment.drawing)!)
          ? getShapeObjectProperties(
              (sourceOwner(fragment.drawing) as SheetFramedGraphicDrawing).shapeProperties,
            ).altTitle
          : undefined) || fragment.drawing.name
      "
      :aria-description="
        sourceOwner(fragment.drawing) && isFramedShapeDrawing(sourceOwner(fragment.drawing)!)
          ? getShapeObjectProperties(
              (sourceOwner(fragment.drawing) as SheetFramedGraphicDrawing).shapeProperties,
            ).altDescription
          : undefined
      "
      @pointerdown="start(fragment, $event)"
      @dblclick="edit(fragment, $event)"
      @contextmenu="shapeContext(fragment, $event)"
      @keydown="keydown(fragment.drawing, $event)"
    >
      <div class="sheet-drawing-layer__clip">
        <div class="sheet-drawing-layer__content" :style="contentStyle(fragment)">
          <EquationCanvasEditor
            v-if="
              equationEditSnapshot &&
              equationEditCallbacks &&
              equationEditorFragmentKey ===
                `${fragment.drawing.id}-${fragment.pageKey ?? fragment.paneId}`
            "
            :snapshot="equationEditSnapshot"
            :callbacks="equationEditCallbacks"
            :hide-placeholders="equationPlaceholdersHidden"
            :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          />
          <DrawingContent
            v-else-if="!groupPaintEntry(fragment.drawing)"
            @detailed-paint="acceptDetailedPaint(fragment, $event)"
            @control-change="emit('controlChange', fragment.drawing.id, $event)"
            :drawing="equationPaintView(fragment.drawing)"
            :paint-drawing="displayedRenderPass?.getLeaf(fragment.drawing.id)?.paintView"
            :text-reference-unavailable="
              displayedRenderPass?.getLeaf(fragment.drawing.id)?.textReference?.status ===
              'unavailable'
            "
            :hide-text="hideCanvasText(fragment.drawing)"
            :connector-route="fragment.connectorRoute"
            :legacy-hit-surface="legacyHitSurface(fragment.drawing)"
            :density="rasterDensity"
            :sheet="sheet"
            :evaluator="evaluator"
            :revision="revision"
            :theme="theme"
            :image-asset-urls="imageAssetUrls"
            :locale="locale"
            :date-system="dateSystem"
          />
        </div>
      </div>
      <FreeShapePointSelection
        v-if="
          isSelectedView(fragment.drawing) &&
          pointEditingId === fragment.drawing.id &&
          canChange(fragment.drawing) &&
          isStandard(fragment.drawing) &&
          fragment.drawing.shapePath
        "
        :drawing="fragment.drawing"
        :fragment="fragment"
        :pane-clip="fragment.pageClip ?? layout.panes[fragment.paneId].clip"
        :active-vertex="activeVertex"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
        :handler="pointHandler(fragment.drawing)"
        v-on="freeSelectionHandlers(fragment)"
      />
      <StandardShapeSelection
        v-else-if="
          isSelectedView(fragment.drawing) &&
          canChange(fragment.drawing) &&
          isStandard(fragment.drawing)
        "
        :drawing="fragment.drawing"
        :connector-route="fragment.connectorRoute"
        :bound-endpoints="connectorBoundState(fragment.drawing)"
        :fragment="fragment"
        :pane-clip="fragment.pageClip ?? layout.panes[fragment.paneId].clip"
        v-on="standardSelectionHandlers(fragment)"
      />
      <SheetObjectSelection
        v-else-if="isSelectedView(fragment.drawing) && canChange(fragment.drawing)"
        :fragment="fragment"
        @resize="(direction, event) => start(fragment, event, direction)"
      />
    </div>
    <ShapeGroupDetailedContent
      v-for="entry in groupPaintEntries"
      :key="entry.source.id"
      :root="entry.displayed"
      :metrics="entry.metrics"
      :render-pass="entry.renderPass"
      :layout="layout"
      :page-projection="pageProjection"
      :density="rasterDensity"
      :theme="theme"
      :asset-urls="imageAssetUrls"
      :stack-index="entry.stackIndex"
      :editing-text-id="
        textEditSnapshot && !textEditSnapshot.stale && textEditSnapshot.root === entry.source
          ? textEditSnapshot.sourceId
          : undefined
      "
      @paint="acceptGroupPaint(entry, $event)"
      @pointerdown="(fragment, event) => startGroupPixels(entry, fragment, event)"
      @doubleclick="(fragment, event) => editGroupPixels(entry, fragment, event)"
      @contextmenu="(fragment, event) => groupPixelContext(entry, fragment, event)"
      @keydown="groupKeydown(entry.source, $event)"
    />
    <div
      v-for="item in groupFragments"
      :key="`group-${item.owner.sourceNode.id}-${item.fragment.pageKey ?? item.fragment.paneId}`"
      class="sheet-drawing-layer__group"
      :data-sheet-drawing-id="item.owner.sourceNode.id"
      :data-shape-group-id="item.owner.sourceNode.id"
      :style="[
        fragmentStyle(item.fragment),
        { zIndex: props.drawings.indexOf(item.source) * 3 + 2 },
      ]"
      tabindex="0"
      role="group"
      :aria-label="item.owner.sourceNode.name"
      @keydown="groupKeydown(item.source, $event, item.owner.path)"
    >
      <ShapeGroupSelection
        :rect="item.layout.rect"
        :rotation="item.layout.angleDeg"
        :fragment="item.fragment"
        :pane-clip="item.fragment.pageClip ?? layout.panes[item.fragment.paneId].clip"
        :show-action="
          groupFragments
            .filter((g) => g.owner.sourceNode.id === item.owner.sourceNode.id)
            .sort(
              (a, b) =>
                b.fragment.clippedRect.width * b.fragment.clippedRect.height -
                a.fragment.clippedRect.width * a.fragment.clippedRect.height,
            )[0] === item
        "
        :disabled="selectionDisabled"
        :show-handles="
          selectedOwnedId
            ? selectedOwnedId === item.owner.sourceNode.id
            : item.owner.path.length === 1
        "
        show-format
        :selection-key="selectionKey"
        :locale="locale"
        @move="
          (event) =>
            startGroupFrame(item.source, item.fragment, event, undefined, 'move', item.owner.path)
        "
        @resize="
          (direction, event) =>
            startGroupFrame(item.source, item.fragment, event, direction, 'move', item.owner.path)
        "
        @rotate="
          (event) =>
            startGroupFrame(item.source, item.fragment, event, undefined, 'rotate', item.owner.path)
        "
        @nudge-rotation="
          (degrees) =>
            runSelectionPlan(() => {
              if (item.owner.path.length === 1) return rotateRootSelection(degrees);
              const layout = groupContainer(item.source, item.owner.path, metrics!).layout!;
              const next = updateOwnedShapeContainer(
                item.source,
                item.owner.path,
                { rect: layout.rect, angleDeg: layout.angleDeg + degrees },
                metrics!,
              );
              return drawings.map((d) => (d === item.source ? next : d));
            })
        "
        @ungroup="ungroupSelected(item.source, item.owner.path)"
        @format="formatGroup(item.source, item.owner.path)"
      />
    </div>
    <Teleport to="body">
      <MenuSurface
        v-if="shapeTextMenu"
        ref="shapeTextMenuSurface"
        :style="shapeTextMenuStyles"
        :label="locale === 'zh-CN' ? '形状操作' : 'Shape actions'"
      >
        <MenuItem v-if="shapeTextMenu.actions.copy" v-on="{ select: shapeTextMenu.actions.copy }">{{
          t("cellMenu.copy")
        }}</MenuItem>
        <MenuItem v-if="shapeTextMenu.actions.cut" v-on="{ select: shapeTextMenu.actions.cut }">{{
          t("cellMenu.cut")
        }}</MenuItem>
        <MenuItem
          v-if="shapeTextMenu.actions.paste"
          :disabled="!canPasteObjects"
          v-on="{ select: shapeTextMenu.actions.paste }"
          >{{ t("cellMenu.paste") }}</MenuItem
        >
        <MenuItem
          v-if="shapeTextMenu.actions.reference"
          v-on="{ select: shapeTextMenu.actions.reference }"
          >{{ t("drawing.textBoxReferenceMenu") }}</MenuItem
        >
        <MenuItem
          v-if="shapeTextMenu.kind !== 'shapeGroup'"
          :disabled="!shapeTextMenu.canText"
          v-on="{ select: shapeTextMenu.actions.text }"
          >{{ locale === "zh-CN" ? "编辑文本" : "Edit Text" }}</MenuItem
        >
        <MenuItem
          v-if="shapeTextMenu.kind !== 'shapeGroup'"
          :disabled="!shapeTextMenu.canObject"
          v-on="{ select: shapeTextMenu.actions.object }"
          >{{
            shapeTextMenu.kind === "shape"
              ? locale === "zh-CN"
                ? "更改形状…"
                : "Change Shape…"
              : locale === "zh-CN"
                ? "对象属性…"
                : "Object Properties…"
          }}</MenuItem
        >
        <MenuItem
          v-if="shapeTextMenu.actions.points"
          v-on="{ select: shapeTextMenu.actions.points }"
          >{{ locale === "zh-CN" ? "编辑顶点" : "Edit Points" }}</MenuItem
        >
        <MenuItem v-on="{ select: shapeTextMenu.actions.format }">{{
          locale === "zh-CN" ? "设置形状格式" : "Format Shape"
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
    <div
      v-if="textEditSnapshot && textEditCallbacks && canvasTextPlacement"
      class="sheet-drawing-layer__text-editor-clip"
      :style="[canvasTextPlacement.clip, { zIndex: props.drawings.length * 3 + 3 }]"
    >
      <ShapeCanvasTextEditor
        ref="canvasTextEditor"
        :key="textEditSnapshot.sessionId"
        :drawing="textEditSnapshot.draftView"
        :theme="theme"
        :session-id="textEditSnapshot.sessionId"
        :draft="textEditSnapshot.draftText"
        :rich="textEditSnapshot.rich"
        :pending-format="textEditSnapshot.pendingFormat"
        :update-rich="textEditCallbacks.updateRich"
        :format="textEditCallbacks.format"
        :set-selection="textEditCallbacks.setSelection"
        :composing="textEditSnapshot.composing"
        :stale="textEditSnapshot.stale"
        :disabled="readOnly"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
        :error="
          textEditSnapshot.error
            ? locale === 'zh-CN'
              ? '无法应用文本更改。草稿已保留，可重试或复制。'
              : textEditSnapshot.error.message
            : undefined
        "
        :frame-style="canvasTextPlacement.frame"
        :textarea-style="canvasTextPlacement.input"
        :initial-selection="textEditSnapshot.selection"
        :update="textEditCallbacks.update"
        :composition="textEditCallbacks.setComposing"
        :commit="canvasTextOwnerActions.commit"
        :escape="canvasTextOwnerActions.escape"
        :cancel="canvasTextOwnerActions.cancel"
        v-on="{
          requestCommit: canvasTextOwnerActions.blur,
          clipboardCopy: () => emit('clipboardCopy'),
        }"
      />
    </div>
  </div>
</template>
<style scoped lang="scss">
.sheet-drawing-layer {
  &__text-editor-clip {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
  }
  position: absolute;
  inset: 0;
  pointer-events: none;
  &__connector-port {
    position: absolute;
    z-index: var(--sheetcraft-layer-toolbar);
    width: 6px;
    height: 6px;
    border: 1px solid #727b86;
    border-radius: 50%;
    background: var(--sheetcraft-surface-default);
    transform: translate(-50%, -50%);
  }
  &__connector-status {
    position: relative;
    width: fit-content;
    max-width: min(420px, calc(100% - 24px));
    margin: 4px 12px;
    padding: 4px 8px;
    color: var(--sheetcraft-text-secondary);
    background: var(--sheetcraft-surface-panel);
    font-size: 12px;
  }
  &__format {
    position: absolute;
    z-index: var(--sheetcraft-layer-toolbar);
    pointer-events: auto;
    width: 28px;
    height: 28px;
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: 4px;
    background: var(--sheetcraft-surface-panel);
    color: var(--sheetcraft-text-primary);
    font-size: 20px;
    cursor: pointer;
  }
  &__object {
    position: absolute;
    pointer-events: auto;
    outline: none;
    cursor: move;
    touch-action: none;
    &.is-composed-group-leaf {
      pointer-events: none;
    }
    &.is-standard {
      pointer-events: none;
      overflow: hidden;
      .sheet-drawing-layer__clip {
        overflow: visible;
      }
    }
  }
  &__group {
    position: absolute;
    pointer-events: none;
    outline: none;
  }
  &__clip {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  &__content {
    position: absolute;
    pointer-events: none;
  }
}
</style>

<style scoped>
.sheet-drawing-layer__point-feedback {
  position: absolute;
  z-index: 30;
  left: 12px;
  bottom: 12px;
  max-width: min(360px, calc(100% - 24px));
  padding: 8px 12px;
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-secondary);
  border: 1px solid var(--sheetcraft-border-control);
  border-radius: 6px;
  pointer-events: none;
  font-size: 12px;
}
</style>
