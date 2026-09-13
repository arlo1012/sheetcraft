<script setup lang="ts">
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
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t("contextMenu.value") }}</th>
              <th scope="col">{{ t("contextMenu.occurrences") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in statistic.distribution" :key="entry.value">
              <td :title="entry.value">{{ entry.value }}</td>
              <td>{{ formatNumber(entry.count) }}</td>
            </tr>
          </tbody>
        </table>
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

    table {
      width: 100%;
      margin-top: var(--idea-space-2);
      border-collapse: collapse;
      font-size: 13px;
    }

    th,
    td {
      padding: 6px var(--idea-space-2);
      text-align: left;
      border-bottom: 1px solid var(--idea-border-control);
    }

    td:first-child {
      max-width: 420px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}
</style>
