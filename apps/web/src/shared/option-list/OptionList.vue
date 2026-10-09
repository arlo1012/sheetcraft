<script setup lang="ts" generic="Option extends OptionListOption">
import { computed, nextTick, ref, watch } from "vue";
import { findOptionMatch, type OptionListOption } from "./option-list";

const props = defineProps<{
  modelValue: Option["value"] | undefined;
  options: readonly Option[];
  label: string;
  searchText?: string;
  variant?: "navigation" | "compact";
  itemDataAttribute?: `data-${string}`;
  monospace?: boolean;
  overflow?: "scroll" | "ellipsis";
}>();
const emit = defineEmits<{
  select: [value: Option["value"]];
  activate: [value: Option["value"]];
}>();
defineSlots<{ option?: (props: { option: Option }) => unknown; empty?: () => unknown }>();
const listRef = ref<HTMLElement>();
const itemAttribute = computed(() => props.itemDataAttribute ?? "data-option-list-value");
const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.modelValue),
);
const matchedIndex = computed(() => {
  const match = findOptionMatch(props.options, props.searchText ?? "");
  return match ? props.options.indexOf(match) : -1;
});
const activeIndex = computed(() =>
  matchedIndex.value >= 0 ? matchedIndex.value : selectedIndex.value,
);
watch(
  [activeIndex, () => props.options],
  () => {
    void nextTick(() => {
      const list = listRef.value;
      const buttons = list?.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons?.[0];
      const selected = buttons?.[activeIndex.value];
      if (!list || !first || !selected) return;
      const top = selected.offsetTop - first.offsetTop + 4;
      const bottom = top + selected.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight;
    });
  },
  { immediate: true },
);
function onKeydown(event: KeyboardEvent): void {
  if (!props.options.length) return;
  const index = Math.max(0, activeIndex.value);
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
  emit("select", props.options[next]!.value);
  void nextTick(() => listRef.value?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus());
}
function confirmOption(value: Option["value"]): void {
  emit("select", value);
  emit("activate", value);
}
</script>
<template>
  <div
    ref="listRef"
    class="option-list"
    :class="{
      'is-navigation': variant === 'navigation',
      'is-monospace': monospace,
      'is-ellipsis': overflow === 'ellipsis',
    }"
    role="listbox"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <div class="option-list__items">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        role="option"
        :aria-selected="modelValue === option.value"
        :tabindex="index === Math.max(0, activeIndex) ? 0 : -1"
        :class="{ 'is-located': index === matchedIndex }"
        :data-option-list-match="index === matchedIndex ? '' : undefined"
        :style="{ color: option.color }"
        :title="option.label"
        :[itemAttribute]="option.value"
        @click="emit('select', option.value)"
        @keydown.enter.prevent="confirmOption(option.value)"
        @dblclick="emit('activate', option.value)"
      >
        <slot name="option" :option="option">{{ option.label }}</slot>
      </button>
    </div>
    <slot v-if="!options.length" name="empty" />
  </div>
</template>
<style scoped lang="scss">
@use "./option-list";

.option-list {
  @include option-list.surface;

  &__items {
    width: max-content;
    min-width: 100%;
  }

  button {
    @include option-list.item;
  }
  &.is-ellipsis {
    .option-list__items {
      width: 100%;
    }
    button {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  &.is-monospace button {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  &.is-navigation {
    .option-list__items {
      width: 100%;
    }
    button {
      min-height: 28px;
      padding: 4px 8px;
      white-space: normal;

      &[aria-selected="true"] {
        font-weight: var(--sheetcraft-font-weight-medium);
      }
    }
  }
}
</style>
