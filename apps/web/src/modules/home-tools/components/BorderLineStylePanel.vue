<script setup lang="ts">
import { Check } from "lucide-vue-next";
import type { CellBorderLineStyle } from "@idea10/core/style";
import { useAppI18n } from "../../../shared/i18n";

withDefaults(
  defineProps<{
    modelValue: CellBorderLineStyle;
    variant?: "menu" | "settings";
  }>(),
  { variant: "menu" },
);

const emit = defineEmits<{
  select: [style: CellBorderLineStyle];
}>();

const { t } = useAppI18n();
</script>

<template>
  <div v-if="variant === 'menu'" class="border-line-style-panel border-line-style-panel--menu">
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="thin"
      :aria-label="t('format.borderLineThin')"
      :aria-checked="modelValue === 'thin'"
      @click="emit('select', 'thin')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--thin"
        aria-hidden="true"
      /><Check :size="15" :class="{ 'is-visible': modelValue === 'thin' }" aria-hidden="true" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="medium"
      :aria-label="t('format.borderLineMedium')"
      :aria-checked="modelValue === 'medium'"
      @click="emit('select', 'medium')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--medium"
        aria-hidden="true"
      /><Check :size="15" :class="{ 'is-visible': modelValue === 'medium' }" aria-hidden="true" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dashed"
      :aria-label="t('format.borderLineDashed')"
      :aria-checked="modelValue === 'dashed'"
      @click="emit('select', 'dashed')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--dashed"
        aria-hidden="true"
      /><Check :size="15" :class="{ 'is-visible': modelValue === 'dashed' }" aria-hidden="true" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="dotted"
      :aria-label="t('format.borderLineDotted')"
      :aria-checked="modelValue === 'dotted'"
      @click="emit('select', 'dotted')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--dotted"
        aria-hidden="true"
      /><Check :size="15" :class="{ 'is-visible': modelValue === 'dotted' }" aria-hidden="true" />
    </button>
    <button
      type="button"
      role="menuitemradio"
      data-border-line-option="double"
      :aria-label="t('format.borderLineDouble')"
      :aria-checked="modelValue === 'double'"
      @click="emit('select', 'double')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--double"
        aria-hidden="true"
      /><Check :size="15" :class="{ 'is-visible': modelValue === 'double' }" aria-hidden="true" />
    </button>
  </div>

  <div
    v-else
    class="cell-border-menu__settings-styles border-line-style-panel"
    :aria-label="t('format.borderLineStyle')"
  >
    <button
      type="button"
      data-border-settings-style="thin"
      :aria-label="t('format.borderLineThin')"
      :aria-pressed="modelValue === 'thin'"
      @click="emit('select', 'thin')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--thin"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      data-border-settings-style="medium"
      :aria-label="t('format.borderLineMedium')"
      :aria-pressed="modelValue === 'medium'"
      @click="emit('select', 'medium')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--medium"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      data-border-settings-style="dashed"
      :aria-label="t('format.borderLineDashed')"
      :aria-pressed="modelValue === 'dashed'"
      @click="emit('select', 'dashed')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--dashed"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      data-border-settings-style="dotted"
      :aria-label="t('format.borderLineDotted')"
      :aria-pressed="modelValue === 'dotted'"
      @click="emit('select', 'dotted')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--dotted"
        aria-hidden="true"
      />
    </button>
    <button
      type="button"
      data-border-settings-style="double"
      :aria-label="t('format.borderLineDouble')"
      :aria-pressed="modelValue === 'double'"
      @click="emit('select', 'double')"
    >
      <span
        class="cell-border-menu__line-sample cell-border-menu__line-sample--double"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped lang="scss">
.border-line-style-panel {
  &--menu {
    display: grid;
    gap: 2px;

    > button {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 18px;
      align-items: center;
      width: 100%;
      height: 29px;
      padding: 0 15px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: var(--idea-surface-hover);
        border-color: var(--idea-action-primary);
        outline: none;
      }

      > svg {
        opacity: 0;
        color: var(--idea-action-primary);

        &.is-visible {
          opacity: 1;
        }
      }
    }
  }

  .cell-border-menu__line-sample {
    display: block;
    width: 100%;
    height: 0;
    border-top: 1px solid var(--idea-text-primary);
  }

  .cell-border-menu__line-sample--medium {
    border-top-width: 2px;
  }

  .cell-border-menu__line-sample--dashed {
    border-top-style: dashed;
  }

  .cell-border-menu__line-sample--dotted {
    border-top-style: dotted;
  }

  .cell-border-menu__line-sample--double {
    height: 3px;
    border-top: 3px double var(--idea-text-primary);
  }
}

.cell-border-menu__settings-styles {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;

  > button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    padding: 0 3px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;

    &:hover,
    &:focus-visible,
    &[aria-pressed="true"] {
      background: var(--idea-surface-hover);
      border-color: var(--idea-action-primary);
      outline: none;
    }
  }
}
</style>
