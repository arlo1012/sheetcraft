<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-vue-next";
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
import { vIconAction } from "../../../shared/focus/icon-action";
import type { SortIcon } from "@idea10/core/commands";
import ConditionalFormatIcon from "../../../shared/conditional-formatting/ConditionalFormatIcon.vue";
import { sortIconKey } from "../sort-icon-options";
import CustomSortListDialog from "./CustomSortListDialog.vue";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import type {
  DataToolColumn,
  SortDraft,
  SortInitial,
  SortLevel,
  SortColorColumn,
  SortIconColumn,
} from "../data-tools-types";

type SortRow = SortLevel & { id: number };
const props = withDefaults(
  defineProps<{
    visible: boolean;
    columns: readonly DataToolColumn[];
    rangeLabel?: string;
    initial?: SortInitial;
    colorColumns?: readonly SortColorColumn[];
    iconColumns?: readonly SortIconColumn[];
  }>(),
  { rangeLabel: "", initial: undefined, colorColumns: () => [], iconColumns: () => [] },
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
  if (isVisualLevel(row)) return positionOptions.value;
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
  return !isVisualLevel(row) && row.customOrder
    ? row.direction === "ascending"
      ? "selected-custom"
      : "selected-custom-reversed"
    : row.direction;
}
function changeOrder(row: SortRow, value: unknown): void {
  if (value === "custom" && !isVisualLevel(row)) {
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
  { label: t("dataTools.sort.icon"), value: "icon" },
]);
const positionOptions = computed(() => [
  { label: t("dataTools.sort.onTop"), value: "ascending" },
  { label: t("dataTools.sort.onBottom"), value: "descending" },
]);
function isColorLevel(row: SortLevel): boolean {
  return row.sortOn === "cellColor" || row.sortOn === "fontColor";
}
function isVisualLevel(row: SortLevel): boolean {
  return isColorLevel(row) || row.sortOn === "icon";
}
function iconLabel(icon: SortIcon | null): string {
  return icon
    ? `${t(`conditionalFormatting.${icon.iconSet}`)} (${icon.iconIndex + 1})`
    : t("dataTools.sort.noIcon");
}
function iconsFor(row: SortLevel) {
  const column = props.iconColumns.find((item) => item.column === row.column);
  if (!column || row.sortOn !== "icon") return [];
  const icons = new Map(column.icons.map((icon) => [sortIconKey(icon), icon]));
  if (!hasHeader.value) icons.set(sortIconKey(column.headerIcon), column.headerIcon);
  return [...icons].map(([value, icon]) => ({ value, icon, label: iconLabel(icon) }));
}
function syncIcon(row: SortRow): void {
  if (row.sortOn !== "icon") {
    delete row.icon;
    return;
  }
  const icons = iconsFor(row);
  if (row.icon === undefined || !icons.some((option) => option.value === sortIconKey(row.icon!))) {
    const first = icons[0];
    if (first) row.icon = first.icon ? { ...first.icon } : null;
    else delete row.icon;
  }
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
  syncIcon(row);
}
function changeBasis(row: SortRow, value: unknown): void {
  if (value !== "value" && value !== "cellColor" && value !== "fontColor" && value !== "icon")
    return;
  row.sortOn = value;
  if (value !== "value") delete row.customOrder;
  delete row.color;
  delete row.icon;
  syncColor(row);
  syncIcon(row);
}
function changeColor(row: SortRow, value: unknown): void {
  const option = colorsFor(row).find((option) => option.value === value);
  if (option) row.color = option.color;
}
function changeIcon(row: SortRow, value: unknown): void {
  const option = iconsFor(row).find((option) => option.value === value);
  if (option) row.icon = option.icon ? { ...option.icon } : null;
}
watch([hasHeader, () => props.colorColumns, () => props.iconColumns], () => {
  rows.value.forEach((row) => {
    syncColor(row);
    syncIcon(row);
  });
});
const canApply = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every((row) =>
      isColorLevel(row)
        ? colorsFor(row).some((option) => option.color === row.color)
        : row.sortOn === "icon"
          ? row.icon !== undefined &&
            iconsFor(row).some((option) => option.value === sortIconKey(row.icon!))
          : true,
    ),
);
const tableColumns = computed<BaseTableCol[]>(() => [
  { colKey: "column", title: t("dataTools.sort.column"), width: 300 },
  { colKey: "basis", title: t("dataTools.sort.sortOn"), width: 150 },
  { colKey: "direction", title: t("dataTools.sort.order") },
  { colKey: "actions", title: t("dataTools.sort.actions"), width: 144, align: "center" },
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
      ...(level.icon ? { icon: { ...level.icon } } : {}),
      id: ++nextId,
    }));
    rows.value.forEach(syncIcon);
    selectedId.value = rows.value[0]?.id;
  },
  { immediate: true },
);
function selectRows(keys: Array<string | number>): void {
  if (typeof keys[0] === "number") selectedId.value = keys[0];
}
function insertLevel(level: SortLevel, afterIndex = selectedIndex.value): void {
  const row = {
    ...level,
    ...(level.customOrder ? { customOrder: [...level.customOrder] } : {}),
    ...(level.icon ? { icon: { ...level.icon } } : {}),
    id: ++nextId,
  };
  rows.value.splice(afterIndex + 1, 0, row);
  selectedId.value = row.id;
}
function addLevel(): void {
  if (rows.value.length >= maxLevels) return;
  const column =
    props.columns.find((item) => !rows.value.some((row) => row.column === item.column)) ??
    props.columns[0];
  if (column) insertLevel({ column: column.column, direction: "ascending" });
}
function copyLevel(index: number): void {
  const row = rows.value[index];
  if (row && rows.value.length < maxLevels) insertLevel(row, index);
}
function removeLevel(index: number): void {
  if (rows.value.length <= 1 || index < 0) return;
  rows.value.splice(index, 1);
  selectedId.value = rows.value[Math.min(index, rows.value.length - 1)]?.id;
}
function moveLevel(index: number, offset: -1 | 1): void {
  const target = index + offset;
  if (index < 0 || target < 0 || target >= rows.value.length) return;
  const [row] = rows.value.splice(index, 1);
  if (row) {
    rows.value.splice(target, 0, row);
    selectedId.value = row.id;
  }
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
        : row.sortOn === "icon"
          ? { sortOn: "icon", icon: row.icon ? { ...row.icon } : null }
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
          >
            <template #icon><Plus class="idea-control-icon" aria-hidden="true" /></template>
            {{ t("dataTools.sort.addLevel") }}
          </TButton>
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
          vertical-align="middle"
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
            <div class="sort-dialog__order" :class="{ 'has-visual': isVisualLevel(row) }">
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
                v-else-if="row.sortOn === 'icon'"
                data-sort-field="icon"
                :value="row.icon === undefined ? undefined : sortIconKey(row.icon)"
                :popup-props="popupProps"
                :aria-label="t('dataTools.sort.selectIcon')"
                :placeholder="t('dataTools.sort.selectIcon')"
                :empty="t('dataTools.sort.noIcons')"
                :disabled="!iconsFor(row).length"
                @update:value="changeIcon(row, $event)"
                @focus="selectedId = row.id"
              >
                <TOption
                  v-for="option in iconsFor(row)"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                >
                  <span class="sort-dialog__visual-option">
                    <ConditionalFormatIcon
                      v-if="option.icon"
                      :icon-set="option.icon.iconSet"
                      :icon-index="option.icon.iconIndex"
                    />
                    {{ option.label }}
                  </span>
                </TOption>
                <template v-if="row.icon !== undefined" #valueDisplay>
                  <span class="sort-dialog__visual-option">
                    <ConditionalFormatIcon
                      v-if="row.icon"
                      :icon-set="row.icon.iconSet"
                      :icon-index="row.icon.iconIndex"
                    />
                    {{ iconLabel(row.icon) }}
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
          <template #actions="{ rowIndex }">
            <div class="sort-dialog__row-actions" @dblclick.stop>
              <span
                v-icon-action="rows.length >= maxLevels"
                data-sort-action="copy"
                :aria-label="t('dataTools.sort.copyLevel')"
                :title="t('dataTools.sort.copyLevel')"
                @click.stop="copyLevel(rowIndex)"
                ><Copy class="idea-action-icon" aria-hidden="true"
              /></span>
              <span
                v-icon-action="rows.length <= 1"
                data-sort-action="delete"
                :aria-label="t('dataTools.sort.deleteLevel')"
                :title="t('dataTools.sort.deleteLevel')"
                @click.stop="removeLevel(rowIndex)"
                ><Trash2 class="idea-action-icon" aria-hidden="true"
              /></span>
              <span
                v-icon-action="rowIndex === 0"
                data-sort-action="up"
                :aria-label="t('dataTools.sort.moveUp')"
                :title="t('dataTools.sort.moveUp')"
                @click.stop="moveLevel(rowIndex, -1)"
                ><ArrowUp class="idea-action-icon" aria-hidden="true"
              /></span>
              <span
                v-icon-action="rowIndex === rows.length - 1"
                data-sort-action="down"
                :aria-label="t('dataTools.sort.moveDown')"
                :title="t('dataTools.sort.moveDown')"
                @click.stop="moveLevel(rowIndex, 1)"
                ><ArrowDown class="idea-action-icon" aria-hidden="true"
              /></span>
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
  gap: var(--idea-space-4);
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
    gap: var(--idea-space-4);
  }
  &__row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--idea-space-2);

    > span {
      width: 24px;
      height: 28px;
    }
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

    &.has-visual {
      grid-template-columns: minmax(0, 1fr) 108px;
    }
  }
  &__color-option,
  &__visual-option {
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
