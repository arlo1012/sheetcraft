<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    label: string;
    text?: string;
    disabled?: boolean;
    pressed?: boolean | "mixed";
    disclosure?: boolean;
    variant?: "compact" | "tall";
  }>(),
  {
    text: undefined,
    disabled: false,
    pressed: undefined,
    disclosure: false,
    variant: "compact",
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
      'is-tall': variant === 'tall',
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
      v-if="disclosure && !disabled"
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
  border-radius: 2px;
  color: var(--idea-text-primary);
  cursor: pointer;
  outline: none;

  &:hover:not(.is-disabled) {
    background: var(--idea-surface-hover);
  }

  &:focus-visible {
    border-color: var(--idea-action-primary);
    box-shadow: 0 0 0 2px var(--idea-action-focus);
  }

  &.is-pressed {
    background: var(--idea-action-primary-subtle);
    color: var(--idea-action-primary);
  }

  &.is-disabled {
    cursor: default;
    color: var(--idea-text-secondary);
  }

  &.has-text {
    width: auto;
    min-width: 27px;
    gap: 2px;
    padding: 0 1px;
  }

  &.is-tall {
    position: relative;
    align-self: stretch;
    width: 58px;
    min-width: 58px;
    height: 54px;
    flex-direction: column;
    gap: 3px;
    padding: 2px;

    &.has-text {
      width: 58px;
      min-width: 58px;
      gap: 3px;
      padding: 2px;
    }

    .ribbon-icon-action__text {
      max-width: 100%;
      overflow: visible;
      line-height: 13px;
      text-align: center;
      text-overflow: clip;
      white-space: normal;
    }

    .ribbon-icon-action__disclosure {
      position: absolute;
      top: 7px;
      right: 2px;
    }
  }

  &__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;

    &:empty {
      display: none;
    }
  }

  &__text {
    overflow: hidden;
    font-size: 12px;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__disclosure {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    color: var(--idea-text-muted);
  }
}
</style>
