<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { FilterX, ListChecks } from "lucide-vue-next";
import type { Sheet } from "@sheetcraft/core/workbook";
import type { SheetSlicerDrawing } from "@sheetcraft/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import { getTableSlicerStyle } from "../slicer-styles";
import { tableSlicerContext } from "../useTableSlicers";

const props = defineProps<{ drawing: SheetSlicerDrawing; sheet: Sheet; revision: number }>();
const { t } = useAppI18n();
const multi = ref(false);
const lastAnchorKey = ref<string | undefined>(undefined);
const context = inject(tableSlicerContext, undefined);

const state = computed(() => {
  void props.revision;
  return context?.state(props.sheet, props.drawing);
});
const editable = computed(() => {
  void props.revision;
  return context?.editable(props.sheet, props.drawing);
});
const styleVars = computed(() => {
  const palette = getTableSlicerStyle(state.value?.styleId ?? props.drawing.slicer.styleId);
  return {
    "--slicer-border": palette.border,
    "--slicer-bg": palette.background,
    "--slicer-header-bg": palette.headerBg,
    "--slicer-header-fg": palette.headerFg,
    "--slicer-header-border": palette.headerBorder,
    "--slicer-item-bg": palette.itemBg,
    "--slicer-item-fg": palette.itemFg,
    "--slicer-item-border": palette.itemBorder,
    "--slicer-item-hover-bg": palette.itemHoverBg,
    "--slicer-selected-bg": palette.selectedBg,
    "--slicer-selected-fg": palette.selectedFg,
    "--slicer-selected-border": palette.selectedBorder,
    "--slicer-nodata-bg": palette.noDataBg,
    "--slicer-nodata-fg": palette.noDataFg,
    "--slicer-nodata-border": palette.noDataBorder,
    "--slicer-columns": String(state.value?.columns ?? props.drawing.slicer.columns ?? 1),
  };
});

function onItemClick(key: string, event: MouseEvent): void {
  if (!context) return;
  if (
    event.shiftKey &&
    lastAnchorKey.value &&
    state.value?.items.some((item) => item.key === lastAnchorKey.value)
  ) {
    context.selectRange(props.sheet, props.drawing, lastAnchorKey.value, key);
    return;
  }
  lastAnchorKey.value = key;
  context.select(props.sheet, props.drawing, key, multi.value || event.ctrlKey || event.metaKey);
}

function onClear(): void {
  lastAnchorKey.value = undefined;
  context?.select(props.sheet, props.drawing);
}
</script>
<template>
  <section
    class="table-slicer"
    :class="{ 'is-headerless': state ? !state.showHeader : drawing.slicer.showHeader === false }"
    :style="styleVars"
    :aria-label="state?.caption ?? drawing.slicer.caption ?? drawing.name"
    :data-slicer-style="state?.styleId ?? drawing.slicer.styleId ?? 'light-blue'"
    :data-slicer-columns="state?.columns ?? drawing.slicer.columns ?? 1"
  >
    <header v-if="state ? state.showHeader : drawing.slicer.showHeader !== false">
      <strong>{{ state?.caption ?? drawing.slicer.caption ?? drawing.name }}</strong>
      <div class="table-slicer__actions" @pointerdown.stop @dblclick.stop @keydown.stop>
        <button
          type="button"
          :title="t('tables.slicerMultiple')"
          :aria-label="t('tables.slicerMultiple')"
          :aria-pressed="multi"
          :disabled="!editable || !state"
          data-slicer-multi
          @click.stop="multi = !multi"
        >
          <ListChecks />
        </button>
        <button
          type="button"
          :title="t('tables.slicerClear')"
          :aria-label="t('tables.slicerClear')"
          :disabled="!editable || !state?.filtered"
          data-slicer-clear
          @click.stop="onClear"
        >
          <FilterX />
        </button>
      </div>
    </header>
    <div v-else class="table-slicer__drag-strip" />
    <div
      v-if="state"
      class="table-slicer__items"
      @pointerdown.stop
      @dblclick.stop
      @keydown.stop
      @wheel.stop
    >
      <button
        v-for="item in state.items"
        :key="item.key"
        type="button"
        :aria-pressed="item.selected"
        :class="{ 'no-data': !item.available }"
        :disabled="!editable"
        @click.stop="onItemClick(item.key, $event)"
      >
        {{
          item.value.kind === "blank"
            ? t("tables.slicerBlank")
            : item.value.kind === "error"
              ? item.value.code
              : String(item.value.value)
        }}
      </button>
    </div>
    <span v-else class="table-slicer__empty">{{ t("tables.slicerMissing") }}</span>
  </section>
</template>
<style scoped lang="scss">
.table-slicer {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--slicer-border);
  border-radius: 3px;
  background: var(--slicer-bg);
  color: var(--slicer-item-fg);
  font-family: var(--sheetcraft-font-sans);
  font-size: 12px;
  line-height: 20px;
  pointer-events: auto;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    background: var(--slicer-header-bg);
    color: var(--slicer-header-fg);
    border-bottom: 1px solid var(--slicer-header-border);
    padding: 4px 6px;
    cursor: move;
  }

  &__drag-strip {
    flex: 0 0 6px;
    background: var(--slicer-header-bg);
    border-bottom: 1px solid var(--slicer-header-border);
    cursor: move;
  }

  strong {
    font-size: 12px;
    line-height: 18px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  &__actions {
    display: flex;
    flex: 0 0 auto;
    gap: 2px;

    button {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: inherit;
    }

    svg {
      width: 15px;
      height: 15px;
    }

    button:hover:not(:disabled) {
      background: rgba(128, 128, 128, 0.16);
    }

    button[aria-pressed="true"] {
      background: rgba(128, 128, 128, 0.28);
    }

    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  &__items {
    display: grid;
    grid-template-columns: repeat(var(--slicer-columns, 1), minmax(0, 1fr));
    align-content: start;
    gap: 4px;
    padding: 5px;
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;

    button {
      min-width: 0;
      border: 1px solid var(--slicer-item-border);
      border-radius: 3px;
      background: var(--slicer-item-bg);
      color: var(--slicer-item-fg);
      padding: 2px 6px;
      text-align: start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: background-color 120ms ease;
    }

    button:not([aria-pressed="true"]):hover:not(:disabled) {
      background: var(--slicer-item-hover-bg);
    }

    button[aria-pressed="true"] {
      background: var(--slicer-selected-bg);
      color: var(--slicer-selected-fg);
      border-color: var(--slicer-selected-border);
      font-weight: 500;
    }

    button[aria-pressed="true"]:hover:not(:disabled) {
      filter: brightness(0.93);
    }

    button.no-data {
      color: var(--slicer-nodata-fg);
      background: var(--slicer-nodata-bg);
      border-color: var(--slicer-nodata-border);
      border-style: dashed;
    }

    button.no-data[aria-pressed="true"] {
      opacity: 0.78;
    }
  }

  &__empty {
    padding: 8px 6px;
    font-size: 12px;
    line-height: 18px;
    color: var(--slicer-nodata-fg);
  }
}
</style>
