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
import {
  MAX_FLOATING_IMAGE_SIZE,
  cloneFloatingImage,
  areFloatingImageCollectionsEqual,
  type FloatingImage as PictureObject,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  reanchorFloatingImageAtSheetRect,
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
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type StandalonePictureObject as FloatingImage,
} from "@sheetcraft/core/picture-object";
import { requireStandalonePicture, requireStandalonePictures } from "../picture-document-support";
import { pictureFrameContainsPoint } from "@sheetcraft/core/picture-frame";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { hitPictureViewportPoint, pictureFragmentRootId } from "../picture-hit-testing";
import {
  movePictureRootSelectionBy,
  resizePictureRootSelectionBy,
} from "../picture-root-selection-planning";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  getPictureViewportFragments,
  type PictureViewportFragment,
} from "../picture-viewport-fragments";
import {
  getPictureViewRect,
  resizePictureViewBy,
  rotatePictureViewBy,
  flipPictureView,
} from "../picture-view-operations";
import SheetFramedPictureSelection from "./SheetFramedPictureSelection.vue";
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
    images: readonly PictureObject[];
    /** Complete forest when the host separately renders owned groups. */
    selectionRoots?: readonly PictureObject[];
    owner?: object;
    applyUpdateMany?: (images: readonly PictureObject[]) => boolean;
    /** Canvas renders image effects; the DOM layer retains this for overlays and future object handles. */
    effects?: DrawingThemeEffects;
    layout: SheetViewportLayout;
    frameContext?: PictureFrameLayoutContext;
    assetUrls: ReadonlyMap<string, string>;
    loadingAssetIds?: ReadonlySet<string>;
    missingAssetIds?: ReadonlySet<string>;
    selectedImageId?: string | null;
    selectedImageIds?: readonly string[];
    readOnly?: boolean;
    canEditRoot?: (root: PictureObject) => boolean;
    canGroup?: boolean;
    previewOnDoubleClick?: boolean;
    scale?: number;
    cropHandler?: () => boolean;
    croppingExternally?: boolean;
  }>(),
  { readOnly: false, canGroup: true, scale: 1, previewOnDoubleClick: true },
);

// The prepared standalone layer refuses the whole container collection before paint or gestures.
const currentImages = computed(() => requireStandalonePictures(props.images));

