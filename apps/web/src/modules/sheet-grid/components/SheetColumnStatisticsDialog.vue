<script setup lang="ts">
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { BaseTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { computed } from "vue";
import { columnIndexToLabel } from "@idea10/core/coordinates";
import type { CellRange, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import { getColumnStatistics } from "../column-context-data";

const MAX_RENDERED_COLUMNS = 50;
const props = defineProps<{
  sheet: Sheet;
  evaluator: SheetEvaluator;
  range: CellRange;
  locale?: string;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const statistics = computed(() => getColumnStatistics(props.sheet, props.range, props.evaluator));
const displayedStatistics = computed(() => statistics.value.slice(0, MAX_RENDERED_COLUMNS));
const hasMoreColumns = computed(() => statistics.value.length > MAX_RENDERED_COLUMNS);
const numberFormatter = computed(() => new Intl.NumberFormat(props.locale));

const distributionColumns = computed<BaseTableCol[]>(() => [
  { colKey: "value", title: t("contextMenu.value"), ellipsis: true },
  { colKey: "count", title: t("contextMenu.occurrences"), width: 120 },
]);
function formatNumber(value: number | null): string {
  return value === null ? "—" : numberFormatter.value.format(value);
}

function columnLabel(column: number): string {
  return columnIndexToLabel(column);
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('contextMenu.columnStatistics')"
    :visible="true"
    :header="t('contextMenu.columnStatistics')"
    :confirm-btn="null"
    :cancel-btn="t('cellFormat.cancel')"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    width="min(660px, calc(100vw - 32px))"
    placement="center"
    class="sheet-column-statistics-dialog"
    @close="emit('close')"
  >
    <p class="sheet-column-statistics-dialog__note">{{ t("contextMenu.visibleRowsOnly") }}</p>
    <p v-if="hasMoreColumns" class="sheet-column-statistics-dialog__note">
      {{ t("contextMenu.statisticsColumnLimit", { count: MAX_RENDERED_COLUMNS }) }}
    </p>
    <section
      v-for="statistic in displayedStatistics"
      :key="statistic.column"
      class="sheet-column-statistics-dialog__column"
      :aria-label="`${t('contextMenu.column')} ${columnLabel(statistic.column)}`"
    >
      <h3>{{ t("contextMenu.column") }} {{ columnLabel(statistic.column) }}</h3>
      <dl class="sheet-column-statistics-dialog__metrics">
        <div>
          <dt>{{ t("contextMenu.selectedCells") }}</dt>
          <dd>{{ formatNumber(statistic.selectedCellCount) }}</dd>
        </div>
        <div>
          <dt>{{ t("contextMenu.nonEmptyCount") }}</dt>
          <dd>{{ formatNumber(statistic.nonEmptyCount) }}</dd>
        </div>
        <div>
          <dt>{{ t("contextMenu.numericCount") }}</dt>
          <dd>{{ formatNumber(statistic.numericCount) }}</dd>
        </div>
        <div>
          <dt>{{ t("contextMenu.sum") }}</dt>
          <dd>{{ formatNumber(statistic.sum) }}</dd>
        </div>
        <div>
          <dt>{{ t("contextMenu.average") }}</dt>
          <dd>{{ formatNumber(statistic.average) }}</dd>
        </div>
        <div>
          <dt>{{ t("contextMenu.minimum") }}</dt>
          <dd>{{ formatNumber(statistic.minimum) }}</dd>
        </div>
        <div>
          <dt>{{ t("contextMenu.maximum") }}</dt>
          <dd>{{ formatNumber(statistic.maximum) }}</dd>
        </div>
        <div v-if="statistic.dateCount > 0">
          <dt>{{ t("contextMenu.dateCount") }}</dt>
          <dd>{{ formatNumber(statistic.dateCount) }}</dd>
        </div>
        <div v-if="statistic.errorCount > 0">
          <dt>{{ t("contextMenu.errorsIgnored") }}</dt>
          <dd>{{ formatNumber(statistic.errorCount) }}</dd>
        </div>
      </dl>
      <div
        v-if="statistic.distribution.length"
        class="sheet-column-statistics-dialog__distribution"
      >
        <h4>{{ t("contextMenu.valueDistribution") }}</h4>
        <div
          class="sheet-column-statistics-dialog__table"
          :style="{ height: `${Math.min(220, 34 + statistic.distribution.length * 30)}px` }"
        >
          <TableHeightWrapper v-slot="{ height }">
            <BaseTable
              class="idea-table--mini idea-table--row-dividers"
              row-key="value"
              :data="[...statistic.distribution]"
              :columns="distributionColumns"
              :height="height"
              size="small"
              table-layout="fixed"
              :bordered="false"
              hover
            >
              <template #count="{ row }">{{ formatNumber(row.count) }}</template>
            </BaseTable>
          </TableHeightWrapper>
        </div>
      </div>
    </section>
  </Dialog>
</template>

<style scoped lang="scss">
.sheet-column-statistics-dialog {
  &__note {
    margin: 0 0 var(--idea-space-3);
    color: var(--idea-text-secondary);
    font-size: 12px;
  }

  &__column + &__column {
    margin-top: var(--idea-space-4);
    padding-top: var(--idea-space-4);
    border-top: 1px solid var(--idea-border-control);
  }

  h3,
  h4 {
    margin: 0;
    color: var(--idea-text-primary);
    font-size: 14px;
    font-weight: 600;
  }

  &__metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));
    gap: var(--idea-space-2);
    margin: var(--idea-space-2) 0 0;

    div {
      min-width: 0;
      padding: var(--idea-space-2);
      background: var(--idea-surface-subtle);
      border-radius: var(--idea-radius-small);
    }

    dt {
      color: var(--idea-text-secondary);
      font-size: 12px;
    }

    dd {
      margin: 2px 0 0;
      color: var(--idea-text-primary);
      font-variant-numeric: tabular-nums;
    }
  }

  &__distribution {
    margin-top: var(--idea-space-3);
  }
  &__table {
    margin-top: var(--idea-space-2);
    min-height: 0;
  }
}
</style>
