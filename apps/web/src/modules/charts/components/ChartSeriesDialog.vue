<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { SquareMousePointer } from "lucide-vue-next";
import type { ChartSourceSeries } from "@sheetcraft/core/chart-source";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import {
  formatChartSourceName,
  formatChartSourceValues,
  getEditableChartSource,
  parseChartSourceName,
  parseChartSourceValues,
  readChartSourcePreview,
  type ChartSourceReferencePicker,
  type ChartSourceReferenceRole,
} from "../chart-source-editor";

const props = defineProps<{
  entry: ChartSourceSeries;
  chart: SheetChart;
  sheet: Sheet;
  workbook: Workbook;
  evaluator: SheetEvaluator;
  revision: number;
  disabled: boolean;
  adding: boolean;
  suspended?: boolean;
  ownerValid: () => boolean;
  apply: (entry: ChartSourceSeries) => boolean;
  selectReference?: ChartSourceReferencePicker;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement>();
const nameText = ref(formatChartSourceName(props.workbook, props.entry.name));
const valuesText = ref(formatChartSourceValues(props.workbook, props.entry.values));
const attempted = ref(false);
const feedback = ref(false);
const compositionBlocked = ref(false);
let composing = false;
let alive = true;
let pickerEpoch = 0;
const candidate = computed(() => {
  const name = parseChartSourceName(props.workbook, nameText.value, props.sheet.id);
  const values = parseChartSourceValues(props.workbook, valuesText.value, props.sheet.id);
  return name && values ? { ...props.entry, name, values } : undefined;
});
const preview = computed(() => {
  void props.revision;
  if (!candidate.value) return undefined;
  try {
    const source = getEditableChartSource(props.sheet.id, props.chart, props.sheet);
    const index = source.series.findIndex((entry) => entry.id === props.entry.id);
    if (index < 0) source.series.push(candidate.value);
    else source.series[index] = candidate.value;
    return readChartSourcePreview(
      props.sheet,
      { ...props.chart, range: null, source },
      props.evaluator,
      props.workbook,
    );
  } catch {
    return undefined;
  }
});
const resolved = computed(() =>
  preview.value?.data.series.find((entry) => entry.id === props.entry.id),
);
const invalid = computed(() => !candidate.value || !preview.value || preview.value.invalid);
function current(): boolean {
  return alive && !props.disabled && props.ownerValid();
}
function syncInputs(): void {
  const name = root.value?.querySelector<HTMLInputElement>("[data-series-name] input");
  const values = root.value?.querySelector<HTMLInputElement>("[data-series-values] input");
  if (name) nameText.value = name.value;
  if (values) valuesText.value = values.value;
}
function confirm(_value?: unknown, context?: { e: KeyboardEvent }): void {
  if (!current()) return;
  if (composing || context?.e.isComposing) {
    compositionBlocked.value = true;
    return;
  }
  syncInputs();
  attempted.value = true;
  if (invalid.value || !candidate.value) return;
  if (!props.apply(candidate.value)) {
    feedback.value = true;
    return;
  }
  close();
}
function close(): void {
  if (!alive) return;
  alive = false;
  pickerEpoch++;
  emit("close");
}
function compositionStart(): void {
  composing = true;
}
function compositionEnd(): void {
  composing = false;
  compositionBlocked.value = false;
  syncInputs();
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (composing || event.isComposing || event.keyCode === 229)) {
    event.stopImmediatePropagation();
  }
}
async function pick(role: ChartSourceReferenceRole): Promise<void> {
  if (!current() || !props.selectReference || composing) return;
  syncInputs();
  const target = role === "series-name" ? nameText : valuesText;
  const before = target.value;
  const epoch = ++pickerEpoch;
  const selected = await props.selectReference(before, role);
  if (!current() || epoch !== pickerEpoch || selected === undefined || target.value !== before)
    return;
  // A picker replaces the complete field; a previous caret/selection must never append an old reference.
  target.value = selected;
  attempted.value = false;
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) pickerEpoch++;
  },
);
onBeforeUnmount(() => {
  alive = false;
  pickerEpoch++;
});
</script>

