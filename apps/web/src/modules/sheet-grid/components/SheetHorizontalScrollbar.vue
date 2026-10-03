<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import type { SheetHorizontalScrollState } from "../horizontal-scroll";

const props = defineProps<{
  state: SheetHorizontalScrollState;
  controls: string;
}>();
const emit = defineEmits<{ scroll: [position: number, allowExpansion?: boolean] }>();
const { t } = useAppI18n();
const trackRef = ref<HTMLDivElement | null>(null);
const thumbRef = ref<HTMLDivElement | null>(null);
const dragging = ref(false);
const maximum = computed(() => Math.max(0, props.state.contentSize - props.state.viewportSize));
const position = computed(() => Math.min(maximum.value, Math.max(0, props.state.position)));
const progress = computed(() => (maximum.value > 0 ? position.value / maximum.value : 0));
const canScrollLeft = computed(() => position.value > 0);
const canScrollRight = computed(() => position.value < maximum.value);
const thumbStyle = computed(() => ({
  width: `${props.state.contentSize > 0 ? Math.min(1, props.state.viewportSize / props.state.contentSize) * 100 : 100}%`,
  left: `${progress.value * 100}%`,
  transform: `translateX(${-progress.value * 100}%)`,
}));
let drag: { pointerId: number; x: number; position: number; scale: number } | undefined;

function scrollTo(value: number): void {
  emit("scroll", Math.min(maximum.value, Math.max(0, value)));
}

function scrollByStep(direction: -1 | 1): void {
  scrollTo(position.value + direction * 48);
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || maximum.value <= 0) return;
  const track = trackRef.value;
  const thumb = thumbRef.value;
  if (!track || !thumb) return;
  event.preventDefault();
  track.focus({ preventScroll: true });
  const thumbBounds = thumb.getBoundingClientRect();
  if (!(event.target instanceof Node) || !thumb.contains(event.target)) {
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
  if (event.ctrlKey || event.metaKey || (maximum.value <= 0 && !event.shiftKey)) return;
  const delta = event.deltaX || event.deltaY;
  if (!delta) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? props.state.viewportSize : 1;
  const requestedPosition = position.value + delta * unit;
  if (event.shiftKey) {
    emit("scroll", requestedPosition, true);
    return;
  }
  scrollTo(requestedPosition);
}
</script>

<template>
  <div class="sheet-horizontal-scrollbar">
    <button
      class="sheet-horizontal-scrollbar__button"
      type="button"
      :disabled="!canScrollLeft"
      :aria-label="t('grid.scrollLeft')"
      :title="t('grid.scrollLeft')"
      @click="scrollByStep(-1)"
    >
      <ChevronLeft :size="10" aria-hidden="true" />
    </button>
    <div
      ref="trackRef"
      class="sheet-horizontal-scrollbar__track"
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
    <button
      class="sheet-horizontal-scrollbar__button"
      type="button"
      :disabled="!canScrollRight"
      :aria-label="t('grid.scrollRight')"
      :title="t('grid.scrollRight')"
      @click="scrollByStep(1)"
    >
      <ChevronRight :size="10" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.sheet-horizontal-scrollbar {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 16px;

  &__button {
    display: grid;
    flex: 0 0 14px;
    width: 14px;
    height: 16px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 2px;
    color: var(--idea-text-muted);
    background: transparent;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--idea-icon-button-hover-bg);
    }

    &:disabled {
      color: var(--idea-text-disabled);
      cursor: default;
    }
  }

  &__track {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    height: 16px;
    touch-action: none;
    user-select: none;
    border-radius: 3px;

    &:focus-visible {
      outline: none;
    }

    &:focus-visible .sheet-horizontal-scrollbar__thumb::after {
      background: var(--idea-sheet-bar-thumb-hover);
    }
  }

  &__thumb {
    position: absolute;
    top: 0;
    height: 16px;
    min-width: min(24px, 100%);

    &::after {
      position: absolute;
      top: 4px;
      right: 0;
      left: 0;
      height: 8px;
      border-radius: 999px;
      background: var(--idea-sheet-bar-thumb);
      content: "";
    }
  }

  &__thumb:hover::after,
  &__track.is-dragging &__thumb::after {
    background: var(--idea-sheet-bar-thumb-hover);
  }

  &__track.is-disabled &__thumb::after {
    background: var(--idea-text-disabled);
  }
}
</style>
