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
  rotateFloatingImages,
  flipFloatingImages,
  resizeFloatingImagesBy,
} from "@sheetcraft/sheet-engine/floating-image-group";
import { resizeFloatingImageSelectionBy } from "@sheetcraft/sheet-engine/floating-image-selection";
import {
  MAX_FLOATING_IMAGE_SIZE,
  cloneFloatingImage,
  areFloatingImageCollectionsEqual,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import {
  moveFloatingImageBy,
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  adjustImageCropSelection,
  type ImageCropGesture,
} from "@sheetcraft/sheet-engine/image-crop-selection";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { PictureAlignment, PictureAlignmentReference } from "../usePictureTools";
import { createContextMenuPoint } from "../../../shared/menu/useContextMenu";
import SheetFloatingImageContextMenu from "./SheetFloatingImageContextMenu.vue";
import SheetFloatingImageSelection from "../../../shared/sheet-objects/SheetObjectSelection.vue";
import type { DrawingThemeEffects } from "../drawing-theme-effects";

import { useFloatingImageEditing } from "../useFloatingImageEditing";
import {
  getFloatingImageViewportFragmentsForPaint,
  type FloatingImagePaintState,
} from "../floating-image-painter";
import { clientPointToElementSurface } from "../../../shared/sheet-input/surface-coordinates";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
const SheetFloatingImageToolbar = defineAsyncComponent(
  () => import("./SheetFloatingImageToolbar.vue"),
);
const SheetPictureSelectionToolbar = defineAsyncComponent(
  () => import("./SheetPictureSelectionToolbar.vue"),
);
const SheetFloatingImageCropOverlay = defineAsyncComponent(
  () => import("./SheetFloatingImageCropOverlay.vue"),
);
const MINIMUM_IMAGE_SIZE = 24;

const props = withDefaults(
  defineProps<{
    images: readonly FloatingImage[];
    owner?: object;
    applyUpdateMany?: (images: readonly FloatingImage[]) => boolean;
    /** Canvas renders image effects; the DOM layer retains this for overlays and future object handles. */
    effects?: DrawingThemeEffects;
    layout: SheetViewportLayout;
    assetUrls: ReadonlyMap<string, string>;
    loadingAssetIds?: ReadonlySet<string>;
    missingAssetIds?: ReadonlySet<string>;
    selectedImageId?: string | null;
    selectedImageIds?: readonly string[];
    readOnly?: boolean;
    previewOnDoubleClick?: boolean;
    scale?: number;
  }>(),
  { readOnly: false, scale: 1, previewOnDoubleClick: true },
);

const emit = defineEmits<{
  select: [id: string | null, additive?: boolean];
  updateMany: [images: FloatingImage[]];
  update: [image: FloatingImage];
  group: [ids: string[]];
  feedback: [key: MessageKey];
  delete: [id: string];
  convertToCell: [id: string];
  preview: [image: FloatingImage, trigger?: HTMLElement];
  copy: [id: string];
  cut: [id: string];
  paste: [id: string];
  paintStateChange: [state: FloatingImagePaintState];
}>();

const { t } = useAppI18n();
function commitImages(images: FloatingImage[]): void {
  const current = images.map((image) => props.images.find((entry) => entry.id === image.id));
  if (
    current.every((image) => image !== undefined) &&
    areFloatingImageCollectionsEqual(current as FloatingImage[], images)
  )
    return;
  if (!props.applyUpdateMany) {
    emit("updateMany", images);
    return;
  }
  try {
    if (!props.applyUpdateMany(images)) emit("feedback", "picture.operationFailed");
  } catch {
    emit("feedback", "picture.operationFailed");
  }
}

type ImageFragment = FloatingImageViewportFragment & { image: FloatingImage };
type Gesture = {
  image: FloatingImage;
  images: FloatingImage[];
  mode: "move" | FloatingImageResizeDirection;
  pointerId: number;
  focusTarget: HTMLElement;
  startPoint: Point;
  grouped: boolean;
  owner: object | undefined;
  layout: SheetViewportLayout;
  scale: number;
  selectionAtStart: string[];
  selectionSettled: boolean;
  groups: Map<string, string[]>;
};

type ContextMenuState = {
  imageId: string;
  anchor: FloatingReference;
  trigger: HTMLElement;
};

const gesture = shallowRef<Gesture>();
const previewImage = shallowRef<FloatingImage>();
const previewImages = shallowRef<FloatingImage[]>([]);
const selectedIds = computed(
  () =>
    new Set([
      ...(props.selectedImageIds ?? []),
      ...(props.selectedImageId ? [props.selectedImageId] : []),
    ]),
);
const layerRef = ref<HTMLElement | null>(null);
const contextMenu = shallowRef<ContextMenuState>();
const paintRevision = ref(0);
let pointerSession: PointerSession | undefined;
const selectedImage = computed(() =>
  props.images.find((image) => image.id === props.selectedImageId),
);
const owners = new WeakMap<object, number>();
const defaultOwner = {};
let nextOwner = 0;
function ownerKey(): number {
  const owner = props.owner ?? defaultOwner;
  let key = owners.get(owner);
  if (key === undefined) {
    key = ++nextOwner;
    owners.set(owner, key);
  }
  return key;
}
const selectionKey = computed(() =>
  JSON.stringify([
    ownerKey(),
    props.selectedImageId,
    [...selectedIds.value].map((id) => {
      const image = props.images.find((entry) => entry.id === id);
      return [id, image?.assetId, image?.groupId];
    }),
  ]),
);
const selectedGroup = computed(() => {
  const groupId = selectedImage.value?.groupId;
  if (!groupId || selectedIds.value.size < 2) return false;
  const members = props.images.filter((image) => image.groupId === groupId);
  return (
    members.length === selectedIds.value.size &&
    members.every((image) => selectedIds.value.has(image.id))
  );
});
const selectionToolbarAnchor = computed<FloatingReference | null>(() => {
  const visible = fragments.value.filter((entry) => selectedIds.value.has(entry.image.id));
  const layer = layerRef.value;
  if (selectedIds.value.size < 2 || !visible.length || !layer) return null;
  const x = Math.min(...visible.map((entry) => entry.clippedRect.x));
  const y = Math.min(...visible.map((entry) => entry.clippedRect.y));
  const right = Math.max(...visible.map((entry) => entry.clippedRect.x + entry.clippedRect.width));
  const bottom = Math.max(
    ...visible.map((entry) => entry.clippedRect.y + entry.clippedRect.height),
  );
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
const toolbarAnchor = computed<FloatingReference | null>(() => {
  const fragment = fragments.value.find((entry) => entry.image.id === props.selectedImageId);
  if (!fragment || !layerRef.value) return null;
  const layer = layerRef.value;
  const rect = fragment.clippedRect;
  return markRaw({
    contextElement: layer,
    getBoundingClientRect: () => {
      const bounds = layer.getBoundingClientRect();
      return new DOMRect(
        bounds.x + rect.x * props.scale,
        bounds.y + rect.y * props.scale,
        rect.width * props.scale,
        rect.height * props.scale,
      );
    },
  });
});
const {
  crop,
  cropGesture,
  canRestore,
  cacheImageSize,
  startCrop: startCropEdit,
  endCropGesture,
  cancelCrop: cancelCropEdit,
  applyCrop: applyCropEdit,
  rotateImage: rotateImageEdit,
  flipImage: flipImageEdit,
  restoreImage: restoreImageEdit,
  startCropGesture: startCropGestureEdit,
  moveCropGesture,
} = useFloatingImageEditing({
  layer: layerRef,
  getImage: () => selectedImage.value,
  getLayout: () => props.layout,
  getScale: () => props.scale,
  isDragging: () => Boolean(gesture.value),
  closeContextMenu: () => closeContextMenu(false),
  update: (image) => emit("update", image),
});
let lastGestureMode: Gesture["mode"] = "move";

const fragments = computed<ImageFragment[]>(() =>
  getFloatingImageViewportFragmentsForPaint(displayImages(), props.layout),
);
const groupFragments = computed<ImageFragment[]>(() => {
  if (!selectedGroup.value) return [];
  const images = displayImages().filter((image) => selectedIds.value.has(image.id));
  if (images.length < 2) return [];
  const rects = images.map((image) => getFloatingImageSheetRect(image, props.layout));
  if (rects.some((rect) => !rect)) return [];
  const x = Math.min(...rects.map((rect) => rect!.x));
  const y = Math.min(...rects.map((rect) => rect!.y));
  const width = Math.max(...rects.map((rect) => rect!.x + rect!.width)) - x;
  const height = Math.max(...rects.map((rect) => rect!.y + rect!.height)) - y;
  const proxy = reanchorFloatingImageAtSheetRect(
    { ...images[0]!, hidden: false },
    { x, y, width, height },
    props.layout,
  );
  return proxy ? getFloatingImageViewportFragmentsForPaint([proxy], props.layout) : [];
});

function displayImages(): readonly FloatingImage[] {
  return props.images.map(displayImage);
}

function displayImage(image: FloatingImage): FloatingImage {
  return (
    previewImages.value.find((entry) => entry.id === image.id) ??
    (previewImage.value?.id === image.id ? previewImage.value : image)
  );
}

function cloneImage(image: FloatingImage): FloatingImage {
  return cloneFloatingImage(image);
}

function getFragmentStyle(fragment: ImageFragment): CSSProperties {
  const clippedRect = fragment.clippedRect;
  return {
    left: `${clippedRect.x}px`,
    top: `${clippedRect.y}px`,
    width: `${clippedRect.width}px`,
    height: `${clippedRect.height}px`,
  };
}

function getFragmentKey(fragment: ImageFragment): string {
  return `${fragment.image.id}:${fragment.paneId}`;
}

function getAccessibleLabel(image: FloatingImage): string {
  if (props.assetUrls.has(image.assetId)) return image.altText || t("image.floatingAlt");
  return props.loadingAssetIds?.has(image.assetId)
    ? t("image.loading")
    : t("image.assetUnavailable");
}

function getLayerPoint(event: MouseEvent): Point {
  const layer = layerRef.value;
  if (!layer) return { x: 0, y: 0 };
  return clientPointToElementSurface({ x: event.clientX, y: event.clientY }, layer, props.scale);
}

function focusSelectedImageProxy(fallback?: HTMLElement): void {
  void nextTick(() => {
    const selected = layerRef.value?.querySelector<HTMLElement>(".is-selected");
    if (selected?.isConnected) selected.focus({ preventScroll: true });
    else if (fallback?.isConnected) fallback.focus({ preventScroll: true });
  });
}

function cancelPointerSession(): void {
  const active = pointerSession;
  pointerSession = undefined;
  active?.cancel();
}

function startGesture(
  image: FloatingImage,
  mode: Gesture["mode"],
  event: PointerEvent,
  startPoint = getLayerPoint(event),
): void {
  if (event.button !== 0 || crop.value) return;
  cancelPointerSession();
  const focusTarget =
    (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-floating-image-id]") ??
    (event.currentTarget as HTMLElement);
  const target = layerRef.value;
  if (!target) return;
  if (event.ctrlKey || event.metaKey) {
    emit("select", image.id, true);
    return;
  }
  const group = selectedIds.value.has(image.id)
    ? props.images.filter((entry) => selectedIds.value.has(entry.id))
    : image.groupId
      ? props.images.filter((entry) => entry.groupId === image.groupId)
      : [image];
  emit("select", image.id);
  focusSelectedImageProxy(focusTarget);
  if (props.readOnly) return;
  if (!group.length || group.some((entry) => !getFloatingImageSheetRect(entry, props.layout))) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  lastGestureMode = mode;
  previewImage.value = cloneImage(image);
  gesture.value = {
    image: cloneImage(image),
    images: group.map(cloneImage),
    mode,
    pointerId: event.pointerId,
    focusTarget,
    startPoint,
    grouped: Boolean(
      image.groupId &&
      group.length > 1 &&
      group.every((entry) => entry.groupId === image.groupId) &&
      group.length === props.images.filter((entry) => entry.groupId === image.groupId).length,
    ),
    owner: props.owner,
    layout: props.layout,
    scale: props.scale,
    selectionAtStart: [...selectedIds.value],
    selectionSettled:
      group.length === selectedIds.value.size &&
      group.every((entry) => selectedIds.value.has(entry.id)),
    groups: new Map(
      group
        .filter((entry) => entry.groupId)
        .map((entry) => [
          entry.groupId!,
          props.images
            .filter((member) => member.groupId === entry.groupId)
            .map((member) => member.id),
        ]),
    ),
  };
  pointerSession = startPointerSession({
    event,
    captureTarget: target,
    onMove: (moveEvent) => {
      if (moveEvent instanceof PointerEvent) onPointerMove(moveEvent);
    },
    onEnd: (endEvent) => {
      pointerSession = undefined;
      if (endEvent instanceof PointerEvent) onPointerUp(endEvent);
    },
    onCancel: () => {
      pointerSession = undefined;
      finishGesture(false);
    },
  });
}

function onPointerMove(event: PointerEvent): void {
  if (cropGesture.value) {
    moveCropGesture(event);
    return;
  }
  const activeGesture = gesture.value;
  if (!activeGesture || activeGesture.pointerId !== event.pointerId) return;
  moveGestureAt(activeGesture, {
    ...getLayerPoint(event),
  });
}

function moveGestureAt(activeGesture: Gesture, point: Point): void {
  if (!isCurrentGesture(activeGesture)) {
    finishGesture(false);
    return;
  }
  const deltaX = point.x - activeGesture.startPoint.x;
  const deltaY = point.y - activeGesture.startPoint.y;
  if (deltaX === 0 && deltaY === 0) {
    previewImages.value = activeGesture.images;
    previewImage.value = activeGesture.images.find((entry) => entry.id === activeGesture.image.id);
    return;
  }
  if (activeGesture.mode === "move") {
    const rects = activeGesture.images
      .map((entry) => getFloatingImageSheetRect(entry, props.layout))
      .filter((entry) => entry !== null);
    const delta = {
      x: Math.max(deltaX, -Math.min(...rects.map((rect) => rect.x))),
      y: Math.max(deltaY, -Math.min(...rects.map((rect) => rect.y))),
    };
    previewImages.value =
      delta.x === 0 && delta.y === 0
        ? activeGesture.images
        : activeGesture.images.map(
            (entry) => moveFloatingImageBy(entry, delta, props.layout) ?? entry,
          );
    previewImage.value = previewImages.value.find((entry) => entry.id === activeGesture.image.id);
    return;
  }
  if (activeGesture.images.length > 1) {
    previewImages.value =
      (activeGesture.grouped
        ? resizeFloatingImagesBy(
            activeGesture.images,
            activeGesture.mode,
            { x: deltaX, y: deltaY },
            props.layout,
          )
        : resizeFloatingImageSelectionBy(
            activeGesture.images,
            activeGesture.image.id,
            activeGesture.mode,
            { x: deltaX, y: deltaY },
            props.layout,
            MINIMUM_IMAGE_SIZE,
          )) ?? activeGesture.images;
    previewImage.value = previewImages.value.find((entry) => entry.id === activeGesture.image.id);
    return;
  }
  previewImage.value =
    resizeFloatingImageBy(
      activeGesture.image,
      activeGesture.mode,
      { x: deltaX, y: deltaY },
      props.layout,
      {
        minSize: MINIMUM_IMAGE_SIZE,
        maxSize: MAX_FLOATING_IMAGE_SIZE,
        preserveAspectRatio:
          activeGesture.mode.length === 2 && (activeGesture.image.lockAspectRatio ?? true),
      },
    ) ?? activeGesture.image;
}

function startCrop(): void {
  if (!props.readOnly) startCropEdit();
}

function cancelCrop(restoreFocus = true): void {
  cancelCropEdit(restoreFocus);
  cancelPointerSession();
}

function applyCrop(): void {
  if (!props.readOnly) {
    applyCropEdit();
    cancelPointerSession();
  }
}

function rotateImage(turns: -1 | 1 | 2): void {
  if (props.readOnly) return;
  const images = props.images.filter((image) => selectedIds.value.has(image.id));
  if (images.length < 2) rotateImageEdit(turns);
  else {
    const next = rotateFloatingImages(images, turns, props.layout);
    if (next) commitImages(next);
    else emit("feedback", "picture.operationFailed");
  }
}

function flipImage(axis: "horizontal" | "vertical"): void {
  if (props.readOnly) return;
  const images = props.images.filter((image) => selectedIds.value.has(image.id));
  if (images.length < 2) flipImageEdit(axis);
  else {
    const next = flipFloatingImages(images, axis, props.layout);
    if (next) commitImages(next);
    else emit("feedback", "picture.operationFailed");
  }
}

function restoreImage(): void {
  if (!props.readOnly) restoreImageEdit();
}

function startCropGesture(direction: ImageCropGesture, event: PointerEvent): void {
  if (props.readOnly) return;
  cancelPointerSession();
  startCropGestureEdit(direction, event);
  const target = layerRef.value;
  if (!target || !cropGesture.value) return;
  pointerSession = startPointerSession({
    event,
    captureTarget: target,
    onMove: (moveEvent) => {
      if (moveEvent instanceof PointerEvent) moveCropGesture(moveEvent);
    },
    onEnd: (endEvent) => {
      pointerSession = undefined;
      if (endEvent instanceof PointerEvent && cropGesture.value?.pointerId === endEvent.pointerId)
        endCropGesture();
    },
    onCancel: () => {
      pointerSession = undefined;
      cancelCrop(false);
    },
  });
}

function isCurrentGesture(active: Gesture): boolean {
  const current = active.images.map((image) => props.images.find((entry) => entry.id === image.id));
  const expected = active.images.map((image) => image.id);
  const matches = (ids: readonly string[]) =>
    ids.length === selectedIds.value.size && ids.every((id) => selectedIds.value.has(id));
  if (matches(expected)) active.selectionSettled = true;
  else if (active.selectionSettled || !matches(active.selectionAtStart)) return false;
  if (
    [...active.groups].some(([groupId, ids]) => {
      const members = props.images.filter((image) => image.groupId === groupId);
      return members.length !== ids.length || members.some((image) => !ids.includes(image.id));
    })
  )
    return false;
  return (
    active.owner === props.owner &&
    active.layout === props.layout &&
    active.scale === props.scale &&
    !props.readOnly &&
    current.every((image) => image !== undefined) &&
    areFloatingImageCollectionsEqual(current as FloatingImage[], active.images)
  );
}
function finishGesture(commit: boolean): void {
  const activeGesture = gesture.value;
  const preview = previewImage.value;
  const previews = previewImages.value;
  previewImages.value = [];
  gesture.value = undefined;
  previewImage.value = undefined;
  cancelPointerSession();
  if (!activeGesture) return;
  focusSelectedImageProxy(activeGesture.focusTarget);
  if (
    commit &&
    preview &&
    isCurrentGesture(activeGesture) &&
    !areFloatingImageCollectionsEqual(previews.length ? previews : [preview], activeGesture.images)
  )
    if (previews.length > 1) commitImages(previews);
    else emit("update", preview);
}

function onPointerUp(event: PointerEvent): void {
  if (cropGesture.value?.pointerId === event.pointerId) endCropGesture();
  if (gesture.value?.pointerId === event.pointerId) finishGesture(true);
}

function onPointerCancel(event: PointerEvent): void {
  if (cropGesture.value?.pointerId === event.pointerId) cancelCrop();
  if (gesture.value?.pointerId === event.pointerId) finishGesture(false);
}

function onLostPointerCapture(event: PointerEvent): void {
  if (cropGesture.value?.pointerId === event.pointerId) cancelCrop();
  if (gesture.value?.pointerId === event.pointerId) finishGesture(false);
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (crop.value && event.key === "Escape") {
    cancelCrop();
    event.preventDefault();
    return;
  }
  if (gesture.value && event.key === "Escape") {
    finishGesture(false);
    event.preventDefault();
  }
}

function closeContextMenu(restoreFocus: boolean): void {
  const trigger = contextMenu.value?.trigger;
  contextMenu.value = undefined;
  if (restoreFocus) {
    void nextTick(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }
}

function openContextMenu(
  image: FloatingImage,
  trigger: HTMLElement,
  anchor: FloatingReference = trigger,
): void {
  if (gesture.value || crop.value) return;
  emit("select", image.id);
  trigger.focus({ preventScroll: true });
  contextMenu.value = {
    imageId: image.id,
    trigger,
    anchor,
  };
}

function onImageContextMenu(image: FloatingImage, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  const trigger = event.currentTarget as HTMLElement;
  openContextMenu(image, trigger, createContextMenuPoint(event, layerRef.value ?? trigger));
}

function openImageKeyboardContextMenu(image: FloatingImage, event: KeyboardEvent): boolean {
  if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return false;
  event.preventDefault();
  event.stopPropagation();
  const trigger = event.currentTarget as HTMLElement;
  openContextMenu(image, trigger);
  return true;
}

function requestConvertToCell(): void {
  const imageId = contextMenu.value?.imageId;
  closeContextMenu(false);
  if (imageId && !props.readOnly) emit("convertToCell", imageId);
}

function requestPreview(): void {
  const image = props.images.find((entry) => entry.id === contextMenu.value?.imageId);
  const trigger = contextMenu.value?.trigger;
  closeContextMenu(false);
  if (image) emit("preview", image, trigger);
}

function requestClipboard(mode: "copy" | "cut" | "paste"): void {
  const imageId = contextMenu.value?.imageId;
  closeContextMenu(true);
  if (!imageId) return;
  if (mode === "copy") emit("copy", imageId);
  else if (mode === "cut" && !props.readOnly) emit("cut", imageId);
  else if (mode === "paste" && !props.readOnly) emit("paste", imageId);
}

function onImageDoubleClick(image: FloatingImage, event: MouseEvent): void {
  if (crop.value) {
    applyCrop();
    return;
  }
  if (props.previewOnDoubleClick) emit("preview", image, event.currentTarget as HTMLElement);
}

function onLayerDoubleClick(event: MouseEvent): void {
  // Pointer capture keeps drags alive across frozen panes and retargets clicks to this layer.
  if (
    crop.value ||
    event.target !== event.currentTarget ||
    gesture.value ||
    lastGestureMode !== "move" ||
    !props.previewOnDoubleClick
  )
    return;
  const image = props.images.find((entry) => entry.id === props.selectedImageId);
  if (image)
    emit("preview", image, layerRef.value?.querySelector<HTMLElement>(".is-selected") ?? undefined);
}

function requestDelete(): void {
  const imageId = contextMenu.value?.imageId;
  closeContextMenu(false);
  if (imageId && !props.readOnly) emit("delete", imageId);
}

function getPaintState(): FloatingImagePaintState {
  return { images: displayImages(), revision: paintRevision.value, effects: props.effects };
}

function emitPaintState(): void {
  paintRevision.value += 1;
  emit("paintStateChange", getPaintState());
}

function hitTestFloatingImage(point: Point): FloatingImage | undefined {
  for (let index = fragments.value.length - 1; index >= 0; index -= 1) {
    const fragment = fragments.value[index];
    if (!fragment) continue;
    const rect = fragment.clippedRect;
    if (
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height
    )
      return fragment.image;
  }
  return undefined;
}

function isSelectedOverlayTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-floating-image-selected]"));
}

/** Called by the shared surface before its cell pointer routing. */
function handleSurfacePointerDown(event: PointerEvent, point: Point): boolean {
  if (isSelectedOverlayTarget(event.target) || crop.value || event.button !== 0) return false;
  const image = hitTestFloatingImage(point);
  if (!image) return false;
  startGesture(image, "move", event, point);
  return true;
}

function handleSurfacePointerMove(event: PointerEvent, point: Point): boolean {
  const active = gesture.value;
  if (!active || active.pointerId !== event.pointerId) return false;
  moveGestureAt(active, point);
  return true;
}

function handleSurfacePointerUp(event: PointerEvent): boolean {
  if (gesture.value?.pointerId !== event.pointerId) return false;
  finishGesture(true);
  return true;
}

function handleSurfacePointerCancel(event: PointerEvent): boolean {
  if (gesture.value?.pointerId !== event.pointerId) return false;
  finishGesture(false);
  return true;
}

function handleSurfaceDoubleClick(event: MouseEvent, point: Point): boolean {
  if (isSelectedOverlayTarget(event.target) || crop.value) return false;
  const image = hitTestFloatingImage(point);
  if (!image) return false;
  if (props.previewOnDoubleClick) emit("preview", image, layerRef.value ?? undefined);
  return true;
}

function handleSurfaceContextMenu(event: MouseEvent, point: Point): boolean {
  if (isSelectedOverlayTarget(event.target)) return false;
  const image = hitTestFloatingImage(point);
  if (!image) return false;
  event.preventDefault();
  const trigger = layerRef.value ?? document.body;
  openContextMenu(image, trigger, createContextMenuPoint(event, trigger));
  return true;
}

function getSurfaceCursor(point: Point): "move" | undefined {
  return !crop.value && hitTestFloatingImage(point) ? "move" : undefined;
}

watch(
  () => props.images.map((image) => image.id),
  (ids) => {
    if (gesture.value && !ids.includes(gesture.value.image.id)) finishGesture(false);
    if (crop.value && !ids.includes(crop.value.image.id)) cancelCrop(false);
    if (contextMenu.value && !ids.includes(contextMenu.value.imageId)) closeContextMenu(false);
  },
);

watch(
  [
    () => props.images,
    previewImage,
    previewImages,
    crop,
    () => props.layout,
    () => props.assetUrls,
    () => props.effects,
  ],
  emitPaintState,
  { deep: false, flush: "post", immediate: true },
);

watch(
  () =>
    [
      selectedImage.value?.assetId,
      selectedImage.value && props.assetUrls.get(selectedImage.value.assetId),
    ] as const,
  ([assetId, source], _previous, onCleanup) => {
    if (!assetId || !source) return;
    const probe = new Image();
    probe.onload = () =>
      cacheImageSize(assetId, { width: probe.naturalWidth, height: probe.naturalHeight });
    probe.src = source;
    onCleanup(() => {
      probe.onload = null;
      probe.src = "";
    });
  },
  { immediate: true },
);

watch(
  () => props.selectedImageId,
  (selectedImageId) => {
    if (crop.value && selectedImageId !== crop.value.image.id) cancelCrop(false);
    if (contextMenu.value && selectedImageId !== contextMenu.value.imageId) closeContextMenu(false);
  },
);

watch(
  () => [props.selectedImageId, props.selectedImageIds],
  () => {
    if (gesture.value && !isCurrentGesture(gesture.value)) finishGesture(false);
  },
);
watch(
  () => props.owner,
  () => {
    finishGesture(false);
    cancelCrop(false);
    closeContextMenu(false);
  },
);
watch(
  () => props.readOnly,
  (readOnly) => {
    if (!readOnly) return;
    finishGesture(false);
    cancelCrop(false);
  },
);

watch(
  () => selectedImage.value,
  (image) => {
    if (crop.value && image !== crop.value.image) cancelCrop(false);
  },
);
onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onBeforeUnmount(() => {
  cancelPointerSession();
  window.removeEventListener("keydown", onWindowKeydown);
  finishGesture(false);
  cancelCrop(false);
  closeContextMenu(false);
});

function arrangeImages(
  ids: readonly string[],
  action: PictureAlignment,
  reference: PictureAlignmentReference = "selection",
): void {
  if (props.readOnly) return;
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !props.images.some((image) => image.id === id))
  ) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  const members = props.images
    .filter((image) => ids.includes(image.id))
    .flatMap((image) => {
      const rect = getFloatingImageSheetRect(image, props.layout);
      return rect ? [{ image, rect }] : [];
    });
  if (!members.length) return;
  if (members.length !== ids.length) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  if ((action === "horizontal" || action === "vertical") && members.length < 3) return;
  if (action === "grid") {
    commitImages(members.map(({ image }) => ({ ...image, offsetX: 0, offsetY: 0 })));
    return;
  }
  const left = Math.min(...members.map((entry) => entry.rect.x));
  const right = Math.max(...members.map((entry) => entry.rect.x + entry.rect.width));
  const top = Math.min(...members.map((entry) => entry.rect.y));
  const bottom = Math.max(...members.map((entry) => entry.rect.y + entry.rect.height));
  const last =
    members.find((entry) => entry.image.id === props.selectedImageId) ??
    members.find((entry) => entry.image.id === ids.at(-1));
  const base =
    reference === "last-selected" && last
      ? last.rect
      : { x: left, y: top, width: right - left, height: bottom - top };
  const ordered = [...members].sort((a, b) =>
    action === "horizontal" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
  );
  let cursor = action === "horizontal" ? left : top;
  const gap =
    members.length < 2
      ? 0
      : (action === "horizontal"
          ? right - left - members.reduce((sum, entry) => sum + entry.rect.width, 0)
          : bottom - top - members.reduce((sum, entry) => sum + entry.rect.height, 0)) /
        (members.length - 1);
  const next = ordered.map(({ image, rect }) => {
    const target = { ...rect };
    if (action === "left") target.x = base.x;
    if (action === "center" || action === "both") target.x = base.x + (base.width - rect.width) / 2;
    if (action === "right") target.x = base.x + base.width - rect.width;
    if (action === "top") target.y = base.y;
    if (action === "middle" || action === "both")
      target.y = base.y + (base.height - rect.height) / 2;
    if (action === "bottom") target.y = base.y + base.height - rect.height;
    if (action === "horizontal") {
      target.x = cursor;
      cursor += rect.width + gap;
    }
    if (action === "vertical") {
      target.y = cursor;
      cursor += rect.height + gap;
    }
    return target.x < 0 || target.y < 0
      ? null
      : target.x === rect.x && target.y === rect.y
        ? image
        : reanchorFloatingImageAtSheetRect(image, target, props.layout);
  });
  if (next.every((image) => image !== null)) commitImages(next);
  else emit("feedback", "picture.operationFailed");
}

