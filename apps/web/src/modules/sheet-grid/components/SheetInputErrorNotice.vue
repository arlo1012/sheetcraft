<script setup lang="ts">
import { TriangleAlert, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import type { CellAddress } from "@idea10/core/workbook";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";

const props = defineProps<{
  frame: SheetRenderFrame;
  address: CellAddress;
  title: string;
  message: string;
  closeLabel: string;
}>();

const emit = defineEmits<{ close: [] }>();

const noticeRef = ref<HTMLElement | null>(null);
const fallbackHeight = 112;
const gap = 2;
const preferredWidth = 280;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

const overlay = computed(() => {
  const rect = props.frame.layout.getCellViewportRect(props.address);
  if (!rect) return { visible: false, style: {} };

  const paneId = props.frame.layout.getPaneForAddress(props.address);
  const pane = props.frame.panes[paneId];
  if (!pane) return { visible: false, style: {} };

  const visibleLeft = Math.max(pane.clip.x, rect.x);
  const visibleRight = Math.min(pane.clip.x + pane.clip.width, rect.x + rect.width);
  const visibleTop = Math.max(pane.clip.y, rect.y);
  const visibleBottom = Math.min(pane.clip.y + pane.clip.height, rect.y + rect.height);
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop)
    return { visible: false, style: {} };

  const width = Math.min(preferredWidth, props.frame.body.width);
  const measuredHeight = noticeRef.value?.offsetHeight || fallbackHeight;
  const leftBound = props.frame.body.x;
  const rightBound = leftBound + props.frame.body.width;
  const topBound = props.frame.body.y;
  const bottomBound = topBound + props.frame.body.height;
  const below = props.frame.body.y + rect.y + rect.height + gap;
  const above = props.frame.body.y + rect.y - measuredHeight - gap;
  const top = below + measuredHeight <= bottomBound || above < topBound ? below : above;

  return {
    visible: true,
    style: {
      left: `${clamp(props.frame.body.x + rect.x, leftBound, rightBound - width)}px`,
      top: `${clamp(top, topBound, bottomBound - measuredHeight)}px`,
      maxWidth: `${width}px`,
    },
  };
});
</script>

<template>
  <section
    v-if="overlay.visible"
    ref="noticeRef"
    class="sheet-input-error-notice"
    :style="overlay.style"
    role="alert"
    data-sheet-input-error-notice
    @pointerdown.prevent.stop
    @click.stop
  >
    <TriangleAlert class="sheet-input-error-notice__icon" :size="28" aria-hidden="true" />
    <div class="sheet-input-error-notice__content">
      <strong>{{ title }}</strong>
      <p>{{ message }}</p>
    </div>
    <button
      type="button"
      class="sheet-input-error-notice__close"
      :aria-label="closeLabel"
      @pointerdown.prevent.stop
      @click.stop="emit('close')"
    >
      <X :size="18" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped lang="scss">
.sheet-input-error-notice {
  position: absolute;
  z-index: 20;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 18px;
  column-gap: var(--idea-space-4);
  align-items: start;
  box-sizing: border-box;
  width: 280px;
  padding: var(--idea-tool-panel-padding);
  color: var(--idea-text-primary);
  background: var(--idea-palette-warning-1);
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-small);
  box-shadow: var(--idea-shadow-menu);

  &__icon {
    margin-top: 2px;
    color: var(--idea-status-warning);
  }

  &__content {
    min-width: 0;

    strong {
      display: block;
      font-size: var(--idea-font-size-body-medium);
      font-weight: var(--idea-font-weight-semibold);
      line-height: var(--idea-line-height-body-medium);
    }

    p {
      margin: var(--idea-space-1) 0 0;
      color: var(--idea-text-primary);
      font-size: var(--idea-font-size-body-small);
      line-height: var(--idea-line-height-body-small);
      overflow-wrap: anywhere;
    }
  }

  &__close {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    color: var(--idea-text-secondary);
    background: transparent;
    border: 0;
    border-radius: var(--idea-radius-small);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: var(--idea-text-primary);
      background: var(--idea-icon-button-hover-bg);
    }
  }
}
</style>
