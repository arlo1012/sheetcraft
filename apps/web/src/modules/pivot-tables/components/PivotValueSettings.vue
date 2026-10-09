<script setup lang="ts">
import { computed, ref } from "vue";
import { Tabs, TabPanel } from "tdesign-vue-next/es/tabs";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import {
  PIVOT_AGGREGATES,
  PIVOT_DISPLAY_TYPES,
  getPivotGroupedValue,
  type PivotValueField,
  type PivotDisplayType,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import type { FormulaValue } from "@sheetcraft/core/formula";
import { isFormulaError } from "@sheetcraft/core/formula";
import type { CellFormatChange } from "@sheetcraft/core/commands";
import OptionList from "../../../shared/option-list/OptionList.vue";
import CellFormatDialog from "../../cell-format/components/CellFormatDialog.vue";
import {
  stylePatchToSelectionState,
  styleFormatToBorderState,
} from "../../../shared/cell-format/style-format-dialog";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  value: PivotValueField;
  table: SheetPivotTable;
  headers: string[];
  records: FormulaValue[][];
  dateSystem?: "1900" | "1904";
  disabled: boolean;
}>();
const { t } = useAppI18n();
const tab = ref("aggregate"),
  formatting = ref(false);
const aggregates = computed(() =>
  PIVOT_AGGREGATES.map((value) => ({ value, label: t(`pivot.${value}`) })),
);
const displayType = computed(() => props.value.display?.type ?? "normal");
const needsField = computed(() =>
  [
    "percent",
    "difference",
    "percentDiff",
    "runTotal",
    "percentOfRunningTotal",
    "percentOfParent",
    "rankAscending",
    "rankDescending",
  ].includes(displayType.value),
);
const needsItem = computed(() =>
  ["percent", "difference", "percentDiff"].includes(displayType.value),
);
const axisFields = computed(() => [...props.table.rowFields, ...props.table.columnFields]);
const fields = computed(() =>
  props.headers.flatMap((label, value) =>
    !needsField.value || axisFields.value.includes(value) ? [{ value: String(value), label }] : [],
  ),
);
const baseField = computed(() => props.value.display?.baseField ?? axisFields.value[0]);
const items = computed(() => {
  if (!needsItem.value || baseField.value === undefined) return [];
  const found = new Map<string, string>();
  for (const record of props.records) {
    const group = props.table.groups?.find((group) => group.field === baseField.value);
    const original = record[baseField.value] ?? null;
    const value = group
      ? getPivotGroupedValue(original, group, props.dateSystem ?? "1900")
      : original;
    if (!isFormulaError(value))
      found.set(
        JSON.stringify({ kind: "value", value }),
        value === null || value === "" ? t("pivot.empty") : String(value),
      );
  }
  return [
    { value: JSON.stringify({ kind: "previous" }), label: t("pivot.previousItem") },
    { value: JSON.stringify({ kind: "next" }), label: t("pivot.nextItem") },
    ...[...found].map(([value, label]) => ({ value, label })),
  ];
});
function setDisplay(type: PivotDisplayType): void {
  const field = baseField.value;
  props.value.display = { type };
  if (
    [
      "percent",
      "difference",
      "percentDiff",
      "runTotal",
      "percentOfRunningTotal",
      "percentOfParent",
      "rankAscending",
      "rankDescending",
    ].includes(type)
  )
    props.value.display.baseField = field ?? axisFields.value[0];
  if (["percent", "difference", "percentDiff"].includes(type))
    props.value.display.baseItem = { kind: "previous" };
}
function setField(value: string): void {
  const field = Number(value);
  if (!needsField.value || !axisFields.value.includes(field) || !props.value.display) return;
  props.value.display.baseField = field;
  if (needsItem.value) props.value.display.baseItem = { kind: "previous" };
}
function setItem(item: string): void {
  if (props.value.display && needsItem.value) props.value.display.baseItem = JSON.parse(item);
}
const style = computed(() =>
  props.value.numberFormat ? { numberFormat: props.value.numberFormat } : {},
);
function confirmFormat(change: CellFormatChange): void {
  const format = change.style?.numberFormat;
  if (format && typeof format === "object") props.value.numberFormat = format;
  else props.value.numberFormat = { kind: "custom", code: "General" };
  formatting.value = false;
}
</script>
<template>
  <Tabs v-model="tab" size="medium">
    <TabPanel value="aggregate" :label="t('pivot.summarizeValues')">
      <div class="pivot-value-settings__panel">
        <p>{{ t("pivot.summarizeHint") }}</p>
        <OptionList
          :model-value="value.aggregate"
          :options="aggregates"
          :label="t('pivot.summarizeValues')"
          variant="navigation"
          @select="!disabled && (value.aggregate = $event)"
        />
      </div>
    </TabPanel>
    <TabPanel value="display" :label="t('pivot.showValuesAs')">
      <div class="pivot-value-settings__panel">
        <Select
          :value="displayType"
          :aria-label="t('pivot.showValuesAs')"
          :disabled="disabled"
          :options="
            PIVOT_DISPLAY_TYPES.map((value) => ({
              value,
              label: t(`pivot.display.${value}`),
              disabled:
                !axisFields.length &&
                [
                  'percent',
                  'difference',
                  'percentDiff',
                  'runTotal',
                  'percentOfRunningTotal',
                  'percentOfParent',
                  'rankAscending',
                  'rankDescending',
                ].includes(value),
            }))
          "
          @change="setDisplay($event as PivotDisplayType)"
        />
        <div class="pivot-value-settings__bases">
          <div>
            <span>{{ t("pivot.baseField") }}</span>
            <div :inert="disabled || !needsField" :class="{ 'is-disabled': !needsField }">
              <OptionList
                :model-value="baseField === undefined ? undefined : String(baseField)"
                :options="fields"
                :label="t('pivot.baseField')"
                variant="navigation"
                @select="setField"
              />
            </div>
          </div>
          <div>
            <span>{{ t("pivot.baseItem") }}</span>
            <div :inert="disabled || !needsItem" :class="{ 'is-disabled': !needsItem }">
              <OptionList
                :model-value="JSON.stringify(value.display?.baseItem)"
                :options="items"
                :label="t('pivot.baseItem')"
                variant="navigation"
                @select="setItem"
              />
            </div>
          </div>
        </div>
      </div>
    </TabPanel>
  </Tabs>
  <div class="pivot-value-settings__format">
    <Button variant="outline" :disabled="disabled" @click="formatting = true">{{
      t("pivot.numberFormat")
    }}</Button>
  </div>
  <CellFormatDialog
    v-if="formatting"
    :state="stylePatchToSelectionState(style)"
    :border-state="styleFormatToBorderState({ style: {} })"
    :sample-value="1234.56"
    :initial-style-patch="style"
    :available-tabs="['number']"
    initial-tab="number"
    @confirm="confirmFormat"
    @cancel="formatting = false"
  />
</template>
<style scoped lang="scss">
.pivot-value-settings__panel {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: 6px;
  p {
    margin: 0 0 8px;
    color: var(--sheetcraft-text-secondary);
  }
  :deep(.option-list) {
    height: 214px;
  }
}
.pivot-value-settings__bases {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
  span {
    display: block;
    margin-bottom: 6px;
  }
  :deep(.option-list) {
    height: 178px;
  }
  .is-disabled {
    opacity: 0.45;
  }
}
.pivot-value-settings__format {
  margin-top: 12px;
}
</style>
