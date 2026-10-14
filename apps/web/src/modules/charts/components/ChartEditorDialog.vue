<script setup lang="ts">
import { ref, computed } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
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
import ChartElementsControls from "./ChartElementsControls.vue";
import type { ChartElementPatch } from "../chart-element-controls";
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
const draft = ref<SheetChartDrawing>({
  ...props.drawing,
  chart: {
    ...props.drawing.chart,
    ...(props.drawing.chart.elements ? { elements: { ...props.drawing.chart.elements } } : {}),
  },
});
const elementsControls = ref<InstanceType<typeof ChartElementsControls>>();
function patchElements(patch: ChartElementPatch): void {
  if (props.disabled) return;
  draft.value.chart = {
    ...draft.value.chart,
    ...patch,
    ...(patch.elements ? { elements: { ...patch.elements } } : {}),
  };
}
function confirm(): void {
  if (props.disabled) return;
  if (elementsControls.value?.commitTitle() === false) return;
  emit("confirm", draft.value, source.value);
}
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
      range: draft.value.chart.pivotTableId
        ? draft.value.chart.range
        : resolved?.sheetId === props.sheet.id
          ? resolved.range
          : null,
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
    width="min(620px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="chart-editor">
      <p v-if="draft.chart.pivotTableId">
        {{ t("pivot.cachedChart") }}
        <Button
          size="small"
          :disabled="disabled"
          @click="emit('editPivot', draft.chart.pivotTableId)"
          >{{ t("pivot.edit") }}</Button
        >
      </p>
      <p v-if="draft.chart.dataCache">
        {{ t("chart.cachedSourceHint") }}
        <Button size="small" :disabled="disabled" @click="draft.chart.dataCache = undefined">{{
          t("chart.linkSource")
        }}</Button>
      </p>
      <label
        >{{ t("chart.source")
        }}<RangeReferenceInput
          v-model="source"
          :disabled="disabled || !!draft.chart.pivotTableId || !!draft.chart.dataCache"
          :label="t('chart.source')"
          :select-reference="selectReference"
      /></label>
      <div class="chart-editor__field">
        <span>{{ t("chart.type") }}</span>
        <Select
          v-model="draft.chart.type"
          :options="options"
          :disabled="disabled"
          :aria-label="t('chart.type')"
        />
      </div>
      <div class="chart-editor__row">
        <Checkbox
          v-model="draft.chart.headerRow"
          :disabled="disabled || !!draft.chart.pivotTableId || !!draft.chart.dataCache"
          >{{
            t(draft.chart.seriesBy === "rows" ? "chart.headerRowCategories" : "chart.headerRow")
          }}</Checkbox
        ><Checkbox
          v-model="draft.chart.headerColumn"
          :disabled="disabled || !!draft.chart.pivotTableId || !!draft.chart.dataCache"
          >{{
            t(draft.chart.seriesBy === "rows" ? "chart.headerColumnSeries" : "chart.headerColumn")
          }}</Checkbox
        ><Checkbox
          :checked="draft.chart.seriesBy === 'rows'"
          :disabled="disabled || !!draft.chart.pivotTableId || !!draft.chart.dataCache"
          @change="draft.chart.seriesBy = $event ? 'rows' : 'columns'"
          >{{ t("chart.seriesByRows") }}</Checkbox
        >
      </div>
      <div class="chart-editor__row">
        <Checkbox
          v-model="draft.chart.showHidden"
          :disabled="disabled || !!draft.chart.dataCache"
          >{{ t("chart.showHidden") }}</Checkbox
        >
      </div>
      <ChartElementsControls
        ref="elementsControls"
        :chart="draft.chart"
        :disabled="disabled"
        @patch="patchElements"
      />
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
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  > label,
  &__field {
    display: flex;
    align-items: center;
    gap: 12px;
    > :first-child {
      white-space: nowrap;
    }
    > :last-child {
      flex: 1;
      min-width: 0;
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
