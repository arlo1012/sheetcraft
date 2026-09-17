<script setup lang="ts">
import { ref } from "vue";
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
const mainElement = ref<HTMLButtonElement | null>(null);
const menuElement = ref<HTMLButtonElement | null>(null);
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
    <button
      ref="mainElement"
      class="ribbon-split-button__main ribbon-split-action__main"
      type="button"
      data-ribbon-split-main
      :disabled="disabled"
      :aria-label="label"
      :aria-pressed="pressed"
      :title="label"
      @click="activate"
    >
      <span class="ribbon-split-button__icon ribbon-split-action__icon" aria-hidden="true"
        ><slot
      /></span>
      <span
        v-if="text"
        class="ribbon-split-button__text ribbon-split-action__text"
        aria-hidden="true"
        >{{ text }}</span
      >
    </button>
    <button
      ref="menuElement"
      class="ribbon-split-button__menu ribbon-split-action__menu"
      type="button"
      data-ribbon-split-menu
      :disabled="menuDisabled"
      :aria-label="menuLabel"
      :title="menuLabel"
      :aria-haspopup="popupRole"
      :aria-expanded="expanded"
      :aria-controls="expanded ? menuId : undefined"
      @click="toggleMenu"
      @keydown="emit('menuKeydown', $event)"
    >
      <RibbonDropdownArrow :expanded="expanded" />
    </button>
  </div>
</template>

<style scoped lang="scss">
@use "./ribbon-actions" as ribbon;

.ribbon-split-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: stretch;
  width: var(--ribbon-split-button-width, 40px);
  height: var(--ribbon-control-height, 26px);
  padding: 1px;
  border-radius: var(--idea-radius-default);

  &:hover:not(.is-disabled),
  &.is-expanded {
    background: color-mix(in srgb, var(--idea-icon-button-hover-bg) 50%, transparent);

    .ribbon-split-button__menu {
      background: var(--idea-icon-button-hover-bg);
    }
  }

  &:has(> button:focus-visible) {
    background: color-mix(in srgb, var(--idea-action-primary-subtle) 50%, transparent);

    .ribbon-split-button__menu {
      background: var(--idea-action-primary-subtle);
    }
  }

  &.has-text {
    width: var(--ribbon-labeled-action-width, max-content);
    min-width: 40px;
  }

  &.is-pressed {
    background: var(--idea-action-primary-subtle);
    color: var(--idea-action-primary);
  }

  &.is-full-width {
    width: 100%;
  }

  &.is-tall {
    align-self: stretch;
    width: max-content;
    min-width: var(--ribbon-tall-action-min-width, 58px);
    height: 54px;

    &.is-full-width {
      width: 100%;
    }

    .ribbon-split-button__main {
      flex-direction: column;
      justify-content: center;
      gap: 3px;
      padding: 1px 2px;
    }

    .ribbon-split-button__menu {
      align-items: flex-end;
      padding-bottom: 5px;
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
    appearance: none;
    background: transparent;
    border: 1px solid transparent;
    color: var(--idea-text-primary);
    cursor: pointer;
    font: inherit;
    outline: none;

    @include ribbon.focus-ring;

    &:disabled {
      color: var(--idea-text-secondary);
      cursor: default;
    }
  }

  &__main {
    flex: 1 1 auto;
    justify-content: var(--ribbon-labeled-action-justify, flex-start);
    gap: 2px;
    padding: 0 3px;
  }

  &__menu {
    flex: 0 0 12px;
    border-radius: 0 var(--idea-radius-default) var(--idea-radius-default) 0;
  }

  &__icon {
    @include ribbon.icon-slot;
  }

  &__text {
    @include ribbon.action-text;
  }
}
</style>
