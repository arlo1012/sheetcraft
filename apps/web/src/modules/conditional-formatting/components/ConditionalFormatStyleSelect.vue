<script setup lang="ts">
import { computed, ref } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { ConditionalFormatStyle } from "@idea10/core/conditional-formatting";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  CONDITIONAL_FORMAT_STYLE_PRESETS,
  conditionalFormatPresetStyle,
  type ConditionalFormatStylePreset,
} from "../conditional-format-quick-rules";
import ConditionalFormatStyleDialog from "./ConditionalFormatStyleDialog.vue";
const props = defineProps<{
  modelValue: ConditionalFormatStyle;
  sampleValue?: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
}>();
const emit = defineEmits<{
  "update:modelValue": [style: ConditionalFormatStyle];
  "custom-visible": [visible: boolean];
}>();
const { t } = useAppI18n();
const customVisible = ref(false);
function styleKey(style: ConditionalFormatStyle): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(style).sort(([a], [b]) => a.localeCompare(b))),
    (_, value: unknown) =>
      typeof value === "string" && value.startsWith("#") ? value.toLowerCase() : value,
  );
}
const preset = computed(
  () =>
    CONDITIONAL_FORMAT_STYLE_PRESETS.find(
      (key) => styleKey(conditionalFormatPresetStyle(key)) === styleKey(props.modelValue),
    ) ?? "custom",
);
const formatOptions = computed(() => [
  ...CONDITIONAL_FORMAT_STYLE_PRESETS.map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
  { value: "custom", label: t("conditionalFormatting.customFormat") },
]);
function showCustom(visible: boolean) {
  customVisible.value = visible;
  emit("custom-visible", visible);
}
function selectFormat(selected: unknown) {
  if (selected === "custom") {
    showCustom(true);
    return;
  }
  if (!CONDITIONAL_FORMAT_STYLE_PRESETS.includes(selected as ConditionalFormatStylePreset)) return;
  emit("update:modelValue", conditionalFormatPresetStyle(selected as ConditionalFormatStylePreset));
}
function confirmFormat(style: ConditionalFormatStyle) {
  emit("update:modelValue", style);
  showCustom(false);
}
function optionStyle(key: string | number | boolean | undefined) {
  if (!CONDITIONAL_FORMAT_STYLE_PRESETS.includes(key as ConditionalFormatStylePreset)) return {};
  const style = conditionalFormatPresetStyle(key as ConditionalFormatStylePreset);
  return {
    backgroundColor: typeof style.fillColor === "string" ? style.fillColor : undefined,
    color: typeof style.textColor === "string" ? style.textColor : undefined,
    ...(key === "redBorder" ? { boxShadow: "inset 0 0 0 1px #9C0006" } : {}),
  };
}
</script>
<template>
  <div class="conditional-format-style-select">
    <TSelect
      :model-value="preset"
      :aria-label="t('conditionalFormatting.setFormat')"
      :options="formatOptions"
      @change="selectFormat"
    >
      <template #option="{ option }"
        ><span class="conditional-format-style-select__swatch" :style="optionStyle(option.value)">{{
          option.label
        }}</span></template
      >
    </TSelect>
    <TButton v-if="preset === 'custom'" variant="text" @click="showCustom(true)">{{
      t("conditionalFormatting.customFormat")
    }}</TButton>
  </div>
  <ConditionalFormatStyleDialog
    v-if="customVisible"
    :style="modelValue"
    :sample-value="sampleValue"
    :date-system="dateSystem"
    @confirm="confirmFormat"
    @cancel="showCustom(false)"
  />
</template>
<style scoped lang="scss">
.conditional-format-style-select {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 4px;
  &__swatch {
    display: block;
    width: 100%;
    padding: 0 4px;
  }
}
</style>
