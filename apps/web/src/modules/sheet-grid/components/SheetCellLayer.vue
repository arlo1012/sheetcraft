<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  getCellStyle,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
} from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { isCellSelected, type CellSelection } from "@idea10/sheet-engine/selection";
import { getCellContentStyle } from "../cell-presentation";
import { formatCellValueForGrid } from "../cell-value-presentation";

type VisibleCell = {
  key: string;
  paneId: "topLeft" | "top" | "left" | "body";
  address: CellAddress;
  rect: Rect;
  viewportTop: number;
  viewportHeight: number;
  text: string;
  multiline: boolean;
  wrapped: boolean;
  style: CSSProperties;
};

type VisibleRow = {
  key: string;
  index: number;
  style: CSSProperties;
  panes: Array<{
    paneId: VisibleCell["paneId"];
    cells: VisibleCell[];
    style: CSSProperties;
  }>;
};

type VisualMergeFragment = {
  key: string;
  paneId: VisibleCell["paneId"];
  style: CSSProperties;
};

const props = withDefaults(
  defineProps<{
    sheet: Sheet;
    evaluator: SheetEvaluator;
    layout: SheetViewportLayout;
    activeCell: CellAddress;
    selection: CellSelection;
    editing: boolean;
    locale?: string;
  }>(),
  { locale: "en-US" },
);

const emit = defineEmits<{
  cellMousedown: [address: CellAddress, event: MouseEvent];
  cellDoubleClick: [address: CellAddress, event: MouseEvent];
  cellContextmenu: [address: CellAddress, event: MouseEvent];
}>();

defineSlots<{ "active-cell"?: (props: { cellRect: Rect }) => unknown }>();

