<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type {
  FloatingImageResizeDirection,
  FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";

const props = defineProps<{
  fragment: FloatingImageViewportFragment;
  direction: FloatingImageResizeDirection;
}>();
const emit = defineEmits<{
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
}>();
const { t } = useAppI18n();
const labelKeys: Record<FloatingImageResizeDirection, MessageKey> = {
  n: "image.resizeTop",
  s: "image.resizeBottom",
  w: "image.resizeLeft",
  e: "image.resizeRight",
  nw: "image.resizeTopLeft",
  ne: "image.resizeTopRight",
  sw: "image.resizeBottomLeft",
  se: "image.resizeBottomRight",
};
const point = computed(() => {
  const { rect } = props.fragment;
  const { direction } = props;
  return {
    x: rect.x + rect.width * (direction.includes("w") ? 0 : direction.includes("e") ? 1 : 0.5),
    y: rect.y + rect.height * (direction.includes("n") ? 0 : direction.includes("s") ? 1 : 0.5),
  };
});
const visible = computed(() => {
  const { rect, clippedRect } = props.fragment;
  // At shared pane boundaries, the following pane owns the point unless this
  // is the image's actual outer edge. Controls remain unique while scrolling.
  const epsilon = 1e-6;
  const isVisible = (value: number, start: number, end: number, imageEnd: number) =>
    value >= start - epsilon &&
    (value < end - epsilon ||
      (Math.abs(value - end) < epsilon && Math.abs(end - imageEnd) < epsilon));
  return (
    isVisible(
      point.value.x,
      clippedRect.x,
      clippedRect.x + clippedRect.width,
      rect.x + rect.width,
    ) &&
    isVisible(
      point.value.y,
      clippedRect.y,
      clippedRect.y + clippedRect.height,
      rect.y + rect.height,
    )
  );
});
const handleStyle = computed<CSSProperties>(() => ({
  left: `${point.value.x - props.fragment.clippedRect.x}px`,
  top: `${point.value.y - props.fragment.clippedRect.y}px`,
}));
</script>

<template>
  <button
    v-if="visible"
    class="sheet-floating-image-resize-handle"
    :style="handleStyle"
    :aria-label="t(labelKeys[direction])"
    :data-image-resize="direction"
    type="button"
    tabindex="-1"
    @pointerdown.prevent.stop="emit('resize', direction, $event)"
    @dblclick.prevent.stop
  />
</template>

<style scoped lang="scss">
.sheet-floating-image-resize-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  touch-action: none;

  &::after {
    position: absolute;
    inset: 2px;
    box-sizing: border-box;
    border: 2px solid white;
    background: var(--idea-action-primary);
    box-shadow: 0 0 1px 1px rgb(0 0 0 / 12%);
    content: "";
  }

  &[data-image-resize="n"],
  &[data-image-resize="s"] {
    cursor: ns-resize;
  }

  &[data-image-resize="e"],
  &[data-image-resize="w"] {
    cursor: ew-resize;
  }

  &[data-image-resize="nw"],
  &[data-image-resize="se"] {
    cursor: nwse-resize;
  }

  &[data-image-resize="ne"],
  &[data-image-resize="sw"] {
    cursor: nesw-resize;
  }
}
</style>
