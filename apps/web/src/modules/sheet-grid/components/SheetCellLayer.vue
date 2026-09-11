<script setup lang="ts">
import { computed, useId, type CSSProperties } from "vue";
import {
  getCellStyle,
  getCellContent,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
} from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { isCellSelected, type CellSelection } from "@idea10/sheet-engine/selection";
import { getCellContentStyle } from "../cell-presentation";
import { getCellValuePresentationForGrid } from "../cell-value-presentation";
import SheetCellRowPane from "./SheetCellRowPane.vue";
import type { VisibleCell, VisibleCellPaneId } from "./sheet-cell-view";
import { createCellTextSpanResolver, type CellTextSpan } from "../cell-text-spans";
import { isCellTextWrapped } from "../../../shared/cell-text/text-presentation";
import CellTextContent from "../../../shared/cell-text/CellTextContent.vue";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";

type VisibleRow = {
  key: string;
  index: number;
  style: CSSProperties;
  panes: Array<{
    paneId: VisibleCellPaneId;
    cells: VisibleCell[];
    style: CSSProperties;
  }>;
};

type VisualMergeFragment = {
  key: string;
  paneId: VisibleCell["paneId"];
  rect: Rect;
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
    showGridLines?: boolean;
    locale?: string;
    dateSystem?: ExcelDateSystem;
    imageAssetUrls?: ReadonlyMap<string, string>;
    loadingImageAssetIds?: ReadonlySet<string>;
  }>(),
  { locale: "en-US", dateSystem: "1900", showGridLines: true },
);

const emit = defineEmits<{
  cellMousedown: [address: CellAddress, event: MouseEvent];
  cellDoubleClick: [address: CellAddress, event: MouseEvent];
  cellContextmenu: [address: CellAddress, event: MouseEvent];
}>();

defineSlots<{ "active-cell"?: (props: { cellRect: Rect }) => unknown }>();
const activeEditorId = `sheet-cell-editor-${useId().replaceAll(":", "")}`;

