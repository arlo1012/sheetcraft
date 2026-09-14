<script setup lang="ts">
import {
  dimensionValueToPixels,
  getDefaultDimensionUnit,
  getDimensionUnits,
  pixelsToDimensionValue,
  type DimensionUnit,
} from "@idea10/core/dimension-units";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed, nextTick, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    axis: "row" | "column";
    modelValue?: number;
    minimum: number;
    maximum: number;
    disabled?: boolean;
    readonly?: boolean;
    compact?: boolean;
    label?: string;
  }>(),
  { disabled: false, readonly: false, compact: false },
);
const emit = defineEmits<{
  "update:modelValue": [value: number | undefined];
  commit: [value: number];
  enter: [value: number];
}>();

const { t } = useAppI18n();
const rootRef = ref<HTMLElement>();
const unit = ref<DimensionUnit>(getDefaultDimensionUnit(props.axis));
const draft = ref<InputNumberValue>(toDisplayValue(props.modelValue, unit.value));
const draftPixels = ref<number | undefined>(props.modelValue);
const dirty = ref(false);
const lastEmittedModelValue = ref<number | undefined>();
const awaitingModelEcho = ref(false);

const disabled = computed(() => props.disabled || props.readonly);
const label = computed(
  () => props.label ?? t(props.axis === "row" ? "axisMenu.rowHeight" : "axisMenu.columnWidth"),
);
const unitOptions = computed(() =>
  getDimensionUnits(props.axis).map((value) => ({
    value,
    label: t(`dimensionUnits.${value}`),
  })),
);
const unitMinimum = computed(() => pixelsToDimensionValue(props.minimum, unit.value));
const unitMaximum = computed(() => pixelsToDimensionValue(props.maximum, unit.value));
const inputWidth = computed(() => (props.compact ? "64px" : "112px"));
const selectWidth = computed(() => (props.compact ? "64px" : "80px"));
const popupProps = computed(() => ({ attach: () => rootRef.value ?? document.body }));

watch(
  () => props.axis,
  (axis) => {
    unit.value = getDefaultDimensionUnit(axis);
    syncFromModel(props.modelValue);
  },
);
watch(
  () => props.modelValue,
  (value) => {
    if (awaitingModelEcho.value && value === lastEmittedModelValue.value) {
      awaitingModelEcho.value = false;
      return;
    }
    syncFromModel(value);
  },
);

function toDisplayValue(value: number | undefined, valueUnit: DimensionUnit): InputNumberValue {
  if (value === undefined || !Number.isFinite(value)) return "";
  return roundForDisplay(pixelsToDimensionValue(value, valueUnit));
}

function roundForDisplay(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatInputValue(value: InputNumberValue): InputNumberValue {
  const numeric = parseDraft(value);
  return numeric === undefined ? "" : roundForDisplay(numeric);
}

function syncFromModel(value: number | undefined): void {
  draftPixels.value = value;
  draft.value = toDisplayValue(value, unit.value);
  dirty.value = false;
}

function parseDraft(value: InputNumberValue): number | undefined {
  if (value === "" || value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function getValidPixels(value: InputNumberValue = draft.value): number | undefined {
  const numeric = parseDraft(value);
  if (numeric === undefined) return undefined;
  const pixels = dimensionValueToPixels(numeric, unit.value);
  const roundedPixels = Math.round(pixels);
  if (roundedPixels < props.minimum || roundedPixels > props.maximum) return undefined;
  return pixels;
}

function onDraftChange(value: InputNumberValue): void {
  if (disabled.value) return;
  if (parseDraft(value) === parseDraft(draft.value)) return;
  draft.value = value;
  dirty.value = true;
  const pixels = getValidPixels(value);
  if (pixels === undefined) {
    draftPixels.value = undefined;
    lastEmittedModelValue.value = undefined;
    awaitingModelEcho.value = true;
    emit("update:modelValue", undefined);
    return;
  }
  draftPixels.value = pixels;
  const roundedPixels = Math.round(pixels);
  lastEmittedModelValue.value = roundedPixels;
  awaitingModelEcho.value = true;
  emit("update:modelValue", roundedPixels);
}

function selectUnit(value: SelectValue): void {
  if (
    disabled.value ||
    typeof value !== "string" ||
    !getDimensionUnits(props.axis).includes(value as DimensionUnit)
  )
    return;
  const pixels = draftPixels.value;
  unit.value = value as DimensionUnit;
  if (pixels !== undefined) draft.value = toDisplayValue(pixels, unit.value);
}

function commit(force = false): number | undefined {
  if (disabled.value || (!dirty.value && !force)) return undefined;
  const pixels = draftPixels.value;
  if (
    pixels === undefined ||
    Math.round(pixels) < props.minimum ||
    Math.round(pixels) > props.maximum
  )
    return undefined;
  const roundedPixels = Math.round(pixels);
  dirty.value = false;
  lastEmittedModelValue.value = roundedPixels;
  awaitingModelEcho.value = true;
  emit("commit", roundedPixels);
  return roundedPixels;
}

function onEnter(value: InputNumberValue, context: { e: KeyboardEvent }): void {
  context.e.preventDefault();
  context.e.stopPropagation();
  if (parseDraft(value) !== parseDraft(draft.value)) onDraftChange(value);
  const pixels = commit(true);
  if (pixels !== undefined) emit("enter", pixels);
}

function onBlur(_value: InputNumberValue, context: { e: FocusEvent }): void {
  const nextTarget = context.e.relatedTarget;
  if (nextTarget instanceof Node && rootRef.value?.contains(nextTarget)) return;
  void nextTick(() => {
    if (!rootRef.value?.contains(document.activeElement)) commit();
  });
}
</script>

<template>
  <div
    ref="rootRef"
    class="sheet-dimension-input"
    :class="{ 'sheet-dimension-input--compact': compact }"
    role="group"
    :aria-label="label"
  >
    <TInputNumber
      :model-value="draft"
      class="sheet-dimension-input__number idea-input-number--persistent-controls"
      :style="{ width: inputWidth, minWidth: '0' }"
      :min="unitMinimum"
      :max="unitMaximum"
      :allow-input-over-limit="true"
      :format="formatInputValue"
      :step="unit === 'px' ? 1 : 0.1"
      :disabled="disabled"
      :aria-label="label"
      size="small"
      theme="column"
      data-sheet-dimension-number
      @update:model-value="onDraftChange"
      @change="onDraftChange"
      @blur="onBlur"
      @enter="onEnter"
    />
    <TSelect
      :model-value="unit"
      class="sheet-dimension-input__unit"
      :style="{ width: selectWidth, minWidth: '0' }"
      :options="unitOptions"
      :popup-props="popupProps"
      :disabled="disabled"
      :aria-label="t('dimensionUnits.unit')"
      size="small"
      data-sheet-dimension-unit
      @change="selectUnit"
    />
  </div>
</template>

<style scoped lang="scss">
.sheet-dimension-input {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &--compact {
    gap: 4px;
  }
}
</style>
