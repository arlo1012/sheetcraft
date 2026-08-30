<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import HomeAlignmentGroup from "./HomeAlignmentGroup.vue";
import HomeAutomationGroup from "./HomeAutomationGroup.vue";
import HomeCellFormatGroup from "./HomeCellFormatGroup.vue";
import HomeDataGroup from "./HomeDataGroup.vue";
import HomeHistoryGroup from "./HomeHistoryGroup.vue";
import HomeInsertGroup from "./HomeInsertGroup.vue";
import HomeNumberGroup from "./HomeNumberGroup.vue";
import HomeUtilityGroup from "./HomeUtilityGroup.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  undo: [];
  redo: [];
}>();

const { t } = useAppI18n();
const toolbarRef = ref<HTMLDivElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const railRef = ref<HTMLDivElement | null>(null);
const isOverflowing = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
const OVERFLOW_EPSILON = 1;
const TOOLBAR_INLINE_PADDING = 8;
const OVERFLOW_CONTROL_GUTTER = 32;
const MIN_SCROLL_STEP = 160;
const RIBBON_FOCUS_TARGET_SELECTOR = [
  '[data-ribbon-group] button:not(:disabled):not([aria-disabled="true"])',
  "[data-ribbon-group] input:not(:disabled)",
  "[data-ribbon-group] select:not(:disabled)",
  "[data-ribbon-group] textarea:not(:disabled)",
  '[data-ribbon-group] [tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(", ");
let resizeObserver: ResizeObserver | null = null;

function getMaxScrollLeft(viewport: HTMLDivElement): number {
  return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
}

function updateScrollPositionState(): void {
  const viewport = viewportRef.value;
  if (!viewport || !isOverflowing.value) {
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }
  const maxScrollLeft = getMaxScrollLeft(viewport);
  canScrollLeft.value = viewport.scrollLeft > OVERFLOW_EPSILON;
  canScrollRight.value = viewport.scrollLeft < maxScrollLeft - OVERFLOW_EPSILON;
}

function updateOverflowState(): void {
  const toolbar = toolbarRef.value;
  const viewport = viewportRef.value;
  const rail = railRef.value;
  if (!toolbar || !viewport || !rail) {
    return;
  }
  const availableWidth = Math.max(0, toolbar.clientWidth - TOOLBAR_INLINE_PADDING * 2);
  const nextOverflowing = rail.scrollWidth > availableWidth + OVERFLOW_EPSILON;
  if (isOverflowing.value !== nextOverflowing) {
    const shouldRestoreToolFocus =
      !nextOverflowing &&
      document.activeElement instanceof HTMLElement &&
      toolbar.contains(document.activeElement) &&
      document.activeElement.matches("[data-ribbon-scroll]");
    isOverflowing.value = nextOverflowing;
    if (!nextOverflowing) {
      viewport.scrollLeft = 0;
    }
    void nextTick(() => {
      updateScrollPositionState();
      if (shouldRestoreToolFocus) {
        rail.querySelector<HTMLElement>(RIBBON_FOCUS_TARGET_SELECTOR)?.focus();
      }
    });
    return;
  }
  updateScrollPositionState();
}

function scrollViewportTo(left: number): void {
  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }
  viewport.scrollLeft = Math.max(0, Math.min(left, getMaxScrollLeft(viewport)));
  updateScrollPositionState();
}

function scrollByPage(direction: -1 | 1): void {
  const viewport = viewportRef.value;
  const canScroll = direction === -1 ? canScrollLeft.value : canScrollRight.value;
  if (!viewport || !canScroll) {
    return;
  }
  const step = Math.max(MIN_SCROLL_STEP, Math.floor(viewport.clientWidth * 0.72));
  scrollViewportTo(viewport.scrollLeft + direction * step);
}

function onViewportFocusIn(event: FocusEvent): void {
  const viewport = viewportRef.value;
  const target = event.target;
  if (!viewport || !isOverflowing.value || !(target instanceof Element)) {
    return;
  }
  const group = target.closest<HTMLElement>("[data-ribbon-group]");
  if (!group || !viewport.contains(group)) {
    return;
  }
  const viewportBounds = viewport.getBoundingClientRect();
  const groupBounds = group.getBoundingClientRect();
  const visibleLeft = viewportBounds.left + OVERFLOW_CONTROL_GUTTER;
  const visibleRight = viewportBounds.right - OVERFLOW_CONTROL_GUTTER;
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  let nextScrollLeft = viewport.scrollLeft;

  if (groupBounds.width > visibleWidth || groupBounds.left < visibleLeft) {
    nextScrollLeft += groupBounds.left - visibleLeft;
  } else if (groupBounds.right > visibleRight) {
    nextScrollLeft += groupBounds.right - visibleRight;
  }
  if (nextScrollLeft !== viewport.scrollLeft) {
    scrollViewportTo(nextScrollLeft);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }
  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "color") ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      emit("redo");
    } else {
      emit("undo");
    }
  } else if (key === "y") {
    event.preventDefault();
    emit("redo");
  }
}

