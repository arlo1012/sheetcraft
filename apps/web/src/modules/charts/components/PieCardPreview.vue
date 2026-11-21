<script lang="ts">
type CachedPiePreview = { key: string; url: string };
const previewCache = new WeakMap<PieCard, Map<boolean, CachedPiePreview>>();
</script>
<script setup lang="ts">
import { computed } from "vue";
import { rotateChartPalette, type PieFamily } from "@sheetcraft/core/chart-presentation";
import type { SheetChart, ChartData } from "@sheetcraft/core/sheet-charts";
import type { PieCard } from "../chart-pie-cards";
import { pieChartOption } from "../chart-pie";
import { init } from "../chart-runtime";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  family: PieFamily;
  card: PieCard;
  index: number;
  themeColors: readonly string[];
  followTheme: boolean;
}>();
const { t, locale } = useAppI18n();
const size = { width: 320, height: 178 };
const src = computed(() => {
  const first = props.index === 0;
  const sample = first
    ? [34, 66]
    : props.family === "pieOfPie" || props.family === "barOfPie"
      ? [28, 21, 16, 14, 12, 9]
      : [35, 27, 19, 12, 7];
  const categories = sample.map((_, i) => t("chart.pieMenu.sampleCategory", { index: i + 1 }));
  const data: ChartData = { categories, series: [{ name: "", values: sample }], records: [] };
  const colors = props.followTheme
    ? rotateChartPalette(props.themeColors, props.index % 6)
    : props.card.colors;
  const key = `${locale.value}|${colors.join(",")}`;
  let cache = previewCache.get(props.card);
  if (!cache) {
    cache = new Map();
    previewCache.set(props.card, cache);
  }
  const cached = cache.get(props.followTheme);
  if (cached?.key === key) return cached.url;
  const chart: SheetChart = {
    type: props.family === "doughnut" ? "doughnut" : "pie",
    range: null,
    title: first ? t("chart.defaultTitle") : "",
    legend: first,
    labels: props.card.labels !== "none",
    headerRow: false,
    headerColumn: false,
    seriesBy: "columns",
    stacked: false,
    showHidden: false,
    presentation: {
      ...props.card.format,
      ...(props.card.labels === "none" ? {} : { pieLabels: props.card.labels }),
      ...(props.family === "pie" || props.family === "doughnut" ? {} : { pieStyle: props.family }),
    },
  };
  const option = pieChartOption(
    chart,
    data,
    {
      animation: false,
      color: colors,
      tooltip: { show: false },
      legend: {
        show: first,
        top: 20,
        left: "center",
        itemWidth: 8,
        itemHeight: 5,
        textStyle: { fontSize: 8 },
      },
      title: {
        text: chart.title,
        top: 1,
        left: "center",
        textStyle: { fontSize: 12, fontWeight: "normal" },
      },
      textStyle: { fontFamily: "Arial, sans-serif", fontSize: 11 },
    },
    colors,
    size,
    { left: 6, right: 6, top: first ? 35 : 5, bottom: 4 },
  );
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...size });
  try {
    instance.setOption(option);
    const url =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(instance.renderToSVGString());
    cache.set(props.followTheme, { key, url });
    return url;
  } finally {
    instance.dispose();
  }
});
</script>
<template><img :src="src" alt="" class="pie-card-preview" width="320" height="178" /></template>
<style scoped>
.pie-card-preview {
  width: 100%;
  height: auto;
  display: block;
}
</style>
