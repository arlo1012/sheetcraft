<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Select } from "tdesign-vue-next/es/select";
import { getSheetFilterValue, getSheetFilterValueKey } from "@sheetcraft/core/commands";
import { isFormulaError } from "@sheetcraft/core/formula";
import {
  getPivotTableSource,
  normalizePivotTable,
  type PivotAxisFilter,
  type PivotLabelCondition,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import type { CellValue, SheetFilterValue, Workbook } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import FilterPanelActions from "../../../shared/filter/components/FilterPanelActions.vue";
import FilterValueList from "../../../shared/filter/components/FilterValueList.vue";
import FilterSortBar from "../../../shared/filter/components/FilterSortBar.vue";
import PivotFieldFilterConditions from "./PivotFieldFilterConditions.vue";
import {
  readFilterPanelSettings,
  writeFilterPanelSettings,
  type FilterPanelSettings,
} from "../../../shared/filter/filter-panel-settings";
import {
  DEFAULT_FILTER_SEARCH_OPTIONS,
  getMatchingFilterValues,
} from "../../../shared/filter/filter-value-options";

const props = defineProps<{
  table: SheetPivotTable;
  workbook: Workbook;
  area: "filters" | "rows" | "columns";
  index: number;
  trigger: HTMLElement;
  disabled: boolean;
}>();
const emit = defineEmits<{ update: [table: SheetPivotTable]; close: [] }>();
const { t } = useAppI18n();
const panel = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const list = ref<InstanceType<typeof FilterValueList> | null>(null);
const conditions = ref<InstanceType<typeof PivotFieldFilterConditions> | null>(null);
const conditionEditing = ref(false);
const query = ref("");
const searchOptions = ref({ ...DEFAULT_FILTER_SEARCH_OPTIONS });
const settings = ref(readFilterPanelSettings());
const field = ref(
  props.area === "filters"
    ? props.table.filters[props.index]!.field
    : props.area === "rows"
      ? props.table.rowFields[props.index]!
      : props.table.columnFields[props.index]!,
);
const selection = ref<SheetFilterValue[]>([]);
const labelCondition = ref<PivotLabelCondition>();
const valueCondition = ref<PivotAxisFilter["valueCondition"]>();
const source = computed(() => getPivotTableSource(props.workbook, props.table));
const fieldLabel = computed(() => source.value.headers[field.value] ?? "");
const dimensions = computed(() =>
  props.area === "filters"
    ? []
    : (props.area === "rows" ? props.table.rowFields : props.table.columnFields).map((value) => ({
        value,
        label: source.value.headers[value]!,
      })),
);
const choices = computed(() => {
  const members = new Map<
    string,
    { key: SheetFilterValue; value: CellValue; label: string; count: number }
  >();
  for (const record of source.value.records()) {
    const raw = record[field.value];
    const value = raw === "" ? null : (raw ?? null);
    if (isFormulaError(value)) continue;
    const key = getSheetFilterValue(value),
      identity = getSheetFilterValueKey(key);
    const existing = members.get(identity);
    if (existing) existing.count++;
    else
      members.set(identity, {
        key,
        value,
        label: value === null || value === "" ? t("pivot.empty") : String(value),
        count: 1,
      });
  }
  return [...members.values()];
});
const labelKind = computed(() =>
  choices.value.some((item) => item.key.kind === "number") &&
  choices.value.every((item) => item.key.kind === "number" || item.key.kind === "blank")
    ? "number"
    : "text",
);
const matchingChoices = computed(() =>
  getMatchingFilterValues(choices.value, query.value, searchOptions.value),
);
const includedChoices = computed(() => {
  const keys = new Set(selection.value.map(getSheetFilterValueKey));
  return matchingChoices.value.filter((choice) => keys.has(getSheetFilterValueKey(choice.key)));
});
const selectionSummary = computed(() =>
  settings.value.showTotalCount
    ? {
        selected: includedChoices.value.reduce((count, choice) => count + choice.count, 0),
        total: matchingChoices.value.reduce((count, choice) => count + choice.count, 0),
        records: true,
      }
    : {
        selected: includedChoices.value.length,
        total: matchingChoices.value.length,
        search: !!query.value.trim(),
      },
);
const reference = computed(() => props.trigger);
const root = computed(() => panel.value?.rootElement ?? null);
const listening = computed(() => !conditionEditing.value);
const { floatingStyles } = useDismissibleFloatingPanel(reference, root, listening, {
  placement: "bottom-start",
  offset: 4,
  additionalInside: () => [
    list.value?.settingsMenuElement,
    list.value?.searchMenuElement,
    ...(conditions.value?.menuElements ?? []),
  ],
  onDismiss: () => emit("close"),
});
const popupProps = { attach: () => root.value ?? document.body };
watch(
  field,
  () => {
    query.value = "";
    const page = props.area === "filters" ? props.table.filters[props.index] : undefined;
    const axis = props.table.axisFilters?.find(
      (entry) => entry.axis === props.area && entry.field === field.value,
    );
    const values = page ? (page.all ? undefined : page.values) : axis?.values;
    selection.value =
      values === undefined
        ? choices.value.map((entry) => entry.key)
        : values.map((value) => getSheetFilterValue(value === "" ? null : value));
    labelCondition.value = axis?.labelCondition;
    valueCondition.value = axis?.valueCondition;
  },
  { immediate: true },
);
onMounted(
  () => void nextTick(() => root.value?.querySelector<HTMLElement>("input, button")?.focus()),
);
function close(): void {
  emit("close");
  props.trigger.focus();
}
function sort(order: SheetPivotTable["sort"]): void {
  if (props.disabled) return;
  if (props.area === "filters" || order === "source") return;
  const table = normalizePivotTable(props.table);
  table.sortFields = (table.sortFields ?? []).filter(
    (rule) => rule.axis !== props.area || rule.field !== field.value,
  );
  table.sortFields.push({ axis: props.area, field: field.value, order });
  emit("update", table);
  close();
}
function changeSettings(value: FilterPanelSettings): void {
  settings.value = value;
  writeFilterPanelSettings(value);
}
function clear(): void {
  if (props.disabled) return;
  query.value = "";
  selection.value = choices.value.map((entry) => entry.key);
  labelCondition.value = undefined;
  valueCondition.value = undefined;
}
const filtered = computed(
  () =>
    !!labelCondition.value ||
    !!valueCondition.value ||
    selection.value.length !== choices.value.length ||
    !!query.value.trim(),
);
function apply(): void {
  if (props.disabled) return;
  const values = includedChoices.value.map((choice) => choice.value);
  const all = values.length === choices.value.length;
  const table = normalizePivotTable(props.table);
  if (props.area === "filters")
    table.filters[props.index] = { ...table.filters[props.index]!, all, values: all ? [] : values };
  else {
    const axis: PivotAxisFilter = {
      axis: props.area,
      field: field.value,
      ...(!all ? { values } : {}),
      ...(labelCondition.value ? { labelCondition: labelCondition.value } : {}),
      ...(valueCondition.value ? { valueCondition: valueCondition.value } : {}),
    };
    table.axisFilters = (table.axisFilters ?? []).filter(
      (entry) => entry.axis !== props.area || entry.field !== field.value,
    );
    if (!all || labelCondition.value || valueCondition.value) table.axisFilters.push(axis);
    if (!table.axisFilters.length) table.axisFilters = undefined;
  }
  emit("update", table);
  close();
}
</script>
<template>
  <Teleport to="body">
    <FloatingPanelSurface
      ref="panel"
      v-show="!conditionEditing"
      class="pivot-field-filter-panel"
      :label="fieldLabel"
      :style="floatingStyles"
      padding="tool"
      layer="popover"
      viewport-inset="8px"
    >
      <Select
        v-if="dimensions.length > 1"
        v-model="field"
        :options="dimensions"
        :popup-props="popupProps"
        :aria-label="t(area === 'rows' ? 'pivot.rows' : 'pivot.columns')"
        :disabled="disabled"
      />
      <FilterSortBar v-if="area !== 'filters'" :disabled="disabled" @sort="sort" />
      <PivotFieldFilterConditions
        v-if="area !== 'filters'"
        ref="conditions"
        v-model:label-condition="labelCondition"
        v-model:value-condition="valueCondition"
        :field-label="fieldLabel"
        :kind="labelKind"
        :values="choices"
        :measures="table.values"
        :show-summary="settings.showCriteria"
        :date-system="workbook.dateSystem"
        :disabled="disabled"
        @editing="conditionEditing = $event"
      />
      <Button
        theme="default"
        variant="text"
        :disabled="disabled || !filtered"
        :aria-label="t('pivot.clearFilters')"
        @click="clear"
        >{{ t("pivot.clearFilters") }}</Button
      >
      <FilterValueList
        ref="list"
        v-model="selection"
        v-model:query="query"
        v-model:search-options="searchOptions"
        :settings="settings"
        :values="choices"
        :disabled="disabled"
        :merged-cell-settings="false"
        @update:settings="changeSettings"
      />
      <FilterPanelActions
        class="pivot-field-filter-panel__footer"
        :disabled="disabled"
        :summary="selectionSummary"
        @apply="apply"
        @cancel="close"
      />
    </FloatingPanelSurface>
  </Teleport>
</template>
<style scoped lang="scss">
.pivot-field-filter-panel {
  display: grid;
  gap: var(--sheetcraft-space-4);
  width: min(420px, calc(100vw - 16px));
}
</style>