onMounted(() => {
  const toolbar = toolbarRef.value;
  const viewport = viewportRef.value;
  const rail = railRef.value;
  if (toolbar && viewport && rail && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateOverflowState);
    resizeObserver.observe(toolbar);
    resizeObserver.observe(viewport);
    resizeObserver.observe(rail);
  }
  void nextTick(updateOverflowState);
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
  <div
    ref="toolbarRef"
    class="home-format-toolbar"
    :class="{ 'has-overflow': isOverflowing }"
    role="group"
    data-ribbon-tools
    :aria-label="t('format.toolbar')"
    @keydown="onKeydown"
  >
    <template v-if="isOverflowing">
      <span
        class="home-format-toolbar__overflow-cue home-format-toolbar__overflow-cue--left"
        :class="{ 'is-visible': canScrollLeft }"
        data-ribbon-overflow-cue="left"
        aria-hidden="true"
      />
      <span
        class="home-format-toolbar__overflow-cue home-format-toolbar__overflow-cue--right"
        :class="{ 'is-visible': canScrollRight }"
        data-ribbon-overflow-cue="right"
        aria-hidden="true"
      />
      <button
        type="button"
        class="home-format-toolbar__scroll-button home-format-toolbar__scroll-button--left"
        data-ribbon-scroll="left"
        :aria-label="t('ribbon.scrollLeft')"
        :title="t('ribbon.scrollLeft')"
        :aria-disabled="!canScrollLeft"
        :tabindex="canScrollLeft ? 0 : -1"
        @click="scrollByPage(-1)"
      >
        <ChevronLeft :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="home-format-toolbar__scroll-button home-format-toolbar__scroll-button--right"
        data-ribbon-scroll="right"
        :aria-label="t('ribbon.scrollRight')"
        :title="t('ribbon.scrollRight')"
        :aria-disabled="!canScrollRight"
        :tabindex="canScrollRight ? 0 : -1"
        @click="scrollByPage(1)"
      >
        <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
    </template>
    <div
      ref="viewportRef"
      class="home-format-toolbar__viewport"
      data-ribbon-scroll-viewport
      @scroll.passive="updateScrollPositionState"
      @focusin="onViewportFocusIn"
    >
      <div ref="railRef" class="home-format-toolbar__rail">
        <HomeHistoryGroup
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
          @undo="emit('undo')"
          @redo="emit('redo')"
        />
        <HomeCellFormatGroup
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <HomeAlignmentGroup
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <HomeNumberGroup />
        <HomeDataGroup />
        <HomeInsertGroup />
        <HomeAutomationGroup />
        <HomeUtilityGroup />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-format-toolbar {
  position: relative;
  min-width: 0;
  height: 68px;
  overflow: hidden;
  background: var(--td-bg-color-container);

  &__viewport {
    width: 100%;
    height: 68px;
    padding: 5px 8px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-padding-inline: 32px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &.has-overflow &__viewport {
    padding-right: 32px;
    padding-left: 32px;
  }

  &__rail {
    display: flex;
    align-items: stretch;
    width: max-content;
    min-width: max-content;
    height: 56px;
  }

  &__overflow-cue {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    width: 42px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;

    &.is-visible {
      opacity: 1;
    }

    &--left {
      left: 0;
      background: linear-gradient(to right, var(--td-bg-color-container) 48%, transparent);
    }

    &--right {
      right: 0;
      background: linear-gradient(to left, var(--td-bg-color-container) 48%, transparent);
    }
  }

  &__scroll-button {
    position: absolute;
    z-index: 2;
    top: 7px;
    bottom: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    padding: 0;
    background: var(--td-bg-color-container);
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--td-text-color-secondary);
    cursor: pointer;
    outline: none;

    &--left {
      left: 4px;
    }

    &--right {
      right: 4px;
    }

    &:hover:not([aria-disabled="true"]) {
      background: var(--td-bg-color-container-hover);
      color: var(--td-text-color-primary);
    }

    &:focus-visible {
      border-color: var(--td-brand-color);
      box-shadow: 0 0 0 2px var(--td-brand-color-focus);
    }

    &[aria-disabled="true"] {
      color: var(--td-text-color-placeholder);
      cursor: default;
      opacity: 0.38;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-format-toolbar__overflow-cue {
    transition: none;
  }
}
</style>
