<script setup lang="ts">
import { computed } from "vue";
import {
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellStylePatch,
} from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";

const DEFAULT_FONT_FAMILY = "Inter";
const FONT_FAMILIES = [
  "Inter",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Microsoft YaHei",
  "SimSun",
] as const;

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const fontFamilyValue = computed(() =>
  props.state.fontFamily.mixed ? "" : (props.state.fontFamily.value ?? DEFAULT_FONT_FAMILY),
);
const fontSizeValue = computed(() =>
  props.state.fontSize.mixed ? "" : String(props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE),
);

function readSelectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function setFontFamily(event: Event): void {
  const value = readSelectValue(event);
  if (!value) {
    return;
  }
  emit("applyStyle", { fontFamily: value === DEFAULT_FONT_FAMILY ? null : value });
}

function setFontSize(event: Event): void {
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < MIN_CELL_FONT_SIZE || value > MAX_CELL_FONT_SIZE) {
    input.value = fontSizeValue.value;
    return;
  }
  emit("applyStyle", { fontSize: value === DEFAULT_CELL_FONT_SIZE ? null : value });
}
</script>

<template>
  <div class="font-format-controls" role="group" :aria-label="t('format.font')">
    <select
      class="font-format-controls__family"
      :value="fontFamilyValue"
      :disabled="disabled"
      :aria-label="t('format.fontFamily')"
      :title="t('format.fontFamily')"
      @change="setFontFamily"
    >
      <option v-if="state.fontFamily.mixed" disabled value="">{{ t("format.mixed") }}</option>
      <option v-for="family in FONT_FAMILIES" :key="family" :value="family">
        {{ family }}
      </option>
    </select>
    <input
      class="font-format-controls__size"
      type="number"
      inputmode="numeric"
      :min="MIN_CELL_FONT_SIZE"
      :max="MAX_CELL_FONT_SIZE"
      step="1"
      :value="fontSizeValue"
      :placeholder="state.fontSize.mixed ? t('format.mixed') : undefined"
      :disabled="disabled"
      :aria-label="t('format.fontSize')"
      :title="t('format.fontSize')"
      @change="setFontSize"
    />
  </div>
</template>

<style scoped lang="scss">
.font-format-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;

  &__family,
  &__size {
    height: 28px;
    min-width: 0;
    padding: 0 7px;
    background: var(--ui-surface-primary);
    border: 1px solid var(--ui-border-default);
    border-radius: var(--ui-radius-control);
    color: var(--ui-text-primary);
    outline: none;

    &:hover:not(:disabled) {
      border-color: var(--ui-border-strong);
    }

    &:focus-visible {
      border-color: var(--ui-brand-primary);
      box-shadow: 0 0 0 2px var(--ui-brand-soft);
    }

    &:disabled {
      color: var(--ui-text-muted);
      cursor: not-allowed;
      opacity: 0.62;
    }
  }

  &__family {
    width: 132px;
  }

  &__size {
    width: 58px;
  }
}
</style>