const emit = defineEmits<{
  select: [id: string | null, additive?: boolean];
  updateMany: [images: PictureObject[]];
  update: [image: PictureObject];
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
function commitImages(nextImages: PictureObject[]): boolean {
  if (interactionReadOnly.value || nextImages.some((root) => !isRootAvailable(root.id)))
    return false;
  try {
    requireStandalonePictures(props.images);
    selectionImages();
  } catch {
    emit("feedback", "picture.operationFailed");
    return false;
  }
  const current = nextImages.map((image) =>
    selectionImages().find((entry) => entry.id === image.id),
  );
  if (
    current.every((image) => image !== undefined) &&
    areFloatingImageCollectionsEqual(current as PictureObject[], nextImages)
  )
    return true;
  if (!props.applyUpdateMany) {
    if (nextImages.length === 1) emit("update", nextImages[0]!);
    else emit("updateMany", nextImages);
    return true;
  }
  try {
    if (!props.applyUpdateMany(nextImages)) {
      emit("feedback", "picture.operationFailed");
      return false;
    }
    return true;
  } catch {
    emit("feedback", "picture.operationFailed");
    return false;
  }
}

type ImageFragment = Exclude<PictureViewportFragment, { kind: "group-leaf" }>;
type LegacyImageFragment = FloatingImageViewportFragment & {
  image: LegacyFloatingImage;
  kind: "legacy";
};
const fragmentBounds = (fragment: ImageFragment) =>
  fragment.kind === "legacy" ? fragment.clippedRect : fragment.clippedBounds;
type Gesture = {
  image: FloatingImage;
  images: PictureObject[];
  mode: "move" | FloatingImageResizeDirection;
  pointerId: number;
  focusTarget: HTMLElement;
  startPoint: Point;
  grouped: boolean;
  owner: object | undefined;
  layout: SheetViewportLayout;
  frameContext: PictureFrameLayoutContext | undefined;
  scale: number;
  selectionAtStart: string[];
  selectionSettled: boolean;
  groups: Map<string, string[]>;
};

type ContextMenuState = {
  imageId: string;
  anchor: FloatingReference;
  trigger: HTMLElement;
  owner: object | undefined;
  rootsReference: readonly PictureObject[];
  roots: PictureObject[];
  selectedIds: string[];
};

const gesture = shallowRef<Gesture>();
const previewImage = shallowRef<FloatingImage>();
const previewImages = shallowRef<PictureObject[]>([]);
const selectedIds = computed(
  () =>
    new Set([
      ...(props.selectedImageIds ?? []),
      ...(props.selectedImageId ? [props.selectedImageId] : []),
    ]),
);
function isRootAvailable(id: string): boolean {
  const root = selectionImages().find((image) => image.id === id);
  return !!root && props.canEditRoot?.(root) !== false;
}
const interactionReadOnly = computed(
  () =>
    props.readOnly ||
    [...selectedIds.value].some(
      (id) => selectionImages().some((root) => root.id === id) && !isRootAvailable(id),
    ),
);
const layerRef = ref<HTMLElement | null>(null);
const contextMenu = shallowRef<ContextMenuState>();
const paintRevision = ref(0);
let pointerSession: PointerSession | undefined;
const selectedImage = computed(() =>
  currentImages.value.find((image) => image.id === props.selectedImageId),
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
      const image = currentImages.value.find((entry) => entry.id === id);
      return [id, image?.assetId, image?.groupId];
    }),
  ]),
);
const selectedGroup = computed(() => {
  const groupId = selectedImage.value?.groupId;
  if (
    !groupId ||
    selectedIds.value.size < 2 ||
    currentImages.value.some(
      (image) => selectedIds.value.has(image.id) && isFramedPictureObject(image),
    )
  )
    return false;
  const members = currentImages.value.filter((image) => image.groupId === groupId);
  return (
    members.length === selectedIds.value.size &&
    members.every((image) => selectedIds.value.has(image.id))
  );
});
const hasExtendedRootSelection = computed(() =>
  selectionImages().some(
    (root) =>
      selectedIds.value.has(root.id) && (isFramedPictureObject(root) || isPictureGroup(root)),
  ),
);
const selectionToolbarAnchor = computed<FloatingReference | null>(() => {
  const visible = fragments.value.filter((entry) => selectedIds.value.has(entry.image.id));
  const layer = layerRef.value;
  if (selectedIds.value.size < 2 || !visible.length || !layer) return null;
  const x = Math.min(...visible.map((entry) => fragmentBounds(entry).x));
  const y = Math.min(...visible.map((entry) => fragmentBounds(entry).y));
  const right = Math.max(
    ...visible.map((entry) => fragmentBounds(entry).x + fragmentBounds(entry).width),
  );
  const bottom = Math.max(
    ...visible.map((entry) => fragmentBounds(entry).y + fragmentBounds(entry).height),
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
  const rect = fragmentBounds(fragment);
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

  restoreImage: restoreImageEdit,
  startCropGesture: startCropGestureEdit,
  moveCropGesture,
} = useFloatingImageEditing({
  layer: layerRef,
  getImage: () =>
    selectedImage.value && !isFramedPictureObject(selectedImage.value)
      ? selectedImage.value
      : undefined,
  getLayout: () => props.layout,
  getScale: () => props.scale,
  isDragging: () => Boolean(gesture.value),
  closeContextMenu: () => closeContextMenu(false),
  update: (image) => commitImages([image]),
});
let lastGestureMode: Gesture["mode"] = "move";

const fragments = computed<ImageFragment[]>(() =>
  getPictureViewportFragments(displayImages(), props.layout, props.frameContext),
);
const groupFragments = computed<LegacyImageFragment[]>(() => {
  if (!selectedGroup.value) return [];
  const images = displayImages().filter((image) => selectedIds.value.has(image.id));
  if (images.length < 2 || images.some(isFramedPictureObject)) return [];
  const legacy = images as LegacyFloatingImage[];
  const rects = legacy.map((image) => getFloatingImageSheetRect(image, props.layout));
  if (rects.some((rect) => !rect)) return [];
  const x = Math.min(...rects.map((rect) => rect!.x));
  const y = Math.min(...rects.map((rect) => rect!.y));
  const width = Math.max(...rects.map((rect) => rect!.x + rect!.width)) - x;
  const height = Math.max(...rects.map((rect) => rect!.y + rect!.height)) - y;
  const proxy = reanchorFloatingImageAtSheetRect(
    { ...legacy[0]!, hidden: false },
    { x, y, width, height },
    props.layout,
  );
  return proxy
    ? getFloatingImageViewportFragmentsForPaint([proxy], props.layout).map((fragment) => ({
        ...fragment,
        kind: "legacy" as const,
      }))
    : [];
});

function selectionImages(): readonly PictureObject[] {
  const roots = props.selectionRoots ?? props.images;
  // Whole-forest projection validates even hidden ownership before any gesture.
  getPictureViewportFragments(roots, props.layout, props.frameContext);
  return roots;
}
function selectedPreview(id: string): FloatingImage | undefined {
  const image = previewImages.value.find((entry) => entry.id === id);
  return image ? requireStandalonePicture(image) : undefined;
}

function displayImages(): readonly FloatingImage[] {
  return requireStandalonePictures(props.images).map(displayImage);
}

function displayImage(image: FloatingImage): FloatingImage {
  return requireStandalonePicture(
    previewImages.value.find((entry) => entry.id === image.id) ??
      (previewImage.value?.id === image.id ? previewImage.value : image),
  );
}

function cloneImage(image: FloatingImage): FloatingImage {
  return requireStandalonePicture(cloneFloatingImage(image));
}

function getFragmentStyle(fragment: ImageFragment): CSSProperties {
  const clippedRect = fragmentBounds(fragment);
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
  if (props.assetUrls.has(image.assetId))
    return [image.altTitle, image.altText].filter(Boolean).join(". ") || t("image.floatingAlt");
  return props.loadingAssetIds?.has(image.assetId)
    ? t("image.loading")
    : t("image.assetUnavailable");
}

function getLayerPoint(event: MouseEvent): Point {
  const layer = layerRef.value;
  if (!layer) return { x: 0, y: 0 };
  return clientPointToElementSurface({ x: event.clientX, y: event.clientY }, layer, props.scale);
}

function focusSelectedImageProxy(fallback?: HTMLElement, expectedId = props.selectedImageId): void {
  const owner = props.owner,
    layout = props.layout,
    frameContext = props.frameContext,
    scale = props.scale,
    source = normalizePictureObjectCollection(props.selectionRoots ?? props.images);
  void nextTick(() => {
    if (
      owner !== props.owner ||
      layout !== props.layout ||
      frameContext !== props.frameContext ||
      scale !== props.scale ||
      expectedId !== props.selectedImageId ||
      !areFloatingImageCollectionsEqual(
        source,
        normalizePictureObjectCollection(props.selectionRoots ?? props.images),
      )
    )
      return;
    const selected = [
      ...(layerRef.value?.querySelectorAll<HTMLElement>(".is-selected") ?? []),
    ].find((element) => element.dataset.floatingImageId === expectedId);
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
  if (event.button !== 0 || crop.value || !isRootAvailable(image.id)) return;
  try {
    planStartGesture(image, mode, event, startPoint);
  } catch {
    finishGesture(false);
    emit("feedback", "picture.operationFailed");
  }
}
function planStartGesture(
  image: FloatingImage,
  mode: Gesture["mode"],
  event: PointerEvent,
  startPoint: Point,
): void {
  requireStandalonePictures(props.images);
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
    ? selectionImages().filter((entry) => selectedIds.value.has(entry.id))
    : image.groupId
      ? currentImages.value.filter((entry) => entry.groupId === image.groupId)
      : [image];
  if (selectedIds.value.has(image.id) && group.length !== selectedIds.value.size) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  if (group.some((root) => !isRootAvailable(root.id))) return;
  emit("select", image.id);
  focusSelectedImageProxy(focusTarget, image.id);
  if (props.readOnly) return;
  if (
    !group.length ||
    group.some((entry) => !getPictureViewRect(entry, props.layout, props.frameContext))
  ) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  lastGestureMode = mode;
  previewImage.value = cloneImage(image);
  gesture.value = {
    image: cloneImage(image),
    images: group.map(cloneFloatingImage),
    mode,
    pointerId: event.pointerId,
    focusTarget,
    startPoint,
    grouped: Boolean(
      image.groupId &&
      group.length > 1 &&
      group.every((entry) => !isPictureGroup(entry) && entry.groupId === image.groupId) &&
      group.length ===
        currentImages.value.filter((entry) => entry.groupId === image.groupId).length,
    ),
    owner: props.owner,
    layout: props.layout,
    frameContext: props.frameContext,
    scale: props.scale,
    selectionAtStart: [...selectedIds.value],
    selectionSettled:
      group.length === selectedIds.value.size &&
      group.every((entry) => selectedIds.value.has(entry.id)),
    groups: new Map(
      group
        .flatMap((entry) => (isPictureGroup(entry) || !entry.groupId ? [] : [entry]))
        .map((entry) => [
          entry.groupId!,
          currentImages.value
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
  try {
    planGestureAt(activeGesture, point);
  } catch {
    finishGesture(false);
    emit("feedback", "picture.operationFailed");
  }
}
function planGestureAt(activeGesture: Gesture, point: Point): void {
  if (!isCurrentGesture(activeGesture)) {
    finishGesture(false);
    return;
  }
  const deltaX = point.x - activeGesture.startPoint.x;
  const deltaY = point.y - activeGesture.startPoint.y;
  if (deltaX === 0 && deltaY === 0) {
    previewImages.value = activeGesture.images;
    previewImage.value = selectedPreview(activeGesture.image.id);
    return;
  }
  if (activeGesture.mode === "move") {
    const planned = movePictureRootSelectionBy(
      activeGesture.images,
      { x: deltaX, y: deltaY },
      props.layout,
      props.frameContext,
    );
    if (!planned) {
      finishGesture(false);
      emit("feedback", "picture.operationFailed");
      return;
    }
    previewImages.value = planned;
    previewImage.value = selectedPreview(activeGesture.image.id);
    return;
  }
  if (activeGesture.images.length > 1) {
    const planned = activeGesture.grouped
      ? resizeFloatingImagesBy(
          activeGesture.images as LegacyFloatingImage[],
          activeGesture.mode,
          { x: deltaX, y: deltaY },
          props.layout,
        )
      : resizePictureRootSelectionBy(
          activeGesture.images,
          activeGesture.image.id,
          activeGesture.mode,
          { x: deltaX, y: deltaY },
          props.layout,
          props.frameContext,
          MINIMUM_IMAGE_SIZE,
        );
    if (!planned) {
      finishGesture(false);
      emit("feedback", "picture.operationFailed");
      return;
    }
    previewImages.value = planned;
    previewImage.value = selectedPreview(activeGesture.image.id);
    return;
  }
  const next = resizePictureViewBy(
    activeGesture.image,
    activeGesture.mode,
    { x: deltaX, y: deltaY },
    props.layout,
    MINIMUM_IMAGE_SIZE,
    MAX_FLOATING_IMAGE_SIZE,
    props.frameContext,
  );
  if (!next) {
    finishGesture(false);
    emit("feedback", "picture.operationFailed");
    return;
  }
  previewImages.value = [next];
  previewImage.value = next;
}

function startCrop(): void {
  if (props.cropHandler) {
    closeContextMenu(false);
    if (!interactionReadOnly.value && !props.cropHandler())
      emit("feedback", "picture.operationFailed");
    return;
  }
  if (!interactionReadOnly.value) {
    if (selectedImage.value && isFramedPictureObject(selectedImage.value))
      emit("feedback", "picture.operationFailed");
    else startCropEdit();
  }
}

function cancelCrop(restoreFocus = true): void {
  cancelCropEdit(restoreFocus);
  cancelPointerSession();
}

function applyCrop(): void {
  if (!interactionReadOnly.value) {
    if (applyCropEdit()) cancelPointerSession();
  }
}

function rotateImage(turns: -1 | 1 | 2): void {
  try {
    planRotateImage(turns);
  } catch {
    emit("feedback", "picture.operationFailed");
  }
}
function planRotateImage(turns: -1 | 1 | 2): void {
  if (interactionReadOnly.value) return;
  const images = currentImages.value.filter((image) => selectedIds.value.has(image.id));
  if (images.length !== selectedIds.value.size) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  if (images.length < 2) {
    const image = selectedImage.value;
    if (image) {
      const next = rotatePictureViewBy(image, turns, props.layout, props.frameContext);
      if (next) commitImages([next]);
      else emit("feedback", "picture.operationFailed");
      focusSelectedImageProxy();
    }
  } else {
    const next = rotateFloatingImages(images, turns, props.layout);
    if (next) commitImages(next);
    else emit("feedback", "picture.operationFailed");
  }
}

function flipImage(axis: "horizontal" | "vertical"): void {
  try {
    planFlipImage(axis);
  } catch {
    emit("feedback", "picture.operationFailed");
  }
}
function planFlipImage(axis: "horizontal" | "vertical"): void {
  if (interactionReadOnly.value) return;
  const images = currentImages.value.filter((image) => selectedIds.value.has(image.id));
  if (images.length !== selectedIds.value.size) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  if (images.length < 2) {
    const image = selectedImage.value;
    if (image) {
      commitImages([flipPictureView(image, axis, props.layout, props.frameContext)]);
      focusSelectedImageProxy();
    }
  } else {
    const next = flipFloatingImages(images, axis, props.layout);
    if (next) commitImages(next);
    else emit("feedback", "picture.operationFailed");
  }
}

function restoreImage(): void {
  if (!interactionReadOnly.value) {
    if (selectedImage.value && isFramedPictureObject(selectedImage.value))
      emit("feedback", "picture.operationFailed");
    else restoreImageEdit();
  }
}

function startCropGesture(direction: ImageCropGesture, event: PointerEvent): void {
  if (interactionReadOnly.value) return;
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
  const current = active.images.map((image) =>
    selectionImages().find((entry) => entry.id === image.id),
  );
  const expected = active.images.map((image) => image.id);
  const matches = (ids: readonly string[]) =>
    ids.length === selectedIds.value.size && ids.every((id) => selectedIds.value.has(id));
  if (matches(expected)) active.selectionSettled = true;
  else if (active.selectionSettled || !matches(active.selectionAtStart)) return false;
  if (
    [...active.groups].some(([groupId, ids]) => {
      const members = currentImages.value.filter((image) => image.groupId === groupId);
      return members.length !== ids.length || members.some((image) => !ids.includes(image.id));
    })
  )
    return false;
  return (
    active.owner === props.owner &&
    active.layout === props.layout &&
    active.frameContext === props.frameContext &&
    active.scale === props.scale &&
    !interactionReadOnly.value &&
    current.every((image) => image !== undefined) &&
    areFloatingImageCollectionsEqual(current as PictureObject[], active.images)
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
    commitImages(previews.length ? previews : [preview]);
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
  if (gesture.value || crop.value || !isRootAvailable(image.id)) return;
  emit("select", image.id);
  trigger.focus({ preventScroll: true });
  contextMenu.value = {
    imageId: image.id,
    trigger,
    anchor,
    owner: props.owner,
    rootsReference: selectionImages(),
    roots: selectionImages().map(cloneFloatingImage),
    selectedIds: [...selectedIds.value],
  };
  const menu = contextMenu.value;
  // Selection is an emitted controlled contract. Allow its one render-cycle
  // acknowledgement, while uncontrolled consumers keep their original state.
  void nextTick(() => {
    if (contextMenu.value === menu && props.selectedImageId === menu.imageId)
      menu.selectedIds = [...selectedIds.value];
  });
}

function onImageContextMenu(image: FloatingImage, event: MouseEvent): void {
  if (!isRootAvailable(image.id)) return;
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

const contextMenuSourceUnsupported = computed(() => {
  const image = currentImages.value.find((entry) => entry.id === contextMenu.value?.imageId);
  return Boolean(image && isFramedPictureObject(image));
});
function isContextMenuOwnerCurrent(menu: ContextMenuState): boolean {
  try {
    return (
      contextMenu.value === menu &&
      menu.owner === props.owner &&
      menu.rootsReference === selectionImages() &&
      menu.selectedIds.length === selectedIds.value.size &&
      menu.selectedIds.every((id) => selectedIds.value.has(id)) &&
      areFloatingImageCollectionsEqual(menu.roots, selectionImages())
    );
  } catch {
    return false;
  }
}
const contextActions = computed(() => {
  const menu = contextMenu.value;
  const current = () => !!menu && isContextMenuOwnerCurrent(menu);
  return {
    copy: () => {
      if (current()) requestClipboard("copy");
    },
    cut: () => {
      if (current()) requestClipboard("cut");
    },
    paste: () => {
      if (current()) requestClipboard("paste");
    },
    preview: () => {
      if (current()) requestPreview();
    },
    convert: () => {
      if (current()) requestConvertToCell();
    },
    delete: () => {
      if (current()) requestDelete();
    },
    close: (restoreFocus: boolean) => {
      if (contextMenu.value === menu) closeContextMenu(restoreFocus);
    },
  };
});
function requestConvertToCell(): void {
  if (props.croppingExternally || contextMenuSourceUnsupported.value) return;
  const imageId = contextMenu.value?.imageId;
  closeContextMenu(false);
  if (imageId && !interactionReadOnly.value) emit("convertToCell", imageId);
}

function requestPreview(): void {
  if (props.croppingExternally) return;
  const image = currentImages.value.find((entry) => entry.id === contextMenu.value?.imageId);
  const trigger = contextMenu.value?.trigger;
  closeContextMenu(false);
  if (image) emit("preview", image, trigger);
}

function requestClipboard(mode: "copy" | "cut" | "paste"): void {
  const imageId = contextMenu.value?.imageId;
  closeContextMenu(true);
  if (!imageId) return;
  if (mode === "copy") emit("copy", imageId);
  else if (mode === "cut" && !interactionReadOnly.value) emit("cut", imageId);
  else if (mode === "paste" && !interactionReadOnly.value) emit("paste", imageId);
}

function onImageDoubleClick(image: FloatingImage, event: MouseEvent): void {
  if (!isRootAvailable(image.id)) return;
  if (crop.value) {
    applyCrop();
    return;
  }
  if (props.previewOnDoubleClick && !props.croppingExternally)
    emit("preview", image, event.currentTarget as HTMLElement);
}

function onLayerDoubleClick(event: MouseEvent): void {
  // Pointer capture keeps drags alive across frozen panes and retargets clicks to this layer.
  if (
    crop.value ||
    props.croppingExternally ||
    event.target !== event.currentTarget ||
    gesture.value ||
    lastGestureMode !== "move" ||
    !props.previewOnDoubleClick
  )
    return;
  const image = currentImages.value.find((entry) => entry.id === props.selectedImageId);
  if (image)
    emit("preview", image, layerRef.value?.querySelector<HTMLElement>(".is-selected") ?? undefined);
}

function requestDelete(): void {
  const imageId = contextMenu.value?.imageId;
  closeContextMenu(false);
  if (imageId && !interactionReadOnly.value) emit("delete", imageId);
}

function getPaintState(): FloatingImagePaintState {
  return {
    // Publish model state without projecting a transient Vue prop pair during
    // viewport updates. Gesture and paint consumers still validate their context.
    images: normalizePictureObjectCollection(props.selectionRoots ?? props.images).map(
      (root) =>
        previewImages.value.find((next) => next.id === root.id) ??
        (previewImage.value?.id === root.id ? previewImage.value : root),
    ),
    revision: paintRevision.value,
    effects: props.effects,
  };
}

function emitPaintState(): void {
  paintRevision.value += 1;
  emit("paintStateChange", getPaintState());
}

function hitTestFloatingImage(point: Point): FloatingImage | undefined {
  if (props.selectionRoots) {
    const hit = hitPictureViewportPoint(selectionImages(), point, props.layout, props.frameContext);
    if (!hit || hit.kind === "group-leaf") return undefined;
    const image = currentImages.value.find((image) => image.id === pictureFragmentRootId(hit));
    return image && isRootAvailable(image.id) ? image : undefined;
  }
  for (let index = fragments.value.length - 1; index >= 0; index -= 1) {
    const fragment = fragments.value[index];
    if (!fragment) continue;
    const rect = fragmentBounds(fragment);
    if (
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height &&
      (fragment.kind === "legacy" || pictureFrameContainsPoint(fragment.geometry, point))
    )
      return isRootAvailable(fragment.image.id) ? fragment.image : undefined;
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
  if (props.previewOnDoubleClick && !props.croppingExternally)
    emit("preview", image, layerRef.value ?? undefined);
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
  return !interactionReadOnly.value && !crop.value && hitTestFloatingImage(point)
    ? "move"
    : undefined;
}

watch(
  () => currentImages.value.map((image) => image.id),
  (ids) => {
    if (gesture.value && !ids.includes(gesture.value.image.id)) finishGesture(false);
    if (crop.value && !ids.includes(crop.value.image.id)) cancelCrop(false);
    if (contextMenu.value && !ids.includes(contextMenu.value.imageId)) closeContextMenu(false);
  },
);

watch(
  [
    () => currentImages.value,
    previewImage,
    previewImages,
    crop,
    () => props.layout,
    () => props.frameContext,
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
  () => [props.layout, props.frameContext, props.scale],
  () => {
    finishGesture(false);
    cancelCrop(false);
  },
  { flush: "sync" },
);
watch(
  () => props.selectionRoots,
  () => {
    if (gesture.value && !isCurrentGesture(gesture.value)) finishGesture(false);
  },
  { flush: "sync" },
);

watch(
  () => interactionReadOnly.value,
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
  if (interactionReadOnly.value) return;
  if (currentImages.value.some((image) => ids.includes(image.id) && isFramedPictureObject(image))) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !currentImages.value.some((image) => image.id === id))
  ) {
    emit("feedback", "picture.operationFailed");
    return;
  }
  const members = currentImages.value
    .filter((image) => ids.includes(image.id))
    .flatMap((image) => {
      if (isFramedPictureObject(image)) return [];
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
  if (
    key === selectionKey.value &&
    props.canGroup !== false &&
    !interactionReadOnly.value &&
    !gesture.value &&
    !crop.value
  )
    emit("group", [...selectedIds.value]);
}
function dismissSelection(key: string): void {
  if (key === selectionKey.value) emit("select", null);
}

function openSelectedContextMenu(event: MouseEvent): void {
  const image = selectedImage.value,
    layer = layerRef.value;
  if (!image || !layer || selectedIds.value.size !== 1) return;
  openContextMenu(image, layer, createContextMenuPoint(event, layer));
}
defineExpose({
  closePictureContextMenu: () => closeContextMenu(false),
  openSelectedContextMenu,
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
  try {
    planImageKeydown(image, event);
  } catch {
    event.preventDefault();
    emit("feedback", "picture.operationFailed");
  }
}
function planImageKeydown(image: FloatingImage, event: KeyboardEvent): void {
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
            { x: delta.x / current.image.width, y: delta.y / current.image.height },
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
  if (!interactionReadOnly.value && (event.key === "Delete" || event.key === "Backspace")) {
    emit("delete", image.id);
    event.preventDefault();
    return;
  }
  if (interactionReadOnly.value) return;
  const distance = event.shiftKey ? 10 : 1;
  const offset = {
    ArrowLeft: { x: -distance, y: 0 },
    ArrowRight: { x: distance, y: 0 },
    ArrowUp: { x: 0, y: -distance },
    ArrowDown: { x: 0, y: distance },
  }[event.key];
  if (!offset) return;
  const members = selectionImages().filter((entry) => selectedIds.value.has(entry.id));
  if (members.length !== selectedIds.value.size) {
    emit("feedback", "picture.operationFailed");
    event.preventDefault();
    return;
  }
  const next = movePictureRootSelectionBy(members, offset, props.layout, props.frameContext);
  if (!next) emit("feedback", "picture.operationFailed");
  else commitImages(next);
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
      v-for="fragment in fragments.filter(
        (entry) => !croppingExternally && selectedIds.has(entry.image.id),
      )"
      :key="getFragmentKey(fragment)"
      class="sheet-floating-image-layer__selected"
      :class="{
        'is-selected': !crop,
        'is-framed': fragment.kind === 'framed',
        'is-read-only': readOnly,
      }"
      :style="getFragmentStyle(fragment)"
      :data-floating-image-id="fragment.image.id"
      :data-floating-image-pane="fragment.paneId"
      data-floating-image-selected
      tabindex="0"
      role="group"
      :aria-label="getAccessibleLabel(fragment.image)"
      :title="fragment.image.altTitle || undefined"
      @pointerdown.stop="fragment.kind === 'legacy' && startGesture(fragment.image, 'move', $event)"
      @contextmenu="onImageContextMenu(fragment.image, $event)"
      @dblclick.prevent.stop="onImageDoubleClick(fragment.image, $event)"
      @keydown="onImageKeydown(fragment.image, $event)"
    >
      <SheetFloatingImageCropOverlay
        v-if="fragment.kind === 'legacy' && crop?.image.id === fragment.image.id"
        :fragment="fragment"
        :selection="crop.selection"
        @start="startCropGesture"
      />
      <SheetFloatingImageSelection
        v-if="fragment.kind === 'legacy' && !selectedGroup && !crop && !interactionReadOnly"
        :fragment="fragment"
        @resize="(direction, event) => startGesture(fragment.image, direction, event)"
      />
      <SheetFramedPictureSelection
        v-if="fragment.kind === 'framed' && !crop"
        :fragment="fragment"
        :layout="layout"
        :read-only="interactionReadOnly"
        @move="startGesture(fragment.image, 'move', $event)"
        @resize="(direction, event) => startGesture(fragment.image, direction, event)"
      />
    </div>
    <template v-if="!croppingExternally && !crop && !interactionReadOnly && selectedImage">
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
      v-if="
        !croppingExternally &&
        selectionToolbarAnchor &&
        !hasExtendedRootSelection &&
        !selectedGroup &&
        !crop &&
        !gesture &&
        !contextMenu
      "
      :key="selectionKey"
      :anchor="selectionToolbarAnchor"
      :selection-key="selectionKey"
      :can-group="canGroup"
      :count="selectedIds.size"
      :disabled="interactionReadOnly"
      @align="alignSelection"
      @group="groupSelection"
      @dismiss="dismissSelection"
    />
    <SheetFloatingImageToolbar
      v-if="
        !croppingExternally &&
        toolbarAnchor &&
        selectedImage &&
        selectedIds.size <= 1 &&
        !gesture &&
        !contextMenu
      "
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
      :read-only="interactionReadOnly"
      :source-operations-disabled="croppingExternally || contextMenuSourceUnsupported"
      :preview-disabled="
        croppingExternally ||
        !assetUrls.has(
          currentImages.find((image) => image.id === contextMenu?.imageId)?.assetId ?? '',
        )
      "
      @convert-to-cell="contextActions.convert"
      @preview="contextActions.preview"
      @copy="contextActions.copy"
      @cut="contextActions.cut"
      @paste="contextActions.paste"
      @delete="contextActions.delete"
      @close="contextActions.close"
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

    &.is-framed {
      pointer-events: none;
      outline: none;
    }
    &.is-read-only {
      cursor: default;
    }
    &[data-floating-image-group] {
      pointer-events: none;
      outline: none;
    }

    &:focus-visible {
      --image-selection-style: dashed;
      --picture-frame-focus-dash: 4 3;
    }
  }
}
</style>
