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
import { MAX_FLOATING_IMAGE_SIZE, type FloatingImage } from "@idea10/core/workbook";
import {
  getFloatingImageViewportFragments,
  moveFloatingImageBy,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
  type FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import {
  adjustImageCropSelection,
  type ImageCropGesture,
} from "@idea10/sheet-engine/image-crop-selection";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import SheetFloatingImageContextMenu from "./SheetFloatingImageContextMenu.vue";
import SheetFloatingImageSelection from "./SheetFloatingImageSelection.vue";

import { useFloatingImageEditing } from "../useFloatingImageEditing";
import SheetImageContent from "./SheetImageContent.vue";
const SheetFloatingImageToolbar = defineAsyncComponent(
  () => import("./SheetFloatingImageToolbar.vue"),
);
const SheetFloatingImageCropOverlay = defineAsyncComponent(
  () => import("./SheetFloatingImageCropOverlay.vue"),
);
const MINIMUM_IMAGE_SIZE = 24;

const props = withDefaults(
  defineProps<{
    images: readonly FloatingImage[];
    layout: SheetViewportLayout;
    assetUrls: ReadonlyMap<string, string>;
    loadingAssetIds?: ReadonlySet<string>;
    missingAssetIds?: ReadonlySet<string>;
    selectedImageId?: string | null;
    readOnly?: boolean;
    scale?: number;
  }>(),
  { readOnly: false, scale: 1 },
);

const emit = defineEmits<{
  select: [id: string | null];
  update: [image: FloatingImage];
  delete: [id: string];
  convertToCell: [id: string];
  preview: [image: FloatingImage, trigger?: HTMLElement];
  copy: [id: string];
  cut: [id: string];
  paste: [id: string];
}>();

const { t } = useAppI18n();

type ImageFragment = FloatingImageViewportFragment & { image: FloatingImage };
type Gesture = {
  image: FloatingImage;
  mode: "move" | FloatingImageResizeDirection;
  pointerId: number;
  target: HTMLElement;
  focusTarget: HTMLElement;
  startClientX: number;
  startClientY: number;
};

type ContextMenuState = {
  imageId: string;
  anchor: FloatingReference;
  trigger: HTMLElement;
};

const gesture = shallowRef<Gesture>();
const previewImage = shallowRef<FloatingImage>();
const layerRef = ref<HTMLElement | null>(null);
const contextMenu = shallowRef<ContextMenuState>();
const selectedImage = computed(() =>
  props.images.find((image) => image.id === props.selectedImageId),
);
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
  props.images.flatMap((image) =>
    getFloatingImageViewportFragments(displayImage(image), props.layout).map((fragment) => ({
      ...fragment,
      image: displayImage(image),
    })),
  ),
);

function displayImage(image: FloatingImage): FloatingImage {
  return previewImage.value?.id === image.id ? previewImage.value : image;
}

