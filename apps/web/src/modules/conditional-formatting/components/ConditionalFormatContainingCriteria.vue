<script setup lang="ts">
import { computed } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";

export type ContainingRuleType =
  | "cellValue"
  | "text"
  | "date"
  | "blank"
  | "nonBlank"
  | "error"
  | "nonError";

const props = defineProps<{
  value: string;
  secondValue: string;
  error?: string;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const contentType = defineModel<ContainingRuleType>("type", { required: true });
const operator = defineModel<string>("operator", { required: true });
const datePeriod = defineModel<string>("datePeriod", { required: true });
const emit = defineEmits<{
  "update:value": [value: string];
  "update:secondValue": [value: string];
}>();
const { t } = useAppI18n();
const typeOptions = computed(() => [
  { value: "cellValue", label: t("conditionalFormatting.cellValue") },
  { value: "text", label: t("conditionalFormatting.specificText") },
  { value: "date", label: t("conditionalFormatting.occurringDate") },
  { value: "blank", label: t("conditionalFormatting.blankValues") },
  { value: "nonBlank", label: t("conditionalFormatting.nonBlankValues") },
  { value: "error", label: t("conditionalFormatting.errors") },
  { value: "nonError", label: t("conditionalFormatting.nonErrors") },
]);
const comparisonOptions = computed(() =>
  [
    "between",
    "notBetween",
    "equal",
    "notEqual",
    "greaterThan",
    "lessThan",
    "greaterThanOrEqual",
    "lessThanOrEqual",
  ].map((value) => ({ value, label: t(`conditionalFormatting.${value}` as MessageKey) })),
);
const textOptions = computed(() =>
  ["contains", "notContains", "beginsWith", "endsWith"].map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
);
const dateOptions = computed(() =>
  [
    "yesterday",
    "today",
    "tomorrow",
    "last7Days",
    "lastWeek",
    "thisWeek",
    "nextWeek",
    "lastMonth",
    "thisMonth",
    "nextMonth",
  ].map((value) => ({ value, label: t(`conditionalFormatting.${value}` as MessageKey) })),
);
const hasValues = computed(() => contentType.value === "cellValue" || contentType.value === "text");
const needsSecondValue = computed(
  () => contentType.value === "cellValue" && ["between", "notBetween"].includes(operator.value),
);
</script>

<template>
  <div class="containing-criteria">
    <div
      class="containing-criteria__row"
      :class="{ 'has-values': hasValues }"
      role="group"
      :aria-label="t('conditionalFormatting.containingDescription')"
    >
      <TSelect
        v-model="contentType"
        :options="typeOptions"
        :aria-label="t('conditionalFormatting.condition')"
      />
      <template v-if="hasValues">
        <TSelect
          v-model="operator"
          :options="contentType === 'text' ? textOptions : comparisonOptions"
          :aria-label="t('conditionalFormatting.comparison')"
        />
        <div class="containing-criteria__values" :class="{ 'has-second': needsSecondValue }">
          <TInput
            v-if="contentType === 'text'"
            :model-value="value"
            :aria-label="t('conditionalFormatting.value')"
            @update:model-value="emit('update:value', String($event))"
          />
          <RangeReferenceInput
            v-else
            :model-value="value"
            :label="t('conditionalFormatting.value')"
            :show-picker="true"
            :select-reference="props.selectValueReference"
            @update:model-value="emit('update:value', $event)"
          />
          <template v-if="needsSecondValue">
            <span>{{ t("conditionalFormatting.rangeTo") }}</span>
            <RangeReferenceInput
              :model-value="secondValue"
              :label="t('conditionalFormatting.secondValue')"
              :show-picker="true"
              :select-reference="props.selectValueReference"
              @update:model-value="emit('update:secondValue', $event)"
            />
          </template>
        </div>
      </template>
      <TSelect
        v-else-if="contentType === 'date'"
        v-model="datePeriod"
        :options="dateOptions"
        :aria-label="t('conditionalFormatting.datePeriod')"
      />
    </div>
    <p v-if="error" class="containing-criteria__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.containing-criteria {
  display: grid;
  gap: 4px;
  min-width: 0;

  &__row {
    display: grid;
    grid-template-columns: 112px minmax(0, 168px);
    align-items: center;
    gap: 8px;

    &.has-values {
      grid-template-columns: 112px 144px minmax(0, 1fr);
    }

    > * {
      min-width: 0;
    }
  }

  &__values {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: 8px;

    &.has-second {
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    }

    > * {
      min-width: 0;
    }
  }

  &__error {
    margin: 0;
    color: var(--idea-status-error);
  }

  @media (max-width: 560px) {
    &__row.has-values {
      grid-template-columns: 112px minmax(0, 1fr);
    }

    &__values {
      grid-column: 1 / -1;
    }
  }
}
</style>
