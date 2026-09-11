<script setup lang="ts" generic="Value extends string">
import { computed, nextTick, ref } from "vue";

type FormatOption = Readonly<{ code: Value; value?: Value; label: string; color?: string }>;
const props = defineProps<{
  modelValue: Value | undefined;
  options: readonly FormatOption[];
  label: string;
  variant?: "category" | "type";
  monospace?: boolean;
}>();
const emit = defineEmits<{ select: [code: Value] }>();
const listRef = ref<HTMLElement>();
const selectedIndex = computed(() =>
  props.options.findIndex((option) => optionValue(option) === props.modelValue),
);
function onKeydown(event: KeyboardEvent): void {
  if (!props.options.length) return;
  const index = Math.max(0, selectedIndex.value);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? props.options.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % props.options.length
          : event.key === "ArrowUp"
            ? (index - 1 + props.options.length) % props.options.length
            : -1;
  if (next < 0) return;
  event.preventDefault();
  emit("select", optionValue(props.options[next]!));
  void nextTick(() => listRef.value?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus());
}
function optionValue(option: FormatOption): Value {
  return option.value ?? option.code;
}
</script>
<template>
  <div
    ref="listRef"
    class="number-format-options"
    :class="{ 'is-category': variant === 'category', 'is-monospace': monospace }"
    role="listbox"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <div class="number-format-options__items">
      <button
        v-for="(option, index) in options"
        :key="optionValue(option)"
        type="button"
        role="option"
        :aria-selected="modelValue === optionValue(option)"
        :tabindex="index === Math.max(0, selectedIndex) ? 0 : -1"
        :style="{ color: option.color }"
        :title="option.label"
        :data-cell-format-number-category="variant === 'category' ? optionValue(option) : undefined"
        :data-cell-format-type="variant !== 'category' ? optionValue(option) : undefined"
        @click="emit('select', optionValue(option))"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
<style scoped lang="scss">
.number-format-options {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  background: var(--idea-surface-panel);

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  &::-webkit-scrollbar-track,
  &::-webkit-scrollbar-corner {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--idea-scrollbar-thumb);
    background-clip: padding-box;

    &:hover {
      background-color: var(--idea-scrollbar-thumb-hover);
    }
  }
  &::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
  }
  @supports not selector(::-webkit-scrollbar) {
    scrollbar-width: thin;
    scrollbar-color: var(--idea-scrollbar-thumb) transparent;
  }

  &__items {
    width: max-content;
    min-width: 100%;
  }

  button {
    display: block;
    width: 100%;
    min-height: 24px;
    padding: 2px 8px;
    border: 0;
    border-radius: var(--idea-radius-small);
    background: transparent;
    color: var(--idea-text-primary);
    font: inherit;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;

    &:hover:not([aria-selected="true"]) {
      background: var(--idea-surface-secondary);
    }
    &[aria-selected="true"] {
      background: var(--idea-surface-active);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }
  &.is-monospace button {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  &.is-category {
    .number-format-options__items {
      width: 100%;
    }
    button {
      min-height: 28px;
      padding: 4px 8px;
      white-space: normal;

      &[aria-selected="true"] {
        font-weight: var(--idea-font-weight-medium);
      }
    }
  }
}
@media (max-width: 480px) {
  .number-format-options.is-category .number-format-options__items {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
