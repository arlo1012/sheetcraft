<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { SelectionSummary } from "@idea10/core/selection-summary";
import type { Sheet, SheetProperties } from "@idea10/core/workbook";
import WorkbookSheetTabs from "./WorkbookSheetTabs.vue";

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
  selectionSummary: SelectionSummary;
}>();

const emit = defineEmits<{
  select: [sheetId: string];
  add: [];
  duplicate: [sheetId: string];
  rename: [payload: { sheetId: string; name: string }];
  move: [payload: { sheetId: string; toIndex: number }];
  delete: [sheetId: string];
  updateProperties: [payload: { sheetId: string; patch: Partial<SheetProperties> }];
  restore: [sheetId: string];
}>();

const { locale, t } = useAppI18n();
const numberFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }),
);
const zoomValue = computed(() =>
  new Intl.NumberFormat(locale.value, { style: "percent" }).format(1),
);
const shouldShowSummary = computed(
  () => props.selectionSummary.selectedCellCount > 1 && props.selectionSummary.count > 0,
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
        @duplicate="emit('duplicate', $event)"
        @rename="emit('rename', $event)"
        @move="emit('move', $event)"
        @delete="emit('delete', $event)"
        @update-properties="emit('updateProperties', $event)"
        @restore="emit('restore', $event)"
      />
    </div>
    <dl
      v-if="shouldShowSummary"
      class="workbook-status-bar__summary"
      :aria-label="t('statusBar.selectionSummary')"
      data-selection-summary
    >
      <div class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.count") }}</dt>
        <dd :title="formatNumber(selectionSummary.count)">
          {{ formatNumber(selectionSummary.count) }}
        </dd>
      </div>
      <div v-if="selectionSummary.numericCount > 0" class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.average") }}</dt>
        <dd :title="formatNumber(selectionSummary.average)">
          {{ formatNumber(selectionSummary.average) }}
        </dd>
      </div>
      <div v-if="selectionSummary.numericCount > 0" class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.sum") }}</dt>
        <dd :title="formatNumber(selectionSummary.sum)">
          {{ formatNumber(selectionSummary.sum) }}
        </dd>
      </div>
    </dl>
    <span
      class="workbook-status-bar__scale"
      :aria-label="t('statusBar.zoomLevel', { value: 100 })"
      :title="t('statusBar.zoomLevel', { value: 100 })"
    >
      {{ zoomValue }}
    </span>
  </footer>
</template>

<style scoped lang="scss">
.workbook-status-bar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 30px;
  background: var(--idea-surface-panel);
  border-top: 1px solid var(--idea-border-subtle);
  color: var(--idea-text-secondary);
  font-size: 12px;

  &__sheets {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
  }

  &__summary {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 16px;
    min-width: 0;
    max-width: 44%;
    margin: 0;
    padding: 0 16px;
    font-variant-numeric: tabular-nums;
  }

  &__stat {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    white-space: nowrap;

    dt {
      flex: 0 0 auto;
    }

    dd {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      color: var(--idea-text-primary);
      text-overflow: ellipsis;
    }
  }

  &__scale {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    align-self: center;
    justify-content: center;
    min-width: 56px;
    height: 14px;
    padding: 0 12px;
    border-left: 1px solid var(--idea-border-subtle);
    color: var(--idea-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    &__summary {
      gap: 10px;
      padding: 0 10px;
      max-width: 38%;
    }

    &__stat:nth-child(2) {
      display: none;
    }
  }

  @media (max-width: 480px) {
    &__summary {
      max-width: 26%;
      padding: 0 8px;
    }

    &__stat:not(:first-child) {
      display: none;
    }

    &__scale {
      min-width: 48px;
      padding: 0 8px;
    }
  }
}
</style>
