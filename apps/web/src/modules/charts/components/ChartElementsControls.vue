<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import type { ChartElementSettings, SheetChart } from "@sheetcraft/core/sheet-charts";
import { useAppI18n } from "../../../shared/i18n";
import { getChartElementCapabilities, getChartElementSettings } from "../chart-elements";
import type { ChartElementPatch } from "../chart-element-controls";

const props = defineProps<{ chart: SheetChart; disabled: boolean }>();
const emit = defineEmits<{ patch: [patch: ChartElementPatch] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const titleId = `chart-element-title-${useId()}`;
const titleDraft = ref(props.chart.title);
const compositionBlocked = ref(false);
const capabilities = computed(() => getChartElementCapabilities(props.chart.type));
const settings = computed(() => getChartElementSettings(props.chart));
const popupClass = `chart-element-options-${useId().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
const popupProps = { overlayClassName: ["chart-element-options-popup", popupClass] };
function popupElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`.${popupClass}`));
}
let lastEnteredTitle: string | undefined;
let composing = false;
let internalPointerTransition = false;

watch(
  () => props.chart.title,
  (title) => {
    titleDraft.value = title;
    lastEnteredTitle = undefined;
  },
);

function focusTitle(): void {
  root.value?.querySelector<HTMLInputElement>("input")?.focus();
}
function blockComposition(): boolean {
  if (!composing) return false;
  compositionBlocked.value = true;
  focusTitle();
  return true;
}
function pendingTitle(): string | undefined {
  return titleDraft.value !== props.chart.title ? titleDraft.value : undefined;
}
function commitTitle(value = titleDraft.value, context?: { e: KeyboardEvent }): boolean {
  if (props.disabled || blockComposition()) return false;
  if (context?.e.isComposing) {
    compositionBlocked.value = true;
    return false;
  }
  if (value !== props.chart.title) emit("patch", { title: value });
  return true;
}
function enterTitle(value: string | number, context: { e: KeyboardEvent }): void {
  const title = String(value);
  if (commitTitle(title, context)) lastEnteredTitle = title;
}
function isSameOwnerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  return (
    !!root.value?.contains(target) ||
    popupElements().some((popup) => popup.contains(target)) ||
    (target instanceof Element && !!target.closest("[data-chart-tools-toolbar]"))
  );
}
function onPointerDownCapture(event: PointerEvent): void {
  internalPointerTransition =
    event.target instanceof Node && root.value?.querySelector("input") !== event.target;
}
function blurTitle(value: string | number, context: { e: FocusEvent }): void {
  const internal = internalPointerTransition || isSameOwnerTarget(context?.e.relatedTarget ?? null);
  internalPointerTransition = false;
  // Moving to another element control keeps the complete title in the same atomic edit.
  if (internal) return;
  const title = String(value);
  if (title !== lastEnteredTitle) commitTitle(title);
}
function endTitleComposition(_value: string, context: { e: CompositionEvent }): void {
  const input = context.e.target;
  if (input instanceof HTMLInputElement) titleDraft.value = input.value;
  composing = false;
  compositionBlocked.value = false;
}
function startTitleComposition(): void {
  composing = true;
}
function submitPatch(patch: ChartElementPatch): void {
  if (props.disabled || blockComposition()) return;
  const title = pendingTitle();
  emit("patch", { ...patch, ...(title !== undefined ? { title } : {}) });
  internalPointerTransition = false;
}
function patchElements(elements: ChartElementSettings): void {
  submitPatch({ elements: { ...props.chart.elements, ...elements } });
}
function setLegend(value: unknown): void {
  if (props.disabled || !capabilities.value.legend) return;
  if (value === "none") {
    submitPatch({ legend: false });
    return;
  }
  if (
    value !== "top" &&
    value !== "bottom" &&
    value !== "left" &&
    value !== "right" &&
    value !== "topRight"
  )
    return;
  submitPatch({ legend: true, elements: { ...props.chart.elements, legendPosition: value } });
}
function setLabels(value: unknown): void {
  if (props.disabled || !capabilities.value.labelPosition) return;
  if (value === "none") {
    submitPatch({ labels: false });
    return;
  }
  if (
    value !== "center" &&
    value !== "insideEnd" &&
    value !== "insideBase" &&
    value !== "outsideEnd"
  )
    return;
  submitPatch({ labels: true, elements: { ...props.chart.elements, labelPosition: value } });
}
function setTitlePosition(value: unknown): void {
  if (value === "none" || value === "above" || value === "overlay")
    patchElements({ titlePosition: value });
}
function setLegendNonOverlapping(value: unknown): void {
  if (!props.disabled && capabilities.value.legend && props.chart.legend)
    patchElements({ legendOverlay: !value });
}
function toggleLabels(value: unknown): void {
  if (!props.disabled && capabilities.value.labels) submitPatch({ labels: !!value });
}
function toggleStacked(value: unknown): void {
  if (!props.disabled && capabilities.value.stacked) submitPatch({ stacked: !!value });
}

const titleOptions = computed(() => [
  { value: "none", label: t("chart.elementNone") },
  { value: "above", label: t("chart.titleAbove") },
  { value: "overlay", label: t("chart.titleOverlay") },
]);
const legendOptions = computed(() => [
  { value: "none", label: t("chart.elementNone") },
  { value: "right", label: t("chart.positionRight") },
  { value: "top", label: t("chart.positionTop") },
  { value: "left", label: t("chart.positionLeft") },
  { value: "bottom", label: t("chart.positionBottom") },
  { value: "topRight", label: t("chart.positionTopRight") },
]);
const labelOptions = computed(() => [
  { value: "none", label: t("chart.elementNone") },
  { value: "center", label: t("chart.labelCenter") },
  { value: "insideEnd", label: t("chart.labelInsideEnd") },
  { value: "insideBase", label: t("chart.labelInsideBase") },
  { value: "outsideEnd", label: t("chart.labelOutsideEnd") },
]);

defineExpose({
  commitTitle,
  popupElements,
  pendingTitle,
  isComposing: () => composing,
  blockComposition,
  focusTitle,
});
</script>

<template>
  <div
    ref="root"
    class="chart-elements-controls"
    role="group"
    :aria-label="t('chart.elements')"
    @pointerdown.capture="onPointerDownCapture"
  >
    <div class="chart-elements-controls__field">
      <label :for="titleId">{{ t("chart.titleText") }}</label>
      <Input
        :id="titleId"
        v-model="titleDraft"
        size="small"
        :maxlength="1000"
        :status="compositionBlocked ? 'warning' : undefined"
        :disabled="disabled"
        :aria-label="t('chart.titleText')"
        @focus="lastEnteredTitle = undefined"
        @compositionstart="startTitleComposition"
        @compositionend="endTitleComposition"
        @enter="enterTitle"
        @blur="blurTitle"
      />
    </div>
    <p v-if="compositionBlocked" class="chart-elements-controls__hint" role="alert">
      {{ t("chart.finishTitleComposition") }}
    </p>
    <div class="chart-elements-controls__field">
      <span>{{ t("chart.title") }}</span>
      <Select
        :value="settings.titlePosition"
        :options="titleOptions"
        :popup-props="popupProps"
        size="small"
        :disabled="disabled"
        :aria-label="t('chart.titlePosition')"
        @change="setTitlePosition"
      />
    </div>
    <template v-if="capabilities.legend">
      <div class="chart-elements-controls__field">
        <span>{{ t("chart.legend") }}</span>
        <Select
          :value="chart.legend ? settings.legendPosition : 'none'"
          :options="legendOptions"
          :popup-props="popupProps"
          size="small"
          :disabled="disabled"
          :aria-label="t('chart.legendPosition')"
          @change="setLegend"
        />
      </div>
      <Checkbox
        class="chart-elements-controls__check"
        :checked="!settings.legendOverlay"
        :disabled="disabled || !chart.legend"
        @change="setLegendNonOverlapping"
        >{{ t("chart.legendNonOverlapping") }}</Checkbox
      >
    </template>
    <div v-if="capabilities.labelPosition" class="chart-elements-controls__field">
      <span>{{ t("chart.labels") }}</span>
      <Select
        :value="chart.labels ? settings.labelPosition : 'none'"
        :options="labelOptions"
        :popup-props="popupProps"
        size="small"
        :disabled="disabled"
        :aria-label="t('chart.labelPosition')"
        @change="setLabels"
      />
    </div>
    <Checkbox
      v-else-if="capabilities.labels"
      class="chart-elements-controls__check"
      :checked="chart.labels"
      :disabled="disabled"
      @change="toggleLabels"
      >{{ t("chart.labels") }}</Checkbox
    >
    <Checkbox
      v-if="capabilities.stacked"
      class="chart-elements-controls__check"
      :checked="chart.stacked"
      :disabled="disabled"
      @change="toggleStacked"
      >{{ t("chart.stacked") }}</Checkbox
    >
    <p v-if="chart.type === 'wordCloud'" class="chart-elements-controls__hint">
      {{ t("chart.wordCloudElementsHint") }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.chart-elements-controls {
  display: grid;
  min-width: 0;
  gap: 8px;

  &__field {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 12px;

    > :first-child {
      min-width: 64px;
      white-space: nowrap;
      font-size: var(--sheetcraft-font-size-body-medium);
      line-height: var(--sheetcraft-line-height-body-medium);
    }
  }

  &__check {
    width: max-content;
    max-width: 100%;
    white-space: nowrap;
  }

  &__hint {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
