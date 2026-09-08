<script setup lang="ts">
import type { CSSProperties } from "vue";
import { GripVertical } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_ROW_HEIGHT, MIN_ROW_HEIGHT } from "@idea10/core/workbook";
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
  selectedStartRow: number;
  selectedEndRow: number;
  selected: boolean;
  axisSelected?: boolean;
  quickToolsEnabled?: boolean;
  quickToolsGutter?: number;
}>();

const emit = defineEmits<{
  resizeStart: [payload: { index: number; event: PointerEvent }];
  resize: [payload: { index: number; size: number }];
  select: [payload: { row: number; shiftKey: boolean }];
  quickInsert: [payload: { index: number }];
  quickInsertHover: [payload: { index: number } | null];
  axisDragStart: [payload: { index: number; event: PointerEvent }];
  openContextMenu: [
    payload: { row: number; clientX: number; clientY: number; trigger: HTMLButtonElement },
  ];
}>();

const KEYBOARD_RESIZE_STEP = 8;

function getPaneStyle(pane: { offset: number; size: number }): CSSProperties {
  return { top: `${pane.offset}px`, height: `${pane.size}px` };
}

function getHeaderStyle(item: { offset: number; size: number }, paneOffset: number): CSSProperties {
  return {
    top: `${item.offset - paneOffset}px`,
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

function isSelectedRow(row: number): boolean {
  return (
    (props.axisSelected ?? props.selected) &&
    row >= props.selectedStartRow &&
    row <= props.selectedEndRow
  );
}

function shouldShowInsertBefore(row: number): boolean {
  return !isSelectedRow(row) || row === props.selectedStartRow;
}

function shouldShowInsertAfter(row: number): boolean {
  return !isSelectedRow(row) || row === props.selectedEndRow;
}

function onHeaderMouseDown(row: number, event: MouseEvent): void {
  // Keep an existing multi-row selection intact so the parent can turn this
  // pointer sequence into a drag after its movement threshold is reached.
  if (props.quickToolsEnabled && isSelectedRow(row) && !event.shiftKey) {
    return;
  }
  emit("select", { row, shiftKey: event.shiftKey });
}

function onHeaderPointerDown(row: number, event: PointerEvent): void {
  if (props.quickToolsEnabled && isSelectedRow(row) && !event.shiftKey) {
    emit("axisDragStart", { index: row, event });
  }
}

function getQuickInsertCount(boundary: number): number {
  return (props.axisSelected ?? props.selected) &&
    (boundary === props.selectedStartRow || boundary === props.selectedEndRow + 1)
    ? props.selectedEndRow - props.selectedStartRow + 1
    : 1;
}

function getInsertLabel(boundary: number): string {
  return t("grid.insertAtRow", {
    row: boundary + 1,
    count: getQuickInsertCount(boundary),
  });
}

function onGripPointerDown(row: number, event: PointerEvent): void {
  if (!isSelectedRow(row)) {
    emit("select", { row, shiftKey: false });
  }
  emit("axisDragStart", { index: row, event });
}
</script>

<template>
  <div
    class="sheet-row-headers"
    :style="{ '--sheet-axis-tools-size': `${quickToolsGutter ?? 0}px` }"
    role="presentation"
  >
    <div
      v-for="pane in panes"
      :key="pane.id"
      class="sheet-row-headers__pane"
      :style="getPaneStyle(pane)"
      :data-header-pane="pane.id"
    >
      <div
        v-for="item in pane.items"
        :key="item.index"
        class="sheet-row-headers__item"
        :class="{
          'is-in-selection': item.index >= selectedStartRow && item.index <= selectedEndRow,
          'is-active': selected && item.index >= selectedStartRow && item.index <= selectedEndRow,
          'has-quick-tools': quickToolsEnabled,
          'is-axis-selection': isSelectedRow(item.index),
        }"
        :style="getHeaderStyle(item, pane.offset)"
        :data-row="item.index"
      >
        <button
          type="button"
          class="sheet-row-headers__select-button"
          :data-select-row="item.index"
          :aria-label="t('grid.selectRow', { row: item.index + 1 })"
          :aria-pressed="selected && item.index >= selectedStartRow && item.index <= selectedEndRow"
          @pointerdown.left="onHeaderPointerDown(item.index, $event)"
          @mousedown.left.prevent="onHeaderMouseDown(item.index, $event)"
          @contextmenu.prevent="onHeaderContextMenu(item.index, $event)"
          @keydown="onHeaderKeydown(item.index, $event)"
        >
          <span aria-hidden="true">{{ item.index + 1 }}</span>
        </button>
        <button
          v-if="quickToolsEnabled"
          type="button"
          class="sheet-row-headers__drag-grip"
          :data-axis-drag-row="item.index"
          :aria-label="t('grid.dragRow', { row: item.index + 1 })"
          :title="t('grid.dragRow', { row: item.index + 1 })"
          @pointerdown.left.prevent.stop="onGripPointerDown(item.index, $event)"
          @mousedown.left.prevent.stop
        >
          <GripVertical :size="12" aria-hidden="true" />
        </button>
        <button
          v-if="quickToolsEnabled && shouldShowInsertBefore(item.index)"
          type="button"
          class="sheet-row-headers__insert-handle is-before"
          :aria-label="getInsertLabel(item.index)"
          :title="getInsertLabel(item.index)"
          :data-quick-insert-row="item.index"
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
          class="sheet-row-headers__insert-handle is-after"
          :aria-label="getInsertLabel(item.index + 1)"
          :title="getInsertLabel(item.index + 1)"
          :data-quick-insert-row="item.index + 1"
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
    inset-inline: 0;
    overflow: hidden;
  }

  &__select-button {
    position: absolute;
    top: 0;
    left: var(--sheet-axis-tools-size);
    display: grid;
    overflow: hidden;
    place-items: center;
    width: calc(100% - var(--sheet-axis-tools-size));
    height: 100%;
    padding: 0;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--idea-border-subtle);
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
      box-shadow: inset -2px 0 0 var(--idea-action-primary);
    }

    .is-active & {
      background: var(--idea-action-focus);
    }
  }

  &__drag-grip {
    position: absolute;
    z-index: 2;
    top: 50%;
    left: calc(var(--sheet-axis-tools-size) / 2);
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
    left: calc(var(--sheet-axis-tools-size) / 2);
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
      top: 0;
    }

    &.is-after {
      top: 100%;
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
    inset: auto 0 0 var(--sheet-axis-tools-size);
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
