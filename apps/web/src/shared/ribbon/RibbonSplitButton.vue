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
  display: inline-flex;
  flex: 0 0 auto;
  align-items: stretch;
  width: var(--ribbon-split-button-width, 40px);
  height: var(--ribbon-control-height, 26px);
  padding: 0;
  border-radius: var(--idea-radius-default);

  &:has(> [aria-disabled="false"]:hover),
  &:has(> [aria-expanded="true"][aria-disabled="false"]) {
    box-shadow: inset 0 0 0 1px var(--idea-border-subtle);
  }

  &.has-text {
    width: var(--ribbon-labeled-action-width, max-content);
    min-width: 40px;
  }

  &.is-full-width {
    width: 100%;
  }

  &.is-tall {
    --ribbon-icon-size: var(--idea-ribbon-large-icon-size);
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: var(--ribbon-row-gap, 2px);
    align-self: stretch;
    width: max-content;
    min-width: var(--ribbon-tall-action-min-width, 58px);
    height: var(--idea-ribbon-content-height, 54px);
    padding: 0;

    &.is-full-width {
      width: 100%;
    }

    .ribbon-split-button__main {
      justify-content: center;
      padding: 0 2px;
    }

    .ribbon-split-button__menu {
      gap: 2px;
      padding: 0 2px;
      border-radius: 0 0 2px 2px;
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
    justify-content: var(--ribbon-labeled-action-justify, flex-start);
    gap: 2px;
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
