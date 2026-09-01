<script setup lang="ts">
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  update: [color: string];
}>();

const { t } = useAppI18n();

function updateColor(event: Event): void {
  const color = (event.target as HTMLInputElement).value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) {
    emit("update", color);
  }
}
</script>

<template>
  <div class="border-color-panel">
    <div class="border-color-panel__grid" role="radiogroup" :aria-label="t('format.borderColor')">
      <button
        type="button"
        role="radio"
        data-border-color="#20242c"
        :aria-label="t('format.borderColorValue', { value: '#20242c' })"
        :aria-checked="modelValue === '#20242c'"
        @click="emit('update', '#20242c')"
      >
        <span style="--border-swatch-color: #20242c" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#6b7280"
        :aria-label="t('format.borderColorValue', { value: '#6b7280' })"
        :aria-checked="modelValue === '#6b7280'"
        @click="emit('update', '#6b7280')"
      >
        <span style="--border-swatch-color: #6b7280" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#ef4444"
        :aria-label="t('format.borderColorValue', { value: '#ef4444' })"
        :aria-checked="modelValue === '#ef4444'"
        @click="emit('update', '#ef4444')"
      >
        <span style="--border-swatch-color: #ef4444" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#f97316"
        :aria-label="t('format.borderColorValue', { value: '#f97316' })"
        :aria-checked="modelValue === '#f97316'"
        @click="emit('update', '#f97316')"
      >
        <span style="--border-swatch-color: #f97316" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#eab308"
        :aria-label="t('format.borderColorValue', { value: '#eab308' })"
        :aria-checked="modelValue === '#eab308'"
        @click="emit('update', '#eab308')"
      >
        <span style="--border-swatch-color: #eab308" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#22c55e"
        :aria-label="t('format.borderColorValue', { value: '#22c55e' })"
        :aria-checked="modelValue === '#22c55e'"
        @click="emit('update', '#22c55e')"
      >
        <span style="--border-swatch-color: #22c55e" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#3b82f6"
        :aria-label="t('format.borderColorValue', { value: '#3b82f6' })"
        :aria-checked="modelValue === '#3b82f6'"
        @click="emit('update', '#3b82f6')"
      >
        <span style="--border-swatch-color: #3b82f6" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        data-border-color="#8b5cf6"
        :aria-label="t('format.borderColorValue', { value: '#8b5cf6' })"
        :aria-checked="modelValue === '#8b5cf6'"
        @click="emit('update', '#8b5cf6')"
      >
        <span style="--border-swatch-color: #8b5cf6" aria-hidden="true" />
      </button>
    </div>
    <label class="border-color-panel__custom-color"
      ><span>{{ t("format.customBorderColor") }}</span
      ><input
        :value="modelValue"
        type="color"
        data-border-custom-color
        :aria-label="t('format.customBorderColor')"
        @input="updateColor"
    /></label>
  </div>
</template>

<style scoped lang="scss">
.border-color-panel {
  &__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--idea-border-subtle);

    > button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      padding: 3px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      cursor: pointer;

      &:hover,
      &:focus-visible,
      &[aria-checked="true"] {
        border-color: var(--idea-action-primary);
        outline: none;
      }

      > span {
        width: 100%;
        height: 100%;
        background: var(--border-swatch-color);
        border: 1px solid var(--idea-border-control);
      }
    }
  }

  &__custom-color {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    color: var(--idea-text-primary);
    font-size: 13px;

    input {
      width: 28px;
      height: 22px;
      padding: 1px;
      border: 1px solid var(--idea-border-control);
      border-radius: 2px;
      cursor: pointer;
    }
  }

  &__custom-color {
    margin-top: 7px;
  }
}
</style>
