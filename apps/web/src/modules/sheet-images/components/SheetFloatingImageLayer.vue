<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, type CSSProperties } from "vue";
import { MAX_FLOATING_IMAGE_SIZE, type FloatingImage } from "@idea10/core/workbook";
import {
  getFloatingImageViewportFragments,
  moveFloatingImageBy,
  type FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { useAppI18n } from "../../../shared/i18n";

const MINIMUM_IMAGE_SIZE = 24;

const props = defineProps<{
  images: readonly FloatingImage[];
  layout: SheetViewportLayout;
  assetUrls: ReadonlyMap<string, string>;
  loadingAssetIds?: ReadonlySet<string>;
  missingAssetIds?: ReadonlySet<string>;
  selectedImageId?: string | null;
}>();

const emit = defineEmits<{
  select: [id: string | null];
  update: [image: FloatingImage];
  delete: [id: string];
}>();

const { t } = useAppI18n();

type ImageFragment = FloatingImageViewportFragment & { image: FloatingImage };
type Gesture = {
  image: FloatingImage;
  mode: "move" | "resize";
  pointerId: number;
  target: HTMLElement;
  startClientX: number;
  startClientY: number;
};

const gesture = shallowRef<Gesture>();
const previewImage = shallowRef<FloatingImage>();
const layerRef = ref<HTMLElement | null>(null);

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

function canResize(fragment: ImageFragment): boolean {
  const { rect, clippedRect } = fragment;
  return (
    clippedRect.x + clippedRect.width >= rect.x + rect.width &&
    clippedRect.y + clippedRect.height >= rect.y + rect.height
  );
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
  if (event.button !== 0) return;
  const focusTarget =
    (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-floating-image-id]") ??
    (event.currentTarget as HTMLElement);
  const target = layerRef.value;
  if (!target) return;
  emit("select", image.id);
  focusTarget.focus({ preventScroll: true });
  setPointerCapture(target, event.pointerId);
  previewImage.value = cloneImage(image);
  gesture.value = {
    image: cloneImage(image),
    mode,
    pointerId: event.pointerId,
    target,
    startClientX: event.clientX,
    startClientY: event.clientY,
  };
}

function onPointerMove(event: PointerEvent): void {
  const activeGesture = gesture.value;
  if (
    !activeGesture ||
    activeGesture.pointerId !== event.pointerId ||
    activeGesture.target !== event.currentTarget
  )
    return;
  const deltaX = event.clientX - activeGesture.startClientX;
  const deltaY = event.clientY - activeGesture.startClientY;
  if (activeGesture.mode === "move") {
    previewImage.value =
      moveFloatingImageBy(activeGesture.image, { x: deltaX, y: deltaY }, props.layout) ??
      activeGesture.image;
    return;
  }
  const horizontalScale = (activeGesture.image.width + deltaX) / activeGesture.image.width;
  const verticalScale = (activeGesture.image.height + deltaY) / activeGesture.image.height;
  const scale = Math.min(
    MAX_FLOATING_IMAGE_SIZE / Math.max(activeGesture.image.width, activeGesture.image.height),
    Math.max(
      MINIMUM_IMAGE_SIZE / Math.min(activeGesture.image.width, activeGesture.image.height),
      horizontalScale,
      verticalScale,
    ),
  );
  previewImage.value = {
    ...activeGesture.image,
    width: activeGesture.image.width * scale,
    height: activeGesture.image.height * scale,
  };
}

function finishGesture(commit: boolean): void {
  const activeGesture = gesture.value;
  const preview = previewImage.value;
  gesture.value = undefined;
  previewImage.value = undefined;
  if (!activeGesture) return;
  releasePointerCapture(activeGesture.target, activeGesture.pointerId);
  if (commit && preview) emit("update", preview);
}

function onPointerUp(event: PointerEvent): void {
  if (gesture.value?.pointerId === event.pointerId) finishGesture(true);
}

function onPointerCancel(event: PointerEvent): void {
  if (gesture.value?.pointerId === event.pointerId) finishGesture(false);
}

function onLostPointerCapture(event: PointerEvent): void {
  if (gesture.value?.pointerId === event.pointerId) finishGesture(false);
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (gesture.value && event.key === "Escape") {
    finishGesture(false);
    event.preventDefault();
  }
}

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  finishGesture(false);
});

function onImageKeydown(image: FloatingImage, event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (gesture.value) finishGesture(false);
    else emit("select", null);
    event.preventDefault();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    emit("delete", image.id);
    event.preventDefault();
    return;
  }
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
      role="img"
      :aria-label="getAccessibleLabel(fragment.image)"
      @pointerdown.stop="startGesture(fragment.image, 'move', $event)"
      @keydown="onImageKeydown(fragment.image, $event)"
    >
      <img
        v-if="assetUrls.get(fragment.image.assetId)"
        class="sheet-floating-image-layer__image"
        :src="assetUrls.get(fragment.image.assetId)"
        :alt="fragment.image.altText || t('image.floatingAlt')"
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
      <button
        v-if="fragment.image.id === selectedImageId && canResize(fragment)"
        class="sheet-floating-image-layer__resize-handle"
        type="button"
        :aria-label="t('image.resize')"
        @pointerdown.stop="startGesture(fragment.image, 'resize', $event)"
      />
    </div>
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
    overflow: hidden;
    box-sizing: border-box;
    pointer-events: auto;
    touch-action: none;
    cursor: move;
    outline: none;

    &::after {
      position: absolute;
      z-index: 2;
      inset: 0;
      box-sizing: border-box;
      border: 2px solid transparent;
      content: "";
      pointer-events: none;
    }

    &.is-selected::after {
      border-color: var(--idea-action-primary);
    }

    &:focus-visible::after {
      border-color: white;
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
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

  &__resize-handle {
    position: absolute;
    right: 1px;
    bottom: 1px;
    width: 10px;
    height: 10px;
    padding: 0;
    border: 1px solid white;
    border-radius: 1px;
    background: var(--idea-action-primary);
    cursor: nwse-resize;
    z-index: 3;
  }
}
</style>
