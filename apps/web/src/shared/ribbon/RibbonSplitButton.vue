<script setup lang="ts">
import { ref } from "vue";
import { vIconAction } from "../focus/icon-action";
import RibbonDropdownArrow from "./RibbonDropdownArrow.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    menuLabel: string;
    text?: string;
    disabled?: boolean;
    pressed?: boolean;
    menuDisabled?: boolean;
    expanded?: boolean;
    menuId?: string;
    popupRole?: "menu" | "dialog";
    variant?: "compact" | "tall";
    fullWidth?: boolean;
  }>(),
  {
    text: undefined,
    disabled: false,
    pressed: undefined,
    menuDisabled: false,
    expanded: false,
    menuId: undefined,
    popupRole: "menu",
    variant: "compact",
    fullWidth: false,
  },
);

const emit = defineEmits<{
  activate: [];
  toggleMenu: [];
  menuKeydown: [event: KeyboardEvent];
}>();
const rootElement = ref<HTMLDivElement | null>(null);
const mainElement = ref<HTMLElement | null>(null);
const menuElement = ref<HTMLElement | null>(null);
defineExpose({ rootElement, mainElement, menuElement });

function activate(): void {
  if (!props.disabled) emit("activate");
}

function toggleMenu(): void {
  if (!props.menuDisabled) emit("toggleMenu");
}
</script>

<template>
  <div
    ref="rootElement"
    class="ribbon-split-button ribbon-split-action"
    :class="{
      'has-text': text,
      'is-expanded': expanded,
      'is-disabled': disabled && menuDisabled,
      'is-pressed': pressed,
      'is-tall': variant === 'tall',
      'is-full-width': fullWidth,
    }"
  >
    <span
      ref="mainElement"
      class="ribbon-split-button__main ribbon-split-action__main"
      data-ribbon-split-main
      v-icon-action="disabled"
      :aria-label="label"
      :aria-pressed="pressed"
      :title="label"
      @click="activate"
    >
      <span class="ribbon-split-button__icon ribbon-split-action__icon" aria-hidden="true"
        ><slot
      /></span>
      <span
        v-if="text && variant !== 'tall'"
        class="ribbon-split-button__text ribbon-split-action__text"
        aria-hidden="true"
        >{{ text }}</span
      >
    </span>
    <span
      ref="menuElement"
      class="ribbon-split-button__menu ribbon-split-action__menu"
      data-ribbon-split-menu
      v-icon-action="menuDisabled"
      :aria-label="menuLabel"
      :title="menuLabel"
      :aria-haspopup="popupRole"
      :aria-expanded="expanded"
      :aria-controls="expanded ? menuId : undefined"
      @click="toggleMenu"
      @keydown="emit('menuKeydown', $event)"
    >
      <span
        v-if="text && variant === 'tall'"
        class="ribbon-split-button__text"
        aria-hidden="true"
        >{{ text }}</span
      >
      <RibbonDropdownArrow :expanded="expanded" />
    </span>
  </div>
</template>

<style scoped lang="scss">
@use "./ribbon-actions" as ribbon;

.ribbon-split-button {
  --ribbon-icon-size: var(--idea-action-icon-size);
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: stretch;
  width: var(--ribbon-split-button-width, 40px);
  height: var(--ribbon-control-height, 26px);
  padding: 0;
  border-radius: var(--idea-radius-default);

  &:has(> [aria-disabled="false"]:hover)::after,
  &:has(> [aria-expanded="true"][aria-disabled="false"])::after {
    position: absolute;
    inset: 1px;
    border-radius: var(--idea-radius-default);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--idea-text-primary) 14%, transparent);
    content: "";
    pointer-events: none;
  }

  &.has-text {
    width: var(--ribbon-labeled-action-width, max-content);
    min-width: 40px;
  }

  &.is-full-width {
    width: 100%;
  }

  &:not(.is-tall) &__main {
    --ribbon-feedback-inset: 1px 0 1px 1px;

    &::before {
      border-radius: var(--idea-radius-default) 0 0 var(--idea-radius-default);
    }
  }

  &.has-text:not(.is-tall) &__main {
    justify-content: var(--ribbon-labeled-action-justify, flex-start);
    padding: 0 var(--ribbon-labeled-action-padding, 4px);
  }

  &:not(.is-tall) &__menu {
    --ribbon-feedback-inset: 1px 1px 1px 0;
    box-sizing: border-box;
    padding-right: 1px;

    &::before {
      border-radius: 0 var(--idea-radius-default) var(--idea-radius-default) 0;
    }
  }

  &.is-tall {
    --ribbon-icon-size: var(--idea-ribbon-large-icon-size);
    @include ribbon.tall-content;
    align-items: stretch;
    justify-items: stretch;
    align-self: stretch;
    width: max-content;
    min-width: var(--ribbon-tall-action-min-width, 48px);
    height: var(--idea-ribbon-content-height, 54px);
    padding: 0;

    &:has(> [aria-pressed="true"][aria-disabled="false"])::after,
    &:has(> [aria-expanded="true"][aria-disabled="false"])::after,
    &:has(> [aria-disabled="false"]:hover)::after,
    &:has(> [aria-disabled="false"]:active)::after {
      position: absolute;
      inset: 1px;
      border-radius: var(--idea-radius-default);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--idea-text-primary) 14%, transparent);
      content: "";
      pointer-events: none;
    }

    &.is-full-width {
      width: 100%;
    }

    .ribbon-split-button__main {
      --ribbon-feedback-inset: 1px 1px calc(-1 * var(--ribbon-row-gap, 2px));
      justify-content: center;
      padding: 0 6px;

      &::before {
        border-radius: var(--idea-radius-default) var(--idea-radius-default) 0 0;
      }
    }

    .ribbon-split-button__menu {
      gap: 2px;
      padding: 0 6px;
      border-radius: 0 0 var(--idea-radius-default) var(--idea-radius-default);

      &::before {
        border-radius: 0 0 var(--idea-radius-default) var(--idea-radius-default);
      }
    }
  }

  &__main,
  &__menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    margin: 0;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 2px;
    color: var(--idea-text-primary);
    cursor: pointer;
    font: inherit;
    outline: none;

    @include ribbon.focus-ring;
    @include ribbon.feedback;
  }

  &__main {
    flex: 1 1 auto;
    gap: var(--idea-space-2);
    padding: 0 3px;
  }

  &__menu {
    flex: 0 0 12px;
    border-radius: 0 2px 2px 0;
  }

  &__icon {
    @include ribbon.icon-slot;
  }

  &__text {
    @include ribbon.action-text;
  }
}
</style>
