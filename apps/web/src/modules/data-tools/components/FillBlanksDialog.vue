<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Info } from "lucide-vue-next";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { FillBlanksDraft } from "../fill-tool-types";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: FillBlanksDraft;
    error?: string;
  }>(),
  { error: "" },
);
const emit = defineEmits<{ close: []; apply: [draft: FillBlanksDraft] }>();
const { t } = useAppI18n();
const draft = ref<FillBlanksDraft>({ ...props.initial });
const canApply = computed(() => draft.value.mode !== "value" || Boolean(draft.value.value));
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
    :header="t('dataTools.fill.blanksTitle')"
    width="min(440px, calc(100vw - 32px))"
    :confirm-btn="{ content: t('dataTools.fill.apply'), disabled: !canApply }"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="canApply && emit('apply', { ...draft })"
  >
    <div class="fill-blanks-dialog">
      <p class="fill-blanks-dialog__hint">
        <Info :size="14" aria-hidden="true" />
        <span>{{ t("dataTools.fill.blanksHint") }}</span>
      </p>
      <div class="fill-blanks-dialog__options">
        <TRadioGroup
          v-model="draft.mode"
          class="fill-blanks-dialog__choices"
          direction="vertical"
          :aria-label="t('dataTools.fill.blanksTitle')"
        >
          <TRadio value="up">{{ t("dataTools.fill.fillFromUp") }}</TRadio>
          <TRadio value="down">{{ t("dataTools.fill.fillFromDown") }}</TRadio>
          <TRadio value="left">{{ t("dataTools.fill.fillFromLeft") }}</TRadio>
          <TRadio value="right">{{ t("dataTools.fill.fillFromRight") }}</TRadio>
          <TRadio value="value">{{ t("dataTools.fill.fillWithValue") }}</TRadio>
        </TRadioGroup>
        <div v-if="draft.mode === 'value'" class="fill-blanks-dialog__value">
          <TInput v-model="draft.value" :aria-label="t('dataTools.fill.value')" autofocus />
        </div>
      </div>
      <p v-if="error" class="fill-blanks-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "./fill-dialog";

.fill-blanks-dialog {
  display: grid;
  gap: var(--idea-space-5);

  &__options {
    @include fill-dialog.group;
  }

  &__hint,
  &__error {
    @include fill-dialog.auxiliary-text;
  }

  &__hint {
    @include fill-dialog.subdued-text;
  }

  &__choices {
    --td-comp-margin-xs: var(--idea-space-5);
  }

  &__hint {
    display: flex;
    align-items: flex-start;
    gap: var(--idea-space-2);

    > svg {
      flex: none;
      margin-top: var(--idea-space-1);
    }
  }

  &__value {
    padding-inline-start: calc(16px + var(--idea-space-4));
  }

  &__error {
    color: var(--idea-status-error);
  }
}
</style>
