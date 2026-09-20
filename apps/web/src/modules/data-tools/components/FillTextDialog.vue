<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { FillTextDraft } from "../fill-tool-types";
const props = withDefaults(
  defineProps<{ visible: boolean; initial: FillTextDraft; error?: string; rangeLabel?: string }>(),
  { error: "", rangeLabel: "" },
);
const emit = defineEmits<{ close: []; apply: [draft: FillTextDraft] }>();
const { t } = useAppI18n();
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
      <p class="fill-dialog__hint">{{ t("dataTools.fill.textHint") }}</p>
      <label
        ><span>{{ t("dataTools.fill.text") }}</span
        ><TInput v-model="draft.text" :aria-label="t('dataTools.fill.text')" autofocus
      /></label>
      <div
        class="fill-dialog__group"
        role="group"
        :aria-label="t('dataTools.fill.insertTextTitle')"
      >
        <TRadioGroup v-model="draft.position"
          ><TRadio value="start">{{ t("dataTools.fill.insertAtStart") }}</TRadio
          ><TRadio value="end">{{ t("dataTools.fill.insertAtEnd") }}</TRadio
          ><TRadio value="index">{{ t("dataTools.fill.insertAtIndex") }}</TRadio></TRadioGroup
        >
      </div>
      <div v-if="draft.position === 'index'" class="fill-dialog__index">
        <div class="fill-dialog__group" role="group" :aria-label="t('dataTools.fill.index')">
          <TRadioGroup v-model="draft.from"
            ><TRadio value="left">{{ t("dataTools.fill.fromLeft") }}</TRadio
            ><TRadio value="right">{{ t("dataTools.fill.fromRight") }}</TRadio></TRadioGroup
          >
        </div>
        <div role="group" :aria-label="t('dataTools.fill.index')" class="fill-dialog__field">
          <span>{{ t("dataTools.fill.index") }}</span
          ><TInputNumber
            v-model="draft.index"
            :min="0"
            :decimal-places="0"
            theme="column"
            class="idea-input-number--persistent-controls"
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
label,
.fill-dialog__field {
  @include fill-dialog.field-label;
}
.fill-dialog__index {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: var(--idea-space-6);
}
.fill-dialog__group {
  @include fill-dialog.group;
}
</style>
