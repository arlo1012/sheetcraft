<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { formatCellValueForDisplay } from "../../workbook/input";
import {
  getCellValue,
  type CellAddress,
  type CellRange,
  type Sheet,
} from "../../workbook/workbook";
import type { Point, SheetGeometry, VisibleCellRange } from "../geometry";
import { isCellInRange } from "../selection";

type VisibleCell = {
  key: string;
  address: CellAddress;
  text: string;
  style: CSSProperties;
};

type VisibleRow = {
  key: number;
  row: number;
  style: CSSProperties;
  cells: VisibleCell[];
};

const props = defineProps<{
  sheet: Sheet;
  geometry: SheetGeometry;
  visibleRange: VisibleCellRange;
  activeCell: CellAddress;
  selectedRange: CellRange;
  scrollPosition: Point;
}>();

const emit = defineEmits<{
  cellMousedown: [address: CellAddress, event: MouseEvent];
  cellDoubleClick: [address: CellAddress, event: MouseEvent];
}>();

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = [];
  const rowIndexes = new Set<number>([props.activeCell.row]);

  for (let row = props.visibleRange.startRow; row <= props.visibleRange.endRow; row += 1) {
    rowIndexes.add(row);
  }

  for (const row of [...rowIndexes].sort((left, right) => left - right)) {
    const cells: VisibleCell[] = [];
    const columnIndexes = new Set<number>();

    for (
      let column = props.visibleRange.startColumn;
      column <= props.visibleRange.endColumn;
      column += 1
    ) {
      columnIndexes.add(column);
    }
    if (row === props.activeCell.row) {
      columnIndexes.add(props.activeCell.column);
    }

    for (const column of [...columnIndexes].sort((left, right) => left - right)) {
      const address = { row, column };
      const rect = props.geometry.getCellViewportRect(address, props.scrollPosition);
      cells.push({
        key: `${row}:${column}`,
        address,
        text: formatCellValueForDisplay(getCellValue(props.sheet, address)),
        style: {
          left: `${rect.x}px`,
          width: `${rect.width}px`,
          height: "100%",
        },
      });
    }

    rows.push({
      key: row,
      row,
      style: {
        top: `${props.geometry.getCellViewportRect({ row, column: 0 }, props.scrollPosition).y}px`,
        height: `${props.geometry.rowHeight}px`,
      },
      cells,
    });
  }

  return rows;
});
</script>

<template>
  <div class="sheet-cell-layer">
    <div
      v-for="visibleRow in visibleRows"
      :key="visibleRow.key"
      class="sheet-cell-layer__row"
      :style="visibleRow.style"
      role="row"
      :aria-rowindex="visibleRow.row + 1"
    >
      <div
        v-for="cell in visibleRow.cells"
        :key="cell.key"
        class="sheet-cell-layer__cell"
        :class="{
          'has-value': cell.text.length > 0,
          'is-active':
            cell.address.row === activeCell.row && cell.address.column === activeCell.column,
          'is-selected': isCellInRange(cell.address, selectedRange),
        }"
        :style="cell.style"
        :data-row="cell.address.row"
        :data-column="cell.address.column"
        role="gridcell"
        :aria-colindex="cell.address.column + 1"
        :aria-selected="isCellInRange(cell.address, selectedRange)"
        @mousedown.left.prevent="emit('cellMousedown', cell.address, $event)"
        @dblclick.left.prevent="emit('cellDoubleClick', cell.address, $event)"
      >
        <span v-if="cell.text" class="sheet-cell-layer__value">{{ cell.text }}</span>
        <slot
          v-if="cell.address.row === activeCell.row && cell.address.column === activeCell.column"
          name="active-cell"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-cell-layer {
  position: absolute;
  inset: 0;

  &__row {
    position: absolute;
    left: 0;
    width: 100%;
  }

  &__cell {
    position: absolute;
    top: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    padding: 0 5px;
    background: var(--ui-surface-primary);
    color: var(--ui-text-primary);
    font-size: 13px;
    line-height: 1;
    white-space: nowrap;
    user-select: none;

    &.is-active {
      overflow: visible;
    }
  }

  &__value {
    overflow: hidden;
    text-overflow: clip;
  }
}
</style>
