<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type {
  FloatingImageResizeDirection,
  FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { getDrawingShapeGeometry, standardShapeFlipPoint } from "../shape-geometry";
import { getShapeLineLocalEndpoints } from "../shape-endpoint-layout";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
const props = defineProps<{
  drawing: SheetGraphicDrawing;
  fragment: FloatingImageViewportFragment;
  paneClip: Rect;
}>();
const emit = defineEmits<{
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
  rotate: [event: PointerEvent];
  endpoint: [index: 0 | 1, event: PointerEvent];
  nudgeEndpoint: [index: 0 | 1, delta: { x: number; y: number }];
  adjust: [index: number, event: PointerEvent];
  nudgeAdjustment: [index: number, delta: { x: number; y: number }];
  nudgeRotation: [degrees: number];
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
const directions: FloatingImageResizeDirection[] = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];
const point = (local: { x: number; y: number }) =>
  pictureFrameLocalToWorld(props.fragment.rect, props.drawing.rotation, local);
function owns(p: { x: number; y: number }): boolean {
  const c = props.paneClip;
  return p.x >= c.x && p.x < c.x + c.width && p.y >= c.y && p.y < c.y + c.height;
}
function style(p: { x: number; y: number }): CSSProperties {
  return {
    left: `${p.x - props.fragment.clippedRect.x}px`,
    top: `${p.y - props.fragment.clippedRect.y}px`,
  };
}
const outlineStyle = computed<CSSProperties>(() => ({
  left: `${props.fragment.rect.x - props.fragment.clippedRect.x}px`,
  top: `${props.fragment.rect.y - props.fragment.clippedRect.y}px`,
  width: `${props.drawing.width}px`,
  height: `${props.drawing.height}px`,
  transform: `rotate(${props.drawing.rotation}deg)`,
}));
const sizes = computed(() =>
  directions
    .map((direction) => ({
      direction,
      point: point({
        x: props.drawing.width * (direction.includes("w") ? 0 : direction.includes("e") ? 1 : 0.5),
        y: props.drawing.height * (direction.includes("n") ? 0 : direction.includes("s") ? 1 : 0.5),
      }),
    }))
    .filter((h) => owns(h.point)),
);
const lineEndpoints = computed(() => getShapeLineLocalEndpoints(props.drawing));
const endpoints = computed(
  () =>
    lineEndpoints.value
      ?.map((p, index) => ({
        index: index as 0 | 1,
        point: point(standardShapeFlipPoint(props.drawing, p)),
      }))
      .filter((h) => owns(h.point)) ?? [],
);
const rotation = computed(() => point({ x: props.drawing.width / 2, y: -24 }));
const adjustments = computed(
  () =>
    getDrawingShapeGeometry(props.drawing)
      ?.handles.flatMap((h, index) =>
        h.fields.some((f) => f.disabled)
          ? []
          : [{ index, point: point(standardShapeFlipPoint(props.drawing, h.position)) }],
      )
      .filter((h) => owns(h.point)) ?? [],
);
function handleKey(index: number, event: KeyboardEvent, endpoint = false): void {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const d = event.shiftKey ? 10 : 1;
  const delta = {
    ArrowLeft: { x: -d, y: 0 },
    ArrowRight: { x: d, y: 0 },
    ArrowUp: { x: 0, y: -d },
    ArrowDown: { x: 0, y: d },
  }[event.key];
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  if (endpoint) emit("nudgeEndpoint", index as 0 | 1, delta);
  else emit("nudgeAdjustment", index, delta);
}
function rotateKey(event: KeyboardEvent): void {
  if (
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  emit(
    "nudgeRotation",
    (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1) * (event.shiftKey ? 15 : 1),
  );
}
</script>
<template>
  <div class="standard-shape-selection" data-standard-shape-selection>
    <div v-if="!lineEndpoints" class="standard-shape-selection__outline" :style="outlineStyle">
      <span class="standard-shape-selection__stem" />
    </div>
    <button
      v-for="h in lineEndpoints ? [] : sizes"
      :key="h.direction"
      type="button"
      tabindex="-1"
      class="standard-shape-selection__handle"
      :style="style(h.point)"
      :aria-label="t(labels[h.direction])"
      :data-shape-resize="h.direction"
      @pointerdown.prevent.stop="emit('resize', h.direction, $event)"
      @dblclick.prevent.stop
    />
    <button
      v-if="!lineEndpoints && owns(rotation)"
      type="button"
      class="standard-shape-selection__handle is-rotation"
      :style="style(rotation)"
      :aria-label="t('drawing.rotateShape')"
      data-shape-rotate
      @pointerdown.prevent.stop="emit('rotate', $event)"
      @keydown="rotateKey"
      @dblclick.prevent.stop
    />
    <button
      v-for="h in endpoints"
      :key="`endpoint-${h.index}`"
      type="button"
      class="standard-shape-selection__handle is-endpoint"
      :style="style(h.point)"
      :aria-label="t(h.index === 0 ? 'drawing.lineStart' : 'drawing.lineEnd')"
      :data-shape-endpoint="h.index"
      @pointerdown.prevent.stop="emit('endpoint', h.index, $event)"
      @keydown="handleKey(h.index, $event, true)"
      @dblclick.prevent.stop
    />
    <button
      v-for="h in adjustments"
      :key="h.index"
      type="button"
      class="standard-shape-selection__handle is-adjustment"
      :style="style(h.point)"
      :aria-label="t('drawing.adjustShape', { index: h.index + 1 })"
      :data-shape-adjustment="h.index"
      @pointerdown.prevent.stop="emit('adjust', h.index, $event)"
      @keydown="handleKey(h.index, $event)"
      @dblclick.prevent.stop
    />
  </div>
</template>
<style scoped lang="scss">
.standard-shape-selection {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  &__outline {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--sheetcraft-action-primary);
  }
  &__stem {
    position: absolute;
    width: 1px;
    height: 24px;
    background: var(--sheetcraft-action-primary);
    left: 50%;
    top: -24px;
  }
  &__handle {
    position: absolute;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    touch-action: none;
    cursor: crosshair;
    &::after {
      content: "";
      position: absolute;
      inset: 4px;
      border: 1px solid var(--sheetcraft-action-primary);
      border-radius: 50%;
      background: var(--sheetcraft-surface-default);
      box-shadow: 0 0 0 1px white;
    }
    &.is-rotation::after {
      inset: 3px;
      background: var(--sheetcraft-action-primary);
    }
    &.is-adjustment::after {
      border-radius: 0;
      transform: rotate(45deg);
      background: #ffd438;
      border-color: #795b00;
    }
    &:hover::after {
      box-shadow: 0 0 0 2px var(--sheetcraft-surface-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 2px;
      border-radius: 3px;
    }
  }
}
</style>
