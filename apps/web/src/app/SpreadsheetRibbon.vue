<script setup lang="ts">
import HomeFormatToolbar from "../modules/home-tools/components/HomeFormatToolbar.vue";
import type { CellBorderAction, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../shared/i18n";
import LocaleSwitcher from "./LocaleSwitcher.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
  formatPainterActive?: boolean;
}>();

const emit = defineEmits<{
  applyBorders: [action: CellBorderAction];
  applyStyle: [patch: CellStylePatch];
  adjustDecimals: [delta: -1 | 1];
  activateFormatPainter: [];
  autoSum: [];
  undo: [];
  redo: [];
}>();

const { t } = useAppI18n();
</script>

<template>
  <header class="spreadsheet-ribbon" :aria-label="t('ribbon.label')">
    <div class="spreadsheet-ribbon__categories">
      <nav class="spreadsheet-ribbon__category-list" :aria-label="t('ribbon.categories')">
        <span class="spreadsheet-ribbon__category" data-ribbon-category="home">
          {{ t("ribbon.home") }}
        </span>
      </nav>
      <LocaleSwitcher />
    </div>
    <section class="spreadsheet-ribbon__panel" :aria-label="t('ribbon.homeTools')">
      <HomeFormatToolbar
        :state="state"
        :disabled="disabled"
        :format-painter-active="formatPainterActive"
        @apply-borders="emit('applyBorders', $event)"
        @apply-style="emit('applyStyle', $event)"
        @adjust-decimals="emit('adjustDecimals', $event)"
        @activate-format-painter="emit('activateFormatPainter')"
        @auto-sum="emit('autoSum')"
        @undo="emit('undo')"
        @redo="emit('redo')"
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
    font-size: 12px;
    font-weight: 600;
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
