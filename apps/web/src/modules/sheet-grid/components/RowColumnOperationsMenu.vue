<script setup lang="ts">
import { Columns3, Rows3 } from "lucide-vue-next";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { computed, nextTick, ref, useId, watch } from "vue";
import {
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  getColumnWidth,
  getRowHeight,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useRibbonMenu } from "../../../shared/ribbon/useRibbonMenu";

const props = defineProps<{
  sheet: Sheet;
  range: CellRange;
  disabled: boolean;
  editSessionId?: string;
}>();

const emit = defineEmits<{
  resize: [payload: { axis: SheetDimensionAxis; index: number; size: number }];
  insert: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  delete: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  clear: [range: CellRange];
}>();

type AxisSizeTarget = {
  axis: SheetDimensionAxis;
  index: number;
  size: number;
};

const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `row-column-operations-${useId().replaceAll(":", "")}`;
const sizeTarget = ref<AxisSizeTarget>();
const sizeDraft = ref<InputNumberValue>();
const isSizeDialogOpen = computed(() => sizeTarget.value !== undefined);
const rowCount = computed(() => props.range.end.row - props.range.start.row + 1);
const columnCount = computed(() => props.range.end.column - props.range.start.column + 1);
const rowSizeEnabled = computed(() => !props.disabled && rowCount.value === 1);
const columnSizeEnabled = computed(() => !props.disabled && columnCount.value === 1);
const canInsertRowsAbove = computed(() => rowCount.value <= MAX_SHEET_ROWS - props.range.start.row);
const canInsertRowsBelow = computed(
  () => rowCount.value <= MAX_SHEET_ROWS - props.range.end.row - 1,
);
const canInsertColumnsBefore = computed(
  () => columnCount.value <= MAX_SHEET_COLUMNS - props.range.start.column,
);
const canInsertColumnsAfter = computed(
  () => columnCount.value <= MAX_SHEET_COLUMNS - props.range.end.column - 1,
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useRibbonMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function closeSizeDialog(restoreFocus = true): void {
  sizeTarget.value = undefined;
  sizeDraft.value = undefined;
  if (restoreFocus) {
    void nextTick(() => buttonRef.value?.rootElement?.focus({ preventScroll: true }));
  }
}

function getAxisSizeRange(axis: SheetDimensionAxis): { minimum: number; maximum: number } {
  return axis === "row"
    ? { minimum: MIN_ROW_HEIGHT, maximum: MAX_ROW_HEIGHT }
    : { minimum: MIN_COLUMN_WIDTH, maximum: MAX_COLUMN_WIDTH };
}

function getInsertLabel(axis: SheetDimensionAxis, direction: "before" | "after"): string {
  const count = axis === "row" ? rowCount.value : columnCount.value;
  if (axis === "row") {
    if (direction === "before") {
      return t(count === 1 ? "axisMenu.insertRowAboveOne" : "axisMenu.insertRowsAbove", { count });
    }
    return t(count === 1 ? "axisMenu.insertRowBelowOne" : "axisMenu.insertRowsBelow", { count });
  }
  if (direction === "before") {
    return t(count === 1 ? "axisMenu.insertColumnBeforeOne" : "axisMenu.insertColumnsBefore", {
      count,
    });
  }
  return t(count === 1 ? "axisMenu.insertColumnAfterOne" : "axisMenu.insertColumnsAfter", {
    count,
  });
}

function getDeleteLabel(axis: SheetDimensionAxis): string {
  const count = axis === "row" ? rowCount.value : columnCount.value;
  if (axis === "row")
    return t(count === 1 ? "axisMenu.deleteRowOne" : "axisMenu.deleteRows", { count });
  return t(count === 1 ? "axisMenu.deleteColumnOne" : "axisMenu.deleteColumns", { count });
}

function getClearLabel(axis: SheetDimensionAxis): string {
  const count = axis === "row" ? rowCount.value : columnCount.value;
  if (axis === "row")
    return t(count === 1 ? "axisMenu.clearRowOne" : "axisMenu.clearRows", { count });
  return t(count === 1 ? "axisMenu.clearColumnOne" : "axisMenu.clearColumns", { count });
}

function requestInsert(axis: SheetDimensionAxis, direction: "before" | "after"): void {
  if (props.disabled) return;
  const count = axis === "row" ? rowCount.value : columnCount.value;
  const start = axis === "row" ? props.range.start.row : props.range.start.column;
  const end = axis === "row" ? props.range.end.row : props.range.end.column;
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  const index = direction === "before" ? start : end + 1;
  if (count < 1 || count > maximum - index) return;
  emit("insert", { axis, index, count });
  dismiss();
}

function requestDelete(axis: SheetDimensionAxis): void {
  if (props.disabled) return;
  const index = axis === "row" ? props.range.start.row : props.range.start.column;
  const count = axis === "row" ? rowCount.value : columnCount.value;
  if (count < 1) return;
  emit("delete", { axis, index, count });
  dismiss();
}

function requestClear(axis: SheetDimensionAxis): void {
  if (props.disabled) return;
  const range: CellRange =
    axis === "row"
      ? {
          start: { row: props.range.start.row, column: 0 },
          end: { row: props.range.end.row, column: MAX_SHEET_COLUMNS - 1 },
        }
      : {
          start: { row: 0, column: props.range.start.column },
          end: { row: MAX_SHEET_ROWS - 1, column: props.range.end.column },
        };
  emit("clear", range);
  dismiss();
}

function openSizeDialog(axis: SheetDimensionAxis): void {
  if (props.disabled || (axis === "row" ? !rowSizeEnabled.value : !columnSizeEnabled.value)) return;
  const index = axis === "row" ? props.range.start.row : props.range.start.column;
  const size =
    axis === "row" ? getRowHeight(props.sheet, index) : getColumnWidth(props.sheet, index);
  sizeTarget.value = { axis, index, size };
  sizeDraft.value = size;
  dismiss("programmatic", false);
}

function updateSize(value: InputNumberValue): void {
  sizeDraft.value = value;
}

function confirmSize(): void {
  const target = sizeTarget.value;
  if (props.disabled || !target || typeof sizeDraft.value !== "number") return;
  const { minimum, maximum } = getAxisSizeRange(target.axis);
  const size = Math.round(sizeDraft.value);
  if (!Number.isFinite(size) || size < minimum || size > maximum) return;
  if (size !== target.size) emit("resize", { axis: target.axis, index: target.index, size });
  closeSizeDialog();
}

watch(
  () => props.sheet.id,
  () => {
    closeSizeDialog(false);
    dismiss("programmatic", false);
  },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeSizeDialog(false);
  },
);
</script>

