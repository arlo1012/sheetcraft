<script setup lang="ts">
import type { TableStyleDefinition, TableStyleElement } from "@sheetcraft/core/table-styles";
import type {
  PivotTableStyleDefinition,
  PivotTableStyleElement,
} from "@sheetcraft/core/pivot-table-styles";
import { computed, nextTick, ref, watch } from "vue";
import {
  cellStyleToCss,
  previewCells,
  previewPivotCells,
  tablePreviewDimensions,
} from "../table-style-presentation";

import {
  getCellTextTypographyStyle,
  getCellTextScriptStyle,
} from "../../../shared/cell-text/font-presentation";

const props = withDefaults(
  defineProps<{
    kind?: "table" | "pivot";
    style: TableStyleDefinition | PivotTableStyleDefinition;
    selected?: boolean;
    compact?: boolean;
    variant?: "gallery" | "editor";
    selectedElement?: TableStyleElement | PivotTableStyleElement;
  }>(),
  { kind: "table", selected: false, compact: false, variant: "gallery" },
);
const previewRef = ref<HTMLElement | null>(null);
const editorElement = computed(() =>
  props.variant === "editor" ? (props.selectedElement as TableStyleElement | undefined) : undefined,
);
const dimensions = computed(() =>
  props.kind === "table"
    ? tablePreviewDimensions(props.style as TableStyleDefinition, editorElement.value)
    : { rows: 7, columns: 5 },
);
const cells = computed(() =>
  props.kind === "pivot"
    ? previewPivotCells(props.style as PivotTableStyleDefinition)
    : previewCells(props.style as TableStyleDefinition, editorElement.value),
);

watch(
  [() => props.style, () => props.selectedElement],
  async () => {
    if (props.variant !== "editor") return;
    await nextTick();
    const element = props.selectedElement;
    let row =
      element === "headerRow" || element?.includes("Header") || element === "wholeTable" ? 0 : 1;
    let column = 0;
    if (element === "totalRow" || element?.includes("Total")) row = dimensions.value.rows - 1;
    if (element === "lastColumn" || element === "lastHeaderCell" || element === "lastTotalCell")
      column = dimensions.value.columns - 1;
    if (element === "secondRowStripe")
      row = 1 + (props.style.elements.firstRowStripe?.stripeSize ?? 1);
    if (element === "secondColumnStripe")
      column = props.style.elements.firstColumnStripe?.stripeSize ?? 1;
    previewRef.value
      ?.querySelector<HTMLElement>(`[data-preview-cell="${row}-${column}"]`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  },
  { immediate: true, flush: "post" },
);

function previewValue(row: number, column: number): string {
  return row === 0 ? String.fromCharCode(65 + column) : String(row * 10 + column);
}
</script>

<template>
  <span
    ref="previewRef"
    class="table-style-preview"
    :style="{ '--preview-columns': dimensions.columns, '--preview-rows': dimensions.rows }"
    :class="{
      'is-selected': selected,
      'is-compact': compact,
      'is-editor': variant === 'editor',
    }"
    aria-hidden="true"
  >
    <i
      v-for="cell in cells"
      :key="`${cell.row}-${cell.column}`"
      :data-preview-cell="`${cell.row}-${cell.column}`"
      :style="{
        ...cellStyleToCss(cell.style),
        ...(variant === 'editor' ? getCellTextTypographyStyle(cell.style) : {}),
      }"
      :class="{
        'is-header': cell.row === 0,
        'is-last-column': cell.column === dimensions.columns - 1,
        'is-last-row': cell.row === dimensions.rows - 1,
      }"
      ><span v-if="variant === 'editor'" :style="getCellTextScriptStyle(cell.style)">{{
        previewValue(cell.row, cell.column)
      }}</span></i
    >
  </span>
</template>

<style scoped lang="scss">
.table-style-preview {
  display: grid;
  grid-template-columns: repeat(var(--preview-columns), 1fr);
  grid-template-rows: repeat(var(--preview-rows), 1fr);
  width: 84px;
  height: 52px;
  overflow: hidden;
  border: 0;
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-primary);

  i {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;

    &::after {
      content: "";
      width: 58%;
      height: 1px;
      background: currentColor;
      opacity: 0.78;
    }

    &.is-header::after {
      width: 64%;
    }
  }

  &.is-compact {
    width: 60px;
    height: 42px;
  }

  &.is-editor {
    grid-template-columns: repeat(var(--preview-columns), minmax(48px, 1fr));
    grid-template-rows: repeat(var(--preview-rows), minmax(28px, auto));
    width: 100%;
    min-width: calc(var(--preview-columns) * 48px);
    height: auto;
    min-height: 100%;
    overflow: visible;
    font-size: var(--sheetcraft-font-size-body-medium);

    i {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      overflow: hidden;
      padding: 3px 6px;
      border-right: 1px solid var(--sheetcraft-border-subtle);
      border-bottom: 1px solid var(--sheetcraft-border-subtle);
      font-style: normal;
      line-height: 1.4;
      white-space: nowrap;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &.is-last-column {
        border-right: 0;
      }
      &.is-last-row {
        border-bottom: 0;
      }

      &::after {
        content: none;
      }

      &.is-header {
        justify-content: flex-start;
      }
    }
  }
}
</style>