const visibleCells = computed<VisibleCell[]>(() => {
  const cells: VisibleCell[] = [];
  function addCell(address: CellAddress, paneId: VisibleCell["paneId"]): void {
    if (cells.some((cell) => cell.key === `${address.row}:${address.column}`)) return;
    const mergedRange = props.layout.getMergedRangeAt(address);
    const rect = mergedRange
      ? props.layout.getRangePaneRects(mergedRange).find((pane) => pane.paneId === paneId)?.rect
      : props.layout.getCellViewportRect(address);
    if (!rect) return;
    const cellStyle = getCellStyle(props.sheet, address);
    const text = formatCellValueForGrid(
      props.evaluator.getComputedValue(address),
      cellStyle,
      props.locale,
    );
    const preservesLineBreaks = /[\r\n]/u.test(text);
    cells.push({
      key: `${address.row}:${address.column}`,
      paneId,
      address,
      rect,
      text,
      multiline: Boolean(cellStyle?.wrapText) || preservesLineBreaks,
      wrapped: Boolean(cellStyle?.wrapText),
      style: {
        left: `${rect.x - props.layout.panes[paneId].clip.x}px`,
        top: `${rect.y - props.layout.panes[paneId].clip.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        ...getCellContentStyle(cellStyle, preservesLineBreaks),
      },
      viewportTop: rect.y,
      viewportHeight: rect.height,
    });
  }
  props.layout.forEachVisibleCell((address, paneId) => {
    addCell(address, paneId);
  });
  addCell(
    props.layout.getAnchorForAddress(props.activeCell),
    props.layout.getPaneForAddress(props.activeCell),
  );
  return cells;
});

const paneClips = computed(() =>
  (["topLeft", "top", "left", "body"] as const).map((paneId) => {
    const clip = props.layout.panes[paneId].clip;
    return {
      paneId,
      style: {
        left: `${clip.x}px`,
        top: `${clip.y}px`,
        width: `${clip.width}px`,
        height: `${clip.height}px`,
      },
    };
  }),
);

const visibleRows = computed<VisibleRow[]>(() => {
  const rows = new Map<number, { offset: number; height: number; cells: VisibleCell[] }>();
  for (const cell of visibleCells.value) {
    const row = rows.get(cell.address.row);
    if (row) {
      const bottom = Math.max(row.offset + row.height, cell.viewportTop + cell.viewportHeight);
      row.offset = Math.min(row.offset, cell.viewportTop);
      row.height = bottom - row.offset;
      row.cells.push(cell);
    } else {
      rows.set(cell.address.row, {
        offset: cell.viewportTop,
        height: cell.viewportHeight,
        cells: [cell],
      });
    }
  }

  return [...rows.entries()]
    .map(([index, row]) => ({
      key: String(index),
      index,
      style: { top: `${row.offset}px`, height: `${row.height}px` },
      panes: paneClips.value
        .map(({ paneId }) => {
          const cells = row.cells
            .filter((cell) => cell.paneId === paneId)
            .map((cell) => ({
              ...cell,
              style: { ...cell.style, top: `${cell.viewportTop - row.offset}px` },
            }));
          if (cells.length === 0) return null;
          const clip = props.layout.panes[paneId].clip;
          // Clip to the pane so the editor can extend beyond its owning row.
          const topInset = clip.y - row.offset;
          const bottomInset = row.offset + row.height - clip.y - clip.height;
          return {
            paneId,
            cells,
            style: {
              left: `${clip.x}px`,
              top: "0px",
              width: `${clip.width}px`,
              height: `${row.height}px`,
              clipPath: `inset(${topInset}px 0 ${bottomInset}px)`,
            },
          };
        })
        .filter((pane): pane is NonNullable<typeof pane> => pane !== null),
    }))
    .sort((left, right) => left.index - right.index);
});

const visualMergeFragments = computed<VisualMergeFragment[]>(() => {
  const fragments: VisualMergeFragment[] = [];
  for (const cell of visibleCells.value) {
    const range = props.layout.getMergedRangeAt(cell.address);
    if (!range) continue;
    const fillColor = getCellStyle(props.sheet, cell.address)?.fillColor;
    for (const fragment of props.layout.getRangePaneRects(range)) {
      if (fragment.paneId === cell.paneId) continue;
      const clip = props.layout.panes[fragment.paneId].clip;
      fragments.push({
        key: `${cell.key}:${fragment.paneId}`,
        paneId: fragment.paneId,
        style: {
          left: `${fragment.rect.x - clip.x}px`,
          top: `${fragment.rect.y - clip.y}px`,
          width: `${fragment.rect.width}px`,
          height: `${fragment.rect.height}px`,
          ...(fillColor ? { backgroundColor: fillColor } : {}),
        },
      });
    }
  }
  return fragments;
});
</script>

<template>
  <div class="sheet-cell-layer">
    <div
      v-for="pane in paneClips"
      :key="pane.paneId"
      class="sheet-cell-layer__pane"
      :style="pane.style"
      :data-pane="pane.paneId"
    >
      <div
        v-for="fragment in visualMergeFragments.filter((entry) => entry.paneId === pane.paneId)"
        :key="fragment.key"
        class="sheet-cell-layer__merge-fragment"
        :style="fragment.style"
        aria-hidden="true"
      ></div>
    </div>
    <div
      v-for="row in visibleRows"
      :key="row.key"
      class="sheet-cell-layer__row"
      :class="{ 'is-editing': editing && row.index === activeCell.row }"
      :style="row.style"
      role="row"
      :aria-rowindex="row.index + 1"
    >
      <div
        v-for="pane in row.panes"
        :key="pane.paneId"
        class="sheet-cell-layer__row-pane"
        :style="pane.style"
        :data-pane="pane.paneId"
      >
        <div
          v-for="cell in pane.cells"
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
          :aria-rowindex="cell.address.row + 1"
          :aria-colindex="cell.address.column + 1"
          :aria-selected="isCellSelected(cell.address, selection)"
          @mousedown.left.prevent="emit('cellMousedown', cell.address, $event)"
          @dblclick.left.prevent="emit('cellDoubleClick', cell.address, $event)"
          @contextmenu="emit('cellContextmenu', cell.address, $event)"
        >
          <span v-if="cell.text" class="sheet-cell-layer__value">{{ cell.text }}</span>
          <slot
            v-if="cell.address.row === activeCell.row && cell.address.column === activeCell.column"
            name="active-cell"
            :cell-rect="cell.rect"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-cell-layer {
  position: absolute;
  inset: 0;

  &__pane {
    position: absolute;
    overflow: hidden;
  }

  &__row {
    position: absolute;
    left: 0;
    width: 100%;
    pointer-events: none;

    &.is-editing {
      z-index: 5;
    }
  }

  &__row-pane {
    position: absolute;
    pointer-events: none;
  }

  &__merge-fragment {
    position: absolute;
    box-sizing: border-box;
    background: var(--idea-surface-panel);
    border-right: 1px solid var(--idea-border-subtle);
    border-bottom: 1px solid var(--idea-border-subtle);
    pointer-events: none;
  }

  &__cell {
    position: absolute;
    display: flex;
    align-items: center;
    overflow: hidden;
    padding: 0 5px;
    background: var(--idea-surface-panel);
    border-right: 1px solid var(--idea-border-subtle);
    border-bottom: 1px solid var(--idea-border-subtle);
    color: var(--idea-text-primary);
    font-size: 13px;
    line-height: 1;
    white-space: nowrap;
    pointer-events: auto;
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
  &__cell.is-multiline &__value {
    min-width: 0;
    max-width: 100%;
    overflow: visible;
  }
}
</style>
