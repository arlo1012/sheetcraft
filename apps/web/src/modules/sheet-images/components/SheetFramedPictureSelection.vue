<script setup lang="ts">
import { computed } from "vue";
import type { FramedPictureViewportFragment } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetFramedPictureResizeHandle from "./SheetFramedPictureResizeHandle.vue";
const props = defineProps<{
  fragment: FramedPictureViewportFragment;
  layout: SheetViewportLayout;
  readOnly?: boolean;
}>();
const emit = defineEmits<{
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
  move: [event: PointerEvent];
}>();
const points = computed(() =>
  props.fragment.geometry.corners
    .map((p) => `${p.x - props.fragment.clippedBounds.x},${p.y - props.fragment.clippedBounds.y}`)
    .join(" "),
);
const resize = (direction: FloatingImageResizeDirection, event: PointerEvent) =>
  emit("resize", direction, event);
</script>
<template>
  <svg
    class="picture-frame-outline"
    :width="fragment.clippedBounds.width"
    :height="fragment.clippedBounds.height"
    aria-hidden="true"
  >
    <polygon
      class="picture-frame-outline__body"
      :class="{ 'is-read-only': readOnly }"
      :points="points"
      @pointerdown.stop="emit('move', $event)"
    />
  </svg>
  <template v-if="!readOnly">
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="n"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="s"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="w"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="e"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="nw"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="ne"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="sw"
      @resize="resize"
    />
    <SheetFramedPictureResizeHandle
      :fragment="fragment"
      :layout="layout"
      direction="se"
      @resize="resize"
    />
  </template>
</template>
<style scoped lang="scss">
.picture-frame-outline {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  &__body {
    fill: transparent;
    stroke: var(--sheetcraft-action-primary);
    stroke-width: 1;
    stroke-dasharray: var(--picture-frame-focus-dash, none);
    pointer-events: fill;
    cursor: move;
    touch-action: none;
    &.is-read-only {
      cursor: default;
    }
  }
}
</style>
