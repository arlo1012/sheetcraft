<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { MAX_ROW_HEIGHT, MIN_ROW_HEIGHT } from "../../workbook/workbook";
import type { SheetGeometry } from "../geometry";

const props = defineProps<{
  startRow: number;
  endRow: number;
  geometry: SheetGeometry;
  scrollTop: number;
  selectedStartRow: number;
  selectedEndRow: number;
}>();

const emit = defineEmits<{
  resizeStart: [payload: { index: number; event: PointerEvent }];
  resize: [payload: { index: number; size: number }];
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
</script>

<template>
  <div class="sheet-row-headers" role="presentation">
    <div
      v-for="row in rows"
      :key="row"
      class="sheet-row-headers__item"
      :class="{ 'is-active': row >= selectedStartRow && row <= selectedEndRow }"
      :style="getHeaderStyle(row)"
      :data-row="row"
    >
      <span aria-hidden="true">{{ row + 1 }}</span>
      <span
        class="sheet-row-headers__resize-handle"
        :data-resize-row="row"
        role="separator"
        aria-orientation="horizontal"
        :aria-label="`Row ${row + 1} height`"
        :aria-valuemin="MIN_ROW_HEIGHT"
        :aria-valuemax="MAX_ROW_HEIGHT"
        :aria-valuenow="geometry.getRowHeight(row)"
        tabindex="0"
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
  background: var(--ui-surface-muted);
  border-right: 1px solid var(--ui-border-strong);
  user-select: none;

  &__item {
    position: absolute;
    left: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-bottom: 1px solid var(--ui-border-default);
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
    inset: auto 0 0;
    z-index: 1;
    height: 6px;
    cursor: row-resize;
    touch-action: none;

    &:focus-visible {
      background: var(--ui-brand-primary);
      outline: none;
    }
  }
}
</style>
