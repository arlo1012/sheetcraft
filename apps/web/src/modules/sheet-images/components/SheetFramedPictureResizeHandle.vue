<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { isPictureHandleOwnedByPane } from "../picture-selection-handle";
import type { PictureSelectionFrameFragment } from "../picture-selection-frame";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
const props = defineProps<{
  fragment: PictureSelectionFrameFragment;
  layout: SheetViewportLayout;
  direction: FloatingImageResizeDirection;
}>();
const emit = defineEmits<{
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
}>();
const { t } = useAppI18n();
const labels: Record<FloatingImageResizeDirection, MessageKey> = {
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
  const [nw, ne, se, sw] = props.fragment.geometry.corners;
  const midpoint = (a: typeof nw, b: typeof nw) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return {
    nw,
    ne,
    se,
    sw,
    n: midpoint(nw, ne),
    e: midpoint(ne, se),
    s: midpoint(sw, se),
    w: midpoint(nw, sw),
  }[props.direction];
});
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
    cursor: ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][sector],
  };
});
</script>
<template>
  <button
    v-if="visible"
    type="button"
    tabindex="-1"
    class="picture-frame-handle"
    :style="style"
    :aria-label="t(labels[direction])"
    :data-image-resize="direction"
    :data-direction="direction"
    @pointerdown.prevent.stop="emit('resize', direction, $event)"
    @dblclick.prevent.stop
  />
</template>
<style scoped lang="scss">
.picture-frame-handle {
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
    border-radius: 50%;
    background: var(--sheetcraft-action-primary);
    box-shadow: 0 0 1px 1px rgb(0 0 0 / 12%);
    content: "";
  }
}
</style>
