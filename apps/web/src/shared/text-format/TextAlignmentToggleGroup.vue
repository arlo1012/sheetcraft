<script setup lang="ts">
import RibbonButton from "../ribbon/RibbonButton.vue";
import TextHorizontalAlignmentIcon from "./TextHorizontalAlignmentIcon.vue";
import TextVerticalAlignmentIcon from "./TextVerticalAlignmentIcon.vue";

export type TextAlignmentIconKind =
  | "left"
  | "center"
  | "right"
  | "justify"
  | "distributed"
  | "top"
  | "middle"
  | "bottom";

export interface TextAlignmentOption<T extends string = string> {
  value: T;
  label: string;
  icon: TextAlignmentIconKind;
  disabled?: boolean;
  actionAttr?: string;
}

withDefaults(
  defineProps<{
    options: readonly TextAlignmentOption[];
    modelValue?: string;
    mixed?: boolean;
    disabled?: boolean;
    label: string;
    variant?: "ribbon" | "field";
    size?: "small" | "medium";
    historyControl?: string;
  }>(),
  {
    modelValue: undefined,
    mixed: false,
    disabled: false,
    variant: "field",
    size: "small",
    historyControl: undefined,
  },
);

const emit = defineEmits<{ select: [value: string] }>();

function isVerticalIcon(icon: TextAlignmentIconKind): icon is "top" | "middle" | "bottom" {
  return icon === "top" || icon === "middle" || icon === "bottom";
}
</script>

<template>
  <div
    class="text-alignment-toggle-group"
    :class="[
      `text-alignment-toggle-group--${variant}`,
      {
        'is-mixed': mixed,
        'text-alignment-toggle-group--medium': variant === 'field' && size === 'medium',
      },
    ]"
    role="group"
    :aria-label="label"
  >
    <template v-if="variant === 'ribbon'">
      <RibbonButton
        v-for="option in options"
        :key="option.value"
        class="text-alignment-toggle-group__ribbon-button"
        :disabled="disabled || option.disabled"
        :label="option.label"
        :pressed="!mixed && modelValue === option.value"
        :data-shape-ribbon-action="option.actionAttr"
        :data-horizontal-alignment-action="!isVerticalIcon(option.icon) ? option.value : undefined"
        :data-vertical-alignment-action="isVerticalIcon(option.icon) ? option.value : undefined"
        @activate="emit('select', option.value)"
      >
        <TextVerticalAlignmentIcon v-if="isVerticalIcon(option.icon)" :alignment="option.icon" />
        <TextHorizontalAlignmentIcon v-else :alignment="option.icon" />
      </RibbonButton>
    </template>
    <template v-else>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="text-alignment-toggle-group__button"
        :class="{ 'is-active': !mixed && modelValue === option.value }"
        :disabled="disabled || option.disabled"
        :aria-label="option.label"
        :title="option.label"
        :aria-pressed="!mixed && modelValue === option.value"
        :data-text-alignment-option="option.value"
        :data-format-pane-history-control="historyControl"
        @click="emit('select', option.value)"
      >
        <TextVerticalAlignmentIcon v-if="isVerticalIcon(option.icon)" :alignment="option.icon" />
        <TextHorizontalAlignmentIcon v-else :alignment="option.icon" />
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.text-alignment-toggle-group {
  position: relative;

  &--ribbon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;

    &.is-mixed::after {
      position: absolute;
      right: 6px;
      bottom: 2px;
      left: 6px;
      height: 2px;
      background: var(--sheetcraft-text-muted);
      content: "";
      pointer-events: none;
    }
  }

  &--field {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 2px;
    width: 100%;
    min-width: 0;
    height: 24px;
    padding: 2px;
    box-sizing: border-box;
    border-radius: var(--sheetcraft-radius-default);
    background: var(--sheetcraft-surface-secondary);

    &.is-mixed::after {
      position: absolute;
      right: 8px;
      bottom: 2px;
      left: 8px;
      height: 2px;
      border-radius: 1px;
      background: var(--sheetcraft-text-muted);
      content: "";
      pointer-events: none;
    }
  }

  &--medium {
    height: var(--sheetcraft-control-height-m);
  }

  &__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: calc(var(--sheetcraft-radius-default) - 1px);
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    cursor: pointer;
    transition:
      background-color 0.12s ease,
      color 0.12s ease,
      box-shadow 0.12s ease;

    svg {
      width: var(--sheetcraft-control-icon-size);
      height: var(--sheetcraft-control-icon-size);
      flex-shrink: 0;
    }

    &:hover:not(:disabled):not(.is-active) {
      background: color-mix(in srgb, var(--sheetcraft-text-primary) 6%, transparent);
      color: var(--sheetcraft-text-primary);
    }

    &.is-active {
      background: var(--sheetcraft-surface-panel);
      color: var(--sheetcraft-action-primary);
      box-shadow: var(--sheetcraft-shadow-raised);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--sheetcraft-keyboard-focus-shadow);
    }

    &:disabled {
      color: var(--sheetcraft-text-disabled);
      cursor: not-allowed;
      box-shadow: none;
    }
  }
}
</style>
