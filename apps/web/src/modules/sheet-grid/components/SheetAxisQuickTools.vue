<script setup lang="ts">
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  MoreHorizontal,
} from "lucide-vue-next";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { SheetDimensionAxis } from "@idea10/core/workbook";

const props = defineProps<{
  axis: SheetDimensionAxis;
  position: { x: number; y: number };
  insertBeforeDisabled: boolean;
  insertAfterDisabled: boolean;
}>();

const emit = defineEmits<{
  insert: [direction: "before" | "after"];
  more: [trigger: HTMLButtonElement];
}>();

const { t } = useAppI18n();

function actionLabel(direction: "before" | "after"): string {
  const key: MessageKey =
    props.axis === "row"
      ? direction === "before"
        ? "axisMenu.insertAbove"
        : "axisMenu.insertBelow"
      : direction === "before"
        ? "axisMenu.insertBefore"
        : "axisMenu.insertAfter";
  return t(key);
}

function moreLabel(): string {
  return t(props.axis === "row" ? "axisMenu.rowActions" : "axisMenu.columnActions");
}
</script>

<template>
  <div
    class="sheet-axis-quick-tools"
    :class="`is-${axis}`"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    role="toolbar"
    :aria-label="t('statusBar.axisQuickTools')"
    @mousedown.stop
  >
    <button
      type="button"
      :disabled="insertBeforeDisabled"
      :aria-label="actionLabel('before')"
      :title="actionLabel('before')"
      data-axis-quick-action="insert-before"
      @click="emit('insert', 'before')"
    >
      <ArrowUpToLine v-if="axis === 'row'" :size="14" aria-hidden="true" />
      <ArrowLeftToLine v-else :size="14" aria-hidden="true" />
    </button>
    <button
      type="button"
      :disabled="insertAfterDisabled"
      :aria-label="actionLabel('after')"
      :title="actionLabel('after')"
      data-axis-quick-action="insert-after"
      @click="emit('insert', 'after')"
    >
      <ArrowDownToLine v-if="axis === 'row'" :size="14" aria-hidden="true" />
      <ArrowRightToLine v-else :size="14" aria-hidden="true" />
    </button>
    <button
      type="button"
      :aria-label="moreLabel()"
      :title="moreLabel()"
      aria-haspopup="menu"
      data-axis-quick-action="more"
      @click="emit('more', $event.currentTarget as HTMLButtonElement)"
    >
      <MoreHorizontal :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.sheet-axis-quick-tools {
  position: absolute;
  z-index: 6;
  display: flex;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-small);
  box-shadow: var(--idea-shadow-raised);

  &.is-column {
    flex-direction: column;
  }

  button {
    display: grid;
    width: 24px;
    height: 24px;
    padding: 0;
    place-items: center;
    background: transparent;
    border: 0;
    color: var(--idea-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--idea-icon-button-hover-bg);
    }

    &:focus-visible {
      position: relative;
      z-index: 1;
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }

    &:disabled {
      color: var(--idea-text-disabled);
      cursor: not-allowed;
    }
  }
}
</style>
