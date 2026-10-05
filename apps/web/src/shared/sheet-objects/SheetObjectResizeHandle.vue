<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type {
  FloatingImageResizeDirection,
  FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import { useAppI18n, type MessageKey } from "../i18n";

const props = defineProps<{
  fragment: FloatingImageViewportFragment;
  direction: FloatingImageResizeDirection;
  variant?: "crop";
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
const cropLabelKeys: Record<FloatingImageResizeDirection, MessageKey> = {
  n: "image.cropTop",
  s: "image.cropBottom",
  w: "image.cropLeft",
  e: "image.cropRight",
  nw: "image.cropTopLeft",
  ne: "image.cropTopRight",
  sw: "image.cropBottomLeft",
  se: "image.cropBottomRight",
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
    :aria-label="t((variant === 'crop' ? cropLabelKeys : labelKeys)[direction])"
    :data-image-resize="variant ? undefined : direction"
    :data-image-crop-handle="variant ? direction : undefined"
    :data-direction="direction"
    :class="{ 'is-crop': variant === 'crop' }"
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

  &.is-crop {
    &::after {
      inset: 2px;
      background: #171717;
      border: 0;
      box-shadow: 0 0 0 1px white;
    }
    &[data-direction="n"]::after,
    &[data-direction="s"]::after {
      inset: 5px 0;
    }
    &[data-direction="w"]::after,
    &[data-direction="e"]::after {
      inset: 0 5px;
    }
    &[data-direction="nw"]::after,
    &[data-direction="ne"]::after,
    &[data-direction="sw"]::after,
    &[data-direction="se"]::after {
      background: transparent;
      border: solid #171717;
      border-width: 4px 0 0 4px;
      box-shadow: none;
      filter: drop-shadow(0 0 1px white);
    }
    &[data-direction="ne"]::after {
      transform: rotate(90deg);
    }
    &[data-direction="se"]::after {
      transform: rotate(180deg);
    }
    &[data-direction="sw"]::after {
      transform: rotate(270deg);
    }
  }

  &[data-direction="n"],
  &[data-direction="s"] {
    cursor: ns-resize;
  }

  &[data-direction="e"],
  &[data-direction="w"] {
    cursor: ew-resize;
  }

  &[data-direction="nw"],
  &[data-direction="se"] {
    cursor: nwse-resize;
  }

  &[data-direction="ne"],
  &[data-direction="sw"] {
    cursor: nesw-resize;
  }
}
</style>
