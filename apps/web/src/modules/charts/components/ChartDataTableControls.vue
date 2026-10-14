<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import { useAppI18n } from "../../../shared/i18n";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";

type DataTableChoice = "none" | "withLegendKeys" | "withoutLegendKeys";
const props = defineProps<{
  chart: SheetChart;
  disabled: boolean;
  apply: (choice: DataTableChoice) => boolean;
}>();
const { t } = useAppI18n();
const failed = ref(false);
let active = true;
const supported = computed(
  () =>
    props.chart.type === "column" ||
    props.chart.type === "line" ||
    props.chart.type === "area" ||
    props.chart.type === "combo",
);
const selected = computed(() => props.chart.elements?.dataTable ?? "none");
watch(
  () => [props.chart, props.chart.type, props.apply],
  () => {
    failed.value = false;
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  active = false;
});
const actions = computed(() => {
  const chart = props.chart,
    type = props.chart.type,
    apply = props.apply;
  const current = () =>
    active &&
    !props.disabled &&
    supported.value &&
    props.chart === chart &&
    props.chart.type === type &&
    props.apply === apply;
  function choice(value: DataTableChoice) {
    return (event: MouseEvent | KeyboardEvent): void => {
      if (!current() || (event instanceof KeyboardEvent && (event.repeat || event.isComposing)))
        return;
      let accepted = false;
      try {
        accepted = apply(value);
      } catch {
        accepted = false;
      }
      if (current()) failed.value = !accepted;
    };
  }
  return {
    none: choice("none"),
    withLegendKeys: choice("withLegendKeys"),
    withoutLegendKeys: choice("withoutLegendKeys"),
  };
});
</script>

<template>
  <div class="chart-data-table-controls" role="group" :aria-label="t('chart.dataTable')">
    <ul class="chart-data-table-controls__choices" role="presentation">
      <MenuRadioItem
        :checked="selected === 'none'"
        :disabled="disabled || !supported"
        data-chart-data-table="none"
        @select="actions.none"
      >
        {{ t("chart.dataTableNone") }}
      </MenuRadioItem>
      <MenuRadioItem
        :checked="selected === 'withLegendKeys'"
        :disabled="disabled || !supported"
        data-chart-data-table="withLegendKeys"
        @select="actions.withLegendKeys"
      >
        {{ t("chart.dataTableWithLegendKeys") }}
      </MenuRadioItem>
      <MenuRadioItem
        :checked="selected === 'withoutLegendKeys'"
        :disabled="disabled || !supported"
        data-chart-data-table="withoutLegendKeys"
        @select="actions.withoutLegendKeys"
      >
        {{ t("chart.dataTableWithoutLegendKeys") }}
      </MenuRadioItem>
    </ul>
    <p class="chart-data-table-controls__hint">
      {{ t(chart.type === "bar" ? "chart.dataTableBarHint" : "chart.dataTableHint") }}
    </p>
    <p v-if="failed" class="chart-data-table-controls__error" role="alert">
      {{ t("chart.dataTableApplyFailed") }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.chart-data-table-controls {
  max-width: min(340px, calc(100vw - 48px));

  &__choices {
    padding: 0;
    margin: 0;
    list-style: none;
  }

  &__hint,
  &__error {
    margin: 8px var(--sheetcraft-tool-panel-padding) 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }

  &__hint {
    color: var(--sheetcraft-text-secondary);
  }

  &__error {
    color: var(--sheetcraft-color-error);
  }
}
</style>
