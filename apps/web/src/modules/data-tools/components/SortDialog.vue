<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ArrowDown, ArrowUp } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type {
  BaseTableCol,
  TableRowAttributes,
  TableRowData,
} from "tdesign-vue-next/es/table/type";
import { useAppI18n } from "../../../shared/i18n";
import CustomSortListDialog from "./CustomSortListDialog.vue";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import type {
  DataToolColumn,
  SortDraft,
  SortInitial,
  SortLevel,
  SortColorColumn,
} from "../data-tools-types";

type SortRow = SortLevel & { id: number };
const props = withDefaults(
  defineProps<{
    visible: boolean;
    columns: readonly DataToolColumn[];
    rangeLabel?: string;
    initial?: SortInitial;
    colorColumns?: readonly SortColorColumn[];
  }>(),
  { rangeLabel: "", initial: undefined, colorColumns: () => [] },
);
const emit = defineEmits<{ close: []; apply: [draft: SortDraft] }>();
const { t } = useAppI18n();
const contentRef = ref<HTMLElement | null>(null);
const popupProps = { attach: () => contentRef.value ?? document.body };
const rows = ref<SortRow[]>([]);
const selectedId = ref<number>();
const hasHeader = ref(true);
const caseSensitive = ref(false);
const sortMethod = ref<NonNullable<SortDraft["sortMethod"]>>("pinyin");
const optionsVisible = ref(false);
const customListRowId = ref<number>();
const customListRow = computed(() => rows.value.find((row) => row.id === customListRowId.value));
const optionCaseSensitive = ref(false);
const optionSortMethod = ref<NonNullable<SortDraft["sortMethod"]>>("pinyin");
let nextId = 0;
const maxLevels = 64;
const selectedIndex = computed(() => rows.value.findIndex((row) => row.id === selectedId.value));
const selectedRow = computed(() => rows.value[selectedIndex.value]);
const columnOptions = computed(() =>
  props.columns.map((column) => ({
    label: hasHeader.value && column.header ? `${column.label} (${column.header})` : column.label,
    value: column.column,
  })),
);
const directionOptions = computed(() => [
  { label: t("dataTools.sort.ascending"), value: "ascending" },
  { label: t("dataTools.sort.descending"), value: "descending" },
]);
function orderOptions(row: SortRow) {
  if (isColorLevel(row)) return positionOptions.value;
  return [
    ...directionOptions.value,
    ...(row.customOrder
      ? [
          { value: "selected-custom", label: row.customOrder.join(", ") },
          ...(row.customOrder.length > 1
            ? [
                {
                  value: "selected-custom-reversed",
                  label: [...row.customOrder].reverse().join(", "),
                },
              ]
            : []),
        ]
      : []),
    { value: "custom", label: t("dataTools.sort.customList") },
  ];
}
function orderValue(row: SortRow): string {
  return !isColorLevel(row) && row.customOrder
    ? row.direction === "ascending"
      ? "selected-custom"
      : "selected-custom-reversed"
    : row.direction;
}
function changeOrder(row: SortRow, value: unknown): void {
  if (value === "custom" && !isColorLevel(row)) {
    selectedId.value = row.id;
    customListRowId.value = row.id;
  } else if (value === "selected-custom" || value === "selected-custom-reversed") {
    row.direction = value === "selected-custom" ? "ascending" : "descending";
  } else if (value === "ascending" || value === "descending") {
    row.direction = value;
    delete row.customOrder;
  }
}
function applyCustomList(values: string[]): void {
  const row = customListRow.value;
  if (row) {
    row.customOrder = [...values];
    row.direction = "ascending";
  }
  customListRowId.value = undefined;
}
const basisOptions = computed(() => [
  { label: t("dataTools.sort.values"), value: "value" },
  { label: t("dataTools.sort.cellColor"), value: "cellColor" },
  { label: t("dataTools.sort.fontColor"), value: "fontColor" },
  { label: t("dataTools.sort.iconTodo"), value: "icon", disabled: true },
]);
const positionOptions = computed(() => [
  { label: t("dataTools.sort.onTop"), value: "ascending" },
  { label: t("dataTools.sort.onBottom"), value: "descending" },
]);
function isColorLevel(row: SortLevel): boolean {
  return row.sortOn === "cellColor" || row.sortOn === "fontColor";
}
function colorsFor(row: SortLevel) {
  const column = props.colorColumns.find((item) => item.column === row.column);
  if (!column || !isColorLevel(row)) return [];
  const colors = new Set<string | null>(
    row.sortOn === "cellColor" ? column.cellColors : column.fontColors,
  );
  if (!hasHeader.value) {
    const headerColor =
      row.sortOn === "cellColor" ? column.headerCellColor : column.headerFontColor;
    if (headerColor !== undefined) colors.add(headerColor);
  }
  return [...colors].map((color) => ({
    color,
    value: color ?? "no-fill",
    label: color === null ? t("dataTools.sort.noFill") : color.toUpperCase(),
  }));
}
function syncColor(row: SortRow): void {
  if (!isColorLevel(row)) {
    delete row.color;
    return;
  }
  const colors = colorsFor(row);
  if (!colors.some((option) => option.color === row.color)) {
    if (colors[0]) row.color = colors[0].color;
    else delete row.color;
  }
}
function changeColumn(row: SortRow, value: unknown): void {
  if (typeof value !== "number") return;
  row.column = value;
  syncColor(row);
}
function changeBasis(row: SortRow, value: unknown): void {
  if (value !== "value" && value !== "cellColor" && value !== "fontColor") return;
  row.sortOn = value;
  if (value !== "value") delete row.customOrder;
  delete row.color;
  syncColor(row);
}
function changeColor(row: SortRow, value: unknown): void {
  const option = colorsFor(row).find((option) => option.value === value);
  if (option) row.color = option.color;
}
watch([hasHeader, () => props.colorColumns], () => rows.value.forEach(syncColor));
const canApply = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every(
      (row) => !isColorLevel(row) || colorsFor(row).some((option) => option.color === row.color),
    ),
);
const tableColumns = computed<BaseTableCol[]>(() => [
  { colKey: "column", title: t("dataTools.sort.column"), width: 300 },
  { colKey: "basis", title: t("dataTools.sort.sortOn"), width: 150 },
  { colKey: "direction", title: t("dataTools.sort.order") },
]);
const rowAttributes: TableRowAttributes<TableRowData> = ({ row }) => ({
  "data-sort-row": String(row.id),
  "aria-selected": String(selectedId.value === row.id),
});
watch(
  () => props.visible,
  (visible) => {
    optionsVisible.value = false;
    customListRowId.value = undefined;
    if (!visible) return;
    hasHeader.value = props.initial?.headerLocked || (props.initial?.hasHeader ?? true);
    caseSensitive.value = props.initial?.caseSensitive ?? false;
    sortMethod.value = props.initial?.sortMethod ?? "pinyin";
    const column =
      props.columns.find((item) => item.column === props.initial?.column) ?? props.columns[0];
    const initialLevels = props.initial?.levels?.length
      ? props.initial.levels
      : column
        ? [{ column: column.column, direction: props.initial?.direction ?? "ascending" }]
        : [];
    rows.value = initialLevels.map((level) => ({
      ...level,
      ...(level.customOrder ? { customOrder: [...level.customOrder] } : {}),
      id: ++nextId,
    }));
    selectedId.value = rows.value[0]?.id;
  },
  { immediate: true },
);
function selectRows(keys: Array<string | number>): void {
  if (typeof keys[0] === "number") selectedId.value = keys[0];
}
function insertLevel(level: SortLevel): void {
  const row = {
    ...level,
    ...(level.customOrder ? { customOrder: [...level.customOrder] } : {}),
    id: ++nextId,
  };
  rows.value.splice(selectedIndex.value + 1, 0, row);
  selectedId.value = row.id;
}
function addLevel(): void {
  if (rows.value.length >= maxLevels) return;
  const column =
    props.columns.find((item) => !rows.value.some((row) => row.column === item.column)) ??
    props.columns[0];
  if (column) insertLevel({ column: column.column, direction: "ascending" });
}
function copyLevel(): void {
  if (selectedRow.value && rows.value.length < maxLevels) insertLevel(selectedRow.value);
}
function removeLevel(): void {
  const index = selectedIndex.value;
  if (rows.value.length <= 1 || index < 0) return;
  rows.value.splice(index, 1);
  selectedId.value = rows.value[Math.min(index, rows.value.length - 1)]?.id;
}
function moveLevel(offset: number): void {
  const index = selectedIndex.value;
  const target = index + offset;
  if (index < 0 || target < 0 || target >= rows.value.length) return;
  const [row] = rows.value.splice(index, 1);
  if (row) rows.value.splice(target, 0, row);
}
function openOptions(): void {
  optionCaseSensitive.value = caseSensitive.value;
  optionSortMethod.value = sortMethod.value;
  optionsVisible.value = true;
}
function applyOptions(): void {
  caseSensitive.value = optionCaseSensitive.value;
  sortMethod.value = optionSortMethod.value;
  optionsVisible.value = false;
}
function apply(): void {
  if (!canApply.value) return;
  emit("apply", {
    range: props.rangeLabel,
    hasHeader: hasHeader.value,
    caseSensitive: caseSensitive.value,
    sortMethod: sortMethod.value,
    levels: rows.value.map((row) => ({
      column: row.column,
      direction: row.direction,
      ...(isColorLevel(row)
        ? { sortOn: row.sortOn, color: row.color }
        : row.customOrder
          ? { customOrder: [...row.customOrder] }
          : {}),
    })),
  });
}
</script>

