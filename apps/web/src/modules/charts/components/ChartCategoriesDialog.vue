<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { SquareMousePointer } from "lucide-vue-next";
import type { ChartSourceCategories } from "@sheetcraft/core/chart-source";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import {
  formatChartSourceCategories,
  getEditableChartSource,
  parseChartSourceCategories,
  readChartSourcePreview,
  type ChartSourceReferencePicker,
} from "../chart-source-editor";

const props = defineProps<{
  categories: ChartSourceCategories;
  chart: SheetChart;
  sheet: Sheet;
  workbook: Workbook;
  evaluator: SheetEvaluator;
  revision: number;
  disabled: boolean;
  suspended?: boolean;
  ownerValid: () => boolean;
  apply: (categories: ChartSourceCategories) => boolean;
  selectReference?: ChartSourceReferencePicker;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement>();
const text = ref(formatChartSourceCategories(props.workbook, props.categories));
const attempted = ref(false);
const feedback = ref(false);
const compositionBlocked = ref(false);
let composing = false;
let alive = true;
let pickerEpoch = 0;
const candidate = computed(() =>
  parseChartSourceCategories(props.workbook, text.value, props.sheet.id),
);
const preview = computed(() => {
  void props.revision;
  if (!candidate.value) return undefined;
  try {
    const source = getEditableChartSource(props.sheet.id, props.chart, props.sheet);
    source.categories = candidate.value;
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
const invalid = computed(() => !candidate.value || !preview.value || preview.value.invalid);
function current(): boolean {
  return alive && !props.disabled && props.ownerValid();
}
function syncInput(): void {
  const input = root.value?.querySelector<HTMLInputElement>("input");
  if (input) text.value = input.value;
}
function confirm(_value?: unknown, context?: { e: KeyboardEvent }): void {
  if (!current()) return;
  if (composing || context?.e.isComposing) {
    compositionBlocked.value = true;
    return;
  }
  syncInput();
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
  syncInput();
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && (composing || event.isComposing || event.keyCode === 229))
    event.stopImmediatePropagation();
}
async function pick(): Promise<void> {
  if (!current() || !props.selectReference || composing) return;
  syncInput();
  const before = text.value;
  const epoch = ++pickerEpoch;
  const selected = await props.selectReference(before, "categories");
  if (!current() || epoch !== pickerEpoch || selected === undefined || text.value !== before)
    return;
  text.value = selected;
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
    :header="t('chart.sourceEditCategories')"
    width="min(660px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="close"
  >
    <div
      ref="root"
      class="chart-categories-editor"
      data-chart-categories-dialog
      @compositionstart.capture="compositionStart"
      @compositionend.capture="compositionEnd"
      @keydown.capture="keydown"
    >
      <label class="chart-categories-editor__control"
        ><span class="chart-categories-editor__label">{{ t("chart.sourceCategoryRange") }}</span>
        <Input
          v-model="text"
          :disabled="disabled"
          :aria-label="t('chart.sourceCategoryRange')"
          autocomplete="off"
          @enter="confirm"
          @blur="syncInput"
        >
          <template v-if="selectReference" #suffixIcon>
            <Button
              size="small"
              variant="text"
              :disabled="disabled"
              :aria-label="t('chart.sourcePickCategories')"
              @click.stop="pick"
              ><template #icon
                ><SquareMousePointer class="sheetcraft-action-icon" aria-hidden="true" /></template
            ></Button>
          </template> </Input
      ></label>
      <p class="chart-categories-editor__hint">{{ t("chart.sourceCategoriesHint") }}</p>
      <p class="chart-categories-editor__resolved" data-categories-preview>
        {{
          preview
            ? preview.data.categories.slice(0, 24).join(", ")
            : t("chart.sourcePreviewUnavailable")
        }}{{ preview && preview.data.categories.length > 24 ? "…" : "" }}
      </p>
      <p v-if="compositionBlocked" class="chart-categories-editor__error" role="alert">
        {{ t("chart.sourceFinishComposition") }}
      </p>
      <p v-else-if="attempted && invalid" class="chart-categories-editor__error" role="alert">
        {{ t("chart.sourceInvalidCategories") }}
      </p>
      <p v-else-if="feedback" class="chart-categories-editor__error" role="alert">
        {{ t("chart.sourceApplyFailed") }}
      </p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.chart-categories-editor {
  display: grid;
  gap: 8px;
  max-height: calc(100vh - 190px);
  overflow-y: auto;
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
