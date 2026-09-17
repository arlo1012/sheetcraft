<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { AdvancedFilterDraft } from "../data-tools-types";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: AdvancedFilterDraft;
    busy?: boolean;
    error?: string;
    picking?: "listRange" | "criteriaRange" | "destination";
  }>(),
  { busy: false, error: "", picking: undefined },
);
const emit = defineEmits<{
  apply: [draft: AdvancedFilterDraft];
  close: [];
  pickRange: [field: "listRange" | "criteriaRange" | "destination"];
  draftChange: [draft: AdvancedFilterDraft];
}>();
const { t } = useAppI18n();
const draft = ref<AdvancedFilterDraft>({ ...props.initial });
watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.picking) draft.value = { ...props.initial };
  },
);
watch(
  () => props.initial,
  (initial) => {
    if (props.visible) draft.value = { ...initial };
  },
  { deep: true },
);
watch(
  draft,
  (value) => {
    if (JSON.stringify(value) !== JSON.stringify(props.initial)) emit("draftChange", { ...value });
  },
  { deep: true },
);
const canApply = computed(() =>
  Boolean(
    draft.value.listRange.trim() &&
    (draft.value.mode === "inPlace" || draft.value.destination.trim()),
  ),
);
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.advanced.title')"
    width="min(460px, calc(100vw - 32px))"
    :visible="visible && !picking"
    :header="t('dataTools.advanced.title')"
    :confirm-btn="{ content: t('dataTools.advanced.apply'), disabled: busy || !canApply }"
    :cancel-btn="t('dataTools.common.cancel')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="!busy && canApply && emit('apply', { ...draft })"
    ><div class="advanced-filter-dialog">
      <TRadioGroup v-model="draft.mode" class="advanced-filter-dialog__modes" :disabled="busy"
        ><TRadio value="inPlace">{{ t("dataTools.advanced.inPlace") }}</TRadio
        ><TRadio value="copy">{{ t("dataTools.advanced.copy") }}</TRadio></TRadioGroup
      ><label class="advanced-filter-dialog__field"
        ><span>{{ t("dataTools.advanced.listRange") }}</span>
        <TInput
          v-model="draft.listRange"
          :disabled="busy"
          :aria-label="t('dataTools.advanced.listRange')"
          autocomplete="off"
          placeholder="A1:C10"
        >
          <template #suffix
            ><TButton
              class="advanced-filter-dialog__range-picker"
              variant="text"
              shape="square"
              :disabled="busy"
              :aria-label="`${t('dataTools.advanced.pickRange')}：${t('dataTools.advanced.listRange')}`"
              :title="t('formulaTools.selectRange')"
              @click="emit('pickRange', 'listRange')"
              ><SquareMousePointer :size="16" aria-hidden="true" /></TButton
          ></template>
        </TInput>
      </label>
      <label class="advanced-filter-dialog__field"
        ><span>{{ t("dataTools.advanced.criteriaRange") }}</span>
        <TInput
          v-model="draft.criteriaRange"
          :disabled="busy"
          :aria-label="t('dataTools.advanced.criteriaRange')"
          autocomplete="off"
          placeholder="E1:F3"
        >
          <template #suffix
            ><TButton
              class="advanced-filter-dialog__range-picker"
              variant="text"
              shape="square"
              :disabled="busy"
              :aria-label="`${t('dataTools.advanced.pickRange')}：${t('dataTools.advanced.criteriaRange')}`"
              :title="t('formulaTools.selectRange')"
              @click="emit('pickRange', 'criteriaRange')"
              ><SquareMousePointer :size="16" aria-hidden="true" /></TButton
          ></template>
        </TInput>
      </label>
      <label
        class="advanced-filter-dialog__field"
        :class="{ 'is-disabled': draft.mode === 'inPlace' }"
        ><span>{{ t("dataTools.advanced.copyTo") }}</span>
        <TInput
          v-model="draft.destination"
          :disabled="busy || draft.mode === 'inPlace'"
          :aria-label="t('dataTools.advanced.copyTo')"
          autocomplete="off"
          placeholder="H1"
        >
          <template #suffix
            ><TButton
              class="advanced-filter-dialog__range-picker"
              variant="text"
              shape="square"
              :disabled="busy || draft.mode === 'inPlace'"
              :aria-label="`${t('dataTools.advanced.pickRange')}：${t('dataTools.advanced.copyTo')}`"
              :title="t('formulaTools.selectRange')"
              @click="emit('pickRange', 'destination')"
              ><SquareMousePointer :size="16" aria-hidden="true" /></TButton
          ></template>
        </TInput>
      </label>
      <TCheckbox v-model="draft.uniqueOnly" :disabled="busy">{{
        t("dataTools.advanced.uniqueOnly")
      }}</TCheckbox>
      <TCheckbox v-model="draft.overwrite" :disabled="busy || draft.mode === 'inPlace'">{{
        t("dataTools.advanced.overwrite")
      }}</TCheckbox>
      <p class="advanced-filter-dialog__hint">{{ t("dataTools.advanced.criteriaHint") }}</p>
      <p v-if="draft.mode === 'copy'" class="advanced-filter-dialog__hint">
        {{ t("dataTools.advanced.copyHint") }}
      </p>
      <p v-if="error" class="advanced-filter-dialog__error" role="alert">{{ error }}</p>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.advanced-filter-dialog {
  display: grid;
  gap: var(--idea-space-3);
  &__modes {
    display: grid;
    justify-items: start;
    gap: var(--idea-space-2);
  }
  &__field {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    align-items: center;
    gap: var(--idea-space-2);
    &.is-disabled {
      color: var(--idea-text-secondary);
    }
  }
  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
  }
  &__range-picker:hover {
    --td-bg-color-container-hover: transparent;
  }
  &__error {
    margin: 0;
    color: var(--td-error-color);
  }
}
</style>
