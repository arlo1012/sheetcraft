<script setup lang="ts">
import { SquareMousePointer } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
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
const { t } = useAppI18n();
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
      <TCheckbox v-if="mode === 'count'" :checked="false" disabled>
        {{ t("dataTools.duplicates.insertChartTodo") }}
      </TCheckbox>
      <label class="duplicate-values-dialog__field">
        <span>{{ t("dataTools.duplicates.range") }}</span>
        <TInput
          v-model="draft.range"
          :disabled="busy"
          autocomplete="off"
          placeholder="A1:A10"
          :aria-label="t('dataTools.duplicates.range')"
        >
          <template #suffix
            ><TButton
              variant="text"
              shape="square"
              :disabled="busy"
              :aria-label="`${t('dataTools.duplicates.pickRange')}：${t('dataTools.duplicates.range')}`"
              :title="t('formulaTools.selectRange')"
              @click="emit('pickRange')"
              ><template #icon
                ><SquareMousePointer :size="16" aria-hidden="true" /></template></TButton
          ></template>
        </TInput>
      </label>
      <div v-if="mode === 'highlight'" class="duplicate-values-dialog__field">
        <span>{{ t("dataTools.duplicates.fillColor") }}</span>
        <TRadioGroup
          v-model="draft.fillColor"
          class="duplicate-values-dialog__colors"
          :disabled="busy"
          :aria-label="t('dataTools.duplicates.fillColor')"
        >
          <TRadio v-for="color in colors" :key="color.value" :value="color.value"
            ><span
              class="duplicate-values-dialog__swatch"
              :style="{ backgroundColor: color.value }"
              aria-hidden="true"
            />{{ t(`dataTools.duplicates.colors.${color.label}`) }}</TRadio
          >
        </TRadioGroup>
      </div>
      <p v-if="mode === 'count'" class="duplicate-values-dialog__hint">
        {{ t("dataTools.duplicates.countHint") }}
      </p>
      <p v-if="error" class="duplicate-values-dialog__error" role="alert">
        {{ error }}
      </p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.duplicate-values-dialog {
  display: grid;
  gap: var(--idea-space-2);
  &__field {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    align-items: center;
    gap: var(--idea-space-2);
  }
  &__colors {
    display: grid;
    gap: var(--idea-space-1);
  }
  &__swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-right: var(--idea-space-1);
    border: 1px solid var(--idea-border-subtle);
    border-radius: 2px;
    vertical-align: -2px;
  }
  &__hint,
  &__error {
    margin: 0;
  }
  &__hint {
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
  }
  &__error {
    color: var(--idea-status-error);
  }
}
</style>