function cloneImage(image: FloatingImage): FloatingImage {
  return { ...image, anchor: { ...image.anchor } };
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

function getImageStyle(fragment: ImageFragment): CSSProperties {
  return {
    left: `${fragment.rect.x - fragment.clippedRect.x}px`,
    top: `${fragment.rect.y - fragment.clippedRect.y}px`,
    width: `${fragment.rect.width}px`,
    height: `${fragment.rect.height}px`,
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

function setPointerCapture(target: HTMLElement, pointerId: number): void {
  if (!target.hasPointerCapture?.(pointerId)) target.setPointerCapture?.(pointerId);
}

function releasePointerCapture(target: HTMLElement, pointerId: number): void {
  if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture?.(pointerId);
}

function startGesture(image: FloatingImage, mode: Gesture["mode"], event: PointerEvent): void {
  if (event.button !== 0 || crop.value) return;
  const focusTarget =
    (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-floating-image-id]") ??
    (event.currentTarget as HTMLElement);
  const target = layerRef.value;
  if (!target) return;
  emit("select", image.id);
  focusTarget.focus({ preventScroll: true });
  if (props.readOnly) return;
  lastGestureMode = mode;
  setPointerCapture(target, event.pointerId);
  previewImage.value = cloneImage(image);
  gesture.value = {
    image: cloneImage(image),
    mode,
    pointerId: event.pointerId,
    target,
    focusTarget,
    startClientX: event.clientX,
    startClientY: event.clientY,
  };
}

function onPointerMove(event: PointerEvent): void {
  if (cropGesture.value) {
    moveCropGesture(event);
    return;
  }
  const activeGesture = gesture.value;
  if (
    !activeGesture ||
    activeGesture.pointerId !== event.pointerId ||
    activeGesture.target !== event.currentTarget
  )
    return;
  const deltaX = (event.clientX - activeGesture.startClientX) / props.scale;
  const deltaY = (event.clientY - activeGesture.startClientY) / props.scale;
  if (activeGesture.mode === "move") {
    previewImage.value =
      moveFloatingImageBy(activeGesture.image, { x: deltaX, y: deltaY }, props.layout) ??
      activeGesture.image;
    return;
  }
  previewImage.value =
    resizeFloatingImageBy(
      activeGesture.image,
      activeGesture.mode,
      { x: deltaX, y: deltaY },
      props.layout,
      { minSize: MINIMUM_IMAGE_SIZE, maxSize: MAX_FLOATING_IMAGE_SIZE },
    ) ?? activeGesture.image;
}

function startCrop(): void {
  if (!props.readOnly) startCropEdit();
}

function cancelCrop(restoreFocus = true): void {
  cancelCropEdit(restoreFocus);
}

function applyCrop(): void {
  if (!props.readOnly) applyCropEdit();
}

function rotateImage(turns: -1 | 1 | 2): void {
  if (!props.readOnly) rotateImageEdit(turns);
}

function flipImage(axis: "horizontal" | "vertical"): void {
  if (!props.readOnly) flipImageEdit(axis);
}

function restoreImage(): void {
  if (!props.readOnly) restoreImageEdit();
}

function startCropGesture(direction: ImageCropGesture, event: PointerEvent): void {
  if (!props.readOnly) startCropGestureEdit(direction, event);
}

function finishGesture(commit: boolean): void {
  const activeGesture = gesture.value;
  const preview = previewImage.value;
  gesture.value = undefined;
  previewImage.value = undefined;
  if (!activeGesture) return;
  releasePointerCapture(activeGesture.target, activeGesture.pointerId);
  if (!activeGesture.focusTarget.isConnected) {
    void nextTick(() => {
      if (props.selectedImageId === activeGesture.image.id) {
        layerRef.value?.querySelector<HTMLElement>(".is-selected")?.focus({ preventScroll: true });
      }
    });
  }
  if (
    commit &&
    preview &&
    (preview.anchor.row !== activeGesture.image.anchor.row ||
      preview.anchor.column !== activeGesture.image.anchor.column ||
      preview.offsetX !== activeGesture.image.offsetX ||
      preview.offsetY !== activeGesture.image.offsetY ||
      preview.width !== activeGesture.image.width ||
      preview.height !== activeGesture.image.height)
  )
    emit("update", preview);
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

function openContextMenu(image: FloatingImage, trigger: HTMLElement, x: number, y: number): void {
  if (gesture.value || crop.value) return;
  emit("select", image.id);
  trigger.focus({ preventScroll: true });
  contextMenu.value = {
    imageId: image.id,
    trigger,
    anchor: markRaw({
      contextElement: layerRef.value ?? trigger,
      getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    }),
  };
}

function onImageContextMenu(image: FloatingImage, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  openContextMenu(image, event.currentTarget as HTMLElement, event.clientX, event.clientY);
}

function openImageKeyboardContextMenu(image: FloatingImage, event: KeyboardEvent): boolean {
  if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return false;
  event.preventDefault();
  event.stopPropagation();
  const trigger = event.currentTarget as HTMLElement;
  const rect = trigger.getBoundingClientRect();
  openContextMenu(
    image,
    trigger,
    rect.left + Math.min(16, rect.width / 2),
    rect.top + Math.min(16, rect.height / 2),
  );
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
  emit("preview", image, event.currentTarget as HTMLElement);
}

function onLayerDoubleClick(event: MouseEvent): void {
  // Pointer capture keeps drags alive across frozen panes and retargets clicks to this layer.
  if (
    crop.value ||
    event.target !== event.currentTarget ||
    gesture.value ||
    lastGestureMode !== "move"
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

watch(
  () => props.images.map((image) => image.id),
  (ids) => {
    if (crop.value && !ids.includes(crop.value.image.id)) cancelCrop(false);
    if (contextMenu.value && !ids.includes(contextMenu.value.imageId)) closeContextMenu(false);
  },
);

watch(
  () => props.selectedImageId,
  (selectedImageId) => {
    if (crop.value && selectedImageId !== crop.value.image.id) cancelCrop(false);
    if (contextMenu.value && selectedImageId !== contextMenu.value.imageId) closeContextMenu(false);
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
  window.removeEventListener("keydown", onWindowKeydown);
  finishGesture(false);
  cancelCrop(false);
  closeContextMenu(false);
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
  const next = moveFloatingImageBy(image, offset, props.layout);
  if (next) emit("update", next);
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
      v-for="fragment in fragments"
      :key="getFragmentKey(fragment)"
      class="sheet-floating-image-layer__fragment"
      :class="{ 'is-selected': fragment.image.id === selectedImageId }"
      :style="getFragmentStyle(fragment)"
      :data-floating-image-id="fragment.image.id"
      :data-floating-image-pane="fragment.paneId"
      :tabindex="fragment.image.id === selectedImageId ? 0 : -1"
      role="group"
      :aria-label="getAccessibleLabel(fragment.image)"
      @pointerdown.stop="startGesture(fragment.image, 'move', $event)"
      @contextmenu="onImageContextMenu(fragment.image, $event)"
      @dblclick.prevent.stop="onImageDoubleClick(fragment.image, $event)"
      @keydown="onImageKeydown(fragment.image, $event)"
    >
      <div class="sheet-floating-image-layer__content">
        <SheetImageContent
          v-if="assetUrls.get(fragment.image.assetId)"
          class="sheet-floating-image-layer__image"
          :src="assetUrls.get(fragment.image.assetId)!"
          :alt-text="fragment.image.altText || t('image.floatingAlt')"
          :transform="fragment.image.transform"
          fit="fill"
          @load="(size) => cacheImageSize(fragment.image.assetId, size)"
          :style="getImageStyle(fragment)"
          draggable="false"
        />
        <span
          v-else
          class="sheet-floating-image-layer__placeholder"
          :class="{
            'is-loading': loadingAssetIds?.has(fragment.image.assetId),
            'is-missing': missingAssetIds?.has(fragment.image.assetId),
          }"
          :style="getImageStyle(fragment)"
          aria-hidden="true"
        />
      </div>
      <SheetFloatingImageCropOverlay
        v-if="crop?.image.id === fragment.image.id"
        :fragment="fragment"
        :selection="crop.selection"
        @start="startCropGesture"
      />
      <SheetFloatingImageSelection
        v-if="fragment.image.id === selectedImageId && !crop && !readOnly"
        :fragment="fragment"
        @resize="(direction, event) => startGesture(fragment.image, direction, event)"
      />
    </div>
    <SheetFloatingImageToolbar
      v-if="toolbarAnchor && selectedImage && !gesture && !contextMenu"
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

  &__fragment {
    position: absolute;
    box-sizing: border-box;
    pointer-events: auto;
    touch-action: none;
    cursor: move;
    outline: none;

    &:focus-visible {
      --image-selection-style: dashed;
    }
  }

  &__content {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  &__image,
  &__placeholder {
    position: absolute;
    display: block;
    box-sizing: border-box;
    max-width: none;
    user-select: none;
    z-index: 1;
  }

  &__image {
    object-fit: fill;
    pointer-events: none;
  }

  &__placeholder {
    border: 1px solid color-mix(in srgb, var(--idea-text-secondary) 50%, transparent);
    background: color-mix(in srgb, var(--idea-surface-panel) 80%, var(--idea-text-secondary));

    &.is-loading {
      background: repeating-linear-gradient(
        -45deg,
        color-mix(in srgb, var(--idea-surface-panel) 84%, var(--idea-text-secondary)),
        color-mix(in srgb, var(--idea-surface-panel) 84%, var(--idea-text-secondary)) 8px,
        color-mix(in srgb, var(--idea-surface-panel) 94%, var(--idea-text-secondary)) 8px,
        color-mix(in srgb, var(--idea-surface-panel) 94%, var(--idea-text-secondary)) 16px
      );
    }

    &.is-missing {
      border-style: dashed;
    }
  }
}
</style>
