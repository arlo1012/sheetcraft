<script setup lang="ts">
import type {
  ConditionalFormatCondition,
  ConditionalFormatThreshold,
} from "@idea10/core/conditional-formatting";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { computed } from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";

const props = defineProps<{
  condition: Extract<ConditionalFormatCondition, { kind: "iconSet" }>;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  updateKind: [index: number, kind: ConditionalFormatThreshold["kind"]];
  updateValue: [index: number, value: string];
}>();
const { t } = useAppI18n();
const rows = computed(() =>
  props.condition.thresholds.map((entry, index) => ({ entry, index })).reverse(),
);
const options = computed(() =>
  (["num", "percent", "percentile", "formula", "min", "max"] as const).map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
);
function boundLabel(entry: ConditionalFormatThreshold): string {
  if (entry.kind === "formula") return entry.formula;
  if (!("value" in entry)) return t(`conditionalFormatting.${entry.kind}`);
  return entry.kind === "num"
    ? String(entry.value)
    : `${entry.value} (${t(`conditionalFormatting.${entry.kind}`)})`;
}
</script>

<template>
  <section class="icon-rules" :aria-label="t('conditionalFormatting.iconRules')">
    <h4>{{ t("conditionalFormatting.iconRules") }}</h4>
    <div class="icon-rules__table">
      <div class="icon-rules__header" aria-hidden="true">
        <span>{{ t("conditionalFormatting.icon") }}</span>
        <span class="icon-rules__condition-heading">{{
          t("conditionalFormatting.condition")
        }}</span>
        <span>{{ t("conditionalFormatting.value") }}</span>
        <span>{{ t("conditionalFormatting.thresholdType") }}</span>
      </div>
      <div
        v-for="{ entry, index } in rows"
        :key="index"
        class="icon-rules__row"
        role="group"
        :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1}`"
      >
        <ConditionalFormatPreview :condition="condition" :icon-index="index" />
        <span class="icon-rules__when">{{
          index > 0 && index < condition.thresholds.length - 1
            ? t("conditionalFormatting.belowAnd", {
                value: boundLabel(condition.thresholds[index + 1]!),
              })
            : t("conditionalFormatting.whenValue")
        }}</span>
        <span
          class="icon-rules__operator"
          :aria-label="
            t(index ? 'conditionalFormatting.greaterThanOrEqual' : 'conditionalFormatting.lessThan')
          "
          >{{ index ? "≥" : "<" }}</span
        >
        <template v-if="index > 0">
          <TInputNumber
            v-if="entry.kind !== 'formula'"
            :model-value="'value' in entry ? entry.value : undefined"
            :disabled="entry.kind === 'min' || entry.kind === 'max'"
            :placeholder="
              entry.kind === 'min' || entry.kind === 'max'
                ? t(`conditionalFormatting.${entry.kind}`)
                : undefined
            "
            :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1} · ${t('conditionalFormatting.value')}`"
            theme="column"
            class="idea-input-number--persistent-controls"
            :min="entry.kind === 'percent' || entry.kind === 'percentile' ? 0 : undefined"
            :max="entry.kind === 'percent' || entry.kind === 'percentile' ? 100 : undefined"
            @update:model-value="
              emit(
                'updateValue',
                index,
                $event === '' || $event === undefined ? '' : String($event),
              )
            "
          />
          <RangeReferenceInput
            v-else
            :model-value="entry.formula"
            :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1} · ${t('conditionalFormatting.value')}`"
            placeholder="=$D$1"
            :show-picker="true"
            :select-reference="selectValueReference"
            @update:model-value="emit('updateValue', index, $event)"
          />
          <TSelect
            :model-value="entry.kind"
            :options="options"
            :aria-label="`${t('conditionalFormatting.threshold')} ${index + 1} · ${t('conditionalFormatting.thresholdType')}`"
            @update:model-value="
              emit('updateKind', index, $event as ConditionalFormatThreshold['kind'])
            "
          />
        </template>
        <template v-else>
          <span class="icon-rules__bound">{{
            "value" in condition.thresholds[1]!
              ? condition.thresholds[1]!.value
              : t(`conditionalFormatting.${condition.thresholds[1]!.kind}` as MessageKey)
          }}</span>
          <span class="icon-rules__bound">{{
            t(`conditionalFormatting.${condition.thresholds[1]!.kind}` as MessageKey)
          }}</span>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.icon-rules {
  display: grid;
  gap: 8px;
  min-width: 0;
  h4 {
    margin: 0;
    font: inherit;
    font-weight: var(--idea-font-weight-semibold);
  }
  &__table {
    display: grid;
    grid-template-columns: 40px minmax(100px, 1fr) 28px minmax(80px, 1fr) minmax(100px, 1fr);
    gap: 8px;
    overflow-x: auto;
  }
  &__header,
  &__row {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    > * {
      min-width: 0;
    }
  }
  &__header {
    color: var(--idea-text-secondary);
  }
  &__condition-heading {
    grid-column: span 2;
  }
  &__operator {
    text-align: center;
  }
  &__bound {
    padding-inline: 8px;
  }
  .idea-input-number--persistent-controls {
    width: 100%;
  }
}
</style>
