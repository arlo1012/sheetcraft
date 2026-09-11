<script setup lang="ts">
import HomeFormatToolbar from "../modules/home-tools/components/HomeFormatToolbar.vue";
import type { CellMergeMode } from "@idea10/core/commands";
import type { CellFormatTab } from "../modules/cell-format/components/CellFormatDialog.vue";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../shared/i18n";
import LocaleSwitcher from "./LocaleSwitcher.vue";
import type {
  FilterValueKey,
  HomeDataToolState,
  MergeCellsState,
} from "../modules/home-tools/components/data-tool-state";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
  readOnly?: boolean;
  formatPainterActive?: boolean;
  dataState?: HomeDataToolState;
  mergeState?: MergeCellsState;
}>();

const emit = defineEmits<{
  applyBorders: [action: CellBorderAction];
  updateBorderFormat: [patch: CellBorderFormatPatch];
  openCellFormat: [tab: CellFormatTab];
  applyStyle: [patch: CellStylePatch];
  adjustDecimals: [delta: -1 | 1];
  adjustIndent: [delta: -1 | 1];
  activateFormatPainter: [];
  autoSum: [];
  sort: [direction: "ascending" | "descending"];
  applyFilter: [includedKeys: FilterValueKey[]];
  clearFilter: [];
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
  merge: [mode: CellMergeMode];
  unmerge: [];
  insertImage: [mode: "cell" | "floating"];
  undo: [];
  redo: [];
  toggleProtection: [];
}>();

const { t } = useAppI18n();

defineSlots<{ "file-actions"?: () => unknown }>();
</script>

<template>
  <header class="spreadsheet-ribbon" :aria-label="t('ribbon.label')">
    <div class="spreadsheet-ribbon__categories">
      <nav class="spreadsheet-ribbon__category-list" :aria-label="t('ribbon.categories')">
        <span class="spreadsheet-ribbon__category" data-ribbon-category="home">
          {{ t("ribbon.home") }}
        </span>
        <slot name="file-actions" />
      </nav>
      <LocaleSwitcher />
    </div>
    <section class="spreadsheet-ribbon__panel" :aria-label="t('ribbon.homeTools')">
      <HomeFormatToolbar
        :state="state"
        :disabled="disabled"
        :read-only="readOnly"
        :format-painter-active="formatPainterActive"
        :data-state="dataState"
        :merge-state="mergeState"
        @apply-borders="emit('applyBorders', $event)"
        @update-border-format="emit('updateBorderFormat', $event)"
        @open-cell-format="emit('openCellFormat', $event)"
        @apply-style="emit('applyStyle', $event)"
        @adjust-decimals="emit('adjustDecimals', $event)"
        @adjust-indent="emit('adjustIndent', $event)"
        @activate-format-painter="emit('activateFormatPainter')"
        @auto-sum="emit('autoSum')"
        @sort="emit('sort', $event)"
        @apply-filter="emit('applyFilter', $event)"
        @clear-filter="emit('clearFilter')"
        @freeze="emit('freeze', $event)"
        @unfreeze="emit('unfreeze')"
        @merge="emit('merge', $event)"
        @unmerge="emit('unmerge')"
        @insert-image="emit('insertImage', $event)"
        @undo="emit('undo')"
        @redo="emit('redo')"
        @toggle-protection="emit('toggleProtection')"
      />
    </section>
  </header>
</template>

<style scoped lang="scss">
.spreadsheet-ribbon {
  display: grid;
  grid-template-rows: 30px 68px;
  min-width: 0;
  background: var(--idea-surface-canvas);
  border-bottom: 1px solid var(--idea-border-control);

  &__categories {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    min-width: 0;
    border-bottom: 1px solid var(--idea-border-subtle);
  }

  &__category-list {
    display: flex;
    min-width: 0;
    padding-left: 4px;
  }

  &__category {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    color: var(--idea-action-primary);
    font-size: var(--idea-font-size-body-medium);
    font-weight: var(--idea-font-weight-medium);
    line-height: var(--idea-line-height-body-medium);
    white-space: nowrap;

    &::after {
      position: absolute;
      right: 8px;
      bottom: -1px;
      left: 8px;
      height: 2px;
      background: var(--idea-action-primary);
      content: "";
    }
  }

  &__panel {
    min-width: 0;
    margin: 0 8px;
    overflow: hidden;
    background: var(--idea-surface-panel);
    border-radius: 6px;
  }
}
</style>
