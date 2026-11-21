<script setup lang="ts">
import { ref, useId, watch } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import FormatField from "../../../../shared/format-pane/FormatField.vue";
import { vNativeControl } from "../../../../shared/tdesign/native-control";

/** A mixed aggregate has no starting number to nudge, clamp, or expose as a common value. */
const props = defineProps<{
  ownerKey: string;
  label: string;
  placeholder: string;
  unit?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  invalidMessage: string;
  rejectedMessage: string;
  onCommit: (value: number) => boolean;
}>();
const inputId = `shape-mixed-number-${useId()}`;
const draft = ref(""),
  dirty = ref(false),
  error = ref<string>();
let skipBlur = false;
function reset() {
  draft.value = "";
  dirty.value = false;
  error.value = undefined;
  skipBlur = false;
}
watch(() => props.ownerKey, reset);
function edit(value: unknown) {
  if (props.disabled || typeof value !== "string") return;
  draft.value = value;
  dirty.value = true;
  error.value = undefined;
  skipBlur = false;
}
function commit() {
  if (props.disabled || !dirty.value) return;
  const text = draft.value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    error.value = props.invalidMessage;
    return;
  }
  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    (props.min !== undefined && value < props.min) ||
    (props.max !== undefined && value > props.max)
  ) {
    error.value = props.invalidMessage;
    return;
  }
  let accepted = false;
  try {
    accepted = props.onCommit(value) === true;
  } catch {
    /* Failed transactions retain every typed digit. */
  }
  if (!accepted) {
    error.value = props.rejectedMessage;
    return;
  }
  draft.value = String(value);
  dirty.value = false;
  error.value = undefined;
}
function blur() {
  if (skipBlur) {
    skipBlur = false;
    return;
  }
  commit();
}
function enter() {
  skipBlur = true;
  commit();
}
function keydown(_value: unknown, { e }: { e: KeyboardEvent }) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  reset();
}
</script>
<template>
  <FormatField :label="label" :error="error">
    <template #default="{ feedbackId }">
      <TInput
        v-native-control="{
          attributes: {
            id: inputId,
            name: inputId,
            'aria-label': label,
            'aria-describedby': feedbackId,
            'aria-invalid': error ? 'true' : undefined,
          },
        }"
        :model-value="draft"
        :placeholder="placeholder"
        :disabled="disabled"
        size="small"
        inputmode="decimal"
        :aria-label="label"
        :aria-describedby="feedbackId"
        :aria-invalid="!!error"
        :status="error ? 'error' : undefined"
        @change="edit"
        @blur="blur"
        @enter="enter"
        @keydown="keydown"
      >
        <template #suffix
          ><span v-if="unit" class="shape-format-mixed-number-unit">{{ unit }}</span></template
        >
      </TInput>
    </template>
  </FormatField>
</template>
<style scoped lang="scss">
.shape-format-mixed-number-unit {
  color: var(--sheetcraft-text-secondary);
  white-space: nowrap;
}
</style>