<template>
  <div class="row-column-operations-menu">
    <RibbonMenuButton
      ref="buttonRef"
      :label="t('ribbon.rowColumnTools')"
      :text="t('ribbon.rowColumnTools')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-ribbon-action="row-column-operations"
      :data-cell-edit-session="editSessionId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <Rows3 :size="15" aria-hidden="true" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="row-column-operations-menu__surface"
        :style="floatingStyles"
        :label="t('ribbon.rowColumnTools')"
      >
        <MenuItem
          data-row-column-action="row-height"
          :disabled="!rowSizeEnabled"
          @select="openSizeDialog('row')"
        >
          {{ t("axisMenu.rowHeight") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="column-width"
          :disabled="!columnSizeEnabled"
          @select="openSizeDialog('column')"
        >
          {{ t("axisMenu.columnWidth") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          data-row-column-action="insert-rows-above"
          :disabled="disabled || !canInsertRowsAbove"
          @select="requestInsert('row', 'before')"
        >
          <template #icon><Rows3 :size="15" /></template>
          {{ getInsertLabel("row", "before") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="insert-rows-below"
          :disabled="disabled || !canInsertRowsBelow"
          @select="requestInsert('row', 'after')"
        >
          <template #icon><Rows3 :size="15" /></template>
          {{ getInsertLabel("row", "after") }}
        </MenuItem>
        <MenuItem
          danger
          data-row-column-action="delete-rows"
          :disabled="disabled"
          @select="requestDelete('row')"
        >
          {{ getDeleteLabel("row") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="insert-columns-before"
          :disabled="disabled || !canInsertColumnsBefore"
          @select="requestInsert('column', 'before')"
        >
          <template #icon><Columns3 :size="15" /></template>
          {{ getInsertLabel("column", "before") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="insert-columns-after"
          :disabled="disabled || !canInsertColumnsAfter"
          @select="requestInsert('column', 'after')"
        >
          <template #icon><Columns3 :size="15" /></template>
          {{ getInsertLabel("column", "after") }}
        </MenuItem>
        <MenuItem
          danger
          data-row-column-action="delete-columns"
          :disabled="disabled"
          @select="requestDelete('column')"
        >
          {{ getDeleteLabel("column") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          data-row-column-action="clear-rows"
          :disabled="disabled"
          @select="requestClear('row')"
        >
          {{ getClearLabel("row") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="clear-columns"
          :disabled="disabled"
          @select="requestClear('column')"
        >
          {{ getClearLabel("column") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
    <Dialog
      :visible="isSizeDialogOpen"
      :header="t(sizeTarget?.axis === 'row' ? 'axisMenu.rowHeight' : 'axisMenu.columnWidth')"
      :confirm-btn="{ content: t('cellFormat.confirm'), disabled }"
      :cancel-btn="t('cellFormat.cancel')"
      :close-on-overlay-click="false"
      :destroy-on-close="true"
      :confirm-on-enter="true"
      width="min(360px, calc(100vw - 32px))"
      placement="center"
      class="row-column-operations-menu__dialog"
      @confirm="confirmSize"
      @close="closeSizeDialog()"
    >
      <div
        class="row-column-operations-menu__size-field"
        role="group"
        :aria-label="t(sizeTarget?.axis === 'row' ? 'axisMenu.rowHeight' : 'axisMenu.columnWidth')"
      >
        <span>{{
          t(sizeTarget?.axis === "row" ? "axisMenu.rowHeight" : "axisMenu.columnWidth")
        }}</span>
        <TInputNumber
          class="idea-input-number--persistent-controls"
          :model-value="sizeDraft"
          :min="sizeTarget ? getAxisSizeRange(sizeTarget.axis).minimum : undefined"
          :max="sizeTarget ? getAxisSizeRange(sizeTarget.axis).maximum : undefined"
          :decimal-places="0"
          :step="1"
          theme="column"
          :suffix="t('axisMenu.pixels')"
          :aria-label="
            t(sizeTarget?.axis === 'row' ? 'axisMenu.rowHeight' : 'axisMenu.columnWidth')
          "
          data-row-column-size-input
          @change="updateSize"
        />
      </div>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.row-column-operations-menu {
  @include ribbon.tool;

  &__surface {
    z-index: 80;
    min-width: 210px;
  }

  &__size-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 146px;
    align-items: center;
    gap: 8px;
    color: var(--idea-text-primary);
  }
}
</style>
