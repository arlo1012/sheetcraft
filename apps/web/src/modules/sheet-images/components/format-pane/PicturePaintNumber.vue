<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Slider as TSlider } from "tdesign-vue-next/es/slider";
import PictureFormatField from "./PictureFormatField.vue";

const props = defineProps<{
  ownerKey: string;
  value: number;
  label: string;
  unit?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  invalidMessage: string;
  rejectedMessage: string;
  onCommit: (value: number) => boolean;
}>();
const text = ref(String(props.value)),
  dirty = ref(false),
  error = ref<string>();
let skipBlur = false;
const slider = computed(
  () =>
    props.unit === "%" &&
    props.min !== undefined &&
    props.max !== undefined &&
    props.min >= -100 &&
    props.max <= 100,
);
const sliderValue = computed(() =>
  Number.isFinite(Number(text.value)) ? Number(text.value) : props.value,
);
watch(
  () => props.ownerKey,
  () => {
    text.value = String(props.value);
    dirty.value = false;
    error.value = undefined;
    skipBlur = false;
  },
);
watch(
  () => props.value,
  (value) => {
    if (!dirty.value) text.value = String(value);
  },
);
function edit(value: unknown) {
  if (props.disabled || typeof value !== "string") return;
  text.value = value;
  dirty.value = true;
  error.value = undefined;
  skipBlur = false;
}
function commit() {
  if (props.disabled || !dirty.value) return;
  const input = text.value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input)) {
    error.value = props.invalidMessage;
    return;
  }
  const value = Number(input);
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
    /* A failed transaction keeps this draft. */
  }
  if (!accepted) {
    error.value = props.rejectedMessage;
    return;
  }
  text.value = String(value);
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
function nudge(direction: -1 | 1) {
  if (props.disabled) return;
  const value = Number(text.value);
  if (!text.value.trim() || !Number.isFinite(value)) {
    error.value = props.invalidMessage;
    return;
  }
  const next = Math.min(
    props.max ?? Infinity,
    Math.max(props.min ?? -Infinity, value + direction * (props.step ?? 1)),
  );
  edit(String(Math.round(next * 1e8) / 1e8));
  enter();
}
function slide(value: number | number[]) {
  if (typeof value === "number") edit(String(value));
}
function keydown(_value: unknown, context: { e: KeyboardEvent }) {
  if (context.e.key !== "Escape") return;
  context.e.preventDefault();
  context.e.stopPropagation();
  text.value = String(props.value);
  dirty.value = false;
  error.value = undefined;
}
</script>
<template>
  <PictureFormatField :label="label" :error="error">
    <template #default="{ feedbackId }">
      <div class="picture-paint-number">
        <div class="picture-paint-number__input">
          <button
            type="button"
            :disabled="disabled"
            :aria-label="`${label} −`"
            @mousedown.prevent
            @click="nudge(-1)"
          >
            −
          </button>
          <TInput
            :model-value="text"
            size="small"
            inputmode="decimal"
            :disabled="disabled"
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
              ><span v-if="unit" class="picture-paint-number-unit">{{ unit }}</span></template
            >
          </TInput>
          <button
            type="button"
            :disabled="disabled"
            :aria-label="`${label} +`"
            @mousedown.prevent
            @click="nudge(1)"
          >
            +
          </button>
        </div>
        <TSlider
          v-if="slider"
          :model-value="sliderValue"
          :min="min"
          :max="max"
          :step="step ?? 1"
          :disabled="disabled"
          :aria-label="label"
          @change="slide"
          @change-end="enter"
        />
      </div>
    </template>
  </PictureFormatField>
</template>
<style scoped lang="scss">
.picture-paint-number-unit {
  color: var(--sheetcraft-text-secondary);
  white-space: nowrap;
}
.picture-paint-number {
  display: grid;
  gap: 3px;
  min-width: 0;
  &__input {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 3px;
  }
  &__input > :nth-child(2) {
    flex: 1;
    min-width: 0;
  }
  &__input button {
    flex: 0 0 22px;
    width: 22px;
    height: 25px;
    padding: 0;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
    background: var(--sheetcraft-surface-panel);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  &__input button:hover:not(:disabled) {
    background: var(--sheetcraft-surface-hover);
  }
  &__input button:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
</style>
