<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { normalizePivotTable, type SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import type { FormulaValue } from "@sheetcraft/core/formula";
import PivotValueSettings from "./PivotValueSettings.vue";
import type { CellValue } from "@sheetcraft/core/workbook";
import type { PivotArea } from "../pivot-field-edits";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  table: SheetPivotTable;
  area: PivotArea;
  index: number;
  name: string;
  choices: Array<{ label: string; value: string }>;
  disabled: boolean;
  dateSystem?: "1900" | "1904";
  headers?: string[];
  records?: FormulaValue[][];
}>();
const emit = defineEmits<{ confirm: [table: SheetPivotTable]; close: [] }>();
const { t } = useAppI18n();
const draft = ref(normalizePivotTable(props.table));
const value = computed(() => draft.value.values[props.index]);
const filter = computed(() => draft.value.filters[props.index]);
const sortField = computed(() =>
  props.area === "rows"
    ? draft.value.rowFields[props.index]
    : draft.value.columnFields[props.index],
);
const sortRule = computed(() =>
  draft.value.sortFields?.find(
    (rule) => rule.axis === props.area && rule.field === sortField.value,
  ),
);
function setSort(order: "ascending" | "descending", measure?: number): void {
  if ((props.area !== "rows" && props.area !== "columns") || sortField.value === undefined) return;
  draft.value.sortFields = (draft.value.sortFields ?? []).filter(
    (rule) => rule.axis !== props.area || rule.field !== sortField.value,
  );
  draft.value.sortFields.push({
    axis: props.area,
    field: sortField.value,
    order,
    ...(measure !== undefined ? { measure } : {}),
  });
}
const sortOrder = computed({
  get: () =>
    sortRule.value?.order ?? (draft.value.sort === "descending" ? "descending" : "ascending"),
  set: (order: "ascending" | "descending") => setSort(order, sortRule.value?.measure),
});
const sortMeasure = computed({
  get: () => sortRule.value?.measure ?? -1,
  set: (measure: number) => setSort(sortOrder.value, measure < 0 ? undefined : measure),
});
function setValues(values: unknown): void {
  if (filter.value && Array.isArray(values))
    filter.value.values = values
      .filter((value): value is string => typeof value === "string")
      .map((value) => JSON.parse(value) as CellValue);
}
</script>
<template>
  <Dialog
    attach="body"
    :visible="true"
    :header="t(area === 'values' ? 'pivot.valueFieldSettings' : 'pivot.fieldSettings')"
    :width="area === 'values' ? '470px' : '400px'"
    :close-on-overlay-click="false"
    :confirm-btn="{
      content: t('picture.confirm'),
      disabled: disabled || (area === 'values' && !value?.caption.trim()),
    }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft)"
    @close="emit('close')"
  >
    <div class="pivot-field-settings">
      <div>{{ t("pivot.sourceName") }}: {{ name }}</div>
      <template v-if="area === 'values' && value">
        <label
          >{{ t("pivot.customName")
          }}<Input v-model="value.caption" :maxlength="200" :disabled="disabled"
        /></label>
        <PivotValueSettings
          :value="value"
          :table="draft"
          :headers="headers ?? []"
          :records="records ?? []"
          :date-system="dateSystem"
          :disabled="disabled"
        />
      </template>
      <template v-else-if="area === 'filters' && filter">
        <Checkbox
          :checked="!!filter.all"
          :disabled="disabled"
          @change="filter.all = Boolean($event)"
          >{{ t("pivot.allItems") }}</Checkbox
        >
        <Select
          :value="filter.values.map((value) => JSON.stringify(value))"
          multiple
          filterable
          :options="choices"
          :disabled="disabled || filter.all"
          :aria-label="t('pivot.filterItems')"
          @change="setValues"
        />
        <p>{{ t("pivot.filterHint") }}</p>
      </template>
      <template v-else>
        <label
          >{{ t("pivot.sort")
          }}<Select
            v-model="sortOrder"
            :disabled="disabled"
            :options="[
              { value: 'ascending', label: t('pivot.ascending') },
              { value: 'descending', label: t('pivot.descending') },
            ]"
        /></label>
        <label
          >{{ t("pivot.sortBy")
          }}<Select
            v-model="sortMeasure"
            :disabled="disabled"
            :options="[
              { value: -1, label: t('pivot.fieldLabel') },
              ...draft.values.map((value, index) => ({ value: index, label: value.caption })),
            ]"
        /></label>
      </template>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.pivot-field-settings {
  display: grid;
  gap: 14px;
  label {
    display: grid;
    gap: 6px;
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
