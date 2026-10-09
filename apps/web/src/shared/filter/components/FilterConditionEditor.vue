<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { AutoComplete as TAutoComplete } from "tdesign-vue-next/es/auto-complete";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import type { SheetFilterCondition } from "@sheetcraft/core/workbook";
import type { ExcelDateSystem } from "@sheetcraft/core/formula";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  createCustomFilterDraft,
  buildCustomFilterCondition,
  type FilterValueKind,
} from "../custom-filter-draft";
import {
  createFilterConditionDraft,
  NUMBER_FILTER_OPERATORS,
  TEXT_FILTER_OPERATORS,
  type FilterConditionOperator,
} from "../filter-conditions";
import type { FilterConditionAction } from "../filter-condition-actions";
import type { FilterValueOption } from "../filter-types";

const props = defineProps<{
  kind: FilterValueKind;
  initial?: SheetFilterCondition;
  action?: FilterConditionAction;
  values: readonly FilterValueOption[];
  dateSystem: ExcelDateSystem;
  disabled?: boolean;
  strictKind?: boolean;
}>();
const emit = defineEmits<{ "update:condition": [condition: SheetFilterCondition | undefined] }>();
const { t } = useAppI18n();
const contentRef = ref<HTMLElement | null>(null);
const draft = ref(
  createCustomFilterDraft(props.kind, props.initial, props.dateSystem, props.action),
);
const condition = computed(() => buildCustomFilterCondition(draft.value, props.dateSystem));
const labels: Record<FilterConditionOperator, MessageKey> = {
  equals: "dataTools.filter.equals",
  notEquals: "dataTools.filter.notEquals",
  contains: "dataTools.filter.contains",
  doesNotContain: "dataTools.filter.doesNotContain",
  beginsWith: "dataTools.filter.beginsWith",
  doesNotBeginWith: "dataTools.filter.doesNotBeginWith",
  endsWith: "dataTools.filter.endsWith",
  doesNotEndWith: "dataTools.filter.doesNotEndWith",
  greaterThan: "dataTools.filter.greaterThan",
  greaterThanOrEqual: "dataTools.filter.greaterThanOrEqual",
  lessThan: "dataTools.filter.lessThan",
  lessThanOrEqual: "dataTools.filter.lessThanOrEqual",
  between: "dataTools.filter.between",
  notBetween: "dataTools.filter.notBetween",
};
const operatorOptions = computed(() => {
  const operators =
    props.kind === "text"
      ? TEXT_FILTER_OPERATORS
      : props.strictKind
        ? NUMBER_FILTER_OPERATORS
        : [
            ...NUMBER_FILTER_OPERATORS,
            ...TEXT_FILTER_OPERATORS.filter(
              (operator) => !NUMBER_FILTER_OPERATORS.some((numeric) => numeric === operator),
            ),
          ];
  return operators.map((operator) => ({ value: operator, label: t(labels[operator]) }));
});
const valueOptions = computed(() =>
  props.values.map(({ key, label }) => {
    const text =
      key.kind === "blank"
        ? ""
        : key.kind === "error"
          ? `#${key.code}!`
          : props.kind === "date" && key.kind === "number"
            ? createFilterConditionDraft(
                { kind: "date", operator: "equals", value: key.value },
                props.dateSystem,
              ).first
            : String(key.value);
    return { text, label };
  }),
);
const popupProps = { attach: () => contentRef.value ?? document.body };
const firstInputProps = computed(() => ({
  autofocus: true,
  "aria-label": t("dataTools.filter.firstValue"),
  suffixIcon: () => h(ChevronDown, { size: 14 }),
}));
const secondInputProps = computed(() => ({
  "aria-label": t("dataTools.filter.secondValue"),
  suffixIcon: () => h(ChevronDown, { size: 14 }),
}));
function isInterval(operator: string): boolean {
  return operator === "between" || operator === "notBetween";
}
watch(
  () => [props.kind, props.initial, props.dateSystem, props.action] as const,
  () => {
    draft.value = createCustomFilterDraft(
      props.kind,
      props.initial,
      props.dateSystem,
      props.action,
    );
  },
);
watch(condition, (value) => emit("update:condition", value), { immediate: true });
</script>
<template>
  <div ref="contentRef" class="filter-condition-editor">
    <div class="filter-condition-editor__row">
      <TSelect
        v-model="draft.first.operator"
        :options="operatorOptions"
        :disabled="disabled"
        :popup-props="popupProps"
        :aria-label="t('dataTools.filter.firstCondition')"
      />
      <TAutoComplete
        v-model="draft.first.value"
        :options="valueOptions"
        :disabled="disabled"
        :popup-props="popupProps"
        :input-props="firstInputProps"
        :placeholder="kind === 'date' ? 'YYYY-MM-DD' : ''"
        filterable
      />
    </div>
    <TAutoComplete
      v-if="isInterval(draft.first.operator)"
      v-model="draft.first.value2"
      :options="valueOptions"
      :disabled="disabled"
      :popup-props="popupProps"
      :input-props="secondInputProps"
      filterable
    />
    <TRadioGroup
      v-model="draft.join"
      :disabled="disabled"
      :aria-label="t('dataTools.filter.combineConditions')"
    >
      <TRadio value="and">{{ t("dataTools.filter.and") }}</TRadio>
      <TRadio value="or">{{ t("dataTools.filter.or") }}</TRadio>
    </TRadioGroup>
    <div class="filter-condition-editor__row">
      <TSelect
        v-model="draft.second.operator"
        :options="operatorOptions"
        :disabled="disabled"
        :popup-props="popupProps"
        :aria-label="t('dataTools.filter.secondCondition')"
        clearable
      />
      <TAutoComplete
        v-model="draft.second.value"
        :options="valueOptions"
        :disabled="disabled"
        :popup-props="popupProps"
        :input-props="secondInputProps"
        :placeholder="kind === 'date' ? 'YYYY-MM-DD' : ''"
        filterable
      />
    </div>
    <TAutoComplete
      v-if="isInterval(draft.second.operator)"
      v-model="draft.second.value2"
      :options="valueOptions"
      :disabled="disabled"
      :popup-props="popupProps"
      :input-props="secondInputProps"
      filterable
    />
    <p v-if="!strictKind" class="filter-condition-editor__hint">
      {{ t("dataTools.filter.wildcardHint") }}
    </p>
  </div>
</template>
<style scoped lang="scss">
.filter-condition-editor {
  display: grid;
  gap: var(--sheetcraft-space-4);
  &__caption,
  &__hint {
    margin: 0;
  }
  &__row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: var(--sheetcraft-space-4);
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