const visibleCells = computed<VisibleCell[]>(() => {
  const cells: VisibleCell[] = [];
  const textSpans = createCellTextSpanResolver(props.sheet, (address) =>
    Boolean(props.layout.getMergedRangeAt(address)),
  );
  const visited = new Set<string>();
  const layout = props.layout;
  const sheet = props.sheet;
  const evaluator = props.evaluator;
  const locale = props.locale;
  function addCell(address: CellAddress, paneId: VisibleCellPaneId): void {
    const key = `${address.row}:${address.column}`;
    if (visited.has(key)) return;
    visited.add(key);
    const mergedRange = layout.getMergedRangeAt(address);
    const rect = mergedRange
      ? layout.getRangePaneRects(mergedRange).find((pane) => pane.paneId === paneId)?.rect
      : layout.getCellViewportRect(address);
    if (!rect) return;
    const cellStyle = getCellStyle(sheet, address);
    const content = getCellContent(sheet, address);
    const cellImage = content?.kind === "image" ? content.image : undefined;
    const span = textSpans(address);
    const value = evaluator.getComputedValue(address);
    const displayValue = span?.kind === "fill" ? evaluator.getComputedValue(span.source) : value;
    const presentation = cellImage
      ? undefined
      : getCellValuePresentationForGrid(displayValue, cellStyle, locale, props.dateSystem);
    const displayText = presentation?.text ?? "";
    const text = span?.kind === "fill" && !content ? "" : displayText;
    const preservesLineBreaks = /[\r\n]/u.test(displayText);
    cells.push({
      key,
      paneId,
      address,
      rect,
      text,
      displayText,
      value: displayValue,
      formatStyle: presentation?.color
        ? { ...cellStyle, textColor: presentation.color }
        : cellStyle,
      textSpan: span,
      spanning:
        span?.kind === "centerContinuous" && span.range.start.column !== span.range.end.column,
      ...(presentation?.fill ? { fill: presentation.fill } : {}),
      ...(cellImage
        ? { image: cellImage, imageTransformKey: getImageTransformKey(cellImage) }
        : { imageTransformKey: "" }),
      multiline: isCellTextWrapped(cellStyle) || preservesLineBreaks,
      wrapped: isCellTextWrapped(cellStyle),
      style: {
        left: `${rect.x - layout.panes[paneId].clip.x + (paneId === "body" || paneId === "top" ? layout.bodyScrollPosition.x : 0)}px`,
        top: `${rect.y - layout.panes[paneId].clip.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        ...getCellContentStyle(cellStyle, preservesLineBreaks, displayValue, displayText),
        ...(presentation?.color ? { color: presentation.color } : {}),
      },
      viewportTop: rect.y,
      viewportHeight: rect.height,
    });
  }
  layout.forEachVisibleCell((address, paneId) => {
    addCell(address, paneId);
  });
  addCell(layout.getAnchorForAddress(props.activeCell), layout.getPaneForAddress(props.activeCell));
  return cells;
});

const spanningTextPanes = computed(() => {
  const spans = new Map<string, CellTextSpan>();
  for (const cell of visibleCells.value) {
    if (!cell.spanning) continue;
    const span = cell.textSpan;
    if (span) spans.set(`${span.source.row}:${span.source.column}`, span);
  }
  return [...spans.entries()].flatMap(([key, span]) => {
    if (
      props.editing &&
      span.source.row === props.activeCell.row &&
      span.source.column === props.activeCell.column
    )
      return [];
    const rect = props.layout.getRangeRect(span.range);
    if (!rect) return [];
    const value = props.evaluator.getComputedValue(span.source);
    const cellStyle = getCellStyle(props.sheet, span.source);
    const presentation = getCellValuePresentationForGrid(
      value,
      cellStyle,
      props.locale,
      props.dateSystem,
    );
    return props.layout.getRangePaneRects(span.range).map(({ paneId }) => {
      const clip = props.layout.panes[paneId].clip;
      const scrollingX = paneId === "body" || paneId === "top";
      const scrollingY = paneId === "body" || paneId === "left";
      return {
        key: `${key}:${paneId}`,
        source: span.source,
        value,
        text: presentation.text,
        fill: presentation.fill,
        formatStyle: presentation.color
          ? { ...cellStyle, textColor: presentation.color }
          : cellStyle,
        width: rect.width - 1,
        height: rect.height - 1,
        paneStyle: {
          left: `${clip.x}px`,
          top: `${clip.y}px`,
          width: `${clip.width}px`,
          height: `${clip.height}px`,
        },
        style: {
          left: `${rect.x - (scrollingX ? props.layout.frozenSize.width + props.layout.bodyScrollPosition.x : 0)}px`,
          top: `${rect.y - (scrollingY ? props.layout.frozenSize.height + props.layout.bodyScrollPosition.y : 0)}px`,
          width: `${rect.width - 1}px`,
          height: `${rect.height - 1}px`,
        },
      };
    });
  });
});

const activeEditor = computed(() => {
  const anchor = props.layout.getAnchorForAddress(props.activeCell);
  const cell = visibleCells.value.find(
    ({ address }) => address.row === anchor.row && address.column === anchor.column,
  );
  if (!cell) return undefined;
  const clip = props.layout.panes[cell.paneId].clip;
  // Keep the editor's outward border visible where its pane begins.
  const leftInset = props.editing && cell.rect.x === clip.x ? -1 : 0;
  const topInset = props.editing && cell.rect.y === clip.y ? -1 : 0;
  return {
    paneId: cell.paneId,
    cellRect: cell.rect,
    paneStyle: {
      left: `${clip.x}px`,
      top: `${clip.y}px`,
      width: `${clip.width}px`,
      height: `${clip.height}px`,
      clipPath: `inset(${topInset}px 0px 0px ${leftInset}px)`,
    },
    anchorStyle: {
      left: `${cell.rect.x - clip.x}px`,
      top: `${cell.rect.y - clip.y}px`,
    },
  };
});

function getImageTransformKey(image: NonNullable<VisibleCell["image"]>): string {
  const transform = image.transform;
  return [
    image.assetId,
    image.altText,
    transform?.crop?.x,
    transform?.crop?.y,
    transform?.crop?.width,
    transform?.crop?.height,
    transform?.rotation,
    transform?.flipHorizontal,
    transform?.flipVertical,
  ].join(":");
}

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

let cellStyles = new Map<string, CSSProperties>();

function reuseCellStyle(key: string, style: CSSProperties): CSSProperties {
  const previous = cellStyles.get(key);
  const keys = Object.keys(style) as Array<keyof CSSProperties>;
  return previous &&
    keys.length === Object.keys(previous).length &&
    keys.every((property) => previous[property] === style[property])
    ? previous
    : style;
}

const visibleRows = computed<VisibleRow[]>(() => {
  const nextCellStyles = new Map<string, CSSProperties>();
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

  const result = [...rows.entries()]
    .map(([index, row]) => ({
      key: String(index),
      index,
      style: { top: `${row.offset}px`, height: `${row.height}px` },
      panes: paneClips.value
        .map(({ paneId }) => {
          const cells = row.cells
            .filter((cell) => cell.paneId === paneId)
            .map((cell) => {
              const style = reuseCellStyle(cell.key, {
                ...cell.style,
                top: `${cell.viewportTop - row.offset}px`,
              });
              nextCellStyles.set(cell.key, style);
              const active =
                cell.address.row === props.activeCell.row &&
                cell.address.column === props.activeCell.column;
              return {
                ...cell,
                style,
                selected: isCellSelected(cell.address, props.selection),
                active,
                editing: props.editing && active,
              };
            });
          if (cells.length === 0) return null;
          const clip = props.layout.panes[paneId].clip;
          const topInset = clip.y - row.offset;
          const bottomInset = row.offset + row.height - clip.y - clip.height;
          const scrollX =
            paneId === "body" || paneId === "top" ? props.layout.bodyScrollPosition.x : 0;
          return {
            paneId,
            cells,
            style: {
              left: `${clip.x}px`,
              top: "0px",
              width: `${clip.width}px`,
              height: `${row.height}px`,
              transform: `translateX(${-scrollX}px)`,
              clipPath: `inset(${topInset}px ${-scrollX}px ${bottomInset}px ${scrollX}px)`,
            },
          };
        })
        .filter((pane): pane is NonNullable<typeof pane> => pane !== null),
    }))
    .sort((left, right) => left.index - right.index);
  cellStyles = nextCellStyles;
  return result;
});

const visualMergeFragments = computed<VisualMergeFragment[]>(() => {
  const fragments: VisualMergeFragment[] = [];
  for (const cell of visibleCells.value) {
    const range = props.layout.getMergedRangeAt(cell.address);
    if (!range) continue;
    const fillStyle = getCellFillStyle(getCellStyle(props.sheet, cell.address));
    for (const fragment of props.layout.getRangePaneRects(range)) {
      if (fragment.paneId === cell.paneId) continue;
      const clip = props.layout.panes[fragment.paneId].clip;
      fragments.push({
        key: `${cell.key}:${fragment.paneId}`,
        paneId: fragment.paneId,
        rect: fragment.rect,
        style: {
          left: `${fragment.rect.x - clip.x}px`,
          top: `${fragment.rect.y - clip.y}px`,
          width: `${fragment.rect.width}px`,
          height: `${fragment.rect.height}px`,
          ...fillStyle,
        },
      });
    }
  }
  return fragments;
});

const gridLinePanes = computed(() => {
  if (!props.showGridLines) return [];
  const fragments = [...visibleCells.value, ...visualMergeFragments.value];
  return paneClips.value.flatMap(({ paneId, style }) => {
    const clip = props.layout.panes[paneId].clip;
    if (clip.width <= 0 || clip.height <= 0) return [];
    const path = fragments
      .filter((fragment) => fragment.paneId === paneId)
      .map(({ rect }) => {
        const left = rect.x - clip.x;
        const top = rect.y - clip.y;
        const right = left + rect.width - 0.5;
        const bottom = top + rect.height - 0.5;
        return `M${left} ${bottom}H${right}V${top}`;
      })
      .join(" ");
    return [{ paneId, style, path }];
  });
});
</script>

<template>
  <div
    class="sheet-cell-layer"
    :style="{ '--sheet-gridline-width': showGridLines ? '1px' : '0px' }"
  >
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
      :style="row.style"
      role="row"
      :aria-rowindex="row.index + 1"
    >
      <SheetCellRowPane
        v-for="pane in row.panes"
        :key="pane.paneId"
        class="sheet-cell-layer__row-pane"
        :style="pane.style"
        :data-pane="pane.paneId"
        :cells="pane.cells"
        :active-editor-id="activeEditorId"
        :locale="locale"
        :image-asset-urls="imageAssetUrls"
        :loading-image-asset-ids="loadingImageAssetIds"
        @cell-mousedown="(address, event) => emit('cellMousedown', address, event)"
        @cell-double-click="(address, event) => emit('cellDoubleClick', address, event)"
        @cell-contextmenu="(address, event) => emit('cellContextmenu', address, event)"
      />
    </div>
    <!-- Paint above all cell backgrounds so fractional zoom cannot cover adjacent grid lines. -->
    <svg
      v-for="pane in gridLinePanes"
      :key="pane.paneId"
      class="sheet-cell-layer__grid-lines"
      :style="pane.style"
      :data-gridline-pane="pane.paneId"
      aria-hidden="true"
      focusable="false"
      shape-rendering="crispEdges"
    >
      <path :d="pane.path" />
    </svg>
    <div
      v-for="span in spanningTextPanes"
      :key="span.key"
      class="sheet-cell-layer__text-pane"
      :style="span.paneStyle"
      aria-hidden="true"
    >
      <div
        class="sheet-cell-layer__spanning-text"
        :style="span.style"
        :data-center-across-source="`${span.source.row}:${span.source.column}`"
      >
        <CellTextContent
          :text="span.text"
          :value="span.value"
          :cell-style="span.formatStyle"
          :fill="span.fill"
          :width="span.width"
          :height="span.height"
        />
      </div>
    </div>
    <div
      v-if="activeEditor"
      class="sheet-cell-layer__editor-pane"
      :style="activeEditor.paneStyle"
      :data-editor-pane="activeEditor.paneId"
    >
      <div
        :id="activeEditorId"
        class="sheet-cell-layer__editor-anchor"
        :style="activeEditor.anchorStyle"
        data-cell-editor-anchor
      >
        <slot name="active-cell" :cell-rect="activeEditor.cellRect" />
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
  }

  &__row-pane {
    position: absolute;
    pointer-events: none;
  }

  &__grid-lines {
    position: absolute;
    z-index: 1;
    overflow: hidden;
    fill: none;
    stroke: var(--idea-border-subtle);
    stroke-width: 1px;
    pointer-events: none;
  }

  &__editor-pane {
    position: absolute;
    z-index: 5;
    pointer-events: none;
  }

  &__text-pane {
    position: absolute;
    z-index: 2;
    overflow: hidden;
    pointer-events: none;
  }
  &__spanning-text {
    position: absolute;
  }

  &__editor-anchor {
    position: absolute;
  }

  &__merge-fragment {
    position: absolute;
    box-sizing: border-box;
    background: var(--idea-surface-panel);
    border-right: var(--sheet-gridline-width) solid transparent;
    border-bottom: var(--sheet-gridline-width) solid transparent;
    pointer-events: none;
  }
}
</style>
