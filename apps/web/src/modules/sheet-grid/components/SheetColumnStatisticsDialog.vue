<script setup lang="ts">
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { BaseTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { computed, ref } from "vue";
import { Select, Option } from "tdesign-vue-next/es/select";
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
const selectedColumn = ref<number>();
const statistic = computed(
  () =>
    displayedStatistics.value.find((item) => item.column === selectedColumn.value) ??
    displayedStatistics.value[0],
);
const numberFormatter = computed(() => new Intl.NumberFormat(props.locale));

const distributionColumns = computed<BaseTableCol[]>(() => [
  { colKey: "value", title: t("contextMenu.value"), ellipsis: true },
  { colKey: "count", title: t("contextMenu.occurrences"), width: 100, align: "right" },
  { colKey: "share", title: t("contextMenu.statisticsShare"), width: 180 },
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
    :cancel-btn="t('wordProof.close')"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    width="min(660px, calc(100vw - 32px))"
    placement="center"
    class="sheet-column-statistics-dialog"
    @close="emit('close')"
  >
    <div class="column-statistics">
      <div class="column-statistics__toolbar">
        <span>{{ t("contextMenu.column") }}</span>
        <Select
          v-if="displayedStatistics.length > 1"
          :value="statistic?.column"
          :aria-label="t('contextMenu.column')"
          class="column-statistics__selector"
          @change="selectedColumn = Number($event)"
        >
          <Option
            v-for="item in displayedStatistics"
            :key="item.column"
            :value="item.column"
            :label="columnLabel(item.column)"
          />
        </Select>
        <strong v-else-if="statistic">{{ columnLabel(statistic.column) }}</strong>
        <span class="column-statistics__hint">{{ t("contextMenu.visibleRowsOnly") }}</span>
      </div>
      <p v-if="hasMoreColumns" class="column-statistics__hint">
        {{ t("contextMenu.statisticsColumnLimit", { count: MAX_RENDERED_COLUMNS }) }}
      </p>
      <template v-if="statistic">
        <dl class="column-statistics__metrics">
          <div>
            <dt>{{ t("contextMenu.statisticsCount") }}</dt>
            <dd>{{ formatNumber(statistic.selectedCellCount) }}</dd>
          </div>
          <div>
            <dt>{{ t("contextMenu.numericCount") }}</dt>
            <dd>{{ formatNumber(statistic.numericCount) }}</dd>
          </div>
          <div>
            <dt>{{ t("contextMenu.statisticsDistinct") }}</dt>
            <dd>{{ formatNumber(statistic.distinctCount) }}</dd>
          </div>
          <div>
            <dt>{{ t("contextMenu.statisticsUnique") }}</dt>
            <dd>{{ formatNumber(statistic.uniqueCount) }}</dd>
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
        </dl>
        <div class="column-statistics__distribution-heading">
          <strong>{{ t("contextMenu.valueDistribution") }}</strong>
          <span v-if="statistic.distributionTruncated" class="column-statistics__hint">{{
            t("contextMenu.statisticsLimit")
          }}</span>
        </div>
        <div class="column-statistics__table">
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
              :empty="t('contextMenu.statisticsEmpty')"
              hover
              resizable
            >
              <template #count="{ row }">{{ formatNumber(row.count) }}</template>
              <template #share="{ row }">
                <div class="column-statistics__share">
                  <span class="column-statistics__bar"
                    ><span :style="{ width: `${(row.count / statistic.nonEmptyCount) * 100}%` }"
                  /></span>
                  <span>{{ ((row.count / statistic.nonEmptyCount) * 100).toFixed(1) }}%</span>
                </div>
              </template>
            </BaseTable>
          </TableHeightWrapper>
        </div>
        <div class="column-statistics__notes">
          <p>{{ t("contextMenu.statisticsScope") }}</p>
          <span v-if="statistic.dateCount"
            >{{ t("contextMenu.dateCount") }}：{{ formatNumber(statistic.dateCount) }}</span
          >
          <span v-if="statistic.errorCount"
            >{{ t("contextMenu.errorsIgnored") }}：{{ formatNumber(statistic.errorCount) }}</span
          >
        </div>
      </template>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.column-statistics {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
  }
  &__toolbar,
  &__distribution-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  &__selector {
    width: 120px;
  }
  &__toolbar > :last-child {
    margin-left: auto;
  }
  &__hint,
  &__notes {
    color: var(--idea-text-secondary);
  }
  &__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px 16px;
    margin: 0;
    padding: 12px;
    background: var(--idea-surface-subtle);
    border-radius: var(--idea-radius-small);
    div {
      min-width: 0;
    }
    dt {
      color: var(--idea-text-secondary);
    }
    dd {
      margin: 4px 0 0;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
  }
  &__distribution-heading {
    justify-content: space-between;
  }
  &__table {
    height: min(260px, calc(100dvh - 360px));
    min-height: 0;
  }
  &__notes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    p {
      width: 100%;
    }
  }
  &__share {
    display: flex;
    align-items: center;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  &__bar {
    flex: 1;
    height: 6px;
    background: var(--td-bg-color-secondarycontainer);
    border-radius: 3px;
    overflow: hidden;
    span {
      display: block;
      height: 100%;
      background: var(--td-brand-color);
    }
  }
}
@media (max-width: 560px) {
  .column-statistics__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
