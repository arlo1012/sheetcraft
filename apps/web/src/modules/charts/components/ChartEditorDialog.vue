<script setup lang="ts">
import { ref, computed } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartType } from "@sheetcraft/core/sheet-charts";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";
import ChartContent from "./ChartContent.vue";
const props = defineProps<{
  drawing: SheetChartDrawing;
  sheet: Sheet;
  workbook: Workbook;
  evaluator: SheetEvaluator;
  revision: number;
  disabled: boolean;
  error: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  editPivot: [id: string];
  confirm: [drawing: SheetChartDrawing, source: string];
  close: [];
}>();
const { t } = useAppI18n();
const draft = ref<SheetChartDrawing>({ ...props.drawing, chart: { ...props.drawing.chart } });
const source = ref(
  props.drawing.chart.range
    ? formatRangeReference(props.sheet.name, props.drawing.chart.range)
    : "",
);
const previewDrawing = computed(() => {
  const resolved = resolveRangeReference(props.workbook, source.value, props.sheet.id);
  return {
    ...draft.value,
    width: 540,
    height: 260,
    chart: {
      ...draft.value.chart,
      range: resolved?.sheetId === props.sheet.id ? resolved.range : null,
    },
  };
});
const types: ChartType[] = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
];
const options = computed(() => types.map((type) => ({ label: t(`chart.${type}`), value: type })));
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t('chart.edit')"
    width="620px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft, source)"
    @close="emit('close')"
  >
    <div class="chart-editor">
      <p v-if="draft.chart.pivotTableId">
        {{ t("pivot.cachedChart") }}
        <Button size="small" @click="emit('editPivot', draft.chart.pivotTableId)">{{
          t("pivot.edit")
        }}</Button>
      </p>
      <p v-if="draft.chart.dataCache">
        {{ t("chart.cachedSourceHint") }}
        <Button size="small" @click="draft.chart.dataCache = undefined">{{
          t("chart.linkSource")
        }}</Button>
      </p>
      <label
        >{{ t("chart.source")
        }}<RangeReferenceInput
          v-model="source"
          :disabled="!!draft.chart.pivotTableId || !!draft.chart.dataCache"
          :label="t('chart.source')"
          :select-reference="selectReference"
      /></label>
      <label>{{ t("chart.type") }}<Select v-model="draft.chart.type" :options="options" /></label>
      <label>{{ t("chart.title") }}<Input v-model="draft.chart.title" :maxlength="1000" /></label>
      <div class="chart-editor__row">
        <Checkbox
          v-model="draft.chart.headerRow"
          :disabled="!!draft.chart.pivotTableId || !!draft.chart.dataCache"
          >{{ t("chart.headerRow") }}</Checkbox
        ><Checkbox
          v-model="draft.chart.headerColumn"
          :disabled="!!draft.chart.pivotTableId || !!draft.chart.dataCache"
          >{{ t("chart.headerColumn") }}</Checkbox
        ><Checkbox
          :checked="draft.chart.seriesBy === 'rows'"
          :disabled="!!draft.chart.pivotTableId || !!draft.chart.dataCache"
          @change="draft.chart.seriesBy = $event ? 'rows' : 'columns'"
          >{{ t("chart.seriesByRows") }}</Checkbox
        >
      </div>
      <div class="chart-editor__row">
        <Checkbox v-model="draft.chart.legend">{{ t("chart.legend") }}</Checkbox
        ><Checkbox v-model="draft.chart.labels">{{ t("chart.labels") }}</Checkbox
        ><Checkbox v-model="draft.chart.stacked">{{ t("chart.stacked") }}</Checkbox
        ><Checkbox v-model="draft.chart.showHidden" :disabled="!!draft.chart.dataCache">{{
          t("chart.showHidden")
        }}</Checkbox>
      </div>
      <p v-if="!draft.chart.dataCache" class="chart-editor__hint">
        {{
          t(
            draft.chart.pivotTableId
              ? "chart.pivotSourceHint"
              : draft.chart.type === "sankey"
                ? "chart.sankeyHint"
                : draft.chart.type === "scatter"
                  ? "chart.scatterHint"
                  : "chart.sourceHint",
          )
        }}
      </p>
      <p v-if="error" class="chart-editor__error" role="alert">{{ t("chart.invalidSource") }}</p>
      <div class="chart-editor__preview">
        <ChartContent
          :drawing="previewDrawing"
          :sheet="sheet"
          :evaluator="evaluator"
          :revision="revision"
        />
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.chart-editor {
  display: grid;
  gap: 12px;
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    > :last-child {
      flex: 1;
    }
  }
  &__row {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  &__preview {
    width: 100%;
    height: 260px;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-default);
  }
  &__hint,
  &__error {
    margin: 0;
    font-size: 12px;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-color-error);
  }
}
</style>
