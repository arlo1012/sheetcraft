<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { AutoComplete as TAutoComplete } from "tdesign-vue-next/es/auto-complete";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import type { ExcelDateSystem } from "@idea10/core/formula";
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
import type { DataToolFilterValueOption } from "../data-tools-types";

const props = defineProps<{
  visible: boolean;
  columnLabel: string;
  kind: FilterValueKind;
  initial?: SheetFilterCondition;
  action?: FilterConditionAction;
  values: readonly DataToolFilterValueOption[];
  dateSystem: ExcelDateSystem;
  disabled?: boolean;
}>();
const emit = defineEmits<{ close: []; apply: [condition: SheetFilterCondition] }>();
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
  endsWith: "dataTools.filter.endsWith",
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
      : [
          ...NUMBER_FILTER_OPERATORS,
          ...TEXT_FILTER_OPERATORS.filter(
            (operator) => operator !== "equals" && operator !== "notEquals",
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
  () => props.visible,
  (visible) => {
    if (visible)
      draft.value = createCustomFilterDraft(
        props.kind,
        props.initial,
        props.dateSystem,
        props.action,
      );
  },
  { immediate: true },
);
function apply(): void {
  if (!props.disabled && condition.value) emit("apply", condition.value);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.filter.customFilterTitle')"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: disabled || !condition }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="apply"
  >
    <div ref="contentRef" class="filter-condition-dialog">
      <p class="filter-condition-dialog__caption">
        {{ t("dataTools.filter.showRows", { column: columnLabel }) }}
      </p>
      <div class="filter-condition-dialog__row">
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
      <div class="filter-condition-dialog__row">
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
      <p class="filter-condition-dialog__hint">{{ t("dataTools.filter.wildcardHint") }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.filter-condition-dialog {
  display: grid;
  gap: var(--idea-space-4);
  &__caption,
  &__hint {
    margin: 0;
  }
  &__row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: var(--idea-space-4);
  }
  &__hint {
    color: var(--idea-text-secondary);
  }
}
</style>
