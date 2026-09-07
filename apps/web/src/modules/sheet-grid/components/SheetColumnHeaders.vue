<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { columnIndexToLabel } from "@idea10/core/coordinates";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@idea10/core/workbook";
import type { SheetGeometry } from "@idea10/sheet-engine/geometry";

const { t } = useAppI18n();

const props = defineProps<{
  panes: readonly {
    id: "frozen" | "body";
    offset: number;
    size: number;
    items: readonly { index: number; offset: number; size: number }[];
  }[];
  geometry: SheetGeometry;
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

function getPaneStyle(pane: { offset: number; size: number }): CSSProperties {
  return { left: `${pane.offset}px`, width: `${pane.size}px` };
}

function getHeaderStyle(item: { offset: number; size: number }, paneOffset: number): CSSProperties {
  return {
    left: `${item.offset - paneOffset}px`,
    width: `${item.size}px`,
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
      v-for="pane in panes"
      :key="pane.id"
      class="sheet-column-headers__pane"
      :style="getPaneStyle(pane)"
      :data-header-pane="pane.id"
    >
      <div
        v-for="item in pane.items"
        :key="item.index"
        class="sheet-column-headers__item"
        :class="{
          'is-in-selection': item.index >= selectedStartColumn && item.index <= selectedEndColumn,
          'is-active':
            selected && item.index >= selectedStartColumn && item.index <= selectedEndColumn,
        }"
        :style="getHeaderStyle(item, pane.offset)"
        :data-column="item.index"
      >
        <button
          type="button"
          class="sheet-column-headers__select-button"
          :data-select-column="item.index"
          :aria-label="t('grid.selectColumn', { column: columnIndexToLabel(item.index) })"
          :aria-pressed="
            selected && item.index >= selectedStartColumn && item.index <= selectedEndColumn
          "
          @mousedown.left.prevent="
            emit('select', { column: item.index, shiftKey: $event.shiftKey })
          "
          @contextmenu.prevent="onHeaderContextMenu(item.index, $event)"
          @keydown="onHeaderKeydown(item.index, $event)"
        >
          <span aria-hidden="true">{{ columnIndexToLabel(item.index) }}</span>
        </button>
        <span
          class="sheet-column-headers__resize-handle"
          :data-resize-column="item.index"
          role="separator"
          aria-orientation="vertical"
          :aria-label="t('grid.columnWidth', { column: columnIndexToLabel(item.index) })"
          :aria-valuemin="MIN_COLUMN_WIDTH"
          :aria-valuemax="MAX_COLUMN_WIDTH"
          :aria-valuenow="geometry.getColumnWidth(item.index)"
          tabindex="0"
          @mousedown.stop
          @pointerdown.left.prevent.stop="emit('resizeStart', { index: item.index, event: $event })"
          @keydown.stop="onResizeHandleKeydown(item.index, $event)"
        />
      </div>
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

    &.is-in-selection {
      background: var(--idea-action-primary-subtle);
      box-shadow: inset 0 -2px 0 var(--idea-action-primary);
      color: var(--idea-action-primary);
    }

    &.is-active {
      background: var(--idea-action-focus);
      color: var(--idea-action-primary);
      font-weight: 600;
    }
  }

  &__pane {
    position: absolute;
    inset-block: 0;
    overflow: hidden;
  }

  &__select-button {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
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
