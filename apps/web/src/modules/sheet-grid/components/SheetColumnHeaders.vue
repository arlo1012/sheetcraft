<script setup lang="ts">
import type { CSSProperties } from "vue";
import { GripHorizontal } from "lucide-vue-next";
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
  axisSelected?: boolean;
  quickToolsEnabled?: boolean;
  quickToolsGutter?: number;
}>();

const emit = defineEmits<{
  resizeStart: [payload: { index: number; event: PointerEvent }];
  resize: [payload: { index: number; size: number }];
  select: [payload: { column: number; shiftKey: boolean }];
  quickInsert: [payload: { index: number }];
  quickInsertHover: [payload: { index: number } | null];
  axisDragStart: [payload: { index: number; event: PointerEvent }];
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

function isSelectedColumn(column: number): boolean {
  return (
    (props.axisSelected ?? props.selected) &&
    column >= props.selectedStartColumn &&
    column <= props.selectedEndColumn
  );
}

function shouldShowInsertBefore(column: number): boolean {
  return !isSelectedColumn(column) || column === props.selectedStartColumn;
}

function shouldShowInsertAfter(column: number): boolean {
  return !isSelectedColumn(column) || column === props.selectedEndColumn;
}

function onHeaderMouseDown(column: number, event: MouseEvent): void {
  // Preserve an existing column selection for a potential drag operation.
  if (props.quickToolsEnabled && isSelectedColumn(column) && !event.shiftKey) {
    return;
  }
  emit("select", { column, shiftKey: event.shiftKey });
}

function onHeaderPointerDown(column: number, event: PointerEvent): void {
  if (props.quickToolsEnabled && isSelectedColumn(column) && !event.shiftKey) {
    emit("axisDragStart", { index: column, event });
  }
}

function getQuickInsertCount(boundary: number): number {
  return (props.axisSelected ?? props.selected) &&
    (boundary === props.selectedStartColumn || boundary === props.selectedEndColumn + 1)
    ? props.selectedEndColumn - props.selectedStartColumn + 1
    : 1;
}

function getInsertLabel(boundary: number): string {
  return t("grid.insertAtColumn", {
    column: columnIndexToLabel(boundary),
    count: getQuickInsertCount(boundary),
  });
}

function onGripPointerDown(column: number, event: PointerEvent): void {
  if (!isSelectedColumn(column)) {
    emit("select", { column, shiftKey: false });
  }
  emit("axisDragStart", { index: column, event });
}
</script>

<template>
  <div
    class="sheet-column-headers"
    :style="{ '--sheet-axis-tools-size': `${quickToolsGutter ?? 0}px` }"
    role="presentation"
  >
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
          'has-quick-tools': quickToolsEnabled,
          'is-axis-selection': isSelectedColumn(item.index),
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
          @pointerdown.left="onHeaderPointerDown(item.index, $event)"
          @mousedown.left.prevent="onHeaderMouseDown(item.index, $event)"
          @contextmenu.prevent="onHeaderContextMenu(item.index, $event)"
          @keydown="onHeaderKeydown(item.index, $event)"
        >
          <span aria-hidden="true">{{ columnIndexToLabel(item.index) }}</span>
        </button>
        <button
          v-if="quickToolsEnabled"
          type="button"
          class="sheet-column-headers__drag-grip"
          :data-axis-drag-column="item.index"
          :aria-label="t('grid.dragColumn', { column: columnIndexToLabel(item.index) })"
          :title="t('grid.dragColumn', { column: columnIndexToLabel(item.index) })"
          @pointerdown.left.prevent.stop="onGripPointerDown(item.index, $event)"
          @mousedown.left.prevent.stop
        >
          <GripHorizontal :size="12" aria-hidden="true" />
        </button>
        <button
          v-if="quickToolsEnabled && shouldShowInsertBefore(item.index)"
          type="button"
          class="sheet-column-headers__insert-handle is-before"
          :aria-label="getInsertLabel(item.index)"
          :title="getInsertLabel(item.index)"
          :data-quick-insert-column="item.index"
          @pointerdown.stop
          @mouseenter="emit('quickInsertHover', { index: item.index })"
          @mouseleave="emit('quickInsertHover', null)"
          @focus="emit('quickInsertHover', { index: item.index })"
          @blur="emit('quickInsertHover', null)"
          @click.stop="emit('quickInsert', { index: item.index })"
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          v-if="quickToolsEnabled && shouldShowInsertAfter(item.index)"
          type="button"
          class="sheet-column-headers__insert-handle is-after"
          :aria-label="getInsertLabel(item.index + 1)"
          :title="getInsertLabel(item.index + 1)"
          :data-quick-insert-column="item.index + 1"
          @pointerdown.stop
          @mouseenter="emit('quickInsertHover', { index: item.index + 1 })"
          @mouseleave="emit('quickInsertHover', null)"
          @focus="emit('quickInsertHover', { index: item.index + 1 })"
          @blur="emit('quickInsertHover', null)"
          @click.stop="emit('quickInsert', { index: item.index + 1 })"
        >
          <span aria-hidden="true">+</span>
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
    overflow: visible;
    color: var(--idea-text-secondary);
    font-size: 12px;

    &:hover,
    &:focus-within {
      z-index: 2;
    }

    &.is-in-selection {
      color: var(--idea-action-primary);
    }

    &.is-active {
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
    position: absolute;
    top: var(--sheet-axis-tools-size);
    left: 0;
    display: grid;
    overflow: hidden;
    place-items: center;
    width: 100%;
    height: calc(100% - var(--sheet-axis-tools-size));
    padding: 0;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--idea-border-subtle);
    color: inherit;
    cursor: pointer;

    .is-axis-selection.has-quick-tools & {
      cursor: grab;
    }

    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }

    .is-in-selection & {
      background: var(--idea-action-primary-subtle);
      box-shadow: inset 0 -2px 0 var(--idea-action-primary);
    }

    .is-active & {
      background: var(--idea-action-focus);
    }
  }

  &__drag-grip {
    position: absolute;
    z-index: 2;
    top: calc(var(--sheet-axis-tools-size) / 2);
    left: 50%;
    display: grid;
    width: 16px;
    height: 16px;
    padding: 0;
    place-items: center;
    opacity: 0;
    pointer-events: none;
    background: transparent;
    border: 0;
    border-radius: var(--idea-radius-small);
    cursor: grab;
    transform: translate(-50%, -50%);

    &:focus-visible {
      opacity: 1;
      pointer-events: auto;
      color: var(--idea-action-primary);
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -1px;
    }
  }

  &__insert-handle {
    position: absolute;
    z-index: 2;
    top: calc(var(--sheet-axis-tools-size) / 2);
    display: grid;
    width: 14px;
    height: 14px;
    padding: 0;
    place-items: center;
    color: var(--idea-action-primary);
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    opacity: 0;
    pointer-events: none;
    background: transparent;
    border: 0;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition:
      opacity 120ms ease,
      background 120ms ease,
      color 120ms ease;

    &.is-before {
      left: 0;
    }

    &.is-after {
      left: 100%;
    }

    &::before {
      content: "";
      position: absolute;
      width: 6px;
      height: 6px;
      background: var(--idea-surface-panel);
      border: 1px solid var(--idea-border-control);
      border-radius: 50%;
    }

    span {
      position: relative;
      opacity: 0;
      transition: opacity 120ms ease;
    }

    &:hover,
    &:focus-visible {
      color: var(--idea-surface-panel);
      background: var(--idea-action-primary);
      outline: none;

      &::before {
        width: 14px;
        height: 14px;
        background: var(--idea-action-primary);
        border-color: var(--idea-action-primary);
      }

      span {
        opacity: 1;
      }
    }
  }

  &__item.has-quick-tools:hover &__insert-handle,
  &__item.has-quick-tools:focus-within &__insert-handle,
  &__item.has-quick-tools:hover &__drag-grip,
  &__item.has-quick-tools:focus-within &__drag-grip {
    opacity: 1;
    pointer-events: auto;
  }

  &__resize-handle {
    position: absolute;
    inset: var(--sheet-axis-tools-size) 0 0 auto;
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
