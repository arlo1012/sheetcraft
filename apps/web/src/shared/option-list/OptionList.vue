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
defineSlots<{
  option?: (props: { option: Option }) => unknown;
  icon?: (props: { option: Option }) => unknown;
  empty?: () => unknown;
}>();
const listRef = ref<HTMLElement>();
const itemAttribute = computed(() => props.itemDataAttribute ?? "data-option-list-value");
const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.modelValue),
);
const matchedIndex = computed(() => {
  const match = findOptionMatch(
    props.options.filter((option) => !option.disabled),
    props.searchText ?? "",
  );
  return match ? props.options.indexOf(match) : -1;
});
const enabledIndices = computed(() =>
  props.options.flatMap((option, index) => (option.disabled ? [] : [index])),
);
const activeIndex = computed(() => {
  const preferred = matchedIndex.value >= 0 ? matchedIndex.value : selectedIndex.value;
  return enabledIndices.value.includes(preferred) ? preferred : (enabledIndices.value[0] ?? -1);
});
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
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    !enabledIndices.value.length
  )
    return;
  const enabled = enabledIndices.value;
  const index = Math.max(0, enabled.indexOf(activeIndex.value));
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabled.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % enabled.length
          : event.key === "ArrowUp"
            ? (index - 1 + enabled.length) % enabled.length
            : -1;
  if (next < 0) return;
  event.preventDefault();
  const optionIndex = enabled[next]!;
  emit("select", props.options[optionIndex]!.value);
  void nextTick(() =>
    listRef.value?.querySelectorAll<HTMLButtonElement>("button")[optionIndex]?.focus(),
  );
}
function selectOption(value: Option["value"]): boolean {
  const option = props.options.find((option) => option.value === value);
  if (!option || option.disabled) return false;
  emit("select", value);
  return true;
}
function onOptionEnter(event: KeyboardEvent, value: Option["value"]): void {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    !props.options.some((option) => option.value === value && !option.disabled)
  )
    return;
  event.preventDefault();
  confirmOption(value);
}
function activateOption(value: Option["value"]): void {
  if (props.options.some((option) => option.value === value && !option.disabled))
    emit("activate", value);
}
function confirmOption(value: Option["value"]): void {
  if (selectOption(value)) activateOption(value);
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
        :tabindex="index === activeIndex ? 0 : -1"
        :disabled="option.disabled"
        :aria-disabled="option.disabled || undefined"
        :class="{ 'is-located': index === matchedIndex, 'has-icon': !!$slots.icon }"
        :data-option-list-match="index === matchedIndex ? '' : undefined"
        :style="{ color: option.disabled ? undefined : option.color }"
        :title="option.label"
        :[itemAttribute]="option.value"
        @click="selectOption(option.value)"
        @keydown.enter="onOptionEnter($event, option.value)"
        @dblclick="activateOption(option.value)"
      >
        <span v-if="$slots.icon" class="option-list__icon" aria-hidden="true"
          ><slot name="icon" :option="option"
        /></span>
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
    &.has-icon {
      display: flex;
      align-items: center;
      gap: var(--sheetcraft-space-2);
    }
  }
  &__icon {
    display: inline-flex;
    flex: none;
    :deep(svg) {
      width: var(--sheetcraft-action-icon-size);
      height: var(--sheetcraft-action-icon-size);
      stroke-width: var(--sheetcraft-icon-stroke-width);
    }
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
