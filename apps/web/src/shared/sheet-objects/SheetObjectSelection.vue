<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type {
  FloatingImageResizeDirection,
  FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import SheetObjectResizeHandle from "./SheetObjectResizeHandle.vue";

const props = defineProps<{ fragment: FloatingImageViewportFragment }>();
const emit = defineEmits<{
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
}>();

const outlineStyle = computed<CSSProperties>(() => {
  const { rect, clippedRect } = props.fragment;
  return {
    left: `${rect.x - clippedRect.x}px`,
    top: `${rect.y - clippedRect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
});

function onResize(direction: FloatingImageResizeDirection, event: PointerEvent): void {
  emit("resize", direction, event);
}
</script>

<template>
  <div class="sheet-floating-image-selection">
    <div class="sheet-floating-image-selection__clip">
      <div class="sheet-floating-image-selection__outline" :style="outlineStyle" />
    </div>
    <SheetObjectResizeHandle :fragment="fragment" direction="n" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="s" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="w" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="e" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="nw" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="ne" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="sw" @resize="onResize" />
    <SheetObjectResizeHandle :fragment="fragment" direction="se" @resize="onResize" />
  </div>
</template>

<style scoped lang="scss">
.sheet-floating-image-selection {
  position: absolute;
  z-index: 3;
  inset: 0;
  pointer-events: none;

  &__clip {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  &__outline {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--idea-action-primary);
    border-style: var(--image-selection-style, solid);
  }
}
</style>
