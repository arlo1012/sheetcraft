<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import {
  areFloatingImageCollectionsEqual,
  cloneFloatingImage,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { isPictureGroup, type PictureGroupPath } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  getPicturePaneTranslation,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { createContextMenuPoint } from "../../../shared/menu/useContextMenu";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { clientPointToElementSurface } from "../../../shared/sheet-input/surface-coordinates";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import type { FloatingImagePaintState } from "../floating-image-painter";
import type { PictureSelectionFrameFragment } from "../picture-selection-frame";
import {
  capturePictureGroupInteraction,
  getOwnedPictureSelectionFragments,
  hitPictureRootAt,
  isPictureGroupInteractionCurrent,
  pictureRotationPointerDelta,
  planPictureGroupInteraction,
  resolveOwnedPictureNode,
  samePictureGroupSelection,
  type PictureGroupInteractionContext,
  type PictureGroupInteractionMode,
  type PictureGroupInteractionSnapshot,
  type PictureGroupSelection,
} from "../picture-group-interaction";
import SheetFramedPictureSelection from "./SheetFramedPictureSelection.vue";
import SheetPictureGroupToolbar from "./SheetPictureGroupToolbar.vue";
import SheetOwnedPictureContextMenu from "./SheetOwnedPictureContextMenu.vue";
const SheetPictureSelectionToolbar = defineAsyncComponent(
  () => import("./SheetPictureSelectionToolbar.vue"),
);
import { getPictureViewportFragments } from "../picture-viewport-fragments";
import {
  arrangeOwnedPictureSelection,
  captureOwnedPictureSelection,
  flipOwnedPictureSelection,
  isOwnedPictureSelectionCurrent,
  rotateOwnedPictureSelection,
  type OwnedPictureSelectionSnapshot,
} from "../owned-picture-selection-commands";
import type { PictureAlignment, PictureAlignmentReference } from "../usePictureTools";

const props = withDefaults(
  defineProps<{
    roots: readonly FloatingImage[];
    owner?: object;
    revision: number;
    layout: SheetViewportLayout;
    frameContext: PictureFrameLayoutContext;
    selectedRootId?: string | null;
    selectedRootIds?: readonly string[];
    selectedPath?: PictureGroupPath | null;
    scale?: number;
    readOnly?: boolean;
    canConvertToCell?: (path: PictureGroupPath) => boolean;
    canEditRoot?: (root: FloatingImage) => boolean;
    canGroup?: boolean;
    croppingExternally?: boolean;
    applyUpdateMany?: (roots: readonly FloatingImage[]) => boolean;
  }>(),
  { scale: 1, readOnly: false, canGroup: true },
);
const emit = defineEmits<{
  select: [rootId: string | null, additive?: boolean];
  selectPath: [path: PictureGroupPath | null];
  feedback: [key: MessageKey];
  updateMany: [roots: FloatingImage[]];
  paintStateChange: [state: FloatingImagePaintState];
  ungroup: [rootId: string];
  group: [rootIds: string[]];
  convertToCell: [path: PictureGroupPath, owner?: object];
  format: [path: PictureGroupPath, owner?: object, paint?: "fill" | "line"];
  copy: [path: PictureGroupPath, owner?: object];
  cut: [path: PictureGroupPath, owner?: object];
  paste: [path: PictureGroupPath, owner?: object];
  delete: [path: PictureGroupPath, owner?: object];
}>();
const { t } = useAppI18n();
const layerRef = ref<HTMLElement | null>(null);
const previewRoots = shallowRef<readonly FloatingImage[] | null>(null);
const contextMenu = shallowRef<{
  anchor: FloatingReference;
  lease: OwnedPictureSelectionSnapshot;
  path: PictureGroupPath;
  selection: PictureGroupSelection;
  actions: Record<
    "copy" | "cut" | "paste" | "delete" | "format" | "ungroup" | "convert",
    () => void
  >;
  close: (restoreFocus: boolean) => void;
}>();
const paintRevision = ref(0);
const selectedIds = computed(() => [
  ...new Set([
    ...(props.selectedRootIds ?? []),
    ...(props.selectedRootId ? [props.selectedRootId] : []),
  ]),
]);
function isRootAvailable(id: string): boolean {
  const root = props.roots.find((root) => root.id === id);
  return !!root && props.canEditRoot?.(root) !== false;
}
const interactionReadOnly = computed(
  () =>
    props.readOnly ||
    selectedIds.value.some(
      (id) => props.roots.some((root) => root.id === id) && !isRootAvailable(id),
    ),
);
function hitInteractiveRoot(...args: Parameters<typeof hitPictureRootAt>) {
  const hit = hitPictureRootAt(...args);
  return hit &&
    isRootAvailable(hit.kind === "legacy" || hit.kind === "framed" ? hit.image.id : hit.rootId)
    ? hit
    : undefined;
}
const selectedGroupRoots = computed(() =>
  props.roots.filter((root) => isPictureGroup(root) && selectedIds.value.includes(root.id)),
);
const innerPath = computed(() =>
  props.selectedPath &&
  props.selectedPath.length > 1 &&
  selectedIds.value.length === 1 &&
  selectedIds.value[0] === props.selectedPath[0]
    ? props.selectedPath
    : null,
);
const targetPath = computed<PictureGroupPath | null>(
  () =>
    innerPath.value ??
    (selectedGroupRoots.value.length === 1 && selectedIds.value.length === 1
      ? [selectedGroupRoots.value[0]!.id]
      : null),
);
type SelectionOverlay = {
  path: PictureGroupPath;
  fragment: PictureSelectionFrameFragment;
  passive: boolean;
};
const overlays = computed<SelectionOverlay[]>(() => {
  const roots = displayRoots();
  const result: SelectionOverlay[] = [];
  for (const root of selectedGroupRoots.value) {
    const passive = innerPath.value?.[0] === root.id;
    for (const fragment of getOwnedPictureSelectionFragments(roots, [root.id], props.frameContext))
      result.push({ path: [root.id], fragment, passive });
  }
  if (innerPath.value)
    for (const fragment of getOwnedPictureSelectionFragments(
      roots,
      innerPath.value,
      props.frameContext,
    ))
      result.push({ path: innerPath.value, fragment, passive: false });
  return result;
});
function getOverlayTitle(path: PictureGroupPath): string | undefined {
  return (
    resolveOwnedPictureNode(displayRoots(), path, props.frameContext)?.node.altTitle || undefined
  );
}
function getOverlayLabel(path: PictureGroupPath): string {
  const node = resolveOwnedPictureNode(displayRoots(), path, props.frameContext)?.node;
  return [node?.altTitle, node?.altText].filter(Boolean).join(". ") || t("image.floatingAlt");
}
const toolbarAnchor = computed<FloatingReference | null>(() => {
  const path = targetPath.value,
    layer = layerRef.value;
  if (!path || !layer || gesture.value || contextMenu.value) return null;
  const fragments = getOwnedPictureSelectionFragments(displayRoots(), path, props.frameContext);
  if (!fragments.length) return null;
  const x = Math.min(...fragments.map(({ clippedBounds: b }) => b.x));
  const y = Math.min(...fragments.map(({ clippedBounds: b }) => b.y));
  const right = Math.max(...fragments.map(({ clippedBounds: b }) => b.x + b.width));
  const bottom = Math.max(...fragments.map(({ clippedBounds: b }) => b.y + b.height));
  return markRaw({
    contextElement: layer,
    getBoundingClientRect: () => {
      const bounds = layer.getBoundingClientRect();
      return new DOMRect(
        bounds.x + x * props.scale,
        bounds.y + y * props.scale,
        (right - x) * props.scale,
        (bottom - y) * props.scale,
      );
    },
  });
});
type Gesture = {
  snapshot: PictureGroupInteractionSnapshot;
  mode: PictureGroupInteractionMode;
  pointerId: number;
  startPoint: Point;
  center: Point;
  beforeSelection: PictureGroupSelection;
  expectedSelection: PictureGroupSelection;
  selectionSettled: boolean;
};
const gesture = shallowRef<Gesture | null>(null);
let pointerSession: PointerSession | undefined;

function currentContext(): PictureGroupInteractionContext {
  return {
    roots: props.roots,
    owner: props.owner,
    revision: props.revision,
    layout: props.layout,
    frameContext: props.frameContext,
    scale: props.scale,
    readOnly: interactionReadOnly.value,
  };
}
function currentSelection(): PictureGroupSelection {
  return { rootIds: selectedIds.value, path: innerPath.value };
}
function getSelectionSnapshot(): OwnedPictureSelectionSnapshot | null {
  try {
    return captureOwnedPictureSelection(
      currentContext(),
      currentSelection(),
      props.selectedRootId ?? null,
    );
  } catch {
    return null;
  }
}
function isSelectionSnapshotCurrent(snapshot: OwnedPictureSelectionSnapshot): boolean {
  return isOwnedPictureSelectionCurrent(
    snapshot,
    currentContext(),
    currentSelection(),
    props.selectedRootId ?? null,
  );
}
function applySelectionPlan(
  snapshot: OwnedPictureSelectionSnapshot | null,
  plan: (lease: OwnedPictureSelectionSnapshot) => FloatingImage[],
): boolean {
  if (
    interactionReadOnly.value ||
    gesture.value ||
    !snapshot ||
    !isSelectionSnapshotCurrent(snapshot)
  )
    return false;
  const apply = props.applyUpdateMany;
  try {
    const next = plan(snapshot);
    if (apply !== props.applyUpdateMany || !isSelectionSnapshotCurrent(snapshot)) return false;
    return commitRoots(next);
  } catch {
    fail();
    return false;
  }
}
function rotateSelected(
  turns: -1 | 1 | 2,
  snapshot: OwnedPictureSelectionSnapshot | null = getSelectionSnapshot(),
): boolean {
  return applySelectionPlan(snapshot, (lease) => rotateOwnedPictureSelection(lease, turns));
}
function flipSelected(
  axis: "horizontal" | "vertical",
  snapshot: OwnedPictureSelectionSnapshot | null = getSelectionSnapshot(),
): boolean {
  return applySelectionPlan(snapshot, (lease) => flipOwnedPictureSelection(lease, axis));
}
function arrangeSelection(
  ids: readonly string[],
  action: PictureAlignment,
  reference: PictureAlignmentReference = "selection",
  snapshot: OwnedPictureSelectionSnapshot | null = getSelectionSnapshot(),
): boolean {
  return applySelectionPlan(snapshot, (lease) =>
    arrangeOwnedPictureSelection(lease, ids, action, reference),
  );
}
function focusSelected(): void {
  const selection = currentSelection();
  const path =
    selection.path ?? (selectedGroupRoots.value[0] ? [selectedGroupRoots.value[0].id] : null);
  if (path) focusSelection(selection, path);
}

let selectionToolbarSequence = 0;
const selectionToolbar = computed(() => {
  const layer = layerRef.value;
  if (
    !layer ||
    gesture.value ||
    contextMenu.value ||
    innerPath.value ||
    selectedIds.value.length < 2 ||
    !props.roots.some(
      (root) =>
        selectedIds.value.includes(root.id) &&
        (isPictureGroup(root) || isFramedPictureObject(root)),
    )
  )
    return null;
  const lease = getSelectionSnapshot();
  if (!lease) return null;
  try {
    const roots = displayRoots();
    const bounds = getPictureViewportFragments(roots, props.layout, props.frameContext).flatMap(
      (fragment) =>
        fragment.kind === "group-leaf" || !selectedIds.value.includes(fragment.image.id)
          ? []
          : [fragment.kind === "legacy" ? fragment.clippedRect : fragment.clippedBounds],
    );
    for (const root of selectedGroupRoots.value)
      bounds.push(
        ...getOwnedPictureSelectionFragments(roots, [root.id], props.frameContext).map(
          (fragment) => fragment.clippedBounds,
        ),
      );
    if (!bounds.length) return null;
    const x = Math.min(...bounds.map((rect) => rect.x));
    const y = Math.min(...bounds.map((rect) => rect.y));
    const right = Math.max(...bounds.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...bounds.map((rect) => rect.y + rect.height));
    const key = `owned-selection-${++selectionToolbarSequence}`;
    const apply = props.applyUpdateMany;
    const current = () =>
      !gesture.value &&
      !contextMenu.value &&
      apply === props.applyUpdateMany &&
      isSelectionSnapshotCurrent(lease);
    return {
      key,
      count: lease.selection.rootIds.length,
      anchor: markRaw({
        contextElement: layer,
        getBoundingClientRect: () => {
          const client = layer.getBoundingClientRect();
          return new DOMRect(
            client.x + x * props.scale,
            client.y + y * props.scale,
            (right - x) * props.scale,
            (bottom - y) * props.scale,
          );
        },
      }),
      align: (
        action: PictureAlignment,
        reference: PictureAlignmentReference,
        selectedKey: string,
      ) => {
        if (selectedKey === key && current())
          arrangeSelection(lease.selection.rootIds, action, reference, lease);
      },
      group: (selectedKey: string) => {
        if (
          selectedKey === key &&
          props.canGroup !== false &&
          !interactionReadOnly.value &&
          current()
        )
          emit("group", [...lease.selection.rootIds]);
      },
      dismiss: (selectedKey: string) => {
        if (selectedKey === key && current()) clearSelection();
      },
    };
  } catch {
    return null;
  }
});
function displayRoots(): readonly FloatingImage[] {
  return previewRoots.value ?? props.roots;
}
function getPaintState(): FloatingImagePaintState {
  return { images: displayRoots(), revision: paintRevision.value };
}
function emitPaintState(): void {
  paintRevision.value++;
  emit("paintStateChange", getPaintState());
}
function fail(): void {
  emit("feedback", "picture.operationFailed");
}
function clearSelection(): void {
  emit("selectPath", null);
  emit("select", null);
}
function pointFor(event: MouseEvent): Point {
  return layerRef.value
    ? clientPointToElementSurface(
        { x: event.clientX, y: event.clientY },
        layerRef.value,
        props.scale,
      )
    : { x: 0, y: 0 };
}
function focusSelection(expected: PictureGroupSelection, path: PictureGroupPath): void {
  const captured = currentContext();
  const capturedRoots = props.roots.map(cloneFloatingImage);
  const selection = {
    rootIds: [...expected.rootIds],
    path: expected.path ? [...expected.path] : null,
  };
  const pathKey = JSON.stringify(path);
  void nextTick(() => {
    const current = currentContext();
    if (
      captured.owner !== current.owner ||
      captured.roots !== current.roots ||
      captured.revision !== current.revision ||
      captured.layout !== current.layout ||
      captured.frameContext !== current.frameContext ||
      captured.scale !== current.scale ||
      captured.readOnly !== current.readOnly ||
      !areFloatingImageCollectionsEqual(capturedRoots, current.roots) ||
      !samePictureGroupSelection(selection, currentSelection())
    )
      return;
    const target = Array.from(
      layerRef.value?.querySelectorAll<HTMLElement>(
        "[data-owned-picture-selected]:not([data-passive-outline])",
      ) ?? [],
    ).find((element) => element.dataset.ownedPicturePath === pathKey);
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
}

function isCurrent(active: Gesture): boolean {
  if (!isPictureGroupInteractionCurrent(active.snapshot, currentContext())) return false;
  const selection = currentSelection();
  if (samePictureGroupSelection(selection, active.expectedSelection)) {
    active.selectionSettled = true;
    return true;
  }
  return !active.selectionSettled && samePictureGroupSelection(selection, active.beforeSelection);
}
function stopPointerSession(): void {
  const session = pointerSession;
  pointerSession = undefined;
  session?.cancel();
}
function finishGesture(commit: boolean): void {
  const active = gesture.value,
    planned = previewRoots.value;
  const valid = active && isCurrent(active);
  gesture.value = null;
  stopPointerSession();
  if (
    commit &&
    active &&
    valid &&
    planned &&
    !areFloatingImageCollectionsEqual(active.snapshot.roots, planned)
  )
    commitRoots(planned);
  previewRoots.value = null;
}
/** No optimistic success: an emit-only owner must feed its accepted roots back as props. */
function commitRoots(next: readonly FloatingImage[]): boolean {
  if (interactionReadOnly.value) return false;
  if (areFloatingImageCollectionsEqual(props.roots, next)) return true;
  if (!props.applyUpdateMany) {
    emit("updateMany", [...next]);
    return false;
  }
  try {
    const accepted: unknown = props.applyUpdateMany(next);
    if (accepted !== true) {
      fail();
      return false;
    }
    return true;
  } catch {
    fail();
    return false;
  }
}
function beginGesture(
  path: PictureGroupPath,
  rootIds: readonly string[],
  mode: PictureGroupInteractionMode,
  event: PointerEvent,
  startPoint: Point,
  paneId: FrozenPaneId,
  expectedSelection = currentSelection(),
): void {
  if (props.readOnly || rootIds.some((id) => !isRootAvailable(id))) return;
  finishGesture(false);
  try {
    if (mode === "rotate" && rootIds.length > 1) {
      fail();
      return;
    }
    const snapshot = capturePictureGroupInteraction(
      {
        ...currentContext(),
        readOnly: props.readOnly || rootIds.some((id) => !isRootAvailable(id)),
      },
      path,
      rootIds,
    );
    const translation = getPicturePaneTranslation(paneId, props.layout);
    const active: Gesture = {
      snapshot,
      mode,
      pointerId: event.pointerId,
      startPoint,
      center: {
        x: snapshot.world.rect.x + snapshot.world.rect.width / 2 + translation.x,
        y: snapshot.world.rect.y + snapshot.world.rect.height / 2 + translation.y,
      },
      beforeSelection: currentSelection(),
      expectedSelection,
      selectionSettled: samePictureGroupSelection(currentSelection(), expectedSelection),
    };
    gesture.value = active;
    previewRoots.value = snapshot.roots;
    pointerSession = startPointerSession({
      event,
      captureTarget: layerRef.value,
      onMove: (moveEvent) => moveGestureAt(active, pointFor(moveEvent)),
      onEnd: () => {
        pointerSession = undefined;
        finishGesture(true);
      },
      onCancel: () => {
        pointerSession = undefined;
        finishGesture(false);
      },
    });
  } catch {
    finishGesture(false);
    fail();
  }
}
function moveGestureAt(active: Gesture, point: Point): void {
  if (gesture.value !== active) return;
  if (!isCurrent(active)) {
    finishGesture(false);
    return;
  }
  try {
    const delta = { x: point.x - active.startPoint.x, y: point.y - active.startPoint.y };
    previewRoots.value = planPictureGroupInteraction(
      active.snapshot,
      active.mode,
      delta,
      active.mode === "rotate"
        ? pictureRotationPointerDelta(active.center, active.startPoint, point)
        : 0,
    );
  } catch {
    finishGesture(false);
    fail();
  }
}
function selectBodyHit(event: PointerEvent, point: Point): boolean {
  if (event.button !== 0) return false;
  const hit = hitInteractiveRoot(
    props.roots,
    point,
    props.layout,
    props.frameContext,
    selectedIds.value,
  );
  if (hit?.kind !== "group-leaf" && hit?.kind !== "group-frame") return false;
  if (event.ctrlKey || event.metaKey) {
    finishGesture(false);
    emit("selectPath", null);
    emit("select", hit.rootId, true);
    return true;
  }
  const alreadySelected = selectedIds.value.includes(hit.rootId);
  const multi = alreadySelected && selectedIds.value.length > 1;
  const path = alreadySelected && !multi && hit.kind === "group-leaf" ? hit.path : [hit.rootId];
  const rootIds = multi ? selectedIds.value : [hit.rootId];
  const expectedSelection: PictureGroupSelection = { rootIds, path: path.length > 1 ? path : null };
  beginGesture(path, rootIds, "move", event, point, hit.paneId, expectedSelection);
  // Keep ordinary multi-selection intact; clicking one selected member moves the whole selection.
  if (!multi) emit("select", hit.rootId);
  emit("selectPath", path.length > 1 ? [...path] : null);
  focusSelection(expectedSelection, path);
  return true;
}
function onOverlayMove(overlay: SelectionOverlay, event: PointerEvent): void {
  const point = pointFor(event);
  // Always consult global stacking, even when a selected parent's SVG received the event.
  const hit = hitInteractiveRoot(
    props.roots,
    point,
    props.layout,
    props.frameContext,
    selectedIds.value,
  );
  if (
    hit &&
    ((hit.kind !== "group-leaf" && hit.kind !== "group-frame") || hit.rootId !== overlay.path[0])
  )
    return;
  if (hit?.kind === "group-leaf" || hit?.kind === "group-frame") {
    selectBodyHit(event, point);
    return;
  }
  if (event.button !== 0 || overlay.passive) return;
  const rootIds = overlay.path.length === 1 ? selectedIds.value : [overlay.path[0]!];
  beginGesture(overlay.path, rootIds, "move", event, point, overlay.fragment.paneId);
  focusSelection(currentSelection(), overlay.path);
}
function onOverlayResize(
  overlay: SelectionOverlay,
  direction: FloatingImageResizeDirection,
  event: PointerEvent,
): void {
  if (event.button !== 0 || overlay.passive) return;
  beginGesture(
    overlay.path,
    overlay.path.length === 1 ? selectedIds.value : [overlay.path[0]!],
    direction,
    event,
    pointFor(event),
    overlay.fragment.paneId,
  );
}
function onOverlayRotate(overlay: SelectionOverlay, event: PointerEvent): void {
  if (event.button !== 0 || overlay.passive) return;
  beginGesture(
    overlay.path,
    overlay.path.length === 1 ? selectedIds.value : [overlay.path[0]!],
    "rotate",
    event,
    pointFor(event),
    overlay.fragment.paneId,
  );
}
function onKeydown(event: KeyboardEvent, overlayPath?: PictureGroupPath): void {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.defaultPrevented ||
    (event.target instanceof Element &&
      event.target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
      ))
  )
    return;
  const path = targetPath.value ?? overlayPath;
  if (!path) return;
  if (!resolveOwnedPictureNode(props.roots, path, props.frameContext)?.visible) return;
  if (
    event.key === "ContextMenu" ||
    (event.key === "F10" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey)
  ) {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    finishGesture(false);
    openContextMenu(markRaw(trigger), path, currentSelection(), props.selectedRootId ?? null);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishGesture(false);
    clearSelection();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "c" || ((key === "x" || key === "v") && !interactionReadOnly.value)) {
      event.preventDefault();
      event.stopPropagation();
      if (key === "c") emit("copy", [...path], props.owner);
      else if (key === "x") emit("cut", [...path], props.owner);
      else emit("paste", [...path], props.owner);
    }
    return;
  }
  if (interactionReadOnly.value || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    event.stopPropagation();
    emit("delete", [...path], props.owner);
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  const delta =
    event.key === "ArrowLeft"
      ? { x: -step, y: 0 }
      : event.key === "ArrowRight"
        ? { x: step, y: 0 }
        : event.key === "ArrowUp"
          ? { x: 0, y: -step }
          : event.key === "ArrowDown"
            ? { x: 0, y: step }
            : null;
  if (!delta || gesture.value) return;
  event.preventDefault();
  event.stopPropagation();
  try {
    const snapshot = capturePictureGroupInteraction(
      currentContext(),
      path,
      path.length > 1 ? [path[0]!] : selectedIds.value,
    );
    commitRoots(planPictureGroupInteraction(snapshot, "move", delta));
  } catch {
    fail();
  }
}
/** Shared pointer sessions own Escape during a drag; this listener only handles this active session. */
function onActiveEscape(event: KeyboardEvent): void {
  if (!gesture.value || event.key !== "Escape" || event.isComposing) return;
  event.preventDefault();
  finishGesture(false);
  clearSelection();
}
function handleSurfacePointerDown(event: PointerEvent, point: Point): boolean {
  if (event.target instanceof Element && event.target.closest("[data-owned-picture-selected]"))
    return false;
  try {
    return selectBodyHit(event, point);
  } catch {
    fail();
    return false;
  }
}
function handleSurfacePointerMove(event: PointerEvent, point: Point): boolean {
  const active = gesture.value;
  if (!active || event.pointerId !== active.pointerId) return false;
  moveGestureAt(active, point);
  return true;
}
function handleSurfacePointerUp(event: PointerEvent): boolean {
  if (event.pointerId !== gesture.value?.pointerId) return false;
  finishGesture(true);
  return true;
}
function handleSurfacePointerCancel(event: PointerEvent): boolean {
  if (event.pointerId !== gesture.value?.pointerId) return false;
  finishGesture(false);
  return true;
}
function handleSurfaceDoubleClick(_event: MouseEvent, point: Point): boolean {
  // Child selection is deliberately single-click. A double click never fabricates a source preview.
  try {
    const hit = hitInteractiveRoot(
      props.roots,
      point,
      props.layout,
      props.frameContext,
      selectedIds.value,
    );
    return hit?.kind === "group-leaf" || hit?.kind === "group-frame";
  } catch {
    return false;
  }
}
function handleSurfaceContextMenu(event: MouseEvent, point: Point): boolean {
  let hit;
  try {
    hit = hitInteractiveRoot(
      props.roots,
      point,
      props.layout,
      props.frameContext,
      selectedIds.value,
    );
  } catch {
    fail();
    return false;
  }
  if (hit?.kind !== "group-leaf" && hit?.kind !== "group-frame") return false;
  event.preventDefault();
  event.stopPropagation();
  finishGesture(false);
  const alreadySelected = selectedIds.value.includes(hit.rootId);
  const multi = alreadySelected && selectedIds.value.length > 1;
  const path = alreadySelected && !multi && hit.kind === "group-leaf" ? hit.path : [hit.rootId];
  const expected = {
    rootIds: multi ? selectedIds.value : [hit.rootId],
    path: path.length > 1 ? path : null,
  };
  if (!multi) emit("select", hit.rootId);
  emit("selectPath", expected.path ? [...expected.path] : null);
  const trigger = layerRef.value;
  if (trigger)
    openContextMenu(
      markRaw(createContextMenuPoint(event, trigger)),
      path,
      expected,
      multi ? (props.selectedRootId ?? null) : hit.rootId,
    );
  return true;
}
function openContextMenu(
  anchor: FloatingReference,
  path: PictureGroupPath,
  selection: PictureGroupSelection,
  activeRootId: string | null,
): void {
  try {
    const menu: NonNullable<typeof contextMenu.value> = {
      anchor,
      lease: captureOwnedPictureSelection(currentContext(), selection, activeRootId),
      path: [...path],
      selection: {
        rootIds: [...selection.rootIds],
        path: selection.path ? [...selection.path] : null,
      },
      actions: {
        copy: () => contextAction(menu, "copy"),
        cut: () => contextAction(menu, "cut"),
        paste: () => contextAction(menu, "paste"),
        delete: () => contextAction(menu, "delete"),
        format: () => contextAction(menu, "format"),
        ungroup: () => contextAction(menu, "ungroup"),
        convert: () => contextAction(menu, "convert"),
      },
      close: (restoreFocus) => {
        if (contextMenu.value === menu) closeContextMenu(restoreFocus);
      },
    };
    contextMenu.value = menu;
  } catch {
    fail();
  }
}
function isContextMenuCurrent(menu: NonNullable<typeof contextMenu.value>): boolean {
  return isSelectionSnapshotCurrent(menu.lease);
}
function closeContextMenu(restoreFocus = false): void {
  const menu = contextMenu.value;
  contextMenu.value = undefined;
  if (restoreFocus && menu && isContextMenuCurrent(menu)) focusSelection(menu.selection, menu.path);
}
function contextAction(
  menu: NonNullable<typeof contextMenu.value>,
  action: "copy" | "cut" | "paste" | "delete" | "format" | "ungroup" | "convert",
): void {
  if (contextMenu.value !== menu) return;
  const valid = isContextMenuCurrent(menu);
  closeContextMenu(false);
  if (!valid || (interactionReadOnly.value && !["copy", "format"].includes(action))) return;
  if (action === "ungroup") {
    if (menu.path.length === 1 && menu.selection.rootIds.length === 1)
      emit("ungroup", menu.path[0]!);
  } else if (action === "copy") emit("copy", [...menu.path], props.owner);
  else if (action === "cut") emit("cut", [...menu.path], props.owner);
  else if (action === "paste") emit("paste", [...menu.path], props.owner);
  else if (action === "delete") emit("delete", [...menu.path], props.owner);
  else if (action === "convert") emit("convertToCell", [...menu.path], props.owner);
  else emit("format", [...menu.path], props.owner);
}

function getSurfaceCursor(point: Point): "move" | undefined {
  if (interactionReadOnly.value) return undefined;
  try {
    const hit = hitInteractiveRoot(
      props.roots,
      point,
      props.layout,
      props.frameContext,
      selectedIds.value,
    );
    return hit?.kind === "group-leaf" || hit?.kind === "group-frame" ? "move" : undefined;
  } catch {
    return undefined;
  }
}

function overlayStyle(fragment: PictureSelectionFrameFragment): CSSProperties {
  const bounds = fragment.clippedBounds;
  return {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  };
}
function requestUngroup(lease: OwnedPictureSelectionSnapshot, path: PictureGroupPath): void {
  if (
    interactionReadOnly.value ||
    gesture.value ||
    !isSelectionSnapshotCurrent(lease) ||
    path.length !== 1
  )
    return;
  const target = resolveOwnedPictureNode(props.roots, path, props.frameContext);
  if (target?.visible && target.node.kind === "picture-group-v1") emit("ungroup", path[0]!);
}
function requestFormat(
  lease: OwnedPictureSelectionSnapshot,
  path: PictureGroupPath,
  paint?: "fill" | "line",
): void {
  if (
    gesture.value ||
    !isSelectionSnapshotCurrent(lease) ||
    !resolveOwnedPictureNode(props.roots, path, props.frameContext)?.visible
  )
    return;
  if (paint) emit("format", [...path], props.owner, paint);
  else emit("format", [...path], props.owner);
}
const groupToolbarActions = computed(() => {
  const path = targetPath.value;
  const lease = getSelectionSnapshot();
  if (!path || !lease) return null;
  return {
    format: () => requestFormat(lease, path),
    paint: (category: "fill" | "line") => requestFormat(lease, path, category),
    ungroup: () => requestUngroup(lease, path),
    dismiss: () => {
      if (isSelectionSnapshotCurrent(lease)) clearSelection();
    },
  };
});
watch(
  () => [
    props.roots,
    props.owner,
    props.revision,
    props.layout,
    props.frameContext,
    props.scale,
    interactionReadOnly.value,
    props.selectedRootId,
    props.selectedRootIds,
    props.selectedPath,
  ],
  () => {
    if (gesture.value && !isCurrent(gesture.value)) finishGesture(false);
    if (contextMenu.value && !isContextMenuCurrent(contextMenu.value)) closeContextMenu(false);
  },
  { deep: true, flush: "sync" },
);
watch(
  [() => props.roots, () => props.layout, () => props.frameContext, previewRoots],
  emitPaintState,
  { flush: "post", immediate: true },
);
onMounted(() => window.addEventListener("keydown", onActiveEscape, true));
onBeforeUnmount(() => {
  finishGesture(false);
  window.removeEventListener("keydown", onActiveEscape, true);
});
function openSelectedContextMenu(event: MouseEvent): void {
  const path = targetPath.value,
    layer = layerRef.value;
  if (!path || !layer || selectedIds.value.length !== 1) return;
  openContextMenu(
    markRaw(createContextMenuPoint(event, layer)),
    path,
    { rootIds: [...selectedIds.value], path: path.length > 1 ? [...path] : null },
    props.selectedRootId ?? null,
  );
}
defineExpose({
  closePictureContextMenu: () => closeContextMenu(false),
  openSelectedContextMenu,
  handleSurfacePointerDown,
  handleSurfacePointerMove,
  handleSurfacePointerUp,
  handleSurfacePointerCancel,
  handleSurfaceDoubleClick,
  handleSurfaceContextMenu,
  getSurfaceCursor,
  getPaintState,
  getSelectionSnapshot,
  rotateSelected,
  flipSelected,
  arrangeSelection,
  focusSelected,
});
</script>
<template>
  <div ref="layerRef" class="sheet-owned-picture-group-layer" data-owned-picture-group-layer>
    <div
      v-for="overlay in croppingExternally ? [] : overlays"
      :key="`${JSON.stringify(overlay.path)}:${overlay.fragment.paneId}`"
      class="sheet-owned-picture-group-layer__selection"
      :class="{ 'is-passive': overlay.passive }"
      :style="overlayStyle(overlay.fragment)"
      :tabindex="overlay.passive ? undefined : 0"
      :role="overlay.passive ? undefined : 'button'"
      :aria-label="overlay.passive ? undefined : getOverlayLabel(overlay.path)"
      :title="getOverlayTitle(overlay.path)"
      :data-owned-picture-selected="overlay.path.join('/')"
      :data-owned-picture-path="JSON.stringify(overlay.path)"
      :data-passive-outline="overlay.passive ? '' : undefined"
      @keydown="onKeydown($event, overlay.path)"
    >
      <SheetFramedPictureSelection
        :fragment="overlay.fragment"
        :layout="layout"
        :read-only="interactionReadOnly"
        :passive-outline="overlay.passive"
        :rotatable="!overlay.passive"
        :body-interactive="false"
        @move="onOverlayMove(overlay, $event)"
        @resize="(direction, event) => onOverlayResize(overlay, direction, event)"
        @rotate="onOverlayRotate(overlay, $event)"
      />
    </div>
    <SheetPictureGroupToolbar
      v-if="!croppingExternally && toolbarAnchor && targetPath && groupToolbarActions"
      :anchor="toolbarAnchor"
      :disabled="interactionReadOnly"
      :can-ungroup="targetPath.length === 1"
      @ungroup="groupToolbarActions.ungroup"
      @format="groupToolbarActions.format"
      @paint="groupToolbarActions.paint"
      @dismiss="groupToolbarActions.dismiss"
    />
    <SheetPictureSelectionToolbar
      v-if="!croppingExternally && selectionToolbar"
      :key="selectionToolbar.key"
      :anchor="selectionToolbar.anchor"
      :selection-key="selectionToolbar.key"
      :can-group="canGroup"
      :count="selectionToolbar.count"
      :disabled="interactionReadOnly"
      @align="selectionToolbar.align"
      @group="selectionToolbar.group"
      @dismiss="selectionToolbar.dismiss"
    />
    <SheetOwnedPictureContextMenu
      v-if="contextMenu"
      :anchor="contextMenu.anchor"
      :read-only="interactionReadOnly"
      :convert-disabled="props.canConvertToCell?.(contextMenu.path) === false"
      :can-ungroup="contextMenu.path.length === 1 && contextMenu.selection.rootIds.length === 1"
      :can-convert="
        resolveOwnedPictureNode(roots, contextMenu.path, frameContext)?.node.kind ===
          'grouped-picture-v1' ||
        Boolean(
          contextMenu.path.length === 1 &&
          roots.some((root) => root.id === contextMenu?.path[0] && !isPictureGroup(root)),
        )
      "
      @convert-to-cell="contextMenu.actions.convert"
      @copy="contextMenu.actions.copy"
      @cut="contextMenu.actions.cut"
      @paste="contextMenu.actions.paste"
      @delete="contextMenu.actions.delete"
      @format="contextMenu.actions.format"
      @ungroup="contextMenu.actions.ungroup"
      @close="contextMenu.close"
    />
  </div>
</template>
<style scoped lang="scss">
.sheet-owned-picture-group-layer {
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;
  &__selection {
    position: absolute;
    pointer-events: none;
    outline: none;
    &.is-passive {
      --picture-frame-focus-dash: 4 3;
      opacity: 0.45;
    }
  }
}
</style>
