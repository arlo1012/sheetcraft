<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { SelectionSummary } from "../selection-summary";
import type { Sheet } from "../workbook";
import WorkbookSheetTabs from "./WorkbookSheetTabs.vue";

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
  statusText: string;
  selectionSummary: SelectionSummary;
}>();

const emit = defineEmits<{
  select: [sheetId: string];
  add: [];
  rename: [payload: { sheetId: string; name: string }];
  delete: [sheetId: string];
}>();

const { locale, t } = useAppI18n();
const numberFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }),
);

function formatNumber(value: number): string {
  return numberFormatter.value.format(Object.is(value, -0) ? 0 : value);
}
</script>

<template>
  <footer class="workbook-status-bar" :aria-label="t('statusBar.label')">
    <div class="workbook-status-bar__sheets">
      <WorkbookSheetTabs
        :sheets="sheets"
        :active-sheet-id="activeSheetId"
        @select="emit('select', $event)"
        @add="emit('add')"
        @rename="emit('rename', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
    <span class="workbook-status-bar__status" aria-live="polite">
      {{ statusText }}
    </span>
    <dl
      class="workbook-status-bar__summary"
      :aria-label="t('statusBar.selectionSummary')"
      data-selection-summary
    >
      <div class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.average") }}</dt>
        <dd>{{ formatNumber(selectionSummary.average) }}</dd>
      </div>
      <div class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.count") }}</dt>
        <dd>{{ formatNumber(selectionSummary.count) }}</dd>
      </div>
      <div class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.sum") }}</dt>
        <dd>{{ formatNumber(selectionSummary.sum) }}</dd>
      </div>
    </dl>
  </footer>
</template>

<style scoped lang="scss">
.workbook-status-bar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 30px;
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  color: var(--td-text-color-secondary);
  font-size: 12px;

  &__sheets {
    display: flex;
    flex: 1 1 360px;
    min-width: 90px;
    overflow: hidden;
  }

  &__status {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    min-width: 60px;
    padding: 0 12px;
    overflow: hidden;
    color: var(--td-text-color-placeholder);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__summary {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    margin: 0;
    padding: 0 12px;
    border-left: 1px solid var(--td-border-level-1-color);
    font-variant-numeric: tabular-nums;
  }

  &__stat {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;

    dd {
      margin: 0;
      color: var(--td-text-color-primary);
    }
  }

  @media (max-width: 720px) {
    &__status {
      position: absolute;
      width: 1px;
      min-width: 0;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    &__summary {
      gap: 8px;
      padding: 0 8px;
    }
  }

  @media (max-width: 480px) {
    &__summary {
      gap: 0;
    }

    &__stat:not(:nth-child(2)) {
      display: none;
    }
  }
}
</style>
