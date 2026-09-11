<script setup lang="ts">
import { ref } from "vue";
import RibbonDropdownArrow from "./RibbonDropdownArrow.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    menuLabel: string;
    text?: string;
    disabled?: boolean;
    menuDisabled?: boolean;
    expanded?: boolean;
    menuId?: string;
    popupRole?: "menu" | "dialog";
  }>(),
  {
    text: undefined,
    disabled: false,
    menuDisabled: false,
    expanded: false,
    menuId: undefined,
    popupRole: "menu",
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
  <div ref="rootElement" class="ribbon-split-action" :class="{ 'has-text': text }">
    <button
      ref="mainElement"
      class="ribbon-split-action__main"
      type="button"
      data-ribbon-split-main
      :disabled="disabled"
      :aria-label="label"
      :title="label"
      @click="activate"
    >
      <span class="ribbon-split-action__icon" aria-hidden="true"><slot /></span>
      <span v-if="text" class="ribbon-split-action__text" aria-hidden="true">{{ text }}</span>
    </button>
    <button
      ref="menuElement"
      class="ribbon-split-action__menu"
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
      <RibbonDropdownArrow />
    </button>
  </div>
</template>

<style scoped lang="scss">
.ribbon-split-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: stretch;
  width: var(--cell-format-compact-track, 40px);
  height: var(--cell-format-control-height, 26px);
  padding: 1px;

  &.has-text {
    width: max-content;
    min-width: 40px;
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
    border: 0;
    color: var(--idea-text-primary);
    cursor: pointer;
    font: inherit;
    outline: none;

    &:hover:not(:disabled) {
      background: var(--idea-icon-button-hover-bg);
    }

    &:focus-visible {
      background: var(--idea-action-primary-subtle);
    }

    &:disabled {
      color: var(--idea-text-secondary);
      cursor: default;
      opacity: 0.45;
    }
  }

  &__main {
    flex: 1 1 auto;
    gap: 2px;
    padding: 0 2px;
    border-radius: 2px 0 0 2px;
  }

  &__menu {
    flex: 0 0 12px;
    border-radius: 0 2px 2px 0;
    color: var(--idea-text-muted);

    &[aria-expanded="true"] {
      background: var(--idea-icon-button-hover-bg);
    }
  }

  &__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  &__text {
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    white-space: nowrap;
  }
}
</style>
