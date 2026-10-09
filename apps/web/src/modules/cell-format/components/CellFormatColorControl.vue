<script setup lang="ts">
import { computed } from "vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatPanelSelect from "./CellFormatPanelSelect.vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    label: string;
    defaultColor?: string;
    mixed?: boolean;
    disabled?: boolean;
    showValue?: boolean;
  }>(),
  { defaultColor: "#000000", mixed: false, disabled: false, showValue: false },
);
const emit = defineEmits<{ select: [color: string | null] }>();
const { t } = useAppI18n();
const color = computed(() => props.modelValue ?? props.defaultColor);
const automatic = computed(() => color.value.toLowerCase() === props.defaultColor.toLowerCase());
const valueLabel = computed(() => {
  if (props.mixed) return t("format.mixed");
  if (props.disabled) return t("cellFormat.patternNone");
  return automatic.value ? t("cellFormat.automatic") : color.value.toUpperCase();
});

function select(value: string | null, close: () => void): void {
  emit("select", value);
  close();
}
</script>

<template>
  <CellFormatPanelSelect
    class="cell-format-color-control"
    :model-value="modelValue"
    :label="label"
    :value-label="valueLabel"
    :disabled="disabled"
    panel-width="content"
  >
    <template #value>
      <span v-if="mixed || disabled" class="cell-format-color-control__label">{{
        valueLabel
      }}</span>
      <template v-else-if="showValue">
        <span
          v-if="!automatic"
          class="cell-format-color-control__indicator"
          :style="{ backgroundColor: color }"
          aria-hidden="true"
        />
        <span class="cell-format-color-control__label">{{ valueLabel }}</span>
      </template>
      <span
        v-else
        class="cell-format-color-control__swatch"
        :style="{ backgroundColor: color }"
        aria-hidden="true"
      />
    </template>
    <template #panel="{ close }">
      <ColorPalette
        :model-value="modelValue ?? null"
        :default-color="defaultColor"
        :default-label="t('cellFormat.automatic')"
        :mixed="mixed"
        @select="select($event, close)"
      />
    </template>
  </CellFormatPanelSelect>
</template>

<style scoped lang="scss">
.cell-format-color-control {
  &__swatch,
  &__label {
    flex: 1;
    min-width: 0;
  }

  &__swatch {
    height: 16px;
    border-radius: var(--sheetcraft-radius-small);
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__indicator {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: var(--sheetcraft-radius-small);
  }
}
</style>
