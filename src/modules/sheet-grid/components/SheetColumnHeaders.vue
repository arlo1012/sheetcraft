<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "../../workbook/workbook";
import { columnIndexToLabel, type SheetGeometry } from "../geometry";

const props = defineProps<{
  startColumn: number;
  endColumn: number;
  geometry: SheetGeometry;
  scrollLeft: number;
  selectedStartColumn: number;
  selectedEndColumn: number;
}>();

const emit = defineEmits<{
  resizeStart: [payload: { index: number; event: PointerEvent }];
  resize: [payload: { index: number; size: number }];
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
</script>

<template>
  <div class="sheet-column-headers" role="presentation">
    <div
      v-for="column in columns"
      :key="column"
      class="sheet-column-headers__item"
      :class="{
        'is-active': column >= selectedStartColumn && column <= selectedEndColumn,
      }"
      :style="getHeaderStyle(column)"
      :data-column="column"
    >
      <span aria-hidden="true">{{ columnIndexToLabel(column) }}</span>
      <span
        class="sheet-column-headers__resize-handle"
        :data-resize-column="column"
        role="separator"
        aria-orientation="vertical"
        :aria-label="`Column ${columnIndexToLabel(column)} width`"
        :aria-valuemin="MIN_COLUMN_WIDTH"
        :aria-valuemax="MAX_COLUMN_WIDTH"
        :aria-valuenow="geometry.getColumnWidth(column)"
        tabindex="0"
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
  background: var(--ui-surface-muted);
  border-bottom: 1px solid var(--ui-border-strong);
  user-select: none;

  &__item {
    position: absolute;
    top: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-right: 1px solid var(--ui-border-default);
    color: var(--ui-text-secondary);
    font-size: 12px;

    &.is-active {
      background: var(--ui-brand-soft);
      color: var(--ui-brand-primary);
      font-weight: 600;
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
      background: var(--ui-brand-primary);
      outline: none;
    }
  }
}
</style>
