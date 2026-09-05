<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { SheetHorizontalScrollState } from "../horizontal-scroll";

const props = defineProps<{
  state: SheetHorizontalScrollState;
  controls: string;
}>();
const emit = defineEmits<{ scroll: [position: number] }>();
const { t } = useAppI18n();
const trackRef = ref<HTMLDivElement | null>(null);
const thumbRef = ref<HTMLDivElement | null>(null);
const dragging = ref(false);
const maximum = computed(() => Math.max(0, props.state.contentSize - props.state.viewportSize));
const position = computed(() => Math.min(maximum.value, Math.max(0, props.state.position)));
const progress = computed(() => (maximum.value > 0 ? position.value / maximum.value : 0));
const thumbStyle = computed(() => ({
  width: `${props.state.contentSize > 0 ? Math.min(1, props.state.viewportSize / props.state.contentSize) * 100 : 100}%`,
  left: `${progress.value * 100}%`,
  transform: `translateX(${-progress.value * 100}%)`,
}));
let drag: { pointerId: number; x: number; position: number; scale: number } | undefined;

function scrollTo(value: number): void {
  emit("scroll", Math.min(maximum.value, Math.max(0, value)));
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || maximum.value <= 0) return;
  const track = trackRef.value;
  const thumb = thumbRef.value;
  if (!track || !thumb) return;
  event.preventDefault();
  track.focus({ preventScroll: true });
  const thumbBounds = thumb.getBoundingClientRect();
  if (event.target !== thumb) {
    scrollTo(
      position.value + (event.clientX < thumbBounds.left ? -1 : 1) * props.state.viewportSize,
    );
    return;
  }
  const travel = track.getBoundingClientRect().width - thumbBounds.width;
  if (travel <= 0) return;
  drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    position: position.value,
    scale: maximum.value / travel,
  };
  dragging.value = true;
  track.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  scrollTo(drag.position + (event.clientX - drag.x) * drag.scale);
}

function stopDrag(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (trackRef.value?.hasPointerCapture(event.pointerId)) {
    trackRef.value.releasePointerCapture(event.pointerId);
  }
  drag = undefined;
  dragging.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (maximum.value <= 0 || event.ctrlKey || event.metaKey || event.altKey) return;
  let next: number;
  switch (event.key) {
    case "ArrowLeft":
      next = position.value - 48;
      break;
    case "ArrowRight":
      next = position.value + 48;
      break;
    case "PageUp":
      next = position.value - props.state.viewportSize;
      break;
    case "PageDown":
      next = position.value + props.state.viewportSize;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = maximum.value;
      break;
    default:
      return;
  }
  event.preventDefault();
  scrollTo(next);
}

function onWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey || maximum.value <= 0) return;
  const delta = event.deltaX || event.deltaY;
  if (!delta) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? props.state.viewportSize : 1;
  scrollTo(position.value + delta * unit);
}
</script>

<template>
  <div
    ref="trackRef"
    class="sheet-horizontal-scrollbar"
    :class="{ 'is-dragging': dragging, 'is-disabled': maximum <= 0 }"
    role="scrollbar"
    aria-orientation="horizontal"
    :aria-label="t('grid.horizontalScroll')"
    :aria-controls="controls"
    :aria-valuemin="0"
    :aria-valuemax="Math.round(maximum)"
    :aria-valuenow="Math.round(position)"
    :aria-disabled="maximum <= 0"
    :tabindex="maximum > 0 ? 0 : -1"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="stopDrag"
    @pointercancel="stopDrag"
    @lostpointercapture="stopDrag"
    @keydown="onKeydown"
    @wheel="onWheel"
  >
    <div ref="thumbRef" class="sheet-horizontal-scrollbar__thumb" :style="thumbStyle" />
  </div>
</template>

<style scoped lang="scss">
.sheet-horizontal-scrollbar {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 16px;
  touch-action: none;
  user-select: none;
  border-radius: 3px;

  &:focus-visible {
    outline: none;
  }

  &:focus-visible &__thumb {
    background: var(--idea-action-primary);
  }

  &__thumb {
    position: absolute;
    top: 4px;
    height: 8px;
    min-width: min(24px, 100%);
    border-radius: 4px;
    background: var(--idea-text-muted);
  }

  &__thumb:hover,
  &.is-dragging &__thumb {
    background: var(--idea-text-secondary);
  }

  &.is-disabled &__thumb {
    background: var(--idea-border-subtle);
  }
}
</style>
