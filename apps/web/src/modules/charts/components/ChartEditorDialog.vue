<script setup lang="ts">
import { ref, computed } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { normalizeSheetChart, type ChartType } from "@sheetcraft/core/sheet-charts";
import { reconcileChartRangeSeriesForRange } from "@sheetcraft/core/chart-range-series";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";
import ChartContent from "./ChartContent.vue";
import ChartElementsControls from "./ChartElementsControls.vue";
import ChartSubtypeControls from "./ChartSubtypeControls.vue";
import ChartStyleGallery from "./ChartStyleGallery.vue";
import {
  applyChartDesignIntent,
  changeChartType,
  getChartVariant,
  isCommonChartType,
  type ChartDesignIntent,
} from "../chart-design-intents";
import type { ChartElementPatch } from "../chart-element-controls";
import { getChartSourceApplicability } from "../chart-source-editor";
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
  chart: normalizeSheetChart(props.drawing.chart),
});
const elementsControls = ref<InstanceType<typeof ChartElementsControls>>();
function patchElements(patch: ChartElementPatch): void {
  if (props.disabled) return;
  const next = {
    ...draft.value.chart,
    ...patch,
    ...(patch.elements ? { elements: { ...patch.elements } } : {}),
  };
  if (patch.stacked === false && next.presentation?.percentStacked) {
    const presentation = { ...next.presentation };
    delete presentation.percentStacked;
    if (Object.keys(presentation).length) next.presentation = presentation;
    else delete next.presentation;
  }
  draft.value.chart = normalizeSheetChart(next);
}
const designFailed = ref(false);
const commonType = computed(() =>
  isCommonChartType(draft.value.chart.type) ? draft.value.chart.type : undefined,
);
function applyDesign(intent: ChartDesignIntent): boolean {
  if (props.disabled || elementsControls.value?.blockComposition()) return false;
  try {
    const next = applyChartDesignIntent(draft.value.chart, intent);
    const title = elementsControls.value?.pendingTitle();
    if (title !== undefined) next.title = title;
    draft.value.chart = normalizeSheetChart(next);
    designFailed.value = false;
    return true;
  } catch {
    designFailed.value = true;
    return false;
  }
}
function changeType(value: unknown): void {
  if (
    props.disabled ||
    typeof value !== "string" ||
    !types.includes(value as ChartType) ||
    elementsControls.value?.blockComposition()
  )
    return;
  const type = value as ChartType;
  if (
    draft.value.chart.source &&
    getChartSourceApplicability({ ...draft.value.chart, type }) !== "editable"
  )
    return;
  try {
    const next = changeChartType(draft.value.chart, type);
    const title = elementsControls.value?.pendingTitle();
    if (title !== undefined) next.title = title;
    draft.value.chart = normalizeSheetChart(next);
    designFailed.value = false;
  } catch {
    designFailed.value = true;
  }
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
    chart: reconcileChartRangeSeriesForRange(
      draft.value.chart,
      draft.value.chart.source
        ? null
        : draft.value.chart.pivotTableId
          ? draft.value.chart.range
          : resolved?.sheetId === props.sheet.id
            ? resolved.range
            : null,
    ),
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
const options = computed(() =>
  types.map((type) => ({
    label: t(`chart.${type}`),
    value: type,
    disabled:
      !!draft.value.chart.source &&
      getChartSourceApplicability({ ...draft.value.chart, type }) !== "editable",
  })),
);
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
    <div class="chart-editor" data-chart-tools-toolbar>
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
          :disabled="
            disabled ||
            !!draft.chart.pivotTableId ||
            !!draft.chart.dataCache ||
            !!draft.chart.source
          "
          :label="t('chart.source')"
          :select-reference="selectReference"
      /></label>
      <p v-if="draft.chart.source" class="chart-editor__hint">{{ t("chart.customSourceHint") }}</p>
      <div class="chart-editor__field">
        <span>{{ t("chart.type") }}</span>
        <Select
          :value="draft.chart.type"
          @change="changeType"
          :options="options"
          :popup-props="{ overlayClassName: 'chart-editor-options-popup' }"
          :disabled="disabled"
          :aria-label="t('chart.type')"
        />
      </div>
      <ChartSubtypeControls
        v-if="commonType"
        :type="commonType"
        :variant="getChartVariant(draft.chart)"
        :disabled="disabled"
        :apply="applyDesign"
      />
      <ChartStyleGallery :chart="draft.chart" :disabled="disabled" :apply="applyDesign" />
      <p v-if="designFailed" class="chart-editor__error" role="alert">
        {{ t("chart.designApplyFailed") }}
      </p>
      <div class="chart-editor__row">
        <Checkbox
          v-model="draft.chart.headerRow"
          :disabled="
            disabled ||
            !!draft.chart.pivotTableId ||
            !!draft.chart.dataCache ||
            !!draft.chart.source
          "
          >{{
            t(draft.chart.seriesBy === "rows" ? "chart.headerRowCategories" : "chart.headerRow")
          }}</Checkbox
        ><Checkbox
          v-model="draft.chart.headerColumn"
          :disabled="
            disabled ||
            !!draft.chart.pivotTableId ||
            !!draft.chart.dataCache ||
            !!draft.chart.source
          "
          >{{
            t(draft.chart.seriesBy === "rows" ? "chart.headerColumnSeries" : "chart.headerColumn")
          }}</Checkbox
        ><Checkbox
          :checked="draft.chart.seriesBy === 'rows'"
          :disabled="
            disabled ||
            !!draft.chart.pivotTableId ||
            !!draft.chart.dataCache ||
            !!draft.chart.source
          "
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
          :resolve-sheet="(sheetId) => workbook.sheets.get(sheetId)"
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
