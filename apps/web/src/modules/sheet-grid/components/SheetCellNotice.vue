<script setup lang="ts">
import { TriangleAlert, X } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import { computed, ref } from "vue";
import type { CellAddress } from "@idea10/core/workbook";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";

const props = withDefaults(
  defineProps<{
    frame: SheetRenderFrame;
    address: CellAddress;
    title?: string;
    message: string;
    closeLabel?: string;
    tone?: "warning" | "information";
  }>(),
  { tone: "information" },
);

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
    class="sheet-cell-notice"
    :style="overlay.style"
    :class="{
      'sheet-cell-notice--warning': tone === 'warning',
      'sheet-cell-notice--dismissible': !!closeLabel,
    }"
    :role="tone === 'warning' ? 'alert' : 'status'"
    data-sheet-cell-notice
    @pointerdown.prevent.stop
    @click.stop
  >
    <TriangleAlert
      v-if="tone === 'warning'"
      class="sheet-cell-notice__icon"
      :size="28"
      aria-hidden="true"
    />
    <div class="sheet-cell-notice__content">
      <div v-if="title || closeLabel" class="sheet-cell-notice__header">
        <strong v-if="title">{{ title }}</strong>
        <span
          v-if="closeLabel"
          v-icon-action
          class="sheet-cell-notice__close"
          :aria-label="closeLabel"
          @pointerdown.prevent.stop
          @click.stop="emit('close')"
        >
          <X :size="18" aria-hidden="true" />
        </span>
      </div>
      <p v-if="message">{{ message }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.sheet-cell-notice {
  position: absolute;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: var(--idea-space-4);
  align-items: start;
  box-sizing: border-box;
  width: max-content;
  padding: var(--idea-tool-panel-padding);
  color: var(--idea-text-primary);
  background: var(--idea-surface-panel);
  pointer-events: none;
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-small);
  box-shadow: var(--idea-shadow-menu);

  &--warning {
    width: 280px;
    grid-template-columns: 28px minmax(0, 1fr);
    background: var(--idea-palette-warning-1);

    .sheet-cell-notice__icon {
      color: var(--idea-status-warning);
    }
  }

  &--dismissible {
    pointer-events: auto;
  }

  &__icon {
    margin-top: 2px;
    color: var(--idea-action-primary);
  }

  &__content {
    min-width: 0;
    overflow-wrap: anywhere;

    strong {
      display: block;
      font-size: var(--idea-font-size-body-medium);
      font-weight: var(--idea-font-weight-semibold);
      line-height: var(--idea-line-height-body-medium);
    }

    p {
      margin: 0;
      color: var(--idea-text-primary);
      font-size: var(--idea-font-size-body-small);
      line-height: var(--idea-line-height-body-small);
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
  }

  &__header {
    display: flex;
    align-items: center;
    gap: var(--idea-space-4);
    margin-bottom: var(--idea-space-1);
  }

  &__close {
    flex: none;
    margin-left: auto;
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

    &:hover {
      color: var(--idea-text-primary);
      background: var(--idea-icon-button-hover-bg);
    }
  }
}
</style>
