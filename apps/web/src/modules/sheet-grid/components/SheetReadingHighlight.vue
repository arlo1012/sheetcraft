<script setup lang="ts">
import { computed } from "vue";
import type { CellRange } from "@idea10/core/workbook";
import type { SelectionMode } from "@idea10/sheet-engine/selection";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { GridExtent } from "@idea10/sheet-engine/extent";

const props = defineProps<{
  layout: SheetViewportLayout;
  range: CellRange;
  mode: SelectionMode;
  color: string;
  extent: GridExtent;
}>();

function getFragments(range: CellRange) {
  return props.layout.getRangeFragments(range);
}

const fragments = computed(() => {
  const { range, mode } = props;

  if (mode !== "cells") return getFragments(range);

  const rows = getFragments({
    start: { row: range.start.row, column: 0 },
    end: { row: range.end.row, column: props.extent.columnCount - 1 },
  });
  const columns = getFragments({
    start: { row: 0, column: range.start.column },
    end: { row: props.extent.rowCount - 1, column: range.end.column },
  });
  return [...rows, ...columns];
});
</script>

<template>
  <div class="sheet-reading-highlight" :style="{ color }" aria-hidden="true">
    <div
      v-for="(fragment, index) in fragments"
      :key="index"
      class="sheet-reading-highlight__band"
      :style="{
        left: `${fragment.rect.x}px`,
        top: `${fragment.rect.y}px`,
        width: `${fragment.rect.width}px`,
        height: `${fragment.rect.height}px`,
      }"
    />
  </div>
</template>

<style scoped lang="scss">
.sheet-reading-highlight {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0.12;
  pointer-events: none;

  &__band {
    position: absolute;
    background: currentColor;
  }
}
</style>