function alignSelection(
  action: PictureAlignment,
  reference: PictureAlignmentReference,
  key: string,
): void {
  if (key === selectionKey.value && !gesture.value && !crop.value)
    arrangeImages([...selectedIds.value], action, reference);
}
function groupSelection(key: string): void {
  if (key === selectionKey.value && !props.readOnly && !gesture.value && !crop.value)
    emit("group", [...selectedIds.value]);
}
function dismissSelection(key: string): void {
  if (key === selectionKey.value) emit("select", null);
}

defineExpose({
  arrangeImages,
  startCrop,
  rotateImage,
  flipImage,
  restoreImage,
  getPaintState,
  cacheImageSize,
  handleSurfacePointerDown,
  handleSurfacePointerMove,
  handleSurfacePointerUp,
  handleSurfacePointerCancel,
  handleSurfaceDoubleClick,
  handleSurfaceContextMenu,
  getSurfaceCursor,
});

function onImageKeydown(image: FloatingImage, event: KeyboardEvent): void {
  if (crop.value) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCrop();
    } else if (event.key === "Enter") {
      event.preventDefault();
      applyCrop();
    } else {
      const distance = event.shiftKey ? 10 : 1;
      const delta = {
        ArrowLeft: { x: -distance, y: 0 },
        ArrowRight: { x: distance, y: 0 },
        ArrowUp: { x: 0, y: -distance },
        ArrowDown: { x: 0, y: distance },
      }[event.key];
      if (delta) {
        event.preventDefault();
        const current = crop.value;
        crop.value = {
          ...current,
          selection: adjustImageCropSelection(
            current.selection,
            "move",
            { x: delta.x / image.width, y: delta.y / image.height },
            { width: 0, height: 0 },
          ),
        };
      }
    }
    return;
  }
  if (openImageKeyboardContextMenu(image, event)) return;
  if (event.key === "Escape") {
    if (gesture.value) finishGesture(false);
    else emit("select", null);
    event.preventDefault();
    return;
  }
  if (!props.readOnly && (event.key === "Delete" || event.key === "Backspace")) {
    emit("delete", image.id);
    event.preventDefault();
    return;
  }
  if (props.readOnly) return;
  const distance = event.shiftKey ? 10 : 1;
  const offset = {
    ArrowLeft: { x: -distance, y: 0 },
    ArrowRight: { x: distance, y: 0 },
    ArrowUp: { x: 0, y: -distance },
    ArrowDown: { x: 0, y: distance },
  }[event.key];
  if (!offset) return;
  const members = props.images.filter((entry) => selectedIds.value.has(entry.id));
  const rects = members
    .map((entry) => getFloatingImageSheetRect(entry, props.layout))
    .filter((entry) => entry !== null);
  if (members.length !== selectedIds.value.size || rects.length !== members.length) {
    emit("feedback", "picture.operationFailed");
    event.preventDefault();
    return;
  }
  const delta = {
    x: Math.max(offset.x, -Math.min(...rects.map((rect) => rect.x))),
    y: Math.max(offset.y, -Math.min(...rects.map((rect) => rect.y))),
  };
  if (delta.x === 0 && delta.y === 0) {
    event.preventDefault();
    return;
  }
  const next = members.map((entry) => moveFloatingImageBy(entry, delta, props.layout) ?? entry);
  if (next.length > 1) commitImages(next);
  else if (next[0]) emit("update", next[0]);
  event.preventDefault();
}
</script>

