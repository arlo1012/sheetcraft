<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_ROW_HEIGHT, MIN_ROW_HEIGHT } from "@idea10/core/workbook";
import type { SheetGeometry } from "@idea10/sheet-engine/geometry";

const { t } = useAppI18n();

const props = defineProps<{
  startRow: number;
  endRow: number;
  geometry: SheetGeometry;
  scrollTop: number;
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

const rows = computed(() => {
  const result: number[] = [];
  for (let row = props.startRow; row <= props.endRow; row += 1) {
    result.push(row);
  }
  return result;
});

function getHeaderStyle(row: number): CSSProperties {
  return {
    top: `${props.geometry.getRowOffset(row) - props.scrollTop}px`,
    height: `${props.geometry.getRowHeight(row)}px`,
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
      v-for="row in rows"
      :key="row"
      class="sheet-row-headers__item"
      :class="{ 'is-active': selected && row >= selectedStartRow && row <= selectedEndRow }"
      :style="getHeaderStyle(row)"
      :data-row="row"
    >
      <button
        type="button"
        class="sheet-row-headers__select-button"
        :data-select-row="row"
        :aria-label="t('grid.selectRow', { row: row + 1 })"
        :aria-pressed="selected && row >= selectedStartRow && row <= selectedEndRow"
        @mousedown.left.prevent="emit('select', { row, shiftKey: $event.shiftKey })"
        @contextmenu.prevent="onHeaderContextMenu(row, $event)"
        @keydown="onHeaderKeydown(row, $event)"
      >
        <span aria-hidden="true">{{ row + 1 }}</span>
      </button>
      <span
        class="sheet-row-headers__resize-handle"
        :data-resize-row="row"
        role="separator"
        aria-orientation="horizontal"
        :aria-label="t('grid.rowHeight', { row: row + 1 })"
        :aria-valuemin="MIN_ROW_HEIGHT"
        :aria-valuemax="MAX_ROW_HEIGHT"
        :aria-valuenow="geometry.getRowHeight(row)"
        tabindex="0"
        @mousedown.stop
        @pointerdown.left.prevent.stop="emit('resizeStart', { index: row, event: $event })"
        @keydown.stop="onResizeHandleKeydown(row, $event)"
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
