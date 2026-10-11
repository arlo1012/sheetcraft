<script setup lang="ts">
import { computed } from "vue";
import type { PictureSelectionFrameFragment } from "../picture-selection-frame";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetFramedPictureResizeHandle from "./SheetFramedPictureResizeHandle.vue";
import SheetPictureRotationHandle from "./SheetPictureRotationHandle.vue";
const props = defineProps<{
  fragment: PictureSelectionFrameFragment;
  layout: SheetViewportLayout;
  readOnly?: boolean;
  /** A faint owner outline must not steal member hits or display active handles. */
  passiveOutline?: boolean;
  /** Enabled only by a host that owns a real rotation transaction. */
  rotatable?: boolean;
  /** Global surface hit routing can own body hits while local handles remain active. */
  bodyInteractive?: boolean;
}>();
const emit = defineEmits<{
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
  move: [event: PointerEvent];
  rotate: [event: PointerEvent];
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
      :class="{
        'is-read-only': readOnly,
        'is-passive': passiveOutline,
        'is-surface-routed': bodyInteractive === false,
      }"
      :points="points"
      @pointerdown.stop="!passiveOutline && bodyInteractive !== false && emit('move', $event)"
    />
  </svg>
  <template v-if="!readOnly && !passiveOutline">
    <SheetPictureRotationHandle
      v-if="rotatable"
      :fragment="fragment"
      :layout="layout"
      @rotate="emit('rotate', $event)"
    />
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
    &.is-passive {
      opacity: 0.4;
      pointer-events: none;
    }
    &.is-surface-routed {
      pointer-events: none;
    }
  }
}
</style>
