<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_ROW_HEIGHT, MIN_ROW_HEIGHT } from "@idea10/core/workbook";
import type { SheetGeometry } from "@idea10/sheet-engine/geometry";

const { t } = useAppI18n();

const props = defineProps<{
  items: readonly { index: number; offset: number; size: number }[];
  geometry: SheetGeometry;
  selectedStartRow: number;
  selectedEndRow: number;
  selected: boolean;
}>();

const emit = defineEmits<{
  resizeStart: [payload: { index: number; event: PointerEvent }];
  resize: [payload: { index: number; size: number }];
  select: [payload: { row: number; shiftKey: boolean }];
  openContextMenu: [
    payload: { row: number; clientX: number; clientY: number; trigger: HTMLButtonElement },
  ];
}>();

const KEYBOARD_RESIZE_STEP = 8;

function getHeaderStyle(item: { offset: number; size: number }): CSSProperties {
  return {
    top: `${item.offset}px`,
    height: `${item.size}px`,
  };
}

function onResizeHandleKeydown(row: number, event: KeyboardEvent): void {
  const currentSize = props.geometry.getRowHeight(row);
  let size: number;
  if (event.key === "ArrowUp") {
    size = Math.max(MIN_ROW_HEIGHT, currentSize - KEYBOARD_RESIZE_STEP);
  } else if (event.key === "ArrowDown") {
    size = Math.min(MAX_ROW_HEIGHT, currentSize + KEYBOARD_RESIZE_STEP);
  } else if (event.key === "Home") {
    size = MIN_ROW_HEIGHT;
  } else if (event.key === "End") {
    size = MAX_ROW_HEIGHT;
  } else {
    return;
  }

  event.preventDefault();
  emit("resize", { index: row, size });
}

function onHeaderKeydown(row: number, event: KeyboardEvent): void {
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    const trigger = event.currentTarget as HTMLButtonElement;
    const bounds = trigger.getBoundingClientRect();
    emit("openContextMenu", {
      row,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      trigger,
    });
    return;
  }
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
    return;
  }
  event.preventDefault();
  emit("select", { row, shiftKey: event.shiftKey });
}

function onHeaderContextMenu(row: number, event: MouseEvent): void {
  emit("openContextMenu", {
    row,
    clientX: event.clientX,
    clientY: event.clientY,
    trigger: event.currentTarget as HTMLButtonElement,
  });
}
</script>

<template>
  <div class="sheet-row-headers" role="presentation">
    <div
      v-for="item in items"
      :key="item.index"
      class="sheet-row-headers__item"
      :class="{
        'is-active': selected && item.index >= selectedStartRow && item.index <= selectedEndRow,
      }"
      :style="getHeaderStyle(item)"
      :data-row="item.index"
    >
      <button
        type="button"
        class="sheet-row-headers__select-button"
        :data-select-row="item.index"
        :aria-label="t('grid.selectRow', { row: item.index + 1 })"
        :aria-pressed="selected && item.index >= selectedStartRow && item.index <= selectedEndRow"
        @mousedown.left.prevent="emit('select', { row: item.index, shiftKey: $event.shiftKey })"
        @contextmenu.prevent="onHeaderContextMenu(item.index, $event)"
        @keydown="onHeaderKeydown(item.index, $event)"
      >
        <span aria-hidden="true">{{ item.index + 1 }}</span>
      </button>
      <span
        class="sheet-row-headers__resize-handle"
        :data-resize-row="item.index"
        role="separator"
        aria-orientation="horizontal"
        :aria-label="t('grid.rowHeight', { row: item.index + 1 })"
        :aria-valuemin="MIN_ROW_HEIGHT"
        :aria-valuemax="MAX_ROW_HEIGHT"
        :aria-valuenow="geometry.getRowHeight(item.index)"
        tabindex="0"
        @mousedown.stop
        @pointerdown.left.prevent.stop="emit('resizeStart', { index: item.index, event: $event })"
        @keydown.stop="onResizeHandleKeydown(item.index, $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-row-headers {
  position: absolute;
  inset: var(--sheet-column-header-height) auto 0 0;
  z-index: 4;
  width: var(--sheet-row-header-width);
  overflow: hidden;
  background: var(--idea-surface-secondary);
  border-right: 1px solid var(--idea-border-control);
  user-select: none;

  &__item {
    position: absolute;
    left: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-bottom: 1px solid var(--idea-border-subtle);
    color: var(--idea-text-secondary);
    font-size: 12px;
    &.is-active {
      background: var(--idea-action-focus);
      color: var(--idea-action-primary);
      font-weight: 600;
    }
  }

  &__select-button {
    width: 100%;
    height: 100%;
    padding: 0 0 6px;
    background: transparent;
    border: 0;
    color: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }

  &__resize-handle {
    position: absolute;
    inset: auto 0 0;
    z-index: 1;
    height: 6px;
    cursor: row-resize;
    touch-action: none;

    &:focus-visible {
      background: var(--idea-action-primary);
      outline: none;
    }
  }
}
</style>
