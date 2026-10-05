<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { ImageCrop } from "@idea10/core/workbook";
import type { FloatingImageViewportFragment } from "@idea10/sheet-engine/floating-image-layout";
import type { ImageCropGesture } from "@idea10/sheet-engine/image-crop-selection";
import { useAppI18n } from "../../../shared/i18n";
import SheetFloatingImageResizeHandle from "../../../shared/sheet-objects/SheetObjectResizeHandle.vue";

const props = defineProps<{ fragment: FloatingImageViewportFragment; selection: ImageCrop }>();
const emit = defineEmits<{ start: [direction: ImageCropGesture, event: PointerEvent] }>();
const { t } = useAppI18n();
const cropFragment = computed<FloatingImageViewportFragment>(() => {
  const { rect, clippedRect, paneId } = props.fragment;
  const crop = props.selection;
  return {
    paneId,
    clippedRect,
    rect: {
      x: rect.x + crop.x * rect.width,
      y: rect.y + crop.y * rect.height,
      width: crop.width * rect.width,
      height: crop.height * rect.height,
    },
  };
});
const cropStyle = computed<CSSProperties>(() => {
  const { rect, clippedRect } = cropFragment.value;
  return {
    left: `${rect.x - clippedRect.x}px`,
    top: `${rect.y - clippedRect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
});
</script>

<template>
  <div class="sheet-floating-image-crop-overlay" data-image-crop-overlay>
    <div class="sheet-floating-image-crop-overlay__clip">
      <div
        class="sheet-floating-image-crop-overlay__selection"
        :style="cropStyle"
        :aria-label="t('image.cropSelection')"
        role="group"
        data-image-crop-selection
        @pointerdown.prevent.stop="emit('start', 'move', $event)"
        @dblclick.prevent.stop
      >
        <span class="sheet-floating-image-crop-overlay__grid" />
      </div>
    </div>
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="n"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="s"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="w"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="e"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="nw"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="ne"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="sw"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
    <SheetFloatingImageResizeHandle
      :fragment="cropFragment"
      direction="se"
      variant="crop"
      @resize="(d, e) => emit('start', d, e)"
    />
  </div>
</template>

<style scoped lang="scss">
.sheet-floating-image-crop-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;

  &__clip {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  &__selection {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid white;
    box-shadow: 0 0 0 20000px rgb(0 0 0 / 48%);
    cursor: move;
    pointer-events: auto;
    touch-action: none;
  }
  &__grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(
        to right,
        transparent calc(100% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(100% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(100% / 3 + 0.5px),
        transparent calc(100% / 3 + 0.5px),
        transparent calc(200% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(200% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(200% / 3 + 0.5px),
        transparent calc(200% / 3 + 0.5px)
      ),
      linear-gradient(
        to bottom,
        transparent calc(100% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(100% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(100% / 3 + 0.5px),
        transparent calc(100% / 3 + 0.5px),
        transparent calc(200% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(200% / 3 - 0.5px),
        rgb(255 255 255 / 55%) calc(200% / 3 + 0.5px),
        transparent calc(200% / 3 + 0.5px)
      );
  }
}
</style>