<template>
  <Dialog
    :visible="!suspended"
    :header="t(adding ? 'chart.sourceAddSeries' : 'chart.sourceEditSeries')"
    width="min(660px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="close"
  >
    <div
      ref="root"
      class="chart-series-editor"
      data-chart-series-dialog
      @compositionstart.capture="compositionStart"
      @compositionend.capture="compositionEnd"
      @keydown.capture="keydown"
    >
      <div class="chart-series-editor__field" data-series-name>
        <label class="chart-series-editor__control"
          ><span class="chart-series-editor__label">{{ t("chart.sourceSeriesName") }}</span>
          <Input
            v-model="nameText"
            :disabled="disabled"
            :aria-label="t('chart.sourceSeriesName')"
            autocomplete="off"
            @enter="confirm"
            @blur="syncInputs"
          >
            <template v-if="selectReference" #suffixIcon>
              <Button
                size="small"
                variant="text"
                :disabled="disabled"
                :aria-label="t('chart.sourcePickName')"
                @click.stop="pick('series-name')"
                ><template #icon
                  ><SquareMousePointer
                    class="sheetcraft-action-icon"
                    aria-hidden="true" /></template
              ></Button>
            </template> </Input
        ></label>
        <p class="chart-series-editor__hint">{{ t("chart.sourceNameHint") }}</p>
        <p class="chart-series-editor__resolved" data-series-name-preview>
          {{ resolved?.name ?? t("chart.sourcePreviewUnavailable") }}
        </p>
      </div>
      <div class="chart-series-editor__field" data-series-values>
        <label class="chart-series-editor__control"
          ><span class="chart-series-editor__label">{{ t("chart.sourceSeriesValues") }}</span>
          <Input
            v-model="valuesText"
            :disabled="disabled"
            :aria-label="t('chart.sourceSeriesValues')"
            autocomplete="off"
            @enter="confirm"
            @blur="syncInputs"
          >
            <template v-if="selectReference" #suffixIcon>
              <Button
                size="small"
                variant="text"
                :disabled="disabled"
                :aria-label="t('chart.sourcePickValues')"
                @click.stop="pick('series-values')"
                ><template #icon
                  ><SquareMousePointer
                    class="sheetcraft-action-icon"
                    aria-hidden="true" /></template
              ></Button>
            </template> </Input
        ></label>
        <p class="chart-series-editor__hint">
          {{ t("chart.sourceValuesHint", { example: "={10,20,30}" }) }}
        </p>
        <p class="chart-series-editor__resolved" data-series-values-preview>
          {{
            resolved
              ? resolved.values
                  .slice(0, 24)
                  .map((value) => value ?? "∅")
                  .join(", ")
              : t("chart.sourcePreviewUnavailable")
          }}{{ resolved && resolved.values.length > 24 ? "…" : "" }}
        </p>
      </div>
      <p v-if="compositionBlocked" class="chart-series-editor__error" role="alert">
        {{ t("chart.sourceFinishComposition") }}
      </p>
      <p v-else-if="attempted && invalid" class="chart-series-editor__error" role="alert">
        {{ t("chart.sourceInvalidSeries") }}
      </p>
      <p v-else-if="feedback" class="chart-series-editor__error" role="alert">
        {{ t("chart.sourceApplyFailed") }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.chart-series-editor {
  display: grid;
  gap: 20px;
  max-height: calc(100vh - 190px);
  overflow-y: auto;
  &__field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  &__control {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  &__label {
    white-space: nowrap;
    font-weight: 500;
  }
  &__hint,
  &__resolved,
  &__error {
    margin: 0;
    font-size: 12px;
    line-height: 18px;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__resolved {
    padding: 8px 10px;
    background: var(--sheetcraft-surface-secondary);
    border-radius: var(--sheetcraft-radius-default);
    overflow-wrap: anywhere;
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
