<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { DatePicker as TDatePicker, type DatePickerProps } from "tdesign-vue-next/es/date-picker";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { FillSeriesDraft } from "../fill-tool-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: FillSeriesDraft;
    error?: string;
  }>(),
  { error: "" },
);
const emit = defineEmits<{ close: []; apply: [draft: FillSeriesDraft] }>();
const { t } = useAppI18n();
const copy = (value: FillSeriesDraft): FillSeriesDraft => ({ ...value });
const draft = ref(copy(props.initial));
const isAuto = computed(() => draft.value.type === "auto");
const isDate = computed(() => draft.value.type === "date");
const datePickerMode = computed(() =>
  draft.value.dateUnit === "year" ? "year" : draft.value.dateUnit === "month" ? "month" : "date",
);
const datePickerFormat = computed(() =>
  datePickerMode.value === "year"
    ? "YYYY"
    : datePickerMode.value === "month"
      ? "YYYY-MM"
      : "YYYY-MM-DD",
);
const stepLabel = computed(() => {
  if (!isDate.value) return t("dataTools.fill.step");
  switch (draft.value.dateUnit) {
    case "day":
      return t("dataTools.fill.stepDays");
    case "weekday":
      return t("dataTools.fill.stepWeekdays");
    case "month":
      return t("dataTools.fill.stepMonths");
    case "year":
      return t("dataTools.fill.stepYears");
  }
});
const stopIsValid = computed(() => {
  const stop = draft.value.stop.trim();
  if (!stop || isAuto.value) return true;
  if (!isDate.value) return Number.isFinite(Number(stop));
  return datePickerMode.value === "year"
    ? /^\d{4}$/u.test(stop)
    : datePickerMode.value === "month"
      ? /^\d{4}-\d{2}$/u.test(stop)
      : /^\d{4}-\d{2}-\d{2}$/u.test(stop);
});
const canApply = computed(
  () =>
    isAuto.value ||
    ((draft.value.trend ||
      (Number.isFinite(draft.value.step) &&
        (!isDate.value || Number.isInteger(draft.value.step)))) &&
      stopIsValid.value),
);
let resettingDraft = false;
function resetDraft() {
  resettingDraft = true;
  draft.value = copy(props.initial);
  resettingDraft = false;
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) resetDraft();
  },
);
watch(
  () => props.initial,
  () => {
    if (props.visible) resetDraft();
  },
  { deep: true },
);
watch(
  () => draft.value.type,
  (type, previous) => {
    if (resettingDraft) return;
    if (type !== "linear" && type !== "growth") draft.value.trend = false;
    if ((type === "date") !== (previous === "date")) draft.value.stop = "";
  },
  { flush: "sync" },
);
watch(
  () => draft.value.dateUnit,
  () => {
    if (resettingDraft || !isDate.value || !draft.value.stop) return;
    const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/u.exec(draft.value.stop);
    if (!match) {
      draft.value.stop = "";
      return;
    }
    const date = `${match[1]}-${match[2] ?? "01"}-${match[3] ?? "01"}`;
    draft.value.stop = date.slice(
      0,
      datePickerMode.value === "year" ? 4 : datePickerMode.value === "month" ? 7 : 10,
    );
  },
  { flush: "sync" },
);
const updateDateStop: NonNullable<DatePickerProps["onChange"]> = (value) => {
  draft.value.stop = typeof value === "string" ? value : "";
};
function updateNumericStop(value: number | string): void {
  draft.value.stop = String(value);
}
function apply(): void {
  if (canApply.value) emit("apply", copy(draft.value));
}
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.fill.seriesTitle')"
    width="min(480px, calc(100vw - 32px))"
    :confirm-btn="{ content: t('dataTools.fill.apply'), disabled: !canApply }"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="apply"
  >
    <div class="fill-dialog">
      <div class="fill-dialog__options">
        <div
          class="fill-dialog__group fill-dialog__axis"
          role="group"
          :aria-label="t('dataTools.fill.seriesAxis')"
        >
          <span>{{ t("dataTools.fill.seriesAxis") }}</span>
          <TRadioGroup v-model="draft.axis" direction="vertical">
            <TRadio value="rows">{{ t("dataTools.fill.rows") }}</TRadio>
            <TRadio value="columns">{{ t("dataTools.fill.columns") }}</TRadio>
          </TRadioGroup>
          <div class="fill-dialog__trend">
            <TCheckbox
              v-model="draft.trend"
              :disabled="isAuto || (draft.type !== 'linear' && draft.type !== 'growth')"
              >{{ t("dataTools.fill.trend") }}</TCheckbox
            >
          </div>
        </div>
        <div class="fill-dialog__group" role="group" :aria-label="t('dataTools.fill.seriesType')">
          <span>{{ t("dataTools.fill.seriesType") }}</span>
          <TRadioGroup v-model="draft.type" direction="vertical">
            <TRadio value="linear">{{ t("dataTools.fill.linear") }}</TRadio>
            <TRadio value="growth">{{ t("dataTools.fill.growth") }}</TRadio>
            <TRadio value="date">{{ t("dataTools.fill.date") }}</TRadio>
            <TRadio value="auto">{{ t("dataTools.fill.auto") }}</TRadio>
          </TRadioGroup>
        </div>
        <div
          class="fill-dialog__group"
          :class="{ 'is-disabled': !isDate }"
          role="group"
          :aria-label="t('dataTools.fill.dateUnit')"
          :aria-disabled="!isDate"
        >
          <span>{{ t("dataTools.fill.dateUnit") }}</span>
          <TRadioGroup v-model="draft.dateUnit" direction="vertical" :disabled="!isDate">
            <TRadio value="day">{{ t("dataTools.fill.day") }}</TRadio>
            <TRadio value="weekday">{{ t("dataTools.fill.weekday") }}</TRadio>
            <TRadio value="month">{{ t("dataTools.fill.month") }}</TRadio>
            <TRadio value="year">{{ t("dataTools.fill.year") }}</TRadio>
          </TRadioGroup>
        </div>
      </div>
      <div class="fill-dialog__fields">
        <div role="group" :aria-label="stepLabel" class="fill-dialog__field">
          <span>{{ stepLabel }}</span>
          <TInputNumber
            v-model="draft.step"
            :disabled="isAuto || draft.trend"
            :decimal-places="isDate ? 0 : undefined"
            :aria-label="stepLabel"
            theme="column"
            class="idea-input-number--persistent-controls"
            style="width: 100%; min-width: 0"
          />
        </div>
        <div class="fill-dialog__field" role="group" :aria-label="t('dataTools.fill.stop')">
          <span>{{ t("dataTools.fill.stop") }}</span>
          <TDatePicker
            v-if="isDate"
            :key="datePickerMode"
            :value="draft.stop"
            :mode="datePickerMode"
            :format="datePickerFormat"
            :value-type="datePickerFormat"
            allow-input
            clearable
            :aria-label="t('dataTools.fill.stop')"
            style="width: 100%; min-width: 0"
            @change="updateDateStop"
          />
          <TInputNumber
            v-else
            :model-value="isAuto || draft.stop === '' ? '' : Number(draft.stop)"
            :disabled="isAuto"
            :aria-label="t('dataTools.fill.stop')"
            theme="column"
            class="idea-input-number--persistent-controls"
            style="width: 100%; min-width: 0"
            @update:model-value="updateNumericStop"
          />
        </div>
      </div>
      <p v-if="error" class="fill-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "./fill-dialog";

.fill-dialog {
  @include fill-dialog.surface;

  &__error {
    @include fill-dialog.auxiliary-text;
    color: var(--sheetcraft-status-error);
  }

  &__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sheetcraft-space-6);
  }

  &__group {
    @include fill-dialog.group;
    align-content: start;

    > span {
      font-weight: var(--sheetcraft-font-weight-medium);
    }

    &.is-disabled > span {
      color: var(--sheetcraft-text-disabled);
    }
  }

  &__axis {
    grid-template-rows: auto auto 1fr;
  }

  &__trend {
    align-self: end;
  }

  &__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sheetcraft-space-6);
  }

  &__field {
    @include fill-dialog.field-label;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: var(--sheetcraft-space-4);
    min-width: 0;
  }

  @media (max-width: 440px) {
    &__options {
      gap: var(--sheetcraft-space-4);
    }

    &__fields {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sheetcraft-space-4);
    }
  }
}
</style>
