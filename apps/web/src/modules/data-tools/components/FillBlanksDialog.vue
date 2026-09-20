<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
    rangeLabel?: string;
  }>(),
  { error: "", rangeLabel: "" },
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
    <div class="fill-dialog">
      <p v-if="rangeLabel" class="fill-dialog__range">
        {{ t("dataTools.fill.range", { range: rangeLabel }) }}
      </p>
      <p class="fill-dialog__hint">{{ t("dataTools.fill.blanksHint") }}</p>
      <TRadioGroup v-model="draft.mode" :aria-label="t('dataTools.fill.blanksTitle')"
        ><TRadio value="up">{{ t("dataTools.fill.fillFromUp") }}</TRadio
        ><TRadio value="down">{{ t("dataTools.fill.fillFromDown") }}</TRadio
        ><TRadio value="left">{{ t("dataTools.fill.fillFromLeft") }}</TRadio
        ><TRadio value="right">{{ t("dataTools.fill.fillFromRight") }}</TRadio
        ><TRadio value="value">{{ t("dataTools.fill.fillWithValue") }}</TRadio></TRadioGroup
      >
      <label v-if="draft.mode === 'value'"
        ><span>{{ t("dataTools.fill.value") }}</span
        ><TInput v-model="draft.value" :aria-label="t('dataTools.fill.value')" autofocus
      /></label>
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
.fill-dialog__hint,
.fill-dialog__error {
  @include fill-dialog.auxiliary-text;
}
.fill-dialog__range,
.fill-dialog__hint {
  @include fill-dialog.subdued-text;
}
.fill-dialog__error {
  color: var(--idea-status-error);
}
label {
  @include fill-dialog.field-label;
}
</style>
