<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { formatCellValueForDisplay } from "../../workbook/input";
import { getCellStyle, getCellValue, type CellAddress, type Sheet } from "../../workbook/workbook";
import {
  getCellBorderEdges,
  getCellContentStyle,
  type CellBorderEdges,
} from "../cell-presentation";
import type { Point, SheetGeometry, VisibleCellRange } from "../geometry";
import { isCellSelected, type CellSelection } from "../selection";

type VisibleCell = {
  key: string;
  address: CellAddress;
  text: string;
  multiline: boolean;
  wrapped: boolean;
  style: CSSProperties;
  borders: CellBorderEdges;
};

type VisibleRow = {
  key: number;
  row: number;
  style: CSSProperties;
  cells: VisibleCell[];
};

const TRAILING_GRIDLINE_OFFSET = "-1px";

const props = defineProps<{
  sheet: Sheet;
  geometry: SheetGeometry;
  visibleRange: VisibleCellRange;
  activeCell: CellAddress;
  selection: CellSelection;
  scrollPosition: Point;
  editing: boolean;
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

  const orderedRowIndexes = [...rowIndexes].sort((left, right) => left - right);
  const columnIndexesByRow = new Map<number, number[]>();
  const renderedCellKeys = new Set<string>();

  for (const row of orderedRowIndexes) {
    const columnIndexes = new Set<number>();
    if (row >= props.visibleRange.startRow && row <= props.visibleRange.endRow) {
      for (
        let column = props.visibleRange.startColumn;
        column <= props.visibleRange.endColumn;
        column += 1
      ) {
        columnIndexes.add(column);
      }
    }
    if (row === props.activeCell.row) {
      columnIndexes.add(props.activeCell.column);
    }
    const orderedColumnIndexes = [...columnIndexes].sort((left, right) => left - right);
    columnIndexesByRow.set(row, orderedColumnIndexes);
    for (const column of orderedColumnIndexes) {
      renderedCellKeys.add(`${row}:${column}`);
    }
  }

  for (const row of orderedRowIndexes) {
    const cells: VisibleCell[] = [];
    for (const column of columnIndexesByRow.get(row) ?? []) {
      const address = { row, column };
      const rect = props.geometry.getCellViewportRect(address, props.scrollPosition);
      const cellStyle = getCellStyle(props.sheet, address);
      const text = formatCellValueForDisplay(getCellValue(props.sheet, address));
      const preservesLineBreaks = /[\r\n]/u.test(text);
      cells.push({
        key: `${row}:${column}`,
        address,
        text,
        multiline: Boolean(cellStyle?.wrapText) || preservesLineBreaks,
        wrapped: Boolean(cellStyle?.wrapText),
        style: {
          left: `${rect.x}px`,
          width: `${rect.width}px`,
          height: "100%",
          ...getCellContentStyle(cellStyle, preservesLineBreaks),
        },
        borders: getCellBorderEdges(
          cellStyle,
          {
            top: row > 0 ? getCellStyle(props.sheet, { row: row - 1, column }) : undefined,
            right:
              column + 1 < props.geometry.columnCount
                ? getCellStyle(props.sheet, { row, column: column + 1 })
                : undefined,
            bottom:
              row + 1 < props.geometry.rowCount
                ? getCellStyle(props.sheet, { row: row + 1, column })
                : undefined,
            left: column > 0 ? getCellStyle(props.sheet, { row, column: column - 1 }) : undefined,
          },
          !renderedCellKeys.has(`${row - 1}:${column}`),
          !renderedCellKeys.has(`${row}:${column - 1}`),
        ),
      });
    }

    rows.push({
      key: row,
      row,
      style: {
        top: `${props.geometry.getRowOffset(row) - props.scrollPosition.y}px`,
        height: `${props.geometry.getRowHeight(row)}px`,
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
          'is-multiline': cell.multiline,
          'is-wrapped': cell.wrapped,
          'is-active':
            cell.address.row === activeCell.row && cell.address.column === activeCell.column,
          'is-editing':
            editing &&
            cell.address.row === activeCell.row &&
            cell.address.column === activeCell.column,
          'is-selected': isCellSelected(cell.address, selection),
        }"
        :style="cell.style"
        :data-row="cell.address.row"
        :data-column="cell.address.column"
        role="gridcell"
        :aria-colindex="cell.address.column + 1"
        :aria-selected="isCellSelected(cell.address, selection)"
        @mousedown.left.prevent="emit('cellMousedown', cell.address, $event)"
        @dblclick.left.prevent="emit('cellDoubleClick', cell.address, $event)"
      >
        <span v-if="cell.text" class="sheet-cell-layer__value">{{ cell.text }}</span>
        <span
          v-if="cell.borders.top"
          class="sheet-cell-layer__border sheet-cell-layer__border--top"
          :style="{ borderTop: cell.borders.top }"
          aria-hidden="true"
        />
        <span
          v-if="cell.borders.right"
          class="sheet-cell-layer__border sheet-cell-layer__border--right"
          :style="{ borderRight: cell.borders.right, right: TRAILING_GRIDLINE_OFFSET }"
          aria-hidden="true"
        />
        <span
          v-if="cell.borders.bottom"
          class="sheet-cell-layer__border sheet-cell-layer__border--bottom"
          :style="{ borderBottom: cell.borders.bottom, bottom: TRAILING_GRIDLINE_OFFSET }"
          aria-hidden="true"
        />
        <span
          v-if="cell.borders.left"
          class="sheet-cell-layer__border sheet-cell-layer__border--left"
          :style="{ borderLeft: cell.borders.left }"
          aria-hidden="true"
        />
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
    background: var(--td-bg-color-container);
    border-right: 1px solid var(--td-border-level-1-color);
    border-bottom: 1px solid var(--td-border-level-1-color);
    color: var(--td-text-color-primary);
    font-size: 13px;
    line-height: 1;
    white-space: nowrap;
    user-select: none;

    &.is-active {
      overflow: visible;
    }

    &.is-multiline.is-active:not(.is-editing) {
      overflow: hidden;
    }
  }

  &__value {
    overflow: hidden;
    text-overflow: clip;
  }

  &__border {
    position: absolute;
    z-index: 1;
    pointer-events: none;

    &--top,
    &--bottom {
      right: 0;
      left: 0;
    }

    &--left,
    &--right {
      top: 0;
      bottom: 0;
    }

    &--top {
      top: 0;
    }

    &--left {
      left: 0;
    }
  }

  &__cell.is-multiline &__value {
    min-width: 0;
    max-width: 100%;
    overflow: visible;
  }
}
</style>
