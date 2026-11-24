<script setup lang="ts">
import { computed, ref } from "vue";
import { Bold, Italic, Strikethrough, Underline } from "lucide-vue-next";
import { useRovingButtonGroup } from "../focus/useRovingButtonGroup";
import RibbonButton from "../ribbon/RibbonButton.vue";

export type TextStyleToggleKey = "bold" | "italic" | "underline" | "strike";

export interface TextStyleToggleItem {
  key: TextStyleToggleKey;
  label: string;
  pressed: boolean | "mixed";
  disabled?: boolean;
  fieldAttr?: string;
  actionAttr?: string;
}

const props = withDefaults(
  defineProps<{
    items: readonly TextStyleToggleItem[];
    label: string;
    variant?: "ribbon" | "field";
    size?: "small" | "medium";
    historyControl?: string;
  }>(),
  { variant: "field", size: "small", historyControl: undefined },
);

const emit = defineEmits<{ toggle: [key: TextStyleToggleKey] }>();
const groupRef = ref<HTMLElement | null>(null);
const { resolveTabIndex, onFocusItem, onGroupFocusOut, onGroupKeydown } =
  useRovingButtonGroup(groupRef);
const preferredIndex = computed(() => {
  const active = props.items.findIndex((item) => !item.disabled && item.pressed === true);
  if (active >= 0) return active;
  return props.items.findIndex((item) => !item.disabled);
});
</script>

<template>
  <div
    ref="groupRef"
    class="text-style-toggle-group"
    :class="[
      `text-style-toggle-group--${variant}`,
      { 'text-style-toggle-group--medium': variant === 'field' && size === 'medium' },
    ]"
    role="group"
    :aria-label="label"
    @keydown="onGroupKeydown"
    @focusout="onGroupFocusOut"
  >
    <template v-if="variant === 'ribbon'">
      <RibbonButton
        v-for="item in items"
        :key="item.key"
        class="text-style-toggle-group__ribbon-button"
        :disabled="item.disabled"
        :label="item.label"
        :pressed="item.pressed"
        :data-shape-ribbon-action="item.actionAttr"
        :data-text-style-action="item.key"
        @activate="emit('toggle', item.key)"
      >
        <Bold v-if="item.key === 'bold'" aria-hidden="true" />
        <Italic v-else-if="item.key === 'italic'" aria-hidden="true" />
        <Underline v-else-if="item.key === 'underline'" aria-hidden="true" />
        <Strikethrough v-else aria-hidden="true" />
      </RibbonButton>
    </template>
    <template v-else>
      <button
        v-for="(item, index) in items"
        :key="item.key"
        type="button"
        class="text-style-toggle-group__button"
        :class="{ 'is-active': item.pressed === true, 'is-mixed': item.pressed === 'mixed' }"
        :disabled="item.disabled"
        :tabindex="resolveTabIndex(index, preferredIndex, item.disabled)"
        :aria-label="item.label"
        :title="item.label"
        :aria-pressed="item.pressed === 'mixed' ? 'mixed' : item.pressed"
        :data-shape-format-field="item.fieldAttr"
        :data-text-style-action="item.key"
        :data-format-pane-history-control="historyControl"
        @focus="onFocusItem(index)"
        @click="emit('toggle', item.key)"
      >
        <Bold v-if="item.key === 'bold'" aria-hidden="true" />
        <Italic v-else-if="item.key === 'italic'" aria-hidden="true" />
        <Underline v-else-if="item.key === 'underline'" aria-hidden="true" />
        <Strikethrough v-else aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.text-style-toggle-group {
  &--ribbon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    height: var(--ribbon-control-height, 26px);
  }

  &__ribbon-button {
    position: relative;

    &.is-mixed::after {
      position: absolute;
      right: 5px;
      bottom: 3px;
      left: 5px;
      height: 2px;
      background: var(--sheetcraft-text-muted);
      content: "";
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
  }

  &--medium {
    height: var(--sheetcraft-control-height-m);
  }

  &__button {
    position: relative;
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
      stroke-width: var(--sheetcraft-icon-stroke-width);
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

    &.is-mixed::after {
      position: absolute;
      right: 6px;
      bottom: 2px;
      left: 6px;
      height: 2px;
      border-radius: 1px;
      background: var(--sheetcraft-text-muted);
      content: "";
      pointer-events: none;
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
