<script setup lang="ts">
import { nextTick, ref } from "vue";

type FormatOption = Readonly<{ code: string; label: string; color?: string }>;
const props = defineProps<{
  modelValue: string;
  options: readonly FormatOption[];
  label: string;
  monospace?: boolean;
}>();
const emit = defineEmits<{ select: [code: string] }>();
const listRef = ref<HTMLElement>();
function onKeydown(event: KeyboardEvent): void {
  if (!props.options.length) return;
  const index = Math.max(
    0,
    props.options.findIndex(({ code }) => code === props.modelValue),
  );
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
  emit("select", props.options[next]!.code);
  void nextTick(() => listRef.value?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus());
}
</script>
<template>
  <div
    ref="listRef"
    class="number-format-types"
    :class="{ 'is-monospace': monospace }"
    role="listbox"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <div class="number-format-types__items">
      <button
        v-for="(option, index) in options"
        :key="option.code"
        type="button"
        role="option"
        :aria-selected="modelValue === option.code"
        :tabindex="
          modelValue === option.code ||
          (!options.some((item) => item.code === modelValue) && index === 0)
            ? 0
            : -1
        "
        :style="{ color: option.color }"
        :title="option.label"
        :data-cell-format-type="option.code"
        @click="emit('select', option.code)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
<style scoped lang="scss">
.number-format-types {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--idea-border-control);
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
    min-height: 28px;
    padding: 4px 8px;
    border: 0;
    border-radius: var(--idea-radius-small);
    background: transparent;
    color: var(--idea-text-primary);
    font: inherit;
    font-size: 13px;
    line-height: 20px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
      background: var(--idea-surface-hover);
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
    font-size: 12px;
  }
}
</style>
