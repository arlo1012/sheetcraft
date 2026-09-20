<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { FillSeriesDraft } from "../fill-tool-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: FillSeriesDraft;
    error?: string;
    rangeLabel?: string;
  }>(),
  { error: "", rangeLabel: "" },
);
const emit = defineEmits<{ close: []; apply: [draft: FillSeriesDraft] }>();
const { t } = useAppI18n();
const copy = (value: FillSeriesDraft): FillSeriesDraft => ({ ...value });
const draft = ref(copy(props.initial));
const isAuto = computed(() => draft.value.type === "auto");
const isDate = computed(() => draft.value.type === "date");
const stopIsValid = computed(() => {
  const stop = draft.value.stop.trim();
  if (!stop || isAuto.value) return true;
  return isDate.value
    ? Number.isFinite(Number(stop)) || /^\d{4}-\d{1,2}-\d{1,2}$/u.test(stop)
    : Number.isFinite(Number(stop));
});
const canApply = computed(
  () =>
    isAuto.value || ((draft.value.trend || Number.isFinite(draft.value.step)) && stopIsValid.value),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = copy(props.initial);
  },
);
watch(
  () => draft.value.type,
  (type) => {
    if (type !== "linear" && type !== "growth") draft.value.trend = false;
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible) draft.value = copy(value);
  },
  { deep: true },
);
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
      <p v-if="rangeLabel" class="fill-dialog__range">
        {{ t("dataTools.fill.range", { range: rangeLabel }) }}
      </p>
      <div class="fill-dialog__group" role="group" :aria-label="t('dataTools.fill.seriesAxis')">
        <span>{{ t("dataTools.fill.seriesAxis") }}</span>
        <TRadioGroup v-model="draft.axis"
          ><TRadio value="rows">{{ t("dataTools.fill.rows") }}</TRadio
          ><TRadio value="columns">{{ t("dataTools.fill.columns") }}</TRadio></TRadioGroup
        >
      </div>
      <div class="fill-dialog__group" role="group" :aria-label="t('dataTools.fill.seriesType')">
        <span>{{ t("dataTools.fill.seriesType") }}</span>
        <TRadioGroup v-model="draft.type"
          ><TRadio value="linear">{{ t("dataTools.fill.linear") }}</TRadio
          ><TRadio value="growth">{{ t("dataTools.fill.growth") }}</TRadio
          ><TRadio value="date">{{ t("dataTools.fill.date") }}</TRadio
          ><TRadio value="auto">{{ t("dataTools.fill.auto") }}</TRadio></TRadioGroup
        >
      </div>
      <div
        v-if="isDate"
        class="fill-dialog__group"
        role="group"
        :aria-label="t('dataTools.fill.dateUnit')"
      >
        <span>{{ t("dataTools.fill.dateUnit") }}</span>
        <TRadioGroup v-model="draft.dateUnit"
          ><TRadio value="day">{{ t("dataTools.fill.day") }}</TRadio
          ><TRadio value="weekday">{{ t("dataTools.fill.weekday") }}</TRadio
          ><TRadio value="month">{{ t("dataTools.fill.month") }}</TRadio
          ><TRadio value="year">{{ t("dataTools.fill.year") }}</TRadio></TRadioGroup
        >
      </div>
      <div class="fill-dialog__fields">
        <div role="group" :aria-label="t('dataTools.fill.step')" class="fill-dialog__field">
          <span>{{ t("dataTools.fill.step") }}</span
          ><TInputNumber
            v-model="draft.step"
            :disabled="isAuto || draft.trend"
            theme="column"
            class="idea-input-number--persistent-controls"
          />
        </div>
        <label
          ><span>{{ t("dataTools.fill.stop") }}</span
          ><TInput
            v-model="draft.stop"
            :disabled="isAuto"
            :placeholder="isDate ? 'YYYY-MM-DD' : undefined"
        /></label>
      </div>
      <TCheckbox
        v-model="draft.trend"
        :disabled="isAuto || (draft.type !== 'linear' && draft.type !== 'growth')"
        >{{ t("dataTools.fill.trend") }}</TCheckbox
      >
      <p v-if="error" class="fill-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "./fill-dialog";

.fill-dialog {
  @include fill-dialog.surface;
}
.fill-dialog__range,
.fill-dialog__error {
  @include fill-dialog.auxiliary-text;
}
.fill-dialog__range {
  @include fill-dialog.subdued-text;
}
.fill-dialog__error {
  color: var(--idea-status-error);
}
.fill-dialog__group {
  @include fill-dialog.group;
}
.fill-dialog__field,
label {
  @include fill-dialog.field-label;
}
.fill-dialog__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idea-space-6);
}
</style>
