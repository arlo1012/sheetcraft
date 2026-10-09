<script setup lang="ts">
import { ref } from "vue";
import { vIconAction } from "../focus/icon-action";
import RibbonDropdownArrow from "./RibbonDropdownArrow.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    text?: string;
    disabled?: boolean;
    pressed?: boolean | "mixed";
    variant?: "compact" | "tall";
    expanded?: boolean;
    popupRole?: "menu" | "dialog";
    menuId?: string;
    fullWidth?: boolean;
  }>(),
  {
    text: undefined,
    disabled: false,
    pressed: undefined,
    variant: "compact",
    expanded: false,
    popupRole: "menu",
    menuId: undefined,
    fullWidth: false,
  },
);

const emit = defineEmits<{ activate: [] }>();
const rootElement = ref<HTMLElement | null>(null);
defineExpose({ rootElement });

function activate(): void {
  if (!props.disabled) emit("activate");
}
</script>

<template>
  <span
    ref="rootElement"
    class="ribbon-menu-button ribbon-icon-action"
    :class="{
      'has-text': text,
      'is-pressed': pressed === true,
      'is-mixed': pressed === 'mixed',
      'is-expanded': expanded,
      'is-tall': variant === 'tall',
      'is-full-width': fullWidth,
    }"
    v-icon-action="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    :aria-haspopup="popupRole"
    :aria-expanded="expanded"
    :aria-controls="expanded ? menuId : undefined"
    :title="label"
    @click="activate"
  >
    <span class="ribbon-menu-button__icon" aria-hidden="true"><slot /></span>
    <span class="ribbon-menu-button__caption" aria-hidden="true">
      <span v-if="text" class="ribbon-menu-button__text">{{ text }}</span>
      <RibbonDropdownArrow class="ribbon-menu-button__arrow" :expanded="expanded" />
    </span>
  </span>
</template>

<style scoped lang="scss">
@use "./ribbon-actions" as ribbon;

.ribbon-menu-button {
  --ribbon-icon-size: var(--sheetcraft-action-icon-size);
  @include ribbon.action-button(var(--ribbon-menu-button-width, 40px));

  padding: 0 2px;

  &.has-text:not(.is-tall) {
    justify-content: var(--ribbon-labeled-action-justify, flex-start);
    width: var(--ribbon-labeled-action-width, auto);
    min-width: 40px;
    gap: var(--sheetcraft-space-2);
    padding: 0 var(--ribbon-labeled-action-padding, 4px);
  }

  &.is-full-width {
    width: 100%;
  }

  &.is-tall {
    --ribbon-icon-size: var(--sheetcraft-ribbon-large-icon-size);
    align-self: stretch;
    justify-content: center;
    width: max-content;
    min-width: var(--ribbon-tall-action-min-width, 48px);
    height: var(--sheetcraft-ribbon-content-height, 54px);
    @include ribbon.tall-content;
    padding: 0 6px;

    &.is-full-width {
      width: 100%;
    }
  }

  &__icon {
    @include ribbon.icon-slot;
  }

  &__text {
    @include ribbon.action-text;
    text-align: left;
  }

  &__arrow {
    flex: 0 0 auto;
  }

  &__caption {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }

  &.is-full-width:not(.is-tall) &__caption {
    flex: 1 1 auto;
  }

  &.is-tall &__text {
    max-width: 100%;
    overflow: visible;
    text-align: center;
    text-overflow: clip;
  }

  &.is-full-width:not(.is-tall) &__text {
    flex: 1 1 auto;
  }
}
</style>
