<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { columnIndexToLabel } from "@idea10/core/coordinates";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@idea10/core/workbook";
import type { SheetGeometry } from "@idea10/sheet-engine/geometry";

const { t } = useAppI18n();

const props = defineProps<{
  startColumn: number;
  endColumn: number;
  geometry: SheetGeometry;
  scrollLeft: number;
  selectedStartColumn: number;
  selectedEndColumn: number;
  selected: boolean;
}>();

const emit = defineEmits<{
  resizeStart: [payload: { index: number; event: PointerEvent }];
  resize: [payload: { index: number; size: number }];
  select: [payload: { column: number; shiftKey: boolean }];
  openContextMenu: [
    payload: {
      column: number;
      clientX: number;
      clientY: number;
      trigger: HTMLButtonElement;
    },
  ];
}>();

const KEYBOARD_RESIZE_STEP = 8;

const columns = computed(() => {
  const result: number[] = [];
  for (let column = props.startColumn; column <= props.endColumn; column += 1) {
    result.push(column);
  }
  return result;
});

function getHeaderStyle(column: number): CSSProperties {
  return {
    left: `${props.geometry.getColumnOffset(column) - props.scrollLeft}px`,
    width: `${props.geometry.getColumnWidth(column)}px`,
  };
}

function onResizeHandleKeydown(column: number, event: KeyboardEvent): void {
  const currentSize = props.geometry.getColumnWidth(column);
  let size: number;
  if (event.key === "ArrowLeft") {
    size = Math.max(MIN_COLUMN_WIDTH, currentSize - KEYBOARD_RESIZE_STEP);
  } else if (event.key === "ArrowRight") {
    size = Math.min(MAX_COLUMN_WIDTH, currentSize + KEYBOARD_RESIZE_STEP);
  } else if (event.key === "Home") {
    size = MIN_COLUMN_WIDTH;
  } else if (event.key === "End") {
    size = MAX_COLUMN_WIDTH;
  } else {
    return;
  }

  event.preventDefault();
  emit("resize", { index: column, size });
}

function onHeaderKeydown(column: number, event: KeyboardEvent): void {
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    const trigger = event.currentTarget as HTMLButtonElement;
    const bounds = trigger.getBoundingClientRect();
    emit("openContextMenu", {
      column,
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
  emit("select", { column, shiftKey: event.shiftKey });
}

function onHeaderContextMenu(column: number, event: MouseEvent): void {
  emit("openContextMenu", {
    column,
    clientX: event.clientX,
    clientY: event.clientY,
    trigger: event.currentTarget as HTMLButtonElement,
  });
}
</script>

<template>
  <div class="sheet-column-headers" role="presentation">
    <div
      v-for="column in columns"
      :key="column"
      class="sheet-column-headers__item"
      :class="{
        'is-active': selected && column >= selectedStartColumn && column <= selectedEndColumn,
      }"
      :style="getHeaderStyle(column)"
      :data-column="column"
    >
      <button
        type="button"
        class="sheet-column-headers__select-button"
        :data-select-column="column"
        :aria-label="t('grid.selectColumn', { column: columnIndexToLabel(column) })"
        :aria-pressed="selected && column >= selectedStartColumn && column <= selectedEndColumn"
        @mousedown.left.prevent="emit('select', { column, shiftKey: $event.shiftKey })"
        @contextmenu.prevent="onHeaderContextMenu(column, $event)"
        @keydown="onHeaderKeydown(column, $event)"
      >
        <span aria-hidden="true">{{ columnIndexToLabel(column) }}</span>
      </button>
      <span
        class="sheet-column-headers__resize-handle"
        :data-resize-column="column"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('grid.columnWidth', { column: columnIndexToLabel(column) })"
        :aria-valuemin="MIN_COLUMN_WIDTH"
        :aria-valuemax="MAX_COLUMN_WIDTH"
        :aria-valuenow="geometry.getColumnWidth(column)"
        tabindex="0"
        @mousedown.stop
        @pointerdown.left.prevent.stop="emit('resizeStart', { index: column, event: $event })"
        @keydown.stop="onResizeHandleKeydown(column, $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-column-headers {
  position: absolute;
  inset: 0 0 auto var(--sheet-row-header-width);
  z-index: 4;
  height: var(--sheet-column-header-height);
  overflow: hidden;
  background: var(--idea-surface-secondary);
  border-bottom: 1px solid var(--idea-border-control);
  user-select: none;

  &__item {
    position: absolute;
    top: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-right: 1px solid var(--idea-border-subtle);
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
    padding: 0 6px 0 0;
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
    inset: 0 0 0 auto;
    z-index: 1;
    width: 6px;
    cursor: col-resize;
    touch-action: none;

    &:focus-visible {
      background: var(--idea-action-primary);
      outline: none;
    }
  }
}
</style>
