<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog, type DialogCloseContext } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  normalizeSheetChart,
  getSheetChartSourceData,
  type ChartType,
} from "@sheetcraft/core/sheet-charts";
import {
  normalizeChartComboSeriesChanges,
  type ChartComboSeriesChange,
  type ChartComboSeriesTarget,
} from "@sheetcraft/core/chart-combo";
import { reconcileChartRangeSeriesForRange } from "@sheetcraft/core/chart-range-series";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../../shared/range-reference/formatRangeReference";
import ChartContent from "./ChartContent.vue";
import ChartTypeNavigation from "./ChartTypeNavigation.vue";
import ChartSubtypeControls from "./ChartSubtypeControls.vue";
import ChartComboControls from "./ChartComboControls.vue";
import {
  applyChartDesignIntent,
  changeChartType,
  getChartVariant,
  isCommonChartType,
  type ChartDesignIntent,
} from "../chart-design-intents";
import { getChartSourceApplicability } from "../chart-source-editor";
const props = defineProps<{
  drawing: SheetChartDrawing;
  mode: "insert" | "change-type";
  sheet: Sheet;
  workbook: Workbook;
  evaluator: SheetEvaluator;
  revision: number;
  disabled: boolean;
  error: boolean;
  suspended: boolean;
  comboRecipe?: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  editPivot: [id: string];
  confirm: [drawing: SheetChartDrawing, source: string, comboChanges?: ChartComboSeriesChange[]];
  close: [];
}>();
const { t } = useAppI18n();
const draft = ref<SheetChartDrawing>({
  ...props.drawing,
  chart: normalizeSheetChart(props.drawing.chart),
});
const comboChanges = ref<ChartComboSeriesChange[]>([]);
const initialComboRecipePending = ref(props.comboRecipe === true);
const comboInitialized = ref(
  (props.drawing.chart.type === "combo" && !props.comboRecipe) ||
    !!props.drawing.chart.format?.series?.some((series) => series.drawType !== undefined),
);
const designFailed = ref(false);
const commonType = computed(() =>
  isCommonChartType(draft.value.chart.type) ? draft.value.chart.type : undefined,
);
function applyDesign(intent: ChartDesignIntent): boolean {
  if (props.disabled) return false;
  try {
    const next = applyChartDesignIntent(draft.value.chart, intent);
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
    (value === "combo" && !!(draft.value.chart.pivotTableId || draft.value.chart.dataCache))
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
    const previousType = draft.value.chart.type;
    draft.value.chart = normalizeSheetChart(next);
    if (type === "combo" && previousType !== "combo" && !comboInitialized.value) {
      initialComboRecipePending.value = true;
      applyComboRecipe();
    }
    designFailed.value = false;
  } catch {
    designFailed.value = true;
  }
}
function confirm(): void {
  if (props.disabled) return;
  emit(
    "confirm",
    draft.value,
    source.value,
    draft.value.chart.type === "combo" && activeComboChanges.value.length
      ? normalizeChartComboSeriesChanges(activeComboChanges.value)
      : undefined,
  );
}
const source = ref(
  props.drawing.chart.range
    ? formatRangeReference(props.sheet.name, props.drawing.chart.range)
    : "",
);
const previewElement = ref<HTMLElement>();
const previewSize = ref({ width: 600, height: 340 });
let previewObserver: ResizeObserver | undefined;
watch(
  previewElement,
  (element) => {
    previewObserver?.disconnect();
    if (!element || typeof ResizeObserver === "undefined") return;
    previewObserver = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0)
        previewSize.value = { width: entry.contentRect.width, height: entry.contentRect.height };
    });
    previewObserver.observe(element);
  },
  { flush: "post" },
);
onBeforeUnmount(() => previewObserver?.disconnect());
const previewDrawing = computed(() => {
  const resolved = resolveRangeReference(props.workbook, source.value, props.sheet.id);
  return {
    ...draft.value,
    width: previewSize.value.width,
    height: previewSize.value.height,
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
const previewStatus = computed<"ready" | "empty" | "invalid">(() => {
  void props.revision;
  try {
    const chart = previewDrawing.value.chart;
    if (!chart.pivotTableId && !chart.dataCache && !chart.source) {
      const range = resolveRangeReference(props.workbook, source.value, props.sheet.id);
      if (!range || range.sheetId !== props.sheet.id) return "invalid";
    }
    const data = getSheetChartSourceData(props.sheet, chart, props.evaluator, (id) =>
      props.workbook.sheets.get(id),
    );
    if (
      data.diagnostics?.some(
        (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
      )
    )
      return "invalid";
    const available =
      chart.type === "sankey"
        ? data.records.some((record) => typeof record[2] === "number" && Number.isFinite(record[2]))
        : data.series.some((series) =>
            series.values.some((value) => typeof value === "number" && Number.isFinite(value)),
          );
    return available ? "ready" : "empty";
  } catch {
    return "invalid";
  }
});
// Combo controls always read every physical/defined series, including hidden ones.
// Conversion here is detached and never plans identities or rewrites the source.
const comboSeries = computed(() => {
  void props.revision;
  try {
    const chart = previewDrawing.value.chart;
    if (chart.pivotTableId || chart.dataCache) return [];
    return getSheetChartSourceData(
      props.sheet,
      { ...changeChartType(chart, "combo"), showHidden: true },
      props.evaluator,
      (sheetId) => props.workbook.sheets.get(sheetId),
    ).series;
  } catch {
    return [];
  }
});
function comboTargetKey(target: ChartComboSeriesTarget): string {
  return "rangeBand" in target
    ? `band:${target.rangeBand.seriesBy}:${target.rangeBand.index}`
    : `id:${target.seriesId}`;
}
const comboTargets = computed<ChartComboSeriesTarget[]>(() =>
  comboSeries.value.flatMap<ChartComboSeriesTarget>((series) =>
    series.rangeBand
      ? [{ rangeBand: { ...series.rangeBand } }]
      : series.id
        ? [{ seriesId: series.id }]
        : [],
  ),
);
const comboAvailable = computed(
  () =>
    !draft.value.chart.pivotTableId &&
    !draft.value.chart.dataCache &&
    comboSeries.value.length <= 256 &&
    comboTargets.value.length === comboSeries.value.length,
);
const activeComboChanges = computed(() => {
  const keys = new Set(comboTargets.value.map(comboTargetKey));
  return comboChanges.value.filter((change) => keys.has(comboTargetKey(change)));
});
function patchCombo(change: ChartComboSeriesChange): void {
  if (props.disabled || !comboAvailable.value) return;
  try {
    const key = comboTargetKey(change);
    if (!comboTargets.value.some((target) => comboTargetKey(target) === key)) return;
    const next = normalizeChartComboSeriesChanges([
      ...activeComboChanges.value.filter((entry) => comboTargetKey(entry) !== key),
      change,
    ]);
    comboChanges.value = next;
    comboInitialized.value = true;
    initialComboRecipePending.value = false;
    designFailed.value = false;
  } catch {
    designFailed.value = true;
  }
}
function applyComboRecipe(): boolean {
  if (props.disabled || !comboAvailable.value || comboTargets.value.length < 2) return false;
  comboChanges.value = normalizeChartComboSeriesChanges(
    comboTargets.value.map((target, index) => ({
      ...target,
      drawType: index === 0 ? "column" : "line",
      axis: "primary",
      markers: false,
    })),
  );
  comboInitialized.value = true;
  initialComboRecipePending.value = false;
  designFailed.value = false;
  return true;
}
watch(
  comboTargets,
  () => {
    if (initialComboRecipePending.value && draft.value.chart.type === "combo") applyComboRecipe();
  },
  { immediate: true },
);
const types: ChartType[] = [
  "column",
  "bar",
  "line",
  "combo",
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
function typeDisabled(type: ChartType): boolean {
  return (
    props.disabled ||
    (type === "combo" && !!(draft.value.chart.pivotTableId || draft.value.chart.dataCache)) ||
    (!!draft.value.chart.source &&
      getChartSourceApplicability({ ...draft.value.chart, type }) !== "editable")
  );
}
const selectedSubtype = computed(() => {
  const type = commonType.value;
  if (!type) return t(`chart.${draft.value.chart.type}`);
  const variant = getChartVariant(draft.value.chart) ?? "standard";
  if (type === "line") return t(`chart.variant.line.${variant}`);
  const commonVariant =
    variant === "stacked"
      ? "stacked"
      : variant === "percentStacked"
        ? "percentStacked"
        : "standard";
  return t(`chart.variant.${type}.${commonVariant}`);
});
const sourceOpen = ref(false);
const sourceEditor = ref<HTMLElement>();
const sourceTrigger = ref<InstanceType<typeof Button>>();
let sourceSnapshot:
  | {
      chart: SheetChartDrawing["chart"];
      source: string;
      comboChanges: ChartComboSeriesChange[];
      comboInitialized: boolean;
      recipePending: boolean;
    }
  | undefined;
function openSource(): void {
  if (props.disabled) return;
  sourceSnapshot = {
    chart: normalizeSheetChart(draft.value.chart),
    source: source.value,
    comboChanges: normalizeChartComboSeriesChanges(comboChanges.value),
    comboInitialized: comboInitialized.value,
    recipePending: initialComboRecipePending.value,
  };
  sourceOpen.value = true;
  void nextTick(() => sourceEditor.value?.querySelector<HTMLInputElement>("input")?.focus());
}
function finishSource(accept: boolean): void {
  if (!sourceOpen.value || (accept && props.disabled)) return;
  if (!accept && sourceSnapshot) {
    draft.value.chart = sourceSnapshot.chart;
    source.value = sourceSnapshot.source;
    comboChanges.value = sourceSnapshot.comboChanges;
    comboInitialized.value = sourceSnapshot.comboInitialized;
    initialComboRecipePending.value = sourceSnapshot.recipePending;
  }
  sourceSnapshot = undefined;
  sourceOpen.value = false;
  void nextTick(() => {
    const element = sourceTrigger.value?.$el;
    if (element instanceof HTMLElement) element.focus();
  });
}
const sourceLocked = computed(
  () =>
    props.disabled ||
    !!draft.value.chart.pivotTableId ||
    !!draft.value.chart.dataCache ||
    !!draft.value.chart.source,
);
const rectangularSource = computed(
  () =>
    !draft.value.chart.pivotTableId && !draft.value.chart.dataCache && !draft.value.chart.source,
);
function confirmStep(): void {
  if (sourceOpen.value) finishSource(true);
  else confirm();
}
function closeDialog(context: DialogCloseContext): void {
  if (sourceOpen.value && context.trigger === "cancel") finishSource(false);
  else emit("close");
}
function onDialogKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.defaultPrevented) return;
  if (event.key === "Escape" && sourceOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    finishSource(false);
  }
}
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t(mode === 'change-type' ? 'chart.changeType' : 'chart.insertDialog')"
    width="min(880px, calc(100vw - 32px))"
    class="chart-type-dialog"
    :top="'max(16px, calc((100vh - 640px) / 2))'"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!sourceOpen"
    :confirm-on-enter="false"
    :confirm-btn="{
      content: t(sourceOpen ? 'chart.backToPreview' : 'picture.confirm'),
      theme: 'primary',
      variant: 'base',
      disabled,
    }"
    :cancel-btn="{ content: t('picture.cancel'), theme: 'default', variant: 'base' }"
    @confirm="confirmStep"
    @close="closeDialog"
    @keydown="onDialogKeydown"
  >
    <div class="chart-selector" data-chart-tools-toolbar>
      <ChartTypeNavigation
        :value="draft.chart.type"
        :disabled="(type) => sourceOpen || typeDisabled(type)"
        @select="changeType"
      />
      <section v-if="!sourceOpen" class="chart-selector__main" :aria-label="t('chart.type')">
        <div class="chart-selector__subtypes">
          <ChartSubtypeControls
            v-if="commonType"
            presentation="dialog"
            :type="commonType"
            :variant="getChartVariant(draft.chart)"
            :disabled="disabled"
            :apply="applyDesign"
          />
          <div v-else class="chart-selector__single-type">
            <strong>{{ t(`chart.${draft.chart.type}`) }}</strong>
            <span v-if="draft.chart.type === 'combo'">{{ t("chart.comboHint") }}</span>
          </div>
        </div>
        <h3 class="chart-selector__preview-title" aria-live="polite">{{ selectedSubtype }}</h3>
        <div
          ref="previewElement"
          class="chart-selector__preview"
          :aria-label="t('chart.dataPreview')"
        >
          <p v-if="previewStatus !== 'ready'" class="chart-selector__empty" role="status">
            {{ t(previewStatus === "invalid" ? "chart.invalidSource" : "chart.previewNoData") }}
          </p>
          <ChartContent
            v-else
            :drawing="previewDrawing"
            :theme="workbook.theme"
            :combo-series-changes="activeComboChanges"
            :sheet="sheet"
            :evaluator="evaluator"
            :revision="revision"
            :resolve-sheet="(sheetId) => workbook.sheets.get(sheetId)"
          />
        </div>
        <div v-if="rectangularSource" class="chart-selector__range">
          <span>{{ t("chart.source") }}</span>
          <div class="chart-selector__source-controls">
            <RangeReferenceInput
              v-model="source"
              :disabled="disabled"
              :label="t('chart.source')"
              :select-reference="selectReference"
            />
            <Button
              ref="sourceTrigger"
              data-chart-select-data
              theme="default"
              variant="base"
              :disabled="disabled"
              @click="openSource"
              >{{ t("chart.selectData") }}</Button
            >
          </div>
        </div>
        <div v-else class="chart-selector__source-controls">
          <p class="chart-selector__hint">
            {{
              draft.chart.pivotTableId
                ? t("pivot.cachedChart")
                : draft.chart.dataCache
                  ? t("chart.cachedSourceHint")
                  : t("chart.customSourceHint")
            }}
          </p>
          <Button
            ref="sourceTrigger"
            data-chart-select-data
            theme="default"
            variant="base"
            :disabled="disabled"
            @click="openSource"
            >{{ t("chart.selectData") }}</Button
          >
        </div>
        <p v-if="draft.chart.type === 'combo' && !comboAvailable" class="chart-selector__hint">
          {{ t("chart.comboUnavailable") }}
        </p>
        <p v-if="designFailed" class="chart-selector__error" role="alert">
          {{ t("chart.designApplyFailed") }}
        </p>
        <p v-if="error" class="chart-selector__error" role="alert">
          {{ t("chart.invalidSource") }}
        </p>
      </section>
      <section
        v-else
        ref="sourceEditor"
        class="chart-selector__source-editor"
        :aria-label="t('chart.selectData')"
      >
        <h3>{{ t("chart.selectData") }}</h3>
        <p v-if="draft.chart.pivotTableId" class="chart-selector__hint">
          {{ t("pivot.cachedChart") }}
          <Button
            size="small"
            :disabled="disabled"
            @click="emit('editPivot', draft.chart.pivotTableId)"
            >{{ t("pivot.edit") }}</Button
          >
        </p>
        <p v-if="draft.chart.dataCache" class="chart-selector__hint">
          {{ t("chart.cachedSourceHint") }}
          <Button size="small" :disabled="disabled" @click="draft.chart.dataCache = undefined">{{
            t("chart.linkSource")
          }}</Button>
        </p>
        <div class="chart-selector__range">
          <span>{{ t("chart.source") }}</span>
          <RangeReferenceInput
            v-model="source"
            :disabled="sourceLocked"
            :label="t('chart.source')"
            :select-reference="selectReference"
          />
        </div>
        <p v-if="draft.chart.source" class="chart-selector__hint">
          {{ t("chart.customSourceHint") }}
        </p>
        <Checkbox v-model="draft.chart.headerRow" :disabled="sourceLocked">{{
          t(draft.chart.seriesBy === "rows" ? "chart.headerRowCategories" : "chart.headerRow")
        }}</Checkbox>
        <Checkbox v-model="draft.chart.headerColumn" :disabled="sourceLocked">{{
          t(draft.chart.seriesBy === "rows" ? "chart.headerColumnSeries" : "chart.headerColumn")
        }}</Checkbox>
        <Checkbox
          :checked="draft.chart.seriesBy === 'rows'"
          :disabled="sourceLocked"
          @change="draft.chart.seriesBy = $event ? 'rows' : 'columns'"
          >{{ t("chart.seriesByRows") }}</Checkbox
        >
        <Checkbox
          v-model="draft.chart.showHidden"
          :disabled="disabled || !!draft.chart.dataCache"
          >{{ t("chart.showHidden") }}</Checkbox
        >
        <ChartComboControls
          v-if="draft.chart.type === 'combo' && comboAvailable"
          :chart="previewDrawing.chart"
          :series="comboSeries"
          :changes="activeComboChanges"
          :disabled="disabled"
          @change="patchCombo"
          @recipe="applyComboRecipe"
        />
        <p v-else-if="draft.chart.type === 'combo'" class="chart-selector__hint">
          {{ t("chart.comboUnavailable") }}
        </p>
        <p v-if="!draft.chart.dataCache" class="chart-selector__hint">
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
      </section>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.chart-selector {
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr);
  gap: 16px;
  height: min(530px, calc(100dvh - 160px));
  min-height: 240px;
  overflow: hidden;
  &__main {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 12px;
  }
  &__subtypes {
    flex: 0 0 auto;
    min-width: 0;
    max-height: 146px;
    overflow-y: auto;
  }
  &__single-type {
    display: grid;
    gap: 5px;
    padding: 7px 4px;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    span {
      color: var(--sheetcraft-text-secondary);
      font-size: var(--sheetcraft-font-size-body-medium);
      line-height: var(--sheetcraft-line-height-body-medium);
    }
  }
  &__preview-title {
    margin: 0;
    font-size: var(--sheetcraft-font-size-title-small);
    line-height: var(--sheetcraft-line-height-title-small);
    font-weight: var(--sheetcraft-font-weight-semibold);
  }
  &__preview {
    flex: 1 1 auto;
    min-height: 80px;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-subtle);
    background: #fff;
  }
  &__empty {
    display: grid;
    height: 100%;
    place-items: center;
    margin: 0;
    padding: 24px;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    text-align: center;
  }
  &__source-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  &__source-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 12px;
    overflow-y: auto;
    h3 {
      margin: 0;
      font-size: var(--sheetcraft-font-size-title-small);
      line-height: var(--sheetcraft-line-height-title-small);
    }
  }
  &__range {
    display: grid;
    gap: 4px;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
  }
  &__hint,
  &__error {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
@media (max-height: 550px) {
  .chart-selector {
    min-height: 180px;
    &__subtypes {
      max-height: 95px;
    }
  }
}
</style>
