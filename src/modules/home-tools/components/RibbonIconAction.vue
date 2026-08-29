<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
    pressed?: boolean | "mixed";
    warning?: boolean;
  }>(),
  {
    disabled: false,
    pressed: undefined,
    warning: false,
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
      'is-warning': warning,
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
    <slot />
  </span>
</template>

<style scoped lang="scss">
.ribbon-icon-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
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
    opacity: 0.52;
  }

  &.is-warning {
    color: var(--td-warning-color, #d97706);
    opacity: 0.72;
  }
}
</style>
