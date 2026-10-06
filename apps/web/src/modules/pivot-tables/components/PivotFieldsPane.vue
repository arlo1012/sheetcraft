<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { X, GripVertical } from "lucide-vue-next";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import {
  getPivotTableSource,
  normalizePivotTable,
  type PivotAggregate,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import { isFormulaError } from "@idea10/core/formula";
import type { Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import PivotFieldArea from "./PivotFieldArea.vue";
import PivotFieldSettingsDialog from "./PivotFieldSettingsDialog.vue";
import {
  placePivotField,
  pivotAreaFields,
  removePivotField,
  type PivotArea,
  type PivotFieldChoice,
  type PivotFieldDrag,
} from "../pivot-field-edits";
const props = defineProps<{
  table: SheetPivotTable;
  workbook: Workbook;
  revision: number;
  disabled: boolean;
}>();
const emit = defineEmits<{
  update: [table: SheetPivotTable];
  close: [];
  settingsOpen: [value: boolean];
}>();
const { t } = useAppI18n();
const search = ref("");
const dragging = ref<PivotFieldDrag>();
const settings = ref<{ area: PivotArea; index: number }>();
const source = computed(() => {
  void props.revision;
  try {
    return getPivotTableSource(props.workbook, props.table);
  } catch {
    return undefined;
  }
});
const choices = computed<PivotFieldChoice[]>(() => {
  const info = source.value;
  if (!info) return [];
  const types = info.headers.map(() => ({ number: false, other: false }));
  for (const record of info.records())
    record.forEach((value, field) => {
      if (typeof value === "number") types[field]!.number = true;
      else if (value !== null && value !== "" && !isFormulaError(value)) types[field]!.other = true;
    });
  return info.headers.map((label, field) => ({
    field,
    label,
    numeric: types[field]!.number && !types[field]!.other,
  }));
});
const filtered = computed(() =>
  choices.value.filter((choice) =>
    choice.label.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
);
const used = computed(
  () =>
    new Set([
      ...props.table.rowFields,
      ...props.table.columnFields,
      ...props.table.values.map((value) => value.field),
      ...props.table.filters.map((filter) => filter.field),
    ]),
);
const items = (area: PivotArea) =>
  pivotAreaFields(props.table, area).map((field, index) => ({
    field,
    label:
      area === "values"
        ? props.table.values[index]!.caption
        : (choices.value.find((choice) => choice.field === field)?.label ?? String(field + 1)),
  }));
const caption = (aggregate: PivotAggregate, label: string) =>
  `${t(`pivot.${aggregate}`)} · ${label}`;
function place(drag: PivotFieldDrag, area: PivotArea, index: number): void {
  if (props.disabled) return;
  const choice = choices.value.find((choice) => choice.field === drag.field);
  if (!choice) return;
  if (area === "values" && props.table.values.length >= 16 && drag.area !== "values") return;
  emit("update", placePivotField(props.table, drag, area, index, choice, caption));
}
function add(area: PivotArea, field: number): void {
  place({ field }, area, pivotAreaFields(props.table, area).length);
}
function remove(area: PivotArea, index: number): void {
  if (!props.disabled) emit("update", removePivotField(props.table, area, index));
}
function move(from: PivotArea, index: number, to: PivotArea, at: number): void {
  const field = pivotAreaFields(props.table, from)[index];
  if (field !== undefined) place({ field, area: from, index }, to, at);
}
function toggle(field: number, checked: boolean): void {
  if (props.disabled) return;
  if (checked) {
    const choice = choices.value.find((entry) => entry.field === field);
    if (choice) add(choice.numeric ? "values" : "rows", field);
  } else {
    const next = normalizePivotTable(props.table);
    next.rowFields = next.rowFields.filter((item) => item !== field);
    next.columnFields = next.columnFields.filter((item) => item !== field);
    next.values = next.values.filter((item) => item.field !== field);
    next.filters = next.filters.filter((item) => item.field !== field);
    emit("update", next);
  }
}
function drop(area: PivotArea, index: number): void {
  if (dragging.value) place(dragging.value, area, index);
  dragging.value = undefined;
}
function start(event: DragEvent, choice: PivotFieldChoice): void {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  event.dataTransfer?.setData("text/plain", choice.label);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
  dragging.value = { field: choice.field };
}
function dropRemove(event: DragEvent): void {
  if (!dragging.value?.area || dragging.value.index === undefined || props.disabled) return;
  event.preventDefault();
  remove(dragging.value.area, dragging.value.index);
  dragging.value = undefined;
}
const settingField = computed(() =>
  settings.value
    ? pivotAreaFields(props.table, settings.value.area)[settings.value.index]
    : undefined,
);
const settingName = computed(
  () => choices.value.find((choice) => choice.field === settingField.value)?.label ?? "",
);
const settingChoices = computed(() => {
  const info = source.value,
    field = settingField.value;
  if (!info || field === undefined || settings.value?.area !== "filters") return [];
  const values = new Map<string, string>();
  for (const record of info.records()) {
    const value = record[field] ?? null;
    if (!isFormulaError(value))
      values.set(
        JSON.stringify(value),
        value === null || value === "" ? t("pivot.empty") : String(value),
      );
  }
  return [...values].map(([value, label]) => ({ value, label }));
});
watch(
  () => props.table.id,
  () => {
    search.value = "";
    dragging.value = undefined;
    settings.value = undefined;
  },
);
watch(settings, (value) => emit("settingsOpen", !!value));
onBeforeUnmount(() => emit("settingsOpen", false));
watch(
  () => props.table,
  () => {
    settings.value = undefined;
  },
);
function confirmSettings(table: SheetPivotTable): void {
  if (!props.disabled && table.id === props.table.id) emit("update", table);
  settings.value = undefined;
}
defineExpose({
  openFieldSettings: (field?: { area: PivotArea; index: number }) => {
    if (field) {
      settings.value = field;
      return;
    }
    const area: PivotArea = props.table.values.length
      ? "values"
      : props.table.rowFields.length
        ? "rows"
        : props.table.columnFields.length
          ? "columns"
          : "filters";
    if (pivotAreaFields(props.table, area).length) settings.value = { area, index: 0 };
  },
});
</script>
<template>
  <aside class="pivot-fields-pane" :aria-label="t('pivot.fieldList')">
    <header class="pivot-fields-pane__header">
      <strong>{{ t("pivot.title") }}</strong
      ><Button variant="text" shape="square" :aria-label="t('picture.close')" @click="emit('close')"
        ><X :size="16"
      /></Button>
    </header>
    <section
      class="pivot-fields-pane__available"
      @dragover="dragging?.area && !disabled && $event.preventDefault()"
      @drop="dropRemove"
    >
      <h3>{{ t("pivot.fieldList") }}</h3>
      <p>{{ t("pivot.dragHint") }}</p>
      <Input
        v-model="search"
        :placeholder="t('pivot.searchFields')"
        :aria-label="t('pivot.searchFields')"
        clearable
      />
      <ul class="pivot-fields-pane__fields">
        <li
          v-for="choice in filtered"
          :key="choice.field"
          :draggable="!disabled"
          :data-pivot-source-field="choice.field"
          @dragstart="start($event, choice)"
          @dragend="dragging = undefined"
        >
          <GripVertical :size="14" aria-hidden="true" /><Checkbox
            :checked="used.has(choice.field)"
            :disabled="disabled"
            @change="toggle(choice.field, Boolean($event))"
            >{{ choice.label }}</Checkbox
          >
        </li>
      </ul>
      <p v-if="!source" role="alert">{{ t("pivot.sourceUnavailable") }}</p>
    </section>
    <section class="pivot-fields-pane__configuration">
      <h3>{{ t("pivot.areas") }}</h3>
      <p>{{ t("pivot.areaHint") }}</p>
      <div class="pivot-fields-pane__areas">
        <PivotFieldArea
          area="filters"
          :items="items('filters')"
          :choices="choices"
          :disabled="disabled"
          :dragging="!!dragging"
          @add="add('filters', $event)"
          @remove="remove('filters', $event)"
          @move="(index, to, at) => move('filters', index, to, at)"
          @settings="settings = { area: 'filters', index: $event }"
          @drag-start="dragging = $event"
          @drag-end="dragging = undefined"
          @drop-field="drop('filters', $event)"
        />
        <PivotFieldArea
          area="columns"
          :items="items('columns')"
          :choices="choices"
          :disabled="disabled"
          :dragging="!!dragging"
          @add="add('columns', $event)"
          @remove="remove('columns', $event)"
          @move="(index, to, at) => move('columns', index, to, at)"
          @settings="settings = { area: 'columns', index: $event }"
          @drag-start="dragging = $event"
          @drag-end="dragging = undefined"
          @drop-field="drop('columns', $event)"
        />
        <PivotFieldArea
          area="rows"
          :items="items('rows')"
          :choices="choices"
          :disabled="disabled"
          :dragging="!!dragging"
          @add="add('rows', $event)"
          @remove="remove('rows', $event)"
          @move="(index, to, at) => move('rows', index, to, at)"
          @settings="settings = { area: 'rows', index: $event }"
          @drag-start="dragging = $event"
          @drag-end="dragging = undefined"
          @drop-field="drop('rows', $event)"
        />
        <PivotFieldArea
          area="values"
          :items="items('values')"
          :choices="choices"
          :disabled="disabled"
          :dragging="!!dragging"
          @add="add('values', $event)"
          @remove="remove('values', $event)"
          @move="(index, to, at) => move('values', index, to, at)"
          @settings="settings = { area: 'values', index: $event }"
          @drag-start="dragging = $event"
          @drag-end="dragging = undefined"
          @drop-field="drop('values', $event)"
        />
      </div>
    </section>
    <PivotFieldSettingsDialog
      v-if="settings && settingField !== undefined"
      :key="`${table.id}-${settings.area}-${settings.index}`"
      :table="table"
      :area="settings.area"
      :index="settings.index"
      :name="settingName"
      :choices="settingChoices"
      :disabled="disabled"
      @confirm="confirmSettings"
      @close="settings = undefined"
    />
  </aside>
</template>
<style scoped lang="scss">
.pivot-fields-pane {
  display: flex;
  flex-direction: column;
  width: 360px;
  flex: 0 0 360px;
  max-width: 45vw;
  min-height: 0;
  gap: 14px;
  padding: 10px 14px;
  border-left: 1px solid var(--idea-border-subtle);
  background: var(--idea-surface-secondary);
  font-size: 12px;
  overflow: auto;
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__available {
    display: flex;
    flex: 1 1 45%;
    flex-direction: column;
    min-height: 150px;
    gap: 8px;
  }
  &__fields {
    list-style: none;
    margin: 0;
    padding: 8px;
    flex: 1;
    min-height: 60px;
    overflow: auto;
    border: 1px solid var(--idea-border-control);
    border-radius: 4px;
    background: var(--idea-surface-panel);
    li {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: 28px;
      cursor: grab;
    }
  }
  &__configuration {
    display: grid;
    gap: 8px;
    flex: 0 0 auto;
  }
  &__areas {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  [role="alert"] {
    color: var(--idea-status-error);
  }
}
</style>
