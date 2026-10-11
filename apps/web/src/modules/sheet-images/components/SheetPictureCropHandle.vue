<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { FramedPictureViewportFragment } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { getPictureCropHandlePoint } from "../picture-crop-preview";
import { isPictureHandleOwnedByPane } from "../picture-selection-handle";

const props = defineProps<{
  fragment: FramedPictureViewportFragment;
  layout: SheetViewportLayout;
  direction: FloatingImageResizeDirection;
}>();
const emit = defineEmits<{
  start: [direction: FloatingImageResizeDirection, event: PointerEvent];
}>();
const { t } = useAppI18n();
const labelKeys: Record<FloatingImageResizeDirection, MessageKey> = {
  n: "image.cropTop",
  s: "image.cropBottom",
  w: "image.cropLeft",
  e: "image.cropRight",
  nw: "image.cropTopLeft",
  ne: "image.cropTopRight",
  sw: "image.cropBottomLeft",
  se: "image.cropBottomRight",
};
const point = computed(() => getPictureCropHandlePoint(props.fragment.geometry, props.direction));
const visible = computed(() =>
  isPictureHandleOwnedByPane(props.fragment, props.layout, point.value),
);
const style = computed<CSSProperties>(() => {
  const angles = { e: 0, w: 180, n: 270, s: 90, nw: 225, ne: 315, sw: 135, se: 45 };
  const sector =
    ((Math.round((angles[props.direction] + props.fragment.geometry.angleDeg) / 45) % 4) + 4) % 4;
  return {
    left: `${point.value.x - props.fragment.clippedBounds.x}px`,
    top: `${point.value.y - props.fragment.clippedBounds.y}px`,
    transform: `translate(-50%, -50%) rotate(${props.fragment.geometry.angleDeg}deg)`,
    cursor: ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][sector],
  };
});
</script>

<template>
  <button
    v-if="visible"
    type="button"
    tabindex="-1"
    class="sheet-picture-crop-handle"
    :style="style"
    :aria-label="t(labelKeys[direction])"
    :data-image-crop-handle="direction"
    :data-picture-crop-handle="direction"
    :data-direction="direction"
    @pointerdown.prevent.stop="emit('start', direction, $event)"
    @dblclick.prevent.stop
  />
</template>

<style scoped lang="scss">
.sheet-picture-crop-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  touch-action: none;

  &::after {
    position: absolute;
    inset: 2px;
    box-sizing: border-box;
    content: "";
    background: #171717;
    filter: drop-shadow(0 0 1px white);
    pointer-events: none;
  }
  &[data-direction="n"]::after,
  &[data-direction="s"]::after {
    inset: 6px 0;
  }
  &[data-direction="w"]::after,
  &[data-direction="e"]::after {
    inset: 0 6px;
  }
  &[data-direction="nw"]::after,
  &[data-direction="ne"]::after,
  &[data-direction="sw"]::after,
  &[data-direction="se"]::after {
    background: transparent;
    border: solid #171717;
    border-width: 4px 0 0 4px;
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
</style>
