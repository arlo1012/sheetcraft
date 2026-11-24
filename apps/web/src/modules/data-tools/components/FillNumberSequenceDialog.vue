<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Alert as TAlert } from "tdesign-vue-next/es/alert";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { FillNumberSequenceDraft } from "../fill-number-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: FillNumberSequenceDraft;
    error?: string;
  }>(),
  { error: "" },
);
const emit = defineEmits<{
  close: [];
  apply: [draft: FillNumberSequenceDraft];
}>();
const { t } = useAppI18n();
const copy = (value: FillNumberSequenceDraft): FillNumberSequenceDraft => ({
  ...value,
});
const draft = ref(copy(props.initial));
const canApply = computed(
  () => Number.isFinite(draft.value.start) && Number.isFinite(draft.value.step),
);

watch(
  () => props.visible,
  (visible, previous) => {
    if (visible && !previous) draft.value = copy(props.initial);
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible) draft.value = copy(value);
  },
);

function apply(): void {
  if (canApply.value) emit("apply", copy(draft.value));
}
</script>

<template>
  <Dialog
    v-if="visible"
    :visible="visible"
    :header="t('dataTools.fill.numberSequence')"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    :confirm-btn="{ content: t('dataTools.fill.apply'), disabled: !canApply }"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="apply"
  >
    <div class="fill-number-dialog">
      <TForm class="fill-number-dialog__form sheetcraft-form-grid" :data="draft" label-align="top">
        <TFormItem name="axis" :label="t('dataTools.fill.sequenceDirection')">
          <div class="fill-number-dialog__card">
            <TRadioGroup v-model="draft.axis" :aria-label="t('dataTools.fill.sequenceDirection')">
              <TRadio value="rows">{{ t("dataTools.fill.rows") }}</TRadio>
              <TRadio value="columns">{{ t("dataTools.fill.columns") }}</TRadio>
            </TRadioGroup>
          </div>
        </TFormItem>
        <div class="fill-number-dialog__row">
          <TFormItem name="start" :label="t('dataTools.fill.startValue')">
            <TInputNumber
              v-model="draft.start"
              theme="column"
              class="sheetcraft-input-number--persistent-controls"
              :aria-label="t('dataTools.fill.startValue')"
            />
          </TFormItem>
          <TFormItem name="step" :label="t('dataTools.fill.step')">
            <TInputNumber
              v-model="draft.step"
              theme="column"
              class="sheetcraft-input-number--persistent-controls"
              :aria-label="t('dataTools.fill.step')"
            />
          </TFormItem>
        </div>
      </TForm>
      <TAlert v-if="error" theme="error" :message="error" role="alert" />
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
@use "./fill-dialog";

.fill-number-dialog {
  @include fill-dialog.surface;

  &__form {
    display: grid;
    gap: 10px;
  }

  &__card {
    width: 100%;
    padding: 9px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }

  &__row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }

  &__error {
    @include fill-dialog.auxiliary-text;
    color: var(--sheetcraft-status-error);
  }
}
</style>
