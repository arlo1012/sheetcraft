<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import { init, type EChartsType } from "../chart-runtime";
import { createChartOption } from "../chart-option";
import { getChartElementSettings } from "../chart-elements";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  drawing: SheetChartDrawing;
  sheet: Sheet;
  evaluator: SheetEvaluator;
  resolveSheet?: (sheetId: string) => Sheet | undefined;
  revision: number;
}>();
const { t } = useAppI18n();
const root = ref<HTMLElement>();
let chart: EChartsType | undefined;
let observer: ResizeObserver | undefined;
const result = computed(() => {
  void props.revision;
  try {
    const data = getSheetChartData(
      props.sheet,
      props.drawing.chart,
      props.evaluator,
      props.resolveSheet,
    );
    return {
      data,
      invalid: Boolean(
        data.diagnostics?.some(
          (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
        ),
      ),
    };
  } catch {
    return { data: { categories: [], series: [], records: [] }, invalid: true };
  }
});
const data = computed(() => result.value.data);
const error = ref(false);
function render() {
  if (!root.value || props.drawing.chart.type === "wordCloud") {
    chart?.dispose();
    chart = undefined;
    return;
  }
  try {
    chart ??= init(root.value, undefined, {
      renderer: "svg",
      width: props.drawing.width,
      height: props.drawing.height,
    });
    chart.resize({ width: props.drawing.width, height: props.drawing.height });
    if (result.value.invalid) {
      chart.clear();
      error.value = false;
      return;
    }
    chart.setOption(
      createChartOption(props.drawing.chart, data.value, {
        width: props.drawing.width,
        height: props.drawing.height,
      }),
      { notMerge: true },
    );
    error.value = false;
  } catch {
    error.value = true;
  }
}
const wordTitle = computed(() => {
  const position = getChartElementSettings(props.drawing.chart).titlePosition;
  return {
    show: position !== "none",
    // Preserve the original word layout until a title placement is explicitly chosen.
    offset:
      props.drawing.chart.elements?.titlePosition === undefined
        ? 30
        : position === "above" && props.drawing.chart.title
          ? Math.min(30, props.drawing.height * 0.24)
          : 0,
  };
});
const words = computed(() => {
  const source = data.value.categories
    .map((text, index) => ({ text, value: data.value.series[0]?.values[index] ?? 0 }))
    .filter((word) => word.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 100);
  const columns = Math.max(
    1,
    Math.ceil(Math.sqrt((source.length * props.drawing.width) / Math.max(1, props.drawing.height))),
  );
  const rows = Math.ceil(source.length / columns);
  const width = props.drawing.width / columns;
  const height = Math.max(
    1,
    (props.drawing.height - wordTitle.value.offset - 5) / Math.max(1, rows),
  );
  const max = source[0]?.value ?? 1;
  return source.map((word, index) => ({
    ...word,
    x: ((index % columns) + 0.5) * width,
    y: (Math.floor(index / columns) + 0.5) * height + wordTitle.value.offset,
    size: Math.max(
      6,
      Math.min(
        height * 0.8,
        (width / Math.max(1, [...word.text].length)) * 1.5,
        12 + 36 * Math.sqrt(word.value / max),
      ),
    ),
    color: ["#2563eb", "#16a34a", "#8b5cf6", "#ef4444", "#f59e0b"][index % 5],
  }));
});
onMounted(() => {
  render();
  observer = new ResizeObserver(render);
  if (root.value) observer.observe(root.value);
});
watch([() => props.drawing, result], render, { deep: true, flush: "post" });
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <div class="chart-content">
    <svg
      v-if="drawing.chart.type === 'wordCloud'"
      :viewBox="`0 0 ${drawing.width} ${drawing.height}`"
      width="100%"
      height="100%"
      role="img"
      :aria-label="drawing.chart.title"
    >
      <rect width="100%" height="100%" fill="white" />
      <text v-if="wordTitle.show" :x="drawing.width / 2" y="22" text-anchor="middle" font-size="15">
        {{ drawing.chart.title }}
      </text>
      <text
        v-for="(word, index) in words"
        :key="index"
        :x="word.x"
        :y="word.y"
        :font-size="word.size"
        :fill="word.color"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ word.text }}
        <title>{{ word.text }}: {{ word.value }}</title>
      </text>
    </svg>
    <div v-else ref="root" class="chart-content__canvas" />
    <div
      v-if="
        (!drawing.chart.source && !drawing.chart.range && !drawing.chart.dataCache) ||
        error ||
        result.invalid
      "
      class="chart-content__error"
      role="status"
    >
      {{ t("chart.invalidSource") }}
    </div>
  </div>
</template>
<style scoped lang="scss">
.chart-content {
  width: 100%;
  height: 100%;
  position: relative;
  background: white;
  &__canvas {
    width: 100%;
    height: 100%;
  }
  &__error {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #b91c1c;
    background: white;
    padding: 16px;
    text-align: center;
  }
}
</style>