<template>
  <Dialog
    :visible="visible && !optionsVisible && customListRowId === undefined"
    :header="t('dataTools.sort.title')"
    width="min(900px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: !canApply }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="apply"
  >
    <div ref="contentRef" class="sort-dialog">
      <div class="sort-dialog__toolbar">
        <div class="sort-dialog__actions">
          <TButton
            variant="outline"
            data-sort-action="add"
            :disabled="!columns.length || rows.length >= maxLevels"
            @click="addLevel"
            >{{ t("dataTools.sort.addLevel") }}</TButton
          >
          <TButton
            variant="outline"
            data-sort-action="delete"
            :disabled="!selectedRow || rows.length <= 1"
            @click="removeLevel"
            >{{ t("dataTools.sort.deleteLevel") }}</TButton
          >
          <TButton
            variant="outline"
            data-sort-action="copy"
            :disabled="!selectedRow || rows.length >= maxLevels"
            @click="copyLevel"
            >{{ t("dataTools.sort.copyLevel") }}</TButton
          >
          <TButton
            variant="outline"
            shape="square"
            data-sort-action="up"
            :aria-label="t('dataTools.sort.moveUp')"
            :title="t('dataTools.sort.moveUp')"
            :disabled="selectedIndex <= 0"
            @click="moveLevel(-1)"
            ><ArrowUp :size="15"
          /></TButton>
          <TButton
            variant="outline"
            shape="square"
            data-sort-action="down"
            :aria-label="t('dataTools.sort.moveDown')"
            :title="t('dataTools.sort.moveDown')"
            :disabled="selectedIndex < 0 || selectedIndex >= rows.length - 1"
            @click="moveLevel(1)"
            ><ArrowDown :size="15"
          /></TButton>
          <TButton variant="outline" data-sort-action="options" @click="openOptions">{{
            t("dataTools.sort.options")
          }}</TButton>
        </div>
        <TCheckbox v-model="hasHeader" :disabled="initial?.headerLocked" data-sort-header>{{
          t("dataTools.sort.header")
        }}</TCheckbox>
      </div>
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini"
          row-key="id"
          :data="rows"
          :columns="tableColumns"
          :row-attributes="rowAttributes"
          :active-row-keys="selectedId === undefined ? [] : [selectedId]"
          active-row-type="single"
          :disable-space-inactive-row="true"
          size="small"
          table-layout="fixed"
          :height="height"
          :bordered="false"
          hover
          :aria-label="t('dataTools.sort.title')"
          @active-change="selectRows"
        >
          <template #column="{ row, rowIndex }">
            <div class="sort-dialog__column">
              <span class="sort-dialog__priority">{{
                t(rowIndex === 0 ? "dataTools.sort.primaryKey" : "dataTools.sort.thenBy")
              }}</span>
              <TSelect
                data-sort-field="column"
                :value="row.column"
                @update:value="changeColumn(row, $event)"
                :options="columnOptions"
                :popup-props="popupProps"
                :aria-label="t('dataTools.sort.column')"
                @focus="selectedId = row.id"
              />
            </div>
          </template>
          <template #basis="{ row }">
            <TSelect
              data-sort-field="basis"
              :value="row.sortOn ?? 'value'"
              :options="basisOptions"
              :popup-props="popupProps"
              :aria-label="t('dataTools.sort.sortOn')"
              @update:value="changeBasis(row, $event)"
              @focus="selectedId = row.id"
            />
          </template>
          <template #direction="{ row }">
            <div class="sort-dialog__order" :class="{ 'has-color': isColorLevel(row) }">
              <TSelect
                v-if="isColorLevel(row)"
                data-sort-field="color"
                :value="row.color === null ? 'no-fill' : row.color"
                :popup-props="popupProps"
                :aria-label="t('dataTools.sort.selectColor')"
                :placeholder="t('dataTools.sort.selectColor')"
                :empty="t('dataTools.sort.noColors')"
                :disabled="!colorsFor(row).length"
                @update:value="changeColor(row, $event)"
                @focus="selectedId = row.id"
              >
                <TOption
                  v-for="option in colorsFor(row)"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                >
                  <span class="sort-dialog__color-option">
                    <span
                      class="sort-dialog__swatch"
                      :class="{ 'is-empty': option.color === null }"
                      :style="{ backgroundColor: option.color ?? undefined }"
                      aria-hidden="true"
                    />
                    {{ option.label }}
                  </span>
                </TOption>
                <template v-if="row.color !== undefined" #valueDisplay>
                  <span class="sort-dialog__color-option">
                    <span
                      class="sort-dialog__swatch"
                      :class="{ 'is-empty': row.color === null }"
                      :style="{ backgroundColor: row.color ?? undefined }"
                      aria-hidden="true"
                    />
                    {{ row.color === null ? t("dataTools.sort.noFill") : row.color.toUpperCase() }}
                  </span>
                </template>
              </TSelect>
              <TSelect
                :value="orderValue(row)"
                data-sort-field="direction"
                :options="orderOptions(row)"
                @update:value="changeOrder(row, $event)"
                :popup-props="popupProps"
                :aria-label="t('dataTools.sort.order')"
                @focus="selectedId = row.id"
              />
            </div>
          </template>
        </TTable>
      </TableHeightWrapper>
    </div>
  </Dialog>
  <CustomSortListDialog
    v-if="visible && customListRowId !== undefined"
    :visible="true"
    :initial-order="customListRow?.customOrder"
    @close="customListRowId = undefined"
    @apply="applyCustomList"
  />
  <Dialog
    :visible="visible && optionsVisible"
    :header="t('dataTools.sort.optionsTitle')"
    width="min(320px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="t('dataTools.common.confirm')"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="optionsVisible = false"
    @confirm="applyOptions"
  >
    <div class="sort-dialog-options">
      <TCheckbox v-model="optionCaseSensitive" data-sort-case-sensitive>{{
        t("dataTools.sort.caseSensitive")
      }}</TCheckbox>
      <section class="sort-dialog-options__group">
        <strong>{{ t("dataTools.sort.orientation") }}</strong>
        <TRadioGroup
          value="columns"
          direction="vertical"
          :aria-label="t('dataTools.sort.orientation')"
        >
          <TRadio value="columns" data-sort-orientation="columns">{{
            t("dataTools.sort.sortByColumns")
          }}</TRadio>
          <TRadio value="rows" disabled data-sort-orientation="rows">{{
            t("dataTools.sort.sortByRows")
          }}</TRadio>
        </TRadioGroup>
      </section>
      <section class="sort-dialog-options__group">
        <strong>{{ t("dataTools.sort.method") }}</strong>
        <TRadioGroup
          v-model="optionSortMethod"
          direction="vertical"
          :aria-label="t('dataTools.sort.method')"
          data-sort-method
        >
          <TRadio value="pinyin">{{ t("dataTools.sort.pinyin") }}</TRadio>
          <TRadio value="stroke">{{ t("dataTools.sort.stroke") }}</TRadio>
        </TRadioGroup>
      </section>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.sort-dialog-options {
  display: grid;
  gap: var(--idea-space-6);

  &__group {
    display: grid;
    gap: var(--idea-space-2);

    strong {
      font-weight: var(--idea-font-weight-semibold);
    }
  }
}

.sort-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: min(300px, calc(100dvh - 180px));
  min-height: 0;
  min-width: 0;
  gap: 12px;
  color: var(--idea-text-primary);

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  &__column {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
  &__order {
    display: grid;
    min-width: 0;
    gap: 8px;

    &.has-color {
      grid-template-columns: minmax(0, 1fr) 108px;
    }
  }
  &__color-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  &__swatch {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    border: 1px solid var(--idea-border-control);
    border-radius: 2px;

    &.is-empty {
      background: linear-gradient(
        135deg,
        transparent 46%,
        var(--idea-status-error) 48%,
        var(--idea-status-error) 52%,
        transparent 54%
      );
    }
  }
  &__priority {
    white-space: nowrap;
  }
}
</style>
