<script setup lang="ts">
import { ref } from "vue";
import { vIconAction } from "../focus/icon-action";

const props = withDefaults(
  defineProps<{
    label: string;
    text?: string;
    disabled?: boolean;
    pressed?: boolean | "mixed";
    variant?: "compact" | "tall";
    fullWidth?: boolean;
  }>(),
  {
    text: undefined,
    disabled: false,
    pressed: undefined,
    variant: "compact",
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
    class="ribbon-button ribbon-icon-action"
    :class="{
      'has-text': text,
      'is-pressed': pressed === true,
      'is-mixed': pressed === 'mixed',
      'is-tall': variant === 'tall',
      'is-full-width': fullWidth,
    }"
    v-icon-action="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    :title="label"
    @click="activate"
  >
    <span class="ribbon-button__icon" aria-hidden="true"><slot /></span>
    <span v-if="text" class="ribbon-button__text" aria-hidden="true">{{ text }}</span>
  </span>
</template>

<style scoped lang="scss">
@use "./ribbon-actions" as ribbon;

.ribbon-button {
  --ribbon-icon-size: var(--idea-action-icon-size);
  @include ribbon.action-button(var(--ribbon-button-width, 27px));

  padding: 0;

  &:not(.has-text):not(.is-tall) {
    width: calc(var(--ribbon-button-width, 27px) - 3px);
    height: calc(var(--ribbon-control-height, 26px) - 2px);
    margin: 1px 1.5px;
    border-radius: 4px;
  }

  &.has-text:not(.is-tall) {
    justify-content: var(--ribbon-labeled-action-justify, flex-start);
    width: var(--ribbon-labeled-action-width, auto);
    min-width: 27px;
    gap: 2px;
    padding: 0 var(--ribbon-labeled-action-padding, 4px);
  }

  &.is-full-width {
    width: 100%;
  }

  &.is-tall {
    --ribbon-icon-size: var(--idea-ribbon-large-icon-size);
    align-self: stretch;
    justify-content: center;
    width: max-content;
    min-width: var(--ribbon-tall-action-min-width, 58px);
    height: var(--idea-ribbon-content-height, 54px);
    @include ribbon.tall-content;
    padding: 0 2px;

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
