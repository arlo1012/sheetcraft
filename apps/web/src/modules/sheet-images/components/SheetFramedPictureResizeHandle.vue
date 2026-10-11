<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  getPicturePaneTranslation,
  type FramedPictureViewportFragment,
} from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
const props = defineProps<{
  fragment: FramedPictureViewportFragment;
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
const visible = computed(() => {
  const layout = props.layout,
    paneId = props.fragment.paneId,
    from = getPicturePaneTranslation(paneId, layout),
    bounds = props.fragment.geometry.bounds,
    epsilon = 1e-6;
  const all = Object.values(layout.panes).map((p) => p.clip),
    outerX = Math.max(...all.map((p) => p.x + p.width)),
    outerY = Math.max(...all.map((p) => p.y + p.height));
  const owns = (v: number, start: number, end: number, outer: number) =>
    v >= start - epsilon &&
    (v < end - epsilon || (Math.abs(v - end) < epsilon && Math.abs(end - outer) < epsilon));
  const priority = { topLeft: 0, top: 1, left: 2, body: 3 };
  // Normally the half-open following pane owns the point. When its image
  // fragment is empty, choose one visible closed edge deterministically, even
  // at an intersection of both frozen seams.
  const candidates = Object.entries(layout.panes)
    .flatMap(([key, pane]) => {
      const candidate = key as typeof paneId,
        c = pane.clip;
      if (c.width <= 0 || c.height <= 0) return [];
      const to = getPicturePaneTranslation(candidate, layout),
        dx = to.x - from.x,
        dy = to.y - from.y;
      const positive =
        Math.min(bounds.x + dx + bounds.width, c.x + c.width) > Math.max(bounds.x + dx, c.x) &&
        Math.min(bounds.y + dy + bounds.height, c.y + c.height) > Math.max(bounds.y + dy, c.y);
      const p = { x: point.value.x + dx, y: point.value.y + dy };
      if (
        !positive ||
        p.x < c.x - epsilon ||
        p.x > c.x + c.width + epsilon ||
        p.y < c.y - epsilon ||
        p.y > c.y + c.height + epsilon
      )
        return [];
      return [
        {
          paneId: candidate,
          score:
            Number(owns(p.x, c.x, c.x + c.width, outerX)) +
            Number(owns(p.y, c.y, c.y + c.height, outerY)),
        },
      ];
    })
    .sort((a, b) => b.score - a.score || priority[b.paneId] - priority[a.paneId]);
  return candidates[0]?.paneId === paneId;
});
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
