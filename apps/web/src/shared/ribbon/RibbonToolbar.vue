<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { vIconAction } from "../focus/icon-action";
import { useAppI18n } from "../i18n";

defineProps<{
  label: string;
}>();

defineSlots<{
  default?: () => unknown;
  overlays?: () => unknown;
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
  const focusBounds =
    groupBounds.width > visibleWidth ? target.getBoundingClientRect() : groupBounds;
  let nextScrollLeft = viewport.scrollLeft;

  if (focusBounds.width > visibleWidth || focusBounds.left < visibleLeft) {
    nextScrollLeft += focusBounds.left - visibleLeft;
  } else if (focusBounds.right > visibleRight) {
    nextScrollLeft += focusBounds.right - visibleRight;
  }
  if (nextScrollLeft !== viewport.scrollLeft) {
    scrollViewportTo(nextScrollLeft);
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
    class="ribbon-toolbar"
    :class="{ 'has-overflow': isOverflowing }"
    role="group"
    data-ribbon-tools
    :aria-label="label"
  >
    <template v-if="isOverflowing">
      <span
        class="ribbon-toolbar__overflow-cue ribbon-toolbar__overflow-cue--left"
        :class="{ 'is-visible': canScrollLeft }"
        data-ribbon-overflow-cue="left"
        aria-hidden="true"
      />
      <span
        class="ribbon-toolbar__overflow-cue ribbon-toolbar__overflow-cue--right"
        :class="{ 'is-visible': canScrollRight }"
        data-ribbon-overflow-cue="right"
        aria-hidden="true"
      />
      <span
        v-icon-action="!canScrollLeft"
        class="ribbon-toolbar__scroll-button ribbon-toolbar__scroll-button--left"
        data-ribbon-scroll="left"
        :aria-label="t('ribbon.scrollLeft')"
        :title="t('ribbon.scrollLeft')"
        @click="scrollByPage(-1)"
      >
        <ChevronLeft :size="16" :stroke-width="2" aria-hidden="true" />
      </span>
      <span
        v-icon-action="!canScrollRight"
        class="ribbon-toolbar__scroll-button ribbon-toolbar__scroll-button--right"
        data-ribbon-scroll="right"
        :aria-label="t('ribbon.scrollRight')"
        :title="t('ribbon.scrollRight')"
        @click="scrollByPage(1)"
      >
        <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
      </span>
    </template>
    <div
      ref="viewportRef"
      class="ribbon-toolbar__viewport"
      data-ribbon-scroll-viewport
      @scroll.passive="updateScrollPositionState"
      @focusin="onViewportFocusIn"
    >
      <div ref="railRef" class="ribbon-toolbar__rail" data-ribbon-rail>
        <slot />
      </div>
    </div>
    <slot name="overlays" />
  </div>
</template>

<style scoped lang="scss">
.ribbon-toolbar {
  --ribbon-control-height: var(--idea-ribbon-row-height, 26px);
  --ribbon-row-gap: var(--idea-ribbon-row-gap, 2px);

  position: relative;
  min-width: 0;
  height: var(--idea-ribbon-toolbar-height, 68px);
  overflow: hidden;
  background: var(--idea-surface-panel);

  &__viewport {
    width: 100%;
    height: 100%;
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
    height: var(--idea-ribbon-group-height, 56px);
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
      background: linear-gradient(to right, var(--idea-surface-panel) 48%, transparent);
    }

    &--right {
      right: 0;
      background: linear-gradient(to left, var(--idea-surface-panel) 48%, transparent);
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
    background: var(--idea-surface-panel);
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--idea-text-secondary);
    cursor: pointer;
    outline: none;

    &--left {
      left: 4px;
    }

    &--right {
      right: 4px;
    }

    &:hover:not([aria-disabled="true"]) {
      background: var(--idea-surface-hover);
      color: var(--idea-text-primary);
    }

    &:focus-visible {
      border-color: var(--idea-action-focus);
      box-shadow: var(--idea-keyboard-focus-shadow);
    }

    &[aria-disabled="true"] {
      color: var(--idea-text-muted);
      cursor: default;
      opacity: 0.38;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .ribbon-toolbar__overflow-cue {
    transition: none;
  }
}
</style>
