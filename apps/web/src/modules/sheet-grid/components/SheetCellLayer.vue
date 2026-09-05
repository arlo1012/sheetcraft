<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  getCellStyle,
  getCellContent,
  type CellAddress,
  type ImageTransform,
  type Sheet,
  type SheetEvaluator,
} from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { isCellSelected, type CellSelection } from "@idea10/sheet-engine/selection";
import { useAppI18n } from "../../../shared/i18n";
import { getCellContentStyle } from "../cell-presentation";
import { formatCellValueForGrid } from "../cell-value-presentation";
import SheetImageContent from "../../sheet-images/components/SheetImageContent.vue";

type VisibleCell = {
  key: string;
  paneId: "topLeft" | "top" | "left" | "body";
  address: CellAddress;
  rect: Rect;
  viewportTop: number;
  viewportHeight: number;
  text: string;
  image?: { assetId: string; altText: string; transform?: ImageTransform };
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
    imageAssetUrls?: ReadonlyMap<string, string>;
    loadingImageAssetIds?: ReadonlySet<string>;
  }>(),
  { locale: "en-US" },
);

const { t } = useAppI18n();

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
    const content = getCellContent(props.sheet, address);
    const cellImage = content?.kind === "image" ? content.image : undefined;
    const text = cellImage
      ? ""
      : formatCellValueForGrid(props.evaluator.getComputedValue(address), cellStyle, props.locale);
    const preservesLineBreaks = /[\r\n]/u.test(text);
    cells.push({
      key: `${address.row}:${address.column}`,
      paneId,
      address,
      rect,
      text,
      ...(cellImage ? { image: cellImage } : {}),
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
          const editorCell = props.editing
            ? cells.find(
                ({ address }) =>
                  address.row === props.activeCell.row &&
                  address.column === props.activeCell.column,
              )
            : undefined;
          // Preserve the outward editor border when it meets a frozen pane edge.
          const leftInset = editorCell?.rect.x === clip.x ? -1 : 0;
          const borderTopInset = editorCell?.rect.y === clip.y ? -1 : 0;
          // Clip to the pane so the editor can extend beyond its owning row.
          const topInset = clip.y - row.offset + borderTopInset;
          const bottomInset = row.offset + row.height - clip.y - clip.height;
          return {
            paneId,
            cells,
            style: {
              left: `${clip.x}px`,
              top: "0px",
              width: `${clip.width}px`,
              height: `${row.height}px`,
              clipPath: `inset(${topInset}px 0 ${bottomInset}px ${leftInset}px)`,
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
            'has-image': Boolean(cell.image),
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
          <SheetImageContent
            v-if="cell.image && imageAssetUrls?.get(cell.image.assetId)"
            class="sheet-cell-layer__image"
            :src="imageAssetUrls.get(cell.image.assetId) ?? ''"
            :alt-text="cell.image.altText || t('image.cellAlt')"
            :transform="cell.image.transform"
            fit="contain"
          />
          <span
            v-else-if="cell.image"
            class="sheet-cell-layer__image-placeholder"
            role="img"
            :aria-label="
              loadingImageAssetIds?.has(cell.image.assetId)
                ? t('image.loading')
                : t('image.assetUnavailable')
            "
          >
            {{
              loadingImageAssetIds?.has(cell.image.assetId)
                ? t("image.loading")
                : t("image.assetUnavailable")
            }}
          </span>
          <span v-else-if="cell.text" class="sheet-cell-layer__value">{{ cell.text }}</span>
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

  &__cell.has-image {
    padding: 2px;
    overflow: hidden;
  }

  &__image {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  &__image-placeholder {
    overflow: hidden;
    color: var(--idea-text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
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
