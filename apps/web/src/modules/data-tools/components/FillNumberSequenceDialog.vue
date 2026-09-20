<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
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
    :visible="visible"
    :header="t('dataTools.fill.numberSequence')"
    width="min(400px, calc(100vw - 32px))"
    :confirm-btn="{ content: t('dataTools.fill.apply'), disabled: !canApply }"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="apply"
  >
    <div class="fill-number-dialog">
      <div
        class="fill-number-dialog__field"
        role="group"
        :aria-label="t('dataTools.fill.sequenceDirection')"
      >
        <span>{{ t("dataTools.fill.sequenceDirection") }}</span>
        <TRadioGroup v-model="draft.axis">
          <TRadio value="rows">{{ t("dataTools.fill.rows") }}</TRadio>
          <TRadio value="columns">{{ t("dataTools.fill.columns") }}</TRadio>
        </TRadioGroup>
      </div>
      <div
        class="fill-number-dialog__field"
        role="group"
        :aria-label="t('dataTools.fill.startValue')"
      >
        <span>{{ t("dataTools.fill.startValue") }}</span>
        <TInputNumber
          v-model="draft.start"
          theme="column"
          class="idea-input-number--persistent-controls"
          :aria-label="t('dataTools.fill.startValue')"
        />
      </div>
      <div class="fill-number-dialog__field" role="group" :aria-label="t('dataTools.fill.step')">
        <span>{{ t("dataTools.fill.step") }}</span>
        <TInputNumber
          v-model="draft.step"
          theme="column"
          class="idea-input-number--persistent-controls"
          :aria-label="t('dataTools.fill.step')"
        />
      </div>
      <p v-if="error" class="fill-number-dialog__error" role="alert">
        {{ error }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
@use "./fill-dialog";

.fill-number-dialog {
  @include fill-dialog.surface;

  &__field {
    @include fill-dialog.field-label;
  }

  &__error {
    @include fill-dialog.auxiliary-text;
    color: var(--idea-status-error);
  }
}
</style>
