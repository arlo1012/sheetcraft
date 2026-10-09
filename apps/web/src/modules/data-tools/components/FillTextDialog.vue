<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Info } from "lucide-vue-next";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { FillTextDraft } from "../fill-tool-types";
const props = withDefaults(
  defineProps<{ visible: boolean; initial: FillTextDraft; error?: string }>(),
  { error: "" },
);
const emit = defineEmits<{ close: []; apply: [draft: FillTextDraft] }>();
const { t, locale } = useAppI18n();
const draft = ref<FillTextDraft>({ ...props.initial });
const canApply = computed(() => Boolean(draft.value.text));
watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = { ...props.initial };
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible) draft.value = { ...value };
  },
  { deep: true },
);
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.fill.insertTextTitle')"
    width="min(480px, calc(100vw - 32px))"
    :confirm-btn="{ content: t('dataTools.fill.apply'), disabled: !canApply }"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="canApply && emit('apply', { ...draft })"
  >
    <div class="fill-text-dialog">
      <p class="fill-text-dialog__hint">
        <Info :size="14" aria-hidden="true" />
        <span>{{ t("dataTools.fill.textHint") }}</span>
      </p>
      <TForm :data="draft" label-align="right" :label-width="locale === 'zh-CN' ? 96 : 136">
        <TFormItem name="text" :label="t('dataTools.fill.text')">
          <TInput v-model="draft.text" :aria-label="t('dataTools.fill.text')" autofocus />
        </TFormItem>
        <TFormItem name="position" :label="t('dataTools.fill.insertPosition')">
          <TRadioGroup
            v-model="draft.position"
            direction="vertical"
            :aria-label="t('dataTools.fill.insertPosition')"
          >
            <TRadio value="start">{{ t("dataTools.fill.insertAtStart") }}</TRadio>
            <TRadio value="end">{{ t("dataTools.fill.insertAtEnd") }}</TRadio>
            <TRadio value="index">{{ t("dataTools.fill.insertAtIndex") }}</TRadio>
          </TRadioGroup>
        </TFormItem>
        <template v-if="draft.position === 'index'">
          <TFormItem name="from" :label="t('dataTools.fill.countDirection')">
            <TRadioGroup v-model="draft.from" :aria-label="t('dataTools.fill.countDirection')">
              <TRadio value="left">{{ t("dataTools.fill.fromLeft") }}</TRadio>
              <TRadio value="right">{{ t("dataTools.fill.fromRight") }}</TRadio>
            </TRadioGroup>
          </TFormItem>
          <TFormItem name="index" :label="t('dataTools.fill.index')">
            <TInputNumber
              v-model="draft.index"
              :min="0"
              :decimal-places="0"
              theme="column"
              class="sheetcraft-input-number--persistent-controls"
              :aria-label="t('dataTools.fill.index')"
            />
          </TFormItem>
        </template>
      </TForm>
      <p v-if="error" class="fill-text-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "./fill-dialog";

.fill-text-dialog {
  display: grid;
  gap: var(--sheetcraft-space-5);

  &__hint,
  &__error {
    @include fill-dialog.auxiliary-text;
  }

  &__hint {
    @include fill-dialog.subdued-text;
    display: flex;
    align-items: flex-start;
    gap: var(--sheetcraft-space-2);

    > svg {
      flex: none;
      margin-top: var(--sheetcraft-space-1);
    }
  }

  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
