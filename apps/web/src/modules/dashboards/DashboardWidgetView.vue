<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { DashboardWidget } from "@sheetcraft/core/dashboard";
import type { Workbook, SheetEvaluator } from "@sheetcraft/core/workbook";
import { init, type EChartsType } from "../charts/chart-runtime";
import { useAppI18n } from "../../shared/i18n";
import { dashboardChartData } from "./dashboard-data";
import { dashboardChartOption } from "./dashboard-chart";
const props = defineProps<{
  widget: DashboardWidget;
  workbook: Workbook;
  evaluator: SheetEvaluator;
  revision: number;
}>();
const { t, locale } = useAppI18n();
const data = computed(() => {
  void props.revision;
  const sheet = props.widget.source && props.workbook.sheets.get(props.widget.source.sheetId);
  if (!sheet || sheet.dashboard || !props.widget.source?.range) return undefined;
  return dashboardChartData(
    props.widget,
    props.evaluator.forSheet?.(sheet.id) ?? props.evaluator,
    t("dashboard.records"),
    t("dashboard.blank"),
  );
});
const value = computed(
  () =>
    data.value?.series[0]?.values[0] ??
    (props.widget.measures[0]?.stat === "records" && data.value ? 0 : null),
);
const target = ref<HTMLDivElement>();
let chart: EChartsType | undefined, observer: ResizeObserver | undefined;
function draw() {
  const host = target.value;
  if (
    !host ||
    !host.clientWidth ||
    !host.clientHeight ||
    !data.value ||
    props.widget.kind === "number" ||
    props.widget.kind === "text"
  )
    return;
  chart ??= init(host, undefined, { renderer: "svg" });
  chart.resize();
  chart.setOption(
    dashboardChartOption(props.widget, data.value, host.clientWidth, host.clientHeight),
    true,
  );
}
watch([data, () => props.widget], draw, { deep: true, flush: "post" });
onMounted(() => {
  observer = new ResizeObserver(draw);
  if (target.value) observer.observe(target.value);
  draw();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <div class="dashboard-widget-view">
    <div v-if="widget.kind === 'text'" class="text">{{ widget.text }}</div>
    <template v-else>
      <div
        v-show="widget.kind !== 'number' && data?.categories.length"
        ref="target"
        class="chart"
        role="img"
        :aria-label="widget.title"
      />
      <div v-if="!data" class="notice">{{ t("dashboard.noSource") }}</div>
      <div v-else-if="widget.kind === 'number'" class="statistic">
        {{ value === null ? "—" : value.toLocaleString(locale, { maximumFractionDigits: 4 }) }}
      </div>
      <div v-else-if="!data.categories.length" class="notice">{{ t("dashboard.empty") }}</div>
    </template>
  </div>
</template>
<style scoped lang="scss">
.dashboard-widget-view,
.chart {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}
.notice,
.statistic {
  height: 100%;
  display: grid;
  place-content: center;
  text-align: center;
}
.statistic {
  color: var(--sheetcraft-action-primary);
  font: 600 32px/1.2 var(--sheetcraft-font-sans);
}
.text {
  padding: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: auto;
  max-height: 100%;
}
</style>
