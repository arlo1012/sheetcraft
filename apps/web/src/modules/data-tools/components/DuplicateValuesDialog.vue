<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { DuplicateToolDraft, DuplicateToolMode } from "../duplicate-tools-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode: DuplicateToolMode;
    initial: DuplicateToolDraft;
    error?: string;
    busy?: boolean;
    picking?: boolean;
  }>(),
  { error: "", busy: false, picking: false },
);
const emit = defineEmits<{
  apply: [draft: DuplicateToolDraft];
  close: [];
  pickRange: [];
  draftChange: [draft: DuplicateToolDraft];
}>();
const { t, locale } = useAppI18n();
const draft = ref<DuplicateToolDraft>({ ...props.initial });
const colors = [
  { value: "#ffc7ce", label: "lightRed" },
  { value: "#ffeb9c", label: "yellow" },
  { value: "#c6efce", label: "green" },
] as const;
const title = computed(() => t(`dataTools.duplicates.${props.mode}Title`));
const canApply = computed(() => Boolean(draft.value.range.trim()));
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
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    width="min(440px, calc(100vw - 32px))"
    :visible="visible && !picking"
    :header="title"
    :confirm-btn="{
      content: t('dataTools.duplicates.apply'),
      disabled: busy || !canApply,
    }"
    :cancel-btn="t('dataTools.common.cancel')"
    :close-btn="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="!busy && canApply && emit('apply', { ...draft })"
  >
    <div class="duplicate-values-dialog">
      <TForm :data="draft" label-align="right" :label-width="locale === 'zh-CN' ? 88 : 104">
        <TFormItem name="range" :label="t('dataTools.duplicates.range')">
          <TInput
            v-model="draft.range"
            :disabled="busy"
            autocomplete="off"
            placeholder="A1:A10"
            :aria-label="t('dataTools.duplicates.range')"
          >
            <template #suffixIcon
              ><SquareMousePointer
                class="idea-input-action-icon"
                :aria-disabled="busy"
                :aria-label="`${t('dataTools.duplicates.pickRange')}：${t('dataTools.duplicates.range')}`"
                @click="!busy && emit('pickRange')"
            /></template>
          </TInput>
        </TFormItem>
        <TFormItem v-if="mode === 'count'">
          <TCheckbox :checked="false" disabled>
            {{ t("dataTools.duplicates.insertChartTodo") }}
          </TCheckbox>
        </TFormItem>
        <TFormItem
          v-if="mode === 'highlight'"
          name="fillColor"
          :label="t('dataTools.duplicates.fillColor')"
        >
          <TRadioGroup
            v-model="draft.fillColor"
            direction="horizontal"
            :disabled="busy"
            :aria-label="t('dataTools.duplicates.fillColor')"
          >
            <TRadio v-for="color in colors" :key="color.value" :value="color.value"
              ><span class="duplicate-values-dialog__color-label"
                ><span
                  class="duplicate-values-dialog__swatch"
                  :style="{ backgroundColor: color.value }"
                  aria-hidden="true"
                />{{ t(`dataTools.duplicates.colors.${color.label}`) }}</span
              ></TRadio
            >
          </TRadioGroup>
        </TFormItem>
      </TForm>
      <p v-if="error" class="duplicate-values-dialog__error" role="alert">
        {{ error }}
      </p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.duplicate-values-dialog {
  display: grid;
  gap: var(--sheetcraft-space-2);
  &__color-label {
    display: inline-flex;
    align-items: center;
    gap: var(--sheetcraft-space-1);
    vertical-align: top;
  }
  &__swatch {
    flex: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: 2px;
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
