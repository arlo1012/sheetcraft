<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { RotateCw } from "lucide-vue-next";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { PictureSelectionFrameFragment } from "../picture-selection-frame";
import { isPictureHandleOwnedByPane } from "../picture-selection-handle";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  fragment: PictureSelectionFrameFragment;
  layout: SheetViewportLayout;
}>();
const emit = defineEmits<{ rotate: [event: PointerEvent] }>();
const { t } = useAppI18n();
const point = computed(() => {
  const [nw, ne] = props.fragment.geometry.corners;
  const angle = (props.fragment.geometry.angleDeg * Math.PI) / 180;
  return {
    x: (nw.x + ne.x) / 2 + Math.sin(angle) * 26,
    y: (nw.y + ne.y) / 2 - Math.cos(angle) * 26,
  };
});
const visible = computed(() =>
  isPictureHandleOwnedByPane(props.fragment, props.layout, point.value),
);
const style = computed<CSSProperties>(() => ({
  left: `${point.value.x - props.fragment.clippedBounds.x}px`,
  top: `${point.value.y - props.fragment.clippedBounds.y}px`,
}));
</script>
<template>
  <button
    v-if="visible"
    type="button"
    tabindex="-1"
    class="picture-rotation-handle"
    :style="style"
    :aria-label="t('image.rotate')"
    data-image-rotate
    @pointerdown.prevent.stop="emit('rotate', $event)"
    @dblclick.prevent.stop
  >
    <RotateCw :size="12" aria-hidden="true" />
  </button>
</template>
<style scoped lang="scss">
.picture-rotation-handle {
  position: absolute;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: white;
  background: var(--sheetcraft-action-primary);
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 0 1px 1px rgb(0 0 0 / 12%);
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  &:active {
    cursor: grabbing;
  }
}
</style>
