<script setup lang="ts">
import { computed } from "vue";
import type { ThemeColorReference } from "@sheetcraft/core/workbook-theme";
import { useAppI18n } from "../i18n";
import PanelSelect from "../panel-select/PanelSelect.vue";
import ColorPalette from "./ColorPalette.vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    label: string;
    defaultColor?: string;
    defaultLabel?: string;
    mixed?: boolean;
    disabled?: boolean;
    showValue?: boolean;
    showDefault?: boolean;
    panelClass?: string;
  }>(),
  { defaultColor: "#000000", mixed: false, disabled: false, showValue: false, showDefault: true },
);
const emit = defineEmits<{ select: [color: string | null, reference?: ThemeColorReference] }>();
const { t } = useAppI18n();
const color = computed(() => props.modelValue ?? props.defaultColor);
const automatic = computed(
  () => props.showDefault && color.value.toLowerCase() === props.defaultColor.toLowerCase(),
);
const resolvedDefaultLabel = computed(() => props.defaultLabel ?? t("cellFormat.automatic"));
const valueLabel = computed(() => {
  if (props.mixed) return t("format.mixed");
  if (props.disabled) return t("cellFormat.patternNone");
  return automatic.value ? resolvedDefaultLabel.value : color.value.toUpperCase();
});

function select(
  value: string | null,
  reference: ThemeColorReference | undefined,
  close: () => void,
): void {
  if (reference) emit("select", value, reference);
  else emit("select", value);
  close();
}
</script>

<template>
  <PanelSelect
    class="color-palette-select"
    :model-value="modelValue"
    :label="label"
    :value-label="valueLabel"
    :disabled="disabled"
    panel-width="content"
    :panel-class="panelClass"
  >
    <template #value>
      <span v-if="mixed || disabled" class="color-palette-select__label">{{ valueLabel }}</span>
      <template v-else-if="showValue">
        <span
          v-if="!automatic"
          class="color-palette-select__indicator"
          :style="{ backgroundColor: color }"
          aria-hidden="true"
        />
        <span class="color-palette-select__label">{{ valueLabel }}</span>
      </template>
      <span
        v-else
        class="color-palette-select__swatch"
        :style="{ backgroundColor: color }"
        aria-hidden="true"
      />
    </template>
    <template #panel="{ close }">
      <ColorPalette
        :model-value="modelValue ?? null"
        :default-color="defaultColor"
        :default-label="resolvedDefaultLabel"
        :mixed="mixed"
        :show-default="showDefault"
        @select="(value, reference) => select(value, reference, close)"
      />
    </template>
  </PanelSelect>
</template>

<style scoped lang="scss">
.color-palette-select {
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
