<script setup lang="ts">
import type { ConditionalFormatThreshold } from "@idea10/core/conditional-formatting";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { computed } from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";

const props = defineProps<{
  kind: ConditionalFormatThreshold["kind"];
  value: string;
  stacked?: boolean;
  label?: string;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  "update:kind": [value: ConditionalFormatThreshold["kind"]];
  "update:value": [value: string];
}>();
const { t } = useAppI18n();
const options = computed(() =>
  ["min", "num", "percent", "percentile", "formula", "max"].map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
);
</script>
<template>
  <div class="threshold-field" :class="{ 'is-stacked': stacked }">
    <TSelect
      :model-value="props.kind"
      :options="options"
      :aria-label="`${label ?? t('conditionalFormatting.threshold')} · ${t('conditionalFormatting.thresholdType')}`"
      @update:model-value="emit('update:kind', $event as ConditionalFormatThreshold['kind'])"
    />
    <TInputNumber
      v-if="(stacked || (props.kind !== 'min' && props.kind !== 'max')) && props.kind !== 'formula'"
      :disabled="props.kind === 'min' || props.kind === 'max'"
      :aria-label="`${label ?? t('conditionalFormatting.threshold')} · ${t('conditionalFormatting.value')}`"
      :placeholder="
        props.kind === 'min'
          ? t('conditionalFormatting.min')
          : props.kind === 'max'
            ? t('conditionalFormatting.max')
            : undefined
      "
      :model-value="props.kind === 'min' || props.kind === 'max' ? undefined : props.value"
      class="idea-input-number--persistent-controls"
      theme="column"
      :min="props.kind === 'percent' || props.kind === 'percentile' ? 0 : undefined"
      :max="props.kind === 'percent' || props.kind === 'percentile' ? 100 : undefined"
      @update:model-value="
        emit('update:value', $event === '' || $event === undefined ? '' : String($event))
      "
    />
    <RangeReferenceInput
      v-else-if="props.kind === 'formula'"
      :model-value="props.value"
      :label="`${label ?? t('conditionalFormatting.threshold')} · ${t('conditionalFormatting.value')}`"
      placeholder="=$D$1"
      :show-picker="true"
      :select-reference="selectValueReference"
      @update:model-value="emit('update:value', $event)"
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
.idea-input-number--persistent-controls {
  width: 100%;
}
</style>
