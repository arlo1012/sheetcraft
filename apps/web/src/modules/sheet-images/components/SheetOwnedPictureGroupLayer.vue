<script setup lang="ts">
import {
  computed,
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
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  getPicturePaneTranslation,
  type PictureFrameLayoutContext,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
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
    applyUpdateMany?: (roots: readonly FloatingImage[]) => boolean;
  }>(),
  { scale: 1, readOnly: false },
);
const emit = defineEmits<{
  select: [rootId: string | null, additive?: boolean];
  selectPath: [path: PictureGroupPath | null];
  feedback: [key: MessageKey];
  updateMany: [roots: FloatingImage[]];
  paintStateChange: [state: FloatingImagePaintState];
  ungroup: [rootId: string];
  format: [path: PictureGroupPath, owner?: object];
  copy: [path: PictureGroupPath, owner?: object];
  cut: [path: PictureGroupPath, owner?: object];
  delete: [path: PictureGroupPath, owner?: object];
}>();
const { t } = useAppI18n();
const layerRef = ref<HTMLElement | null>(null);
const previewRoots = shallowRef<readonly FloatingImage[] | null>(null);
const paintRevision = ref(0);
const selectedIds = computed(() => [
  ...new Set([
    ...(props.selectedRootIds ?? []),
    ...(props.selectedRootId ? [props.selectedRootId] : []),
  ]),
]);
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
const toolbarAnchor = computed<FloatingReference | null>(() => {
  const path = targetPath.value,
    layer = layerRef.value;
  if (!path || !layer || gesture.value) return null;
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
    readOnly: props.readOnly,
  };
}
function currentSelection(): PictureGroupSelection {
  return { rootIds: selectedIds.value, path: innerPath.value };
}
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
  if (props.readOnly) return false;
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
  if (props.readOnly) return;
  finishGesture(false);
  try {
    if (mode === "rotate" && rootIds.length > 1) {
      fail();
      return;
    }
    const snapshot = capturePictureGroupInteraction(currentContext(), path, rootIds);
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
  const hit = hitPictureRootAt(
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
  const hit = hitPictureRootAt(
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
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishGesture(false);
    clearSelection();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "c" || (key === "x" && !props.readOnly)) {
      event.preventDefault();
      event.stopPropagation();
      if (key === "c") emit("copy", [...path], props.owner);
      else emit("cut", [...path], props.owner);
    }
    return;
  }
  if (props.readOnly || event.altKey || event.ctrlKey || event.metaKey) return;
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
    const hit = hitPictureRootAt(
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

function getSurfaceCursor(point: Point): "move" | undefined {
  if (props.readOnly) return undefined;
  try {
    const hit = hitPictureRootAt(
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
function requestUngroup(): void {
  const path = targetPath.value;
  if (props.readOnly || !path || path.length !== 1) return;
  const target = resolveOwnedPictureNode(props.roots, path, props.frameContext);
  if (target?.visible && target.node.kind === "picture-group-v1") emit("ungroup", path[0]!);
}
function requestFormat(): void {
  const path = targetPath.value;
  if (!path || !resolveOwnedPictureNode(props.roots, path, props.frameContext)?.visible) return;
  emit("format", [...path], props.owner);
}
watch(
  () => [
    props.roots,
    props.owner,
    props.revision,
    props.layout,
    props.frameContext,
    props.scale,
    props.readOnly,
    props.selectedRootId,
    props.selectedRootIds,
    props.selectedPath,
  ],
  () => {
    if (gesture.value && !isCurrent(gesture.value)) finishGesture(false);
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
defineExpose({
  handleSurfacePointerDown,
  handleSurfacePointerMove,
  handleSurfacePointerUp,
  handleSurfacePointerCancel,
  handleSurfaceDoubleClick,
  getSurfaceCursor,
  getPaintState,
});
</script>
<template>
  <div ref="layerRef" class="sheet-owned-picture-group-layer" data-owned-picture-group-layer>
    <div
      v-for="overlay in overlays"
      :key="`${JSON.stringify(overlay.path)}:${overlay.fragment.paneId}`"
      class="sheet-owned-picture-group-layer__selection"
      :class="{ 'is-passive': overlay.passive }"
      :style="overlayStyle(overlay.fragment)"
      :tabindex="overlay.passive ? undefined : 0"
      :role="overlay.passive ? undefined : 'button'"
      :aria-label="overlay.passive ? undefined : t('image.floatingAlt')"
      :data-owned-picture-selected="overlay.path.join('/')"
      :data-owned-picture-path="JSON.stringify(overlay.path)"
      :data-passive-outline="overlay.passive ? '' : undefined"
      @keydown="onKeydown($event, overlay.path)"
    >
      <SheetFramedPictureSelection
        :fragment="overlay.fragment"
        :layout="layout"
        :read-only="readOnly"
        :passive-outline="overlay.passive"
        :rotatable="!overlay.passive"
        :body-interactive="false"
        @move="onOverlayMove(overlay, $event)"
        @resize="(direction, event) => onOverlayResize(overlay, direction, event)"
        @rotate="onOverlayRotate(overlay, $event)"
      />
    </div>
    <SheetPictureGroupToolbar
      v-if="toolbarAnchor && targetPath"
      :anchor="toolbarAnchor"
      :disabled="readOnly"
      :can-ungroup="targetPath.length === 1"
      @ungroup="requestUngroup"
      @format="requestFormat"
      @dismiss="clearSelection"
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
