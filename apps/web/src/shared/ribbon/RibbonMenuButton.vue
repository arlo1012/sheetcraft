<script setup lang="ts">
import { ref } from "vue";
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
const rootElement = ref<HTMLButtonElement | null>(null);
defineExpose({ rootElement });

function activate(): void {
  if (!props.disabled) emit("activate");
}
</script>

<template>
  <button
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
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    :aria-haspopup="popupRole"
    :aria-expanded="expanded"
    :aria-controls="expanded ? menuId : undefined"
    :title="label"
    @click="activate"
  >
    <span class="ribbon-menu-button__icon" aria-hidden="true"><slot /></span>
    <span v-if="text" class="ribbon-menu-button__text" aria-hidden="true">{{ text }}</span>
    <RibbonDropdownArrow class="ribbon-menu-button__arrow" :expanded="expanded" />
  </button>
</template>

<style scoped lang="scss">
@use "./ribbon-actions" as ribbon;

.ribbon-menu-button {
  --ribbon-icon-size: var(--idea-control-icon-size);
  @include ribbon.action-button(var(--ribbon-menu-button-width, 40px));

  padding: 0 2px;

  &.has-text {
    justify-content: var(--ribbon-labeled-action-justify, flex-start);
    width: var(--ribbon-labeled-action-width, auto);
    min-width: 40px;
    gap: 2px;
    padding: 0 var(--ribbon-labeled-action-padding, 4px);
  }

  &.is-full-width {
    width: 100%;
  }

  &.is-tall {
    --ribbon-icon-size: var(--idea-ribbon-large-icon-size);
    position: relative;
    align-self: stretch;
    justify-content: center;
    width: max-content;
    min-width: var(--ribbon-tall-action-min-width, 58px);
    height: 54px;
    flex-direction: column;
    gap: 3px;
    padding: 2px;

    &.has-text {
      width: max-content;
      min-width: var(--ribbon-tall-action-min-width, 58px);
    }

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

  &.is-tall &__text {
    max-width: 100%;
    overflow: visible;
    text-align: center;
    text-overflow: clip;
  }

  &.is-full-width:not(.is-tall) &__text {
    flex: 1 1 auto;
  }

  &.is-tall &__arrow {
    position: absolute;
    top: 7px;
    right: 2px;
  }
}
</style>
