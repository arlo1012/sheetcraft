<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Select } from "tdesign-vue-next/es/select";
import { getSheetFilterValue, getSheetFilterValueKey } from "@idea10/core/commands";
import { isFormulaError } from "@idea10/core/formula";
import {
  getPivotTableSource,
  normalizePivotTable,
  type PivotAxisFilter,
  type PivotLabelCondition,
  type PivotValueCondition,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import type {
  CellValue,
  SheetFilterCondition,
  SheetFilterValue,
  Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import FilterValueList from "../../../shared/filter/components/FilterValueList.vue";
import FilterConditionMenu from "../../../shared/filter/components/FilterConditionMenu.vue";
import FilterConditionDialog from "../../../shared/filter/components/FilterConditionDialog.vue";
import FilterRankDialog from "../../../shared/filter/components/FilterRankDialog.vue";
import { readFilterPanelSettings } from "../../../shared/filter/filter-panel-settings";
import {
  DEFAULT_FILTER_SEARCH_OPTIONS,
  getMatchingFilterValues,
} from "../../../shared/filter/filter-value-options";
import type { FilterConditionAction } from "../../../shared/filter/filter-condition-actions";

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
const labelMenu = ref<InstanceType<typeof FilterConditionMenu> | null>(null);
const valueMenu = ref<InstanceType<typeof FilterConditionMenu> | null>(null);
const editor = ref<{ target: "label" | "value"; action: FilterConditionAction }>();
const query = ref("");
const searchOptions = ref({ ...DEFAULT_FILTER_SEARCH_OPTIONS });
const settings = ref({ ...readFilterPanelSettings(), showItemCount: false });
const field = ref(
  props.area === "filters"
    ? props.table.filters[props.index]!.field
    : props.area === "rows"
      ? props.table.rowFields[props.index]!
      : props.table.columnFields[props.index]!,
);
const selection = ref<SheetFilterValue[]>([]);
const labelCondition = ref<PivotLabelCondition>();
const valueCondition = ref<PivotValueCondition>();
const measure = ref(0);
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
const initialCondition = computed(() =>
  editor.value?.target === "label" ? labelCondition.value : valueCondition.value,
);
const rankInitial = computed(() =>
  valueCondition.value?.kind === "rank" ? valueCondition.value : undefined,
);
const reference = computed(() => props.trigger);
const root = computed(() => panel.value?.rootElement ?? null);
const listening = computed(() => !editor.value);
const { floatingStyles } = useDismissibleFloatingPanel(reference, root, listening, {
  placement: "bottom-start",
  offset: 4,
  additionalInside: () => [
    list.value?.settingsMenuElement,
    list.value?.searchMenuElement,
    labelMenu.value?.rootElement,
    valueMenu.value?.rootElement,
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
    valueCondition.value = axis?.valueCondition?.condition;
    measure.value = axis?.valueCondition?.measure ?? 0;
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
  emit("update", { ...normalizePivotTable(props.table), sort: order });
  close();
}
function conditionAction(target: "label" | "value", action: FilterConditionAction): void {
  if (action === "aboveAverage" || action === "belowAverage") {
    valueCondition.value = { kind: "average", above: action === "aboveAverage" };
    return;
  }
  editor.value = { target, action };
}
function acceptCondition(condition: SheetFilterCondition): void {
  if (editor.value?.target === "label") labelCondition.value = condition as PivotLabelCondition;
  else valueCondition.value = condition as PivotValueCondition;
  editor.value = undefined;
}
function clear(): void {
  query.value = "";
  selection.value = choices.value.map((entry) => entry.key);
  labelCondition.value = undefined;
  valueCondition.value = undefined;
}
function apply(): void {
  if (props.disabled) return;
  const selected = new Set(selection.value.map(getSheetFilterValueKey));
  const matching = new Set(
    getMatchingFilterValues(choices.value, query.value, searchOptions.value).map((item) =>
      getSheetFilterValueKey(item.key),
    ),
  );
  const values = choices.value
    .filter(
      (entry) =>
        selected.has(getSheetFilterValueKey(entry.key)) &&
        matching.has(getSheetFilterValueKey(entry.key)),
    )
    .map((entry) => entry.value);
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
      ...(valueCondition.value
        ? { valueCondition: { measure: measure.value, condition: valueCondition.value } }
        : {}),
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
      class="pivot-field-filter-panel"
      :label="fieldLabel"
      :style="floatingStyles"
      padding="tool"
    >
      <strong>{{ fieldLabel }}</strong>
      <Select
        v-if="dimensions.length > 1"
        v-model="field"
        :options="dimensions"
        :popup-props="popupProps"
        :aria-label="t(area === 'rows' ? 'pivot.rows' : 'pivot.columns')"
        :disabled="disabled"
      />
      <template v-if="area !== 'filters'">
        <div class="pivot-field-filter-panel__sort">
          <Button
            variant="text"
            theme="default"
            size="small"
            :disabled="disabled"
            @click="sort('ascending')"
            >{{ t("pivot.ascending") }}</Button
          >
          <Button
            variant="text"
            theme="default"
            size="small"
            :disabled="disabled"
            @click="sort('descending')"
            >{{ t("pivot.descending") }}</Button
          >
          <Button
            variant="text"
            theme="default"
            size="small"
            :disabled="disabled"
            @click="sort('source')"
            >{{ t("pivot.sourceOrder") }}</Button
          >
        </div>
        <div class="pivot-field-filter-panel__conditions">
          <FilterConditionMenu
            ref="labelMenu"
            :kind="labelKind"
            :label="t('pivot.labelFilters')"
            :statistics="false"
            :disabled="disabled"
            @select="conditionAction('label', $event)"
          />
          <FilterConditionMenu
            ref="valueMenu"
            kind="number"
            :label="t('pivot.valueFilters')"
            :disabled="disabled || !table.values.length"
            @select="conditionAction('value', $event)"
          />
        </div>
        <label v-if="table.values.length" class="pivot-field-filter-panel__measure">
          <span>{{ t("pivot.filterMeasure") }}</span>
          <Select
            v-model="measure"
            :options="table.values.map((value, index) => ({ value: index, label: value.caption }))"
            :popup-props="popupProps"
            :aria-label="t('pivot.filterMeasure')"
            :disabled="disabled"
          />
        </label>
        <p
          v-if="labelCondition || valueCondition"
          class="pivot-field-filter-panel__active"
          role="status"
        >
          {{
            [
              labelCondition ? t("pivot.labelFilters") : "",
              valueCondition ? t("pivot.valueFilters") : "",
            ]
              .filter(Boolean)
              .join(" · ")
          }}
        </p>
      </template>
      <Button variant="text" size="small" :disabled="disabled" @click="clear">{{
        t("pivot.clearFilters")
      }}</Button>
      <FilterValueList
        ref="list"
        v-model="selection"
        v-model:query="query"
        v-model:search-options="searchOptions"
        :settings="settings"
        :values="choices"
        :disabled="disabled"
        compact
      />
      <div class="pivot-field-filter-panel__footer">
        <Button theme="primary" size="small" :disabled="disabled" @click="apply">{{
          t("dataTools.common.confirm")
        }}</Button>
        <Button theme="default" variant="outline" size="small" @click="close">{{
          t("dataTools.common.cancel")
        }}</Button>
      </div>
    </FloatingPanelSurface>
    <FilterConditionDialog
      :visible="!!editor && editor.action !== 'rank'"
      :column-label="fieldLabel"
      :caption="editor?.target === 'value' ? table.values[measure]?.caption : fieldLabel"
      :kind="editor?.target === 'value' ? 'number' : labelKind"
      :strict-kind="editor?.target === 'value'"
      :initial="initialCondition"
      :action="editor?.action"
      :values="editor?.target === 'label' ? choices : []"
      :date-system="workbook.dateSystem"
      :disabled="disabled"
      @apply="acceptCondition"
      @close="editor = undefined"
    />
    <FilterRankDialog
      :visible="editor?.action === 'rank'"
      :initial="rankInitial"
      :disabled="disabled"
      @apply="acceptCondition"
      @close="editor = undefined"
    />
  </Teleport>
</template>
<style scoped lang="scss">
.pivot-field-filter-panel {
  display: grid;
  gap: var(--idea-space-3);
  width: min(320px, calc(100vw - 32px));
  &__sort,
  &__conditions,
  &__footer {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
    flex-wrap: wrap;
  }
  &__measure {
    display: grid;
    gap: var(--idea-space-2);
  }
  &__active {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__footer {
    justify-content: flex-end;
  }
}
</style>