<template>
  <div
    ref="layerRef"
    class="sheet-floating-image-layer"
    data-floating-image-layer
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onLostPointerCapture"
    @dblclick.prevent.stop="onLayerDoubleClick"
  >
    <div
      v-for="fragment in fragments.filter((entry) => selectedIds.has(entry.image.id))"
      :key="getFragmentKey(fragment)"
      class="sheet-floating-image-layer__selected"
      :class="{ 'is-selected': !crop }"
      :style="getFragmentStyle(fragment)"
      :data-floating-image-id="fragment.image.id"
      :data-floating-image-pane="fragment.paneId"
      data-floating-image-selected
      tabindex="0"
      role="group"
      :aria-label="getAccessibleLabel(fragment.image)"
      @pointerdown.stop="startGesture(fragment.image, 'move', $event)"
      @contextmenu="onImageContextMenu(fragment.image, $event)"
      @dblclick.prevent.stop="onImageDoubleClick(fragment.image, $event)"
      @keydown="onImageKeydown(fragment.image, $event)"
    >
      <SheetFloatingImageCropOverlay
        v-if="crop?.image.id === fragment.image.id"
        :fragment="fragment"
        :selection="crop.selection"
        @start="startCropGesture"
      />
      <SheetFloatingImageSelection
        v-if="!selectedGroup && !crop && !readOnly"
        :fragment="fragment"
        @resize="(direction, event) => startGesture(fragment.image, direction, event)"
      />
    </div>
    <template v-if="!crop && !readOnly && selectedImage">
      <div
        v-for="fragment in groupFragments"
        :key="`group-${fragment.paneId}`"
        class="sheet-floating-image-layer__selected"
        :style="getFragmentStyle(fragment)"
        data-floating-image-group
      >
        <SheetFloatingImageSelection
          :fragment="fragment"
          @resize="(direction, event) => startGesture(selectedImage!, direction, event)"
        />
      </div>
    </template>
    <SheetPictureSelectionToolbar
      v-if="selectionToolbarAnchor && !selectedGroup && !crop && !gesture && !contextMenu"
      :key="selectionKey"
      :anchor="selectionToolbarAnchor"
      :selection-key="selectionKey"
      :count="selectedIds.size"
      :disabled="readOnly"
      @align="alignSelection"
      @group="groupSelection"
      @dismiss="dismissSelection"
    />
    <SheetFloatingImageToolbar
      v-if="toolbarAnchor && selectedImage && selectedIds.size <= 1 && !gesture && !contextMenu"
      :anchor="toolbarAnchor"
      :cropping="Boolean(crop)"
      :can-restore="canRestore"
      :disabled="readOnly || !assetUrls.has(selectedImage.assetId)"
      @crop="startCrop"
      @rotate="rotateImage"
      @flip="flipImage"
      @restore="restoreImage"
      @apply-crop="applyCrop"
      @cancel-crop="cancelCrop"
    />
    <SheetFloatingImageContextMenu
      v-if="contextMenu"
      :anchor="contextMenu.anchor"
      :read-only="readOnly"
      @convert-to-cell="requestConvertToCell"
      @preview="requestPreview"
      @copy="requestClipboard('copy')"
      @cut="requestClipboard('cut')"
      @paste="requestClipboard('paste')"
      @delete="requestDelete"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped lang="scss">
.sheet-floating-image-layer {
  position: absolute;
  z-index: 7;
  inset: 0;
  pointer-events: none;

  &__selected {
    position: absolute;
    box-sizing: border-box;
    pointer-events: auto;
    touch-action: none;
    cursor: move;
    outline: 1px solid var(--sheetcraft-action-primary);

    &[data-floating-image-group] {
      pointer-events: none;
      outline: none;
    }

    &:focus-visible {
      --image-selection-style: dashed;
    }
  }
}
</style>
