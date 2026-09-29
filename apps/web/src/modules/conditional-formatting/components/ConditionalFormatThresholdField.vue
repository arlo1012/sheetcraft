<script setup lang="ts">
import type { ConditionalFormatThreshold } from "@idea10/core/conditional-formatting";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { computed } from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";

const props = defineProps<{
  kind: ConditionalFormatThreshold["kind"];
  value: string;
  stacked?: boolean;
  dataBarBound?: "minimum" | "maximum";
  label?: string;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  "update:kind": [value: ConditionalFormatThreshold["kind"]];
  "update:value": [value: string];
}>();
const { t } = useAppI18n();
const automatic = computed(() => ["min", "max", "autoMin", "autoMax"].includes(props.kind));
const options = computed(() =>
  [
    ...(props.dataBarBound === "minimum" ? ["autoMin", "min"] : ["min"]),
    "num",
    "percent",
    "percentile",
    "formula",
    ...(props.dataBarBound === "maximum" ? ["autoMax", "max"] : ["max"]),
  ].map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
);
function updateValue(value: string): void {
  if (value.trim().startsWith("=") && props.kind !== "formula") emit("update:kind", "formula");
  emit("update:value", value);
}
</script>
<template>
  <div class="threshold-field" :class="{ 'is-stacked': stacked }">
    <TSelect
      :model-value="props.kind"
      :options="options"
      :aria-label="`${label ?? t('conditionalFormatting.threshold')} · ${t('conditionalFormatting.thresholdType')}`"
      @update:model-value="emit('update:kind', $event as ConditionalFormatThreshold['kind'])"
    />
    <RangeReferenceInput
      v-if="stacked || !automatic"
      :disabled="automatic"
      :model-value="automatic ? '' : props.value"
      :label="`${label ?? t('conditionalFormatting.threshold')} · ${t('conditionalFormatting.value')}`"
      :placeholder="
        props.kind === 'min'
          ? t('conditionalFormatting.min')
          : props.kind === 'autoMin' || props.kind === 'autoMax'
            ? t('conditionalFormatting.automatic')
            : props.kind === 'max'
              ? t('conditionalFormatting.max')
              : t('conditionalFormatting.thresholdValueHint')
      "
      :show-picker="Boolean(dataBarBound) || !automatic"
      :select-reference="selectValueReference"
      @update:model-value="updateValue"
    />
  </div>
</template>
<style scoped lang="scss">
.threshold-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(96px, 0.7fr);
  gap: 8px;
  &.is-stacked {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 28px 28px;
  }
}
</style>
