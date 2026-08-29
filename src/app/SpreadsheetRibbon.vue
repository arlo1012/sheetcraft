<script setup lang="ts">
import HomeFormatToolbar from "../modules/home-tools/components/HomeFormatToolbar.vue";
import type { CellStylePatch } from "../modules/workbook/cell-style";
import type { SelectionCellStyleState } from "../modules/workbook/style-state";
import { useAppI18n } from "../shared/i18n";
import LocaleSwitcher from "./LocaleSwitcher.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
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
        @apply-style="emit('applyStyle', $event)"
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
    </section>
  </header>
</template>

<style scoped lang="scss">
.spreadsheet-ribbon {
  display: grid;
  grid-template-rows: 32px 64px;
  min-width: 0;
  background: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-border);

  &__categories {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    min-width: 0;
    border-bottom: 1px solid var(--td-border-level-1-color);
  }

  &__category-list {
    display: flex;
    min-width: 0;
    padding-left: 6px;
  }

  &__category {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    color: var(--td-brand-color);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;

    &::after {
      position: absolute;
      right: 8px;
      bottom: -1px;
      left: 8px;
      height: 2px;
      background: var(--td-brand-color);
      content: "";
    }
  }

  &__panel {
    min-width: 0;
    overflow: hidden;
  }
}
</style>
