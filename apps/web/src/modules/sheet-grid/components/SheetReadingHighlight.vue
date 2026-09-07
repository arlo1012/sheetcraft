<script setup lang="ts">
import { computed } from "vue";
import type { CellAddress } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { GridExtent } from "@idea10/sheet-engine/extent";

const props = defineProps<{
  layout: SheetViewportLayout;
  activeCell: CellAddress;
  color: string;
  extent: GridExtent;
}>();

const fragments = computed(() => {
  const { layout, activeCell } = props;
  const activeRange = layout.getMergedRangeAt(activeCell) ?? { start: activeCell, end: activeCell };
  const rows = layout.getRangeFragments({
    start: { row: activeRange.start.row, column: 0 },
    end: { row: activeRange.end.row, column: props.extent.columnCount - 1 },
  });
  const columns = layout.getRangeFragments({
    start: { row: 0, column: activeRange.start.column },
    end: { row: props.extent.rowCount - 1, column: activeRange.end.column },
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
