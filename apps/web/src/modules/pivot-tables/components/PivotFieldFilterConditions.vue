<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import type {
  PivotLabelCondition,
  PivotValueCondition,
  PivotValueField,
} from "@idea10/core/pivot-tables";
import { useAppI18n } from "../../../shared/i18n";
import FilterConditionMenu from "../../../shared/filter/components/FilterConditionMenu.vue";
import FilterConditionDialog from "../../../shared/filter/components/FilterConditionDialog.vue";
import type { FilterConditionAction } from "../../../shared/filter/filter-condition-actions";
import type { FilterValueOption } from "../../../shared/filter/filter-types";
import PivotValueFilterDialog from "./PivotValueFilterDialog.vue";

type ValueRule = { measure: number; condition: PivotValueCondition };
const props = defineProps<{
  fieldLabel: string;
  kind: "text" | "number" | "date";
  values: readonly FilterValueOption[];
  measures: readonly PivotValueField[];
  dateSystem: ExcelDateSystem;
  labelCondition?: PivotLabelCondition;
  valueCondition?: ValueRule;
  disabled: boolean;
  showSummary?: boolean;
}>();
const emit = defineEmits<{
  "update:labelCondition": [condition: PivotLabelCondition];
  "update:valueCondition": [condition: ValueRule];
  editing: [value: boolean];
}>();
const { t } = useAppI18n();
const labelMenu = ref<InstanceType<typeof FilterConditionMenu> | null>(null);
const valueMenu = ref<InstanceType<typeof FilterConditionMenu> | null>(null);
const root = ref<HTMLElement | null>(null);
const editor = ref<{ target: "label" | "value"; action: FilterConditionAction }>();
defineExpose({
  menuElements: computed(() => [labelMenu.value?.rootElement, valueMenu.value?.rootElement]),
});
watch(
  () => !!editor.value,
  (editing) => emit("editing", editing),
  { flush: "sync" },
);
onBeforeUnmount(() => emit("editing", false));
function edit(target: "label" | "value", action: FilterConditionAction): void {
  if (!props.disabled) editor.value = { target, action };
}
function close(): void {
  editor.value = undefined;
  void nextTick(() => root.value?.querySelector<HTMLElement>("button")?.focus());
}
function acceptLabel(condition: SheetFilterCondition): void {
  if (!props.disabled) emit("update:labelCondition", condition as PivotLabelCondition);
  close();
}
function acceptValue(condition: ValueRule): void {
  if (!props.disabled) emit("update:valueCondition", condition);
  close();
}
</script>
<template>
  <section ref="root" class="pivot-field-filter-conditions">
    <div class="pivot-field-filter-conditions__actions">
      <FilterConditionMenu
        ref="labelMenu"
        :kind="kind"
        :label="t('pivot.labelFilters')"
        :statistics="false"
        :disabled="disabled"
        @select="edit('label', $event)"
      />
      <FilterConditionMenu
        ref="valueMenu"
        kind="number"
        :label="t('pivot.valueFilters')"
        :disabled="disabled || !measures.length"
        @select="edit('value', $event)"
      />
    </div>
    <p
      v-if="showSummary && (labelCondition || valueCondition)"
      class="pivot-field-filter-conditions__summary"
      role="status"
    >
      {{
        [
          labelCondition ? t("pivot.labelFilters") : "",
          valueCondition
            ? `${t("pivot.valueFilters")} · ${measures[valueCondition.measure]?.caption ?? ""}`
            : "",
        ]
          .filter(Boolean)
          .join(" / ")
      }}
    </p>
    <FilterConditionDialog
      :visible="editor?.target === 'label'"
      :column-label="fieldLabel"
      :caption="fieldLabel"
      :kind="kind"
      :initial="labelCondition"
      :action="editor?.action"
      :values="values"
      :date-system="dateSystem"
      :disabled="disabled"
      @apply="acceptLabel"
      @close="close"
    />
    <PivotValueFilterDialog
      :visible="editor?.target === 'value'"
      :measures="measures"
      :initial-measure="valueCondition?.measure ?? 0"
      :initial="valueCondition?.condition"
      :action="editor?.action"
      :disabled="disabled"
      @apply="acceptValue"
      @close="close"
    />
  </section>
</template>
<style scoped lang="scss">
.pivot-field-filter-conditions {
  display: grid;
  gap: var(--idea-space-2);
  &__actions {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
  }
  &__summary {
    margin: 0;
    color: var(--idea-text-secondary);
  }
}
</style>
