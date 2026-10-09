<script setup lang="ts">
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { BaseTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import { Statistic as TStatistic } from "tdesign-vue-next/es/statistic";
import { Tabs, TabPanel } from "tdesign-vue-next/es/tabs";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { computed, ref } from "vue";
import { Select, Option } from "tdesign-vue-next/es/select";
import { columnIndexToLabel } from "@sheetcraft/core/coordinates";
import type { CellRange, Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
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
const frequency = ref<"most" | "least">("most");
const distribution = computed(() =>
  statistic.value
    ? [
        ...(frequency.value === "most"
          ? statistic.value.distribution
          : statistic.value.leastDistribution),
      ]
    : [],
);
function decimalPlaces(value: number | null) {
  return value !== null && !Number.isInteger(value) ? 3 : 0;
}
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
    :footer="false"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    width="min(660px, calc(100vw - 32px))"
    placement="center"
    class="sheet-column-statistics-dialog"
    @close="emit('close')"
  >
    <div class="column-statistics">
      <p v-if="hasMoreColumns" class="column-statistics__hint">
        {{ t("contextMenu.statisticsColumnLimit", { count: MAX_RENDERED_COLUMNS }) }}
      </p>
      <template v-if="statistic">
        <Select
          v-if="displayedStatistics.length > 1"
          :value="statistic.column"
          :aria-label="t('contextMenu.column')"
          class="column-statistics__selector"
          @change="selectedColumn = Number($event)"
        >
          <Option
            v-for="item in displayedStatistics"
            :key="item.column"
            :value="item.column"
            :label="`${t('contextMenu.column')} ${columnLabel(item.column)}`"
          />
        </Select>
        <Tabs v-model="frequency">
          <TabPanel value="most" :label="t('contextMenu.statisticsMost')" />
          <TabPanel value="least" :label="t('contextMenu.statisticsLeast')" />
        </Tabs>
        <div class="column-statistics__table">
          <TableHeightWrapper v-slot="{ height }">
            <BaseTable
              class="idea-table--mini idea-table--row-dividers"
              row-key="value"
              :data="distribution"
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
              <template #share="{ row }"
                >{{ ((row.count / statistic.nonEmptyCount) * 100).toFixed(2) }}%</template
              >
            </BaseTable>
          </TableHeightWrapper>
        </div>
        <div class="column-statistics__metrics">
          <TStatistic
            :title="t('contextMenu.statisticsTotalRows')"
            :value="statistic.totalRowCount"
            :decimal-places="decimalPlaces(statistic.totalRowCount)"
            separator=","
          />
          <TStatistic
            :title="t('contextMenu.statisticsEmptyCells')"
            :value="statistic.emptyCount"
            :decimal-places="decimalPlaces(statistic.emptyCount)"
            separator=","
          />
          <TStatistic
            :title="t('contextMenu.statisticsDistinct')"
            :value="statistic.distinctCount"
            :decimal-places="decimalPlaces(statistic.distinctCount)"
            separator=","
          />
          <TStatistic
            :title="t('contextMenu.sum')"
            :value="statistic.sum"
            :decimal-places="decimalPlaces(statistic.sum)"
            separator=","
          />
          <TStatistic
            v-if="statistic.average !== null"
            :title="t('contextMenu.average')"
            :value="statistic.average"
            :decimal-places="decimalPlaces(statistic.average)"
            separator=","
          />
          <div v-else class="column-statistics__unavailable">
            <span>{{ t("contextMenu.average") }}</span
            ><strong>—</strong>
          </div>
          <TStatistic
            v-if="statistic.median !== null"
            :title="t('contextMenu.statisticsMedian')"
            :value="statistic.median"
            :decimal-places="decimalPlaces(statistic.median)"
            separator=","
          />
          <div v-else class="column-statistics__unavailable">
            <span>{{ t("contextMenu.statisticsMedian") }}</span
            ><strong>—</strong>
          </div>
          <TStatistic
            v-if="statistic.minimum !== null"
            :title="t('contextMenu.minimum')"
            :value="statistic.minimum"
            :decimal-places="decimalPlaces(statistic.minimum)"
            separator=","
          />
          <div v-else class="column-statistics__unavailable">
            <span>{{ t("contextMenu.minimum") }}</span
            ><strong>—</strong>
          </div>
          <TStatistic
            v-if="statistic.maximum !== null"
            :title="t('contextMenu.maximum')"
            :value="statistic.maximum"
            :decimal-places="decimalPlaces(statistic.maximum)"
            separator=","
          />
          <div v-else class="column-statistics__unavailable">
            <span>{{ t("contextMenu.maximum") }}</span
            ><strong>—</strong>
          </div>
        </div>
        <div v-if="statistic.dateCount || statistic.errorCount" class="column-statistics__notes">
          <span v-if="statistic.dateCount"
            >{{ t("contextMenu.dateCount") }}：{{ formatNumber(statistic.dateCount) }}</span
          >
          <span v-if="statistic.errorCount"
            >{{ t("contextMenu.errorsIgnored") }}：{{ formatNumber(statistic.errorCount) }}</span
          >
        </div>
      </template>
      <p class="column-statistics__hint">{{ t("contextMenu.statisticsScope") }}</p>
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
  &__selector {
    width: 120px;
  }
  &__hint,
  &__notes {
    color: var(--sheetcraft-text-secondary);
  }
  &__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    padding-top: 4px;
  }
  &__unavailable {
    display: grid;
    gap: 8px;
    color: var(--sheetcraft-text-secondary);
    strong {
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
      color: var(--sheetcraft-text-primary);
    }
  }
  &__table {
    height: 186px;
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
}
@media (max-width: 560px) {
  .column-statistics__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
