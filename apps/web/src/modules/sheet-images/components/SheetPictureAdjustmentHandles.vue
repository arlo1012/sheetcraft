<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  pictureFrameLocalToWorld,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import type { PictureCropShape } from "@sheetcraft/core/shape-presets";
import { projectPictureFrameIntoPane } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import { getPictureCropShapeGeometry } from "../picture-crop-shape";
import { isPictureHandleOwnedByPane } from "../picture-selection-handle";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  shape: PictureCropShape;
  geometry: ResolvedPictureFrame;
  layout: SheetViewportLayout;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  start: [index: number, event: PointerEvent];
  nudge: [index: number, delta: Point];
}>();
const { t } = useAppI18n();
const shape = computed(() =>
  getPictureCropShapeGeometry(props.shape, props.geometry.rect.width, props.geometry.rect.height),
);
const handles = computed(() => {
  if (props.disabled || props.geometry.collapsed || !shape.value) return [];
  return (["topLeft", "top", "left", "body"] as FrozenPaneId[]).flatMap((paneId) => {
    const geometry = projectPictureFrameIntoPane(props.geometry, paneId, props.layout);
    const positions = shape.value!.handles.map((handle) =>
      pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, handle.position),
    );
    // Adjustment handles may lie outside the ordinary frame (e.g. callout tips).
    // Expand only the ownership candidate extent; selection boxes remain unchanged.
    const x = Math.min(geometry.bounds.x, ...positions.map((p) => p.x - 1));
    const y = Math.min(geometry.bounds.y, ...positions.map((p) => p.y - 1));
    const endX = Math.max(
      geometry.bounds.x + geometry.bounds.width,
      ...positions.map((p) => p.x + 1),
    );
    const endY = Math.max(
      geometry.bounds.y + geometry.bounds.height,
      ...positions.map((p) => p.y + 1),
    );
    const fragment = {
      paneId,
      geometry: { ...geometry, bounds: { x, y, width: endX - x, height: endY - y } },
      clippedBounds: props.layout.panes[paneId].clip,
    };
    return positions.flatMap((point, index) =>
      shape.value!.handles[index]!.fields.some((field) => field.disabled) ||
      !isPictureHandleOwnedByPane(fragment, props.layout, point)
        ? []
        : [{ paneId, point, index }],
    );
  });
});
function style(point: Point): CSSProperties {
  return { left: `${point.x}px`, top: `${point.y}px` };
}
function keydown(index: number, event: KeyboardEvent): void {
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
  emit("nudge", index, delta);
}
</script>
<template>
  <div class="picture-shape-adjustments" data-picture-shape-adjustments>
    <button
      v-for="handle in handles"
      :key="`${handle.paneId}:${handle.index}`"
      type="button"
      class="picture-shape-adjustments__handle"
      :style="style(handle.point)"
      :aria-label="t('image.adjustShape', { index: handle.index + 1 })"
      :title="t('image.adjustShape', { index: handle.index + 1 })"
      :data-picture-shape-adjustment="handle.index"
      :data-picture-shape-pane="handle.paneId"
      @pointerdown.prevent.stop="$event.button === 0 && emit('start', handle.index, $event)"
      @dblclick.prevent.stop
      @keydown="keydown(handle.index, $event)"
    />
  </div>
</template>
<style scoped lang="scss">
.picture-shape-adjustments {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  &__handle {
    position: absolute;
    width: 15px;
    height: 15px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    cursor: crosshair;
    touch-action: none;
    &::after {
      content: "";
      position: absolute;
      inset: 3px;
      border: 1px solid #795b00;
      background: #ffd438;
      transform: rotate(45deg);
      box-shadow: 0 0 0 1px white;
    }
    &:hover::after {
      background: #ffeb8a;
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 2px;
      border-radius: 3px;
    }
  }
}
</style>
