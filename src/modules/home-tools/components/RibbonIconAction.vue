<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    label: string;
    text?: string;
    disabled?: boolean;
    pressed?: boolean | "mixed";
    disclosure?: boolean;
  }>(),
  {
    text: undefined,
    disabled: false,
    pressed: undefined,
    disclosure: false,
  },
);

const emit = defineEmits<{
  activate: [];
}>();

function activate(): void {
  if (!props.disabled) {
    emit("activate");
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
    return;
  }
  event.preventDefault();
  activate();
}
</script>

<template>
  <span
    class="ribbon-icon-action"
    :class="{
      'is-disabled': disabled,
      'is-pressed': pressed === true,
      'is-mixed': pressed === 'mixed',
      'has-text': text,
    }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-label="label"
    :aria-disabled="disabled"
    :aria-pressed="pressed"
    :title="label"
    @click="activate"
    @keydown="onKeydown"
  >
    <span class="ribbon-icon-action__icon" aria-hidden="true">
      <slot />
    </span>
    <span v-if="text" class="ribbon-icon-action__text" aria-hidden="true">{{ text }}</span>
    <ChevronDown
      v-if="disclosure"
      class="ribbon-icon-action__disclosure"
      :size="11"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped lang="scss">
.ribbon-icon-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--td-text-color-primary);
  cursor: pointer;
  outline: none;

  &:hover:not(.is-disabled) {
    background: var(--td-bg-color-container-hover);
  }

  &:focus-visible {
    border-color: var(--td-brand-color);
    box-shadow: 0 0 0 2px var(--td-brand-color-focus);
  }

  &.is-pressed {
    background: var(--td-brand-color-light);
    color: var(--td-brand-color);
  }

  &.is-disabled {
    cursor: default;
    color: var(--td-text-color-secondary);
    opacity: 0.64;
  }

  &.has-text {
    width: auto;
    min-width: 27px;
    gap: 3px;
    padding: 0 3px;
  }

  &__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  &__text {
    overflow: hidden;
    font-size: 11px;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__disclosure {
    flex: 0 0 auto;
    color: var(--td-text-color-placeholder);
  }
}
</style>
