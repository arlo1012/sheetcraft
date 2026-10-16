<script setup lang="ts">
import { computed } from "vue";
import {
  ChartColumn,
  ChartLine,
  ChartPie,
  CircleDot,
  ChartBar,
  ChartArea,
  ChartScatter,
  ChartNetwork,
  LayoutGrid,
  Layers,
  Waves,
  Type,
} from "lucide-vue-next";
import type { ChartType } from "@sheetcraft/core/sheet-charts";
import { useAppI18n } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";
import type { OptionListOption } from "../../../shared/option-list/option-list";
const props = defineProps<{ value: ChartType; disabled: (type: ChartType) => boolean }>();
const emit = defineEmits<{ select: [type: ChartType] }>();
const { t } = useAppI18n();
const options = computed<readonly OptionListOption<ChartType>[]>(() => [
  { value: "column", label: t("chart.column"), disabled: props.disabled("column") },
  { value: "line", label: t("chart.line"), disabled: props.disabled("line") },
  { value: "pie", label: t("chart.pie"), disabled: props.disabled("pie") },
  { value: "doughnut", label: t("chart.doughnut"), disabled: props.disabled("doughnut") },
  { value: "bar", label: t("chart.bar"), disabled: props.disabled("bar") },
  { value: "area", label: t("chart.area"), disabled: props.disabled("area") },
  { value: "scatter", label: t("chart.scatter"), disabled: props.disabled("scatter") },
  { value: "radar", label: t("chart.radar"), disabled: props.disabled("radar") },
  { value: "treemap", label: t("chart.treemap"), disabled: props.disabled("treemap") },
  { value: "combo", label: t("chart.comboCategory"), disabled: props.disabled("combo") },
  { value: "sankey", label: t("chart.sankey"), disabled: props.disabled("sankey") },
  { value: "river", label: t("chart.river"), disabled: props.disabled("river") },
  { value: "wordCloud", label: t("chart.wordCloud"), disabled: props.disabled("wordCloud") },
]);
function choose(type: ChartType): void {
  if (!props.disabled(type)) emit("select", type);
}
</script>
<template>
  <OptionList
    :model-value="value"
    :options="options"
    :label="t('chart.type')"
    variant="navigation"
    item-data-attribute="data-chart-type"
    @select="choose"
  >
    <template #icon="{ option }">
      <ChartColumn v-if="option.value === 'column'" aria-hidden="true" />
      <ChartLine v-else-if="option.value === 'line'" aria-hidden="true" />
      <ChartPie v-else-if="option.value === 'pie'" aria-hidden="true" />
      <CircleDot v-else-if="option.value === 'doughnut'" aria-hidden="true" />
      <ChartBar v-else-if="option.value === 'bar'" aria-hidden="true" />
      <ChartArea v-else-if="option.value === 'area'" aria-hidden="true" />
      <ChartScatter v-else-if="option.value === 'scatter'" aria-hidden="true" />
      <ChartNetwork v-else-if="option.value === 'radar'" aria-hidden="true" />
      <LayoutGrid v-else-if="option.value === 'treemap'" aria-hidden="true" />
      <Layers v-else-if="option.value === 'combo'" aria-hidden="true" />
      <ChartNetwork v-else-if="option.value === 'sankey'" aria-hidden="true" />
      <Waves v-else-if="option.value === 'river'" aria-hidden="true" />
      <Type v-else-if="option.value === 'wordCloud'" aria-hidden="true" />
    </template>
  </OptionList>
</template>
