<script setup lang="ts">
import { Baseline, PaintBucket } from "lucide-vue-next";
import { computed, type CSSProperties } from "vue";
import {
  DEFAULT_CELL_FILL_COLOR,
  DEFAULT_CELL_TEXT_COLOR,
  type CellStylePatch,
} from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const textColor = computed(() => props.state.textColor.value ?? DEFAULT_CELL_TEXT_COLOR);
const fillColor = computed(() => props.state.fillColor.value ?? DEFAULT_CELL_FILL_COLOR);
const textColorLabel = computed(() =>
  t(props.state.textColor.mixed ? "format.textColorMixed" : "format.textColor"),
);
const fillColorLabel = computed(() =>
  t(props.state.fillColor.mixed ? "format.fillColorMixed" : "format.fillColor"),
);

function swatchStyle(color: string): CSSProperties {
  return { backgroundColor: color };
}

function readColor(event: Event): string {
  return (event.target as HTMLInputElement).value.toLowerCase();
}

function setTextColor(event: Event): void {
  const value = readColor(event);
  emit("applyStyle", { textColor: value === DEFAULT_CELL_TEXT_COLOR ? null : value });
}

function setFillColor(event: Event): void {
  const value = readColor(event);
  emit("applyStyle", { fillColor: value === DEFAULT_CELL_FILL_COLOR ? null : value });
}
</script>

<template>
  <div class="cell-color-controls" role="group" :aria-label="t('format.colors')">
    <label
      class="cell-color-controls__control"
      :class="{ 'is-mixed': state.textColor.mixed, 'is-disabled': disabled }"
      :title="textColorLabel"
    >
      <Baseline :size="17" :stroke-width="2" aria-hidden="true" />
      <span class="cell-color-controls__swatch" :style="swatchStyle(textColor)" />
      <input
        type="color"
        :value="textColor"
        :disabled="disabled"
        :aria-label="textColorLabel"
        @change="setTextColor"
      />
    </label>
    <label
      class="cell-color-controls__control"
      :class="{ 'is-mixed': state.fillColor.mixed, 'is-disabled': disabled }"
      :title="fillColorLabel"
    >
      <PaintBucket :size="17" :stroke-width="2" aria-hidden="true" />
      <span class="cell-color-controls__swatch" :style="swatchStyle(fillColor)" />
      <input
        type="color"
        :value="fillColor"
        :disabled="disabled"
        :aria-label="fillColorLabel"
        @change="setFillColor"
      />
    </label>
  </div>
</template>

<style scoped lang="scss">
.cell-color-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;

  &__control {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--ui-radius-control);
    color: var(--ui-text-primary);
    cursor: pointer;

    &:hover:not(.is-disabled) {
      background: var(--ui-surface-hover);
    }

    &:focus-within {
      border-color: var(--ui-brand-primary);
      box-shadow: 0 0 0 2px var(--ui-brand-soft);
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      padding: 0;
      opacity: 0;
      cursor: inherit;
    }
  }

  &__swatch {
    position: absolute;
    right: 6px;
    bottom: 3px;
    left: 6px;
    height: 3px;
    border: 1px solid rgb(32 36 44 / 22%);
  }

  &__control.is-mixed &__swatch {
    background: transparent !important;
    border-style: dashed;
    border-color: var(--ui-text-muted);
  }
}
</style>
