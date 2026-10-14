<script setup lang="ts">
import { computed } from "vue";
import { BaseTable, type BaseTableCol } from "tdesign-vue-next/es/table";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import {
  resolveChartComboSeriesSettings,
  type ChartComboSeriesChange,
  type ChartComboSeriesTarget,
} from "@sheetcraft/core/chart-combo";
import type { ChartSeries, SheetChart } from "@sheetcraft/core/sheet-charts";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  chart: SheetChart;
  series: readonly ChartSeries[];
  changes: readonly ChartComboSeriesChange[];
  disabled: boolean;
}>();
const emit = defineEmits<{
  change: [change: ChartComboSeriesChange];
  recipe: [];
}>();
const { t } = useAppI18n();
const rows = computed(() =>
  props.series.flatMap((series, rowIndex) => {
    const target: ChartComboSeriesTarget | undefined = series.rangeBand
      ? { rangeBand: { ...series.rangeBand } }
      : series.id
        ? { seriesId: series.id }
        : undefined;
    if (!target) return [];
    const key =
      "rangeBand" in target
        ? `band:${target.rangeBand.seriesBy}:${target.rangeBand.index}`
        : `id:${target.seriesId}`;
    const settings = resolveChartComboSeriesSettings(props.chart, target, props.changes);
    return [{ key, rowIndex, target, settings, name: series.name }];
  }),
);
const columns = computed<BaseTableCol[]>(() => [
  { colKey: "name", title: t("chart.sourceSeriesName"), width: 160 },
  { colKey: "drawType", title: t("chart.type") },
  { colKey: "secondary", title: t("chart.comboSecondaryAxis"), width: 120 },
]);
const typeOptions = computed(() => [
  { value: "column", label: t("chart.column") },
  { value: "line", label: t("chart.line") },
  { value: "lineMarkers", label: t("chart.comboLineMarkers") },
]);
const recipeAvailable = computed(() => rows.value.length >= 2 && rows.value.length <= 256);
function changeType(key: string, value: unknown): void {
  if (props.disabled || !["column", "line", "lineMarkers"].includes(String(value))) return;
  const row = rows.value.find((entry) => entry.key === key);
  if (!row) return;
  emit("change", {
    ...row.target,
    ...row.settings,
    drawType: value === "column" ? "column" : "line",
    markers: value === "lineMarkers",
  });
}
function changeAxis(key: string, checked: unknown): void {
  if (props.disabled || typeof checked !== "boolean") return;
  const row = rows.value.find((entry) => entry.key === key);
  if (!row) return;
  emit("change", { ...row.target, ...row.settings, axis: checked ? "secondary" : "primary" });
}
</script>
<template>
  <section class="chart-combo-controls" :aria-label="t('chart.combo')">
    <Button
      data-chart-combo-recipe
      size="small"
      theme="default"
      :disabled="disabled || !recipeAvailable"
      @click="!disabled && recipeAvailable && emit('recipe')"
      >{{ t("chart.comboRecipe") }}</Button
    >
    <p class="chart-combo-controls__hint">{{ t("chart.comboHint") }}</p>
    <div class="chart-combo-controls__table">
      <TableHeightWrapper v-slot="{ height }">
        <BaseTable
          class="sheetcraft-table--mini"
          size="small"
          row-key="key"
          :data="rows"
          :columns="columns"
          :height="height"
          table-layout="fixed"
          :bordered="false"
          :empty="t('chart.comboEmpty')"
        >
          <template #name="{ row }">
            <span :data-chart-combo-row="row.key">{{ row.name }}</span>
          </template>
          <template #drawType="{ row, rowIndex }">
            <Select
              :data-chart-combo-type="row.key"
              :value="
                row.settings.drawType === 'line' && row.settings.markers
                  ? 'lineMarkers'
                  : row.settings.drawType
              "
              :options="typeOptions"
              :disabled="disabled"
              :aria-label="t('chart.comboSeriesType', { name: series[rowIndex]?.name ?? '' })"
              @change="changeType(row.key, $event)"
            />
          </template>
          <template #secondary="{ row, rowIndex }">
            <Checkbox
              :data-chart-combo-secondary="row.key"
              :checked="row.settings.axis === 'secondary'"
              :disabled="disabled"
              :aria-label="
                t('chart.comboSeriesSecondaryAxis', { name: series[rowIndex]?.name ?? '' })
              "
              @change="changeAxis(row.key, $event)"
            />
          </template>
        </BaseTable>
      </TableHeightWrapper>
    </div>
  </section>
</template>
<style scoped lang="scss">
.chart-combo-controls {
  display: grid;
  gap: 8px;
  justify-items: start;
  &__table {
    width: 100%;
    height: 200px;
    min-height: 0;
  }
  &__hint {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
}
</style>
