<script setup lang="ts">
import {
  ChevronRight,
  Columns3,
  EyeOff,
  Maximize2,
  Rows3,
  Scaling,
  TableCellsMerge,
  TableCellsSplit,
  Rows2,
  TableRowsSplit,
  TableColumnsSplit,
} from "lucide-vue-next";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { computed, nextTick, ref, useId, watch } from "vue";
import {
  DEFAULT_ROW_HEIGHT,
  MAX_COLUMN_WIDTH,
  MAX_ROW_HEIGHT,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  MIN_ROW_HEIGHT,
  getDefaultColumnWidth,
  type CellRange,
  type Sheet,
  type SheetDimensionAxis,
} from "@idea10/core/workbook";
import AxisInsertMenuItem from "./AxisInsertMenuItem.vue";
import CellOperationDialog from "./CellOperationDialog.vue";
import { useAppI18n } from "../../../shared/i18n";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
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
  cellOperation: [
    payload: {
      operation: "insert" | "delete";
      range: CellRange;
      direction: "right" | "down" | "left" | "up" | "row" | "column";
    },
  ];
  deleteEmptyRows: [range: CellRange];
  resize: [payload: { axis: SheetDimensionAxis; index: number; count: number; size: number }];
  insert: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  delete: [payload: { axis: SheetDimensionAxis; index: number; count: number }];
  autoFit: [payload: { axis: SheetDimensionAxis; range: CellRange }];
  standardWidth: [payload: { size: number }];
  visibility: [
    payload: { axis: SheetDimensionAxis; index: number; count: number; hidden: boolean },
  ];
}>();

type AxisOperationSubmenu = "insert" | "delete" | "visibility";
type AxisSizeTarget = {
  axis: SheetDimensionAxis;
  index: number;
  count: number;
  size: number;
};

const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `row-column-operations-${useId().replaceAll(":", "")}`;
const submenuId = `row-column-operations-submenu-${useId().replaceAll(":", "")}`;
const cellTarget = ref<{ operation: "insert" | "delete"; range: CellRange }>();
const sizeTarget = ref<AxisSizeTarget>();
const sizeDraft = ref<InputNumberValue>();
const standardWidthDraft = ref<InputNumberValue>();
const isStandardWidthDialogOpen = ref(false);
const activeSubmenu = ref<AxisOperationSubmenu | null>(null);
const isSizeDialogOpen = computed(() => sizeTarget.value !== undefined);
const rowCount = computed(() => props.range.end.row - props.range.start.row + 1);
const columnCount = computed(() => props.range.end.column - props.range.start.column + 1);
const submenuRef = computed(() => submenuSurfaceRef.value?.rootElement ?? null);
const submenuAnchor = computed(() => {
  const action = activeSubmenu.value;
  return action
    ? (menuSurfaceRef.value?.rootElement?.querySelector<HTMLElement>(
        `[data-row-column-action="${action}"]`,
      ) ?? null)
    : null;
});
const submenuOpen = computed(() => activeSubmenu.value !== null);
const { floatingStyles: submenuStyles } = useFloatingPanel(submenuAnchor, submenuRef, submenuOpen, {
  placement: "right-start",
  offset: 4,
});
const rowSizeEnabled = computed(() => !props.disabled && rowCount.value > 0);
const columnSizeEnabled = computed(() => !props.disabled && columnCount.value > 0);
function maximumInsertCount(axis: SheetDimensionAxis, direction: "before" | "after"): number {
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  const address = direction === "before" ? props.range.start : props.range.end;
  const index = axis === "row" ? address.row : address.column;
  return maximum - index - (direction === "after" ? 1 : 0);
}
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useRibbonMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  additionalInside: () => [submenuRef.value],
  onDismiss: () => {
    activeSubmenu.value = null;
  },
});

function closeSizeDialog(restoreFocus = true): void {
  sizeTarget.value = undefined;
  sizeDraft.value = undefined;
  if (restoreFocus) {
    void nextTick(() => buttonRef.value?.rootElement?.focus({ preventScroll: true }));
  }
}

function closeStandardWidthDialog(restoreFocus = true): void {
  isStandardWidthDialogOpen.value = false;
  standardWidthDraft.value = undefined;
  if (restoreFocus) {
    void nextTick(() => buttonRef.value?.rootElement?.focus({ preventScroll: true }));
  }
}

function getAxisSizeRange(axis: SheetDimensionAxis): { minimum: number; maximum: number } {
  return axis === "row"
    ? { minimum: MIN_ROW_HEIGHT, maximum: MAX_ROW_HEIGHT }
    : { minimum: MIN_COLUMN_WIDTH, maximum: MAX_COLUMN_WIDTH };
}

function getDeleteLabel(axis: SheetDimensionAxis): string {
  const count = axis === "row" ? rowCount.value : columnCount.value;
  if (axis === "row")
    return t(count === 1 ? "axisMenu.deleteRowOne" : "axisMenu.deleteRows", { count });
  return t(count === 1 ? "axisMenu.deleteColumnOne" : "axisMenu.deleteColumns", { count });
}

function requestInsert(
  axis: SheetDimensionAxis,
  direction: "before" | "after",
  count: number,
): void {
  if (props.disabled || !Number.isInteger(count)) return;
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

function closeCellDialog(restoreFocus = true): void {
  cellTarget.value = undefined;
  if (restoreFocus)
    void nextTick(() => buttonRef.value?.rootElement?.focus({ preventScroll: true }));
}

function openCellDialog(operation: "insert" | "delete"): void {
  if (props.disabled) return;
  cellTarget.value = {
    operation,
    range: { start: { ...props.range.start }, end: { ...props.range.end } },
  };
  dismiss("programmatic", false);
}

function confirmCellOperation(
  direction: "right" | "down" | "left" | "up" | "row" | "column",
): void {
  if (props.disabled || !cellTarget.value) return;
  emit("cellOperation", { ...cellTarget.value, direction });
  closeCellDialog();
}

function requestDeleteEmptyRows(): void {
  if (props.disabled) return;
  emit("deleteEmptyRows", props.range);
  dismiss();
}

function openSizeDialog(axis: SheetDimensionAxis): void {
  if (props.disabled || (axis === "row" ? !rowSizeEnabled.value : !columnSizeEnabled.value)) {
    return;
  }
  const index = axis === "row" ? props.range.start.row : props.range.start.column;
  const count = axis === "row" ? rowCount.value : columnCount.value;
  // Preserve a hidden dimension's stored manual size instead of presenting 0.
  const dimensions = axis === "row" ? props.sheet.rowHeights : props.sheet.columnWidths;
  const fallback = axis === "row" ? DEFAULT_ROW_HEIGHT : getDefaultColumnWidth(props.sheet);
  const size = dimensions.get(index) ?? fallback;
  sizeTarget.value = { axis, index, count, size };
  sizeDraft.value = size;
  activeSubmenu.value = null;
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
  if (size !== target.size || target.count > 1) {
    emit("resize", { axis: target.axis, index: target.index, count: target.count, size });
  }
  closeSizeDialog();
}

function openStandardWidthDialog(): void {
  if (props.disabled) return;
  standardWidthDraft.value = getDefaultColumnWidth(props.sheet);
  isStandardWidthDialogOpen.value = true;
  activeSubmenu.value = null;
  dismiss("programmatic", false);
}

function confirmStandardWidth(): void {
  if (props.disabled || typeof standardWidthDraft.value !== "number") return;
  const size = Math.round(standardWidthDraft.value);
  if (!Number.isFinite(size) || size < MIN_COLUMN_WIDTH || size > MAX_COLUMN_WIDTH) return;
  if (size !== getDefaultColumnWidth(props.sheet)) emit("standardWidth", { size });
  closeStandardWidthDialog();
}

function requestAutoFit(axis: SheetDimensionAxis): void {
  if (props.disabled) return;
  emit("autoFit", { axis, range: props.range });
  dismiss();
}

function requestVisibility(axis: SheetDimensionAxis, hidden: boolean): void {
  if (props.disabled) return;
  const index = axis === "row" ? props.range.start.row : props.range.start.column;
  const count = axis === "row" ? rowCount.value : columnCount.value;
  emit("visibility", { axis, index, count, hidden });
  dismiss();
}

function openSubmenu(submenu: AxisOperationSubmenu, focus = true): void {
  if (props.disabled) return;
  activeSubmenu.value = submenu;
  if (focus) void nextTick(() => submenuSurfaceRef.value?.focusFirstItem());
}

function closeSubmenu(restoreFocus: boolean): void {
  const action = activeSubmenu.value;
  activeSubmenu.value = null;
  if (restoreFocus && action) {
    void nextTick(() =>
      menuSurfaceRef.value?.rootElement
        ?.querySelector<HTMLElement>(`[data-row-column-action="${action}"]`)
        ?.focus(),
    );
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowRight") return;
  const action = (
    event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-row-column-action]")?.dataset.rowColumnAction
      : undefined
  ) as AxisOperationSubmenu | undefined;
  if (action === "insert" || action === "delete" || action === "visibility") {
    event.preventDefault();
    openSubmenu(action);
  }
}

function onMenuFocusin(event: FocusEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const action = target?.closest<HTMLElement>("[data-row-column-action]")?.dataset.rowColumnAction;
  if (activeSubmenu.value && action !== activeSubmenu.value) {
    activeSubmenu.value = null;
  }
}

function onSubmenuKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowLeft" && event.target instanceof HTMLInputElement) return;
  if (event.key === "Escape" || event.key === "ArrowLeft") {
    event.preventDefault();
    event.stopPropagation();
    closeSubmenu(true);
  }
}

watch(
  () => props.sheet.id,
  () => {
    closeCellDialog(false);
    closeSizeDialog(false);
    closeStandardWidthDialog(false);
    dismiss("programmatic", false);
  },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closeCellDialog(false);
      closeSizeDialog(false);
      closeStandardWidthDialog(false);
    }
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
        @focusin="onMenuFocusin"
        @keydown="onMenuKeydown"
      >
        <MenuItem
          data-row-column-action="row-height"
          :disabled="!rowSizeEnabled"
          @select="openSizeDialog('row')"
        >
          <template #icon><Rows3 :size="15" /></template>
          {{ t("axisMenu.rowHeight") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="auto-fit-row-height"
          :disabled="disabled"
          @select="requestAutoFit('row')"
        >
          <template #icon><Maximize2 :size="15" /></template>
          {{ t("axisMenu.autoFitRowHeight") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          data-row-column-action="column-width"
          :disabled="!columnSizeEnabled"
          @select="openSizeDialog('column')"
        >
          <template #icon><Columns3 :size="15" /></template>
          {{ t("axisMenu.columnWidth") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="auto-fit-column-width"
          :disabled="disabled"
          @select="requestAutoFit('column')"
        >
          <template #icon><Maximize2 :size="15" /></template>
          {{ t("axisMenu.autoFitColumnWidth") }}
        </MenuItem>
        <MenuItem
          data-row-column-action="standard-column-width"
          :disabled="disabled"
          @select="openStandardWidthDialog"
        >
          <template #icon><Scaling :size="15" /></template>
          {{ t("axisMenu.standardColumnWidth") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          data-row-column-action="insert"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'insert'"
          :aria-controls="activeSubmenu === 'insert' ? submenuId : undefined"
          :disabled="disabled"
          @select="openSubmenu('insert')"
          @mouseenter="openSubmenu('insert', false)"
        >
          <template #icon
            ><TableCellsSplit class="row-column-operations-menu__insert-icon" :size="15"
          /></template>
          {{ t("axisMenu.insertCells") }}
          <template #shortcut><ChevronRight :size="15" /></template>
        </MenuItem>
        <MenuItem
          data-row-column-action="delete"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'delete'"
          :aria-controls="activeSubmenu === 'delete' ? submenuId : undefined"
          :disabled="disabled"
          @select="openSubmenu('delete')"
          @mouseenter="openSubmenu('delete', false)"
        >
          <template #icon
            ><TableCellsMerge class="row-column-operations-menu__delete-icon" :size="15"
          /></template>
          {{ t("axisMenu.deleteCells") }}
          <template #shortcut><ChevronRight :size="15" /></template>
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          data-row-column-action="visibility"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'visibility'"
          :aria-controls="activeSubmenu === 'visibility' ? submenuId : undefined"
          :disabled="disabled"
          @select="openSubmenu('visibility')"
          @mouseenter="openSubmenu('visibility', false)"
        >
          <template #icon><EyeOff :size="15" /></template>
          {{ t("axisMenu.hideAndUnhide") }}
          <template #shortcut><ChevronRight :size="15" /></template>
        </MenuItem>
      </MenuSurface>
      <MenuSurface
        v-if="activeSubmenu"
        :id="submenuId"
        ref="submenuSurfaceRef"
        class="row-column-operations-menu__surface row-column-operations-menu__submenu"
        :style="submenuStyles"
        :label="t('ribbon.rowColumnTools')"
        @keydown="onSubmenuKeydown"
      >
        <template v-if="activeSubmenu === 'insert'">
          <MenuItem
            data-row-column-action="insert-cells"
            :disabled="disabled"
            @select="openCellDialog('insert')"
          >
            <template #icon
              ><TableCellsSplit class="row-column-operations-menu__insert-icon" :size="15"
            /></template>
            {{ t("axisMenu.insertCellsDialog") }}
          </MenuItem>
          <MenuSeparator />
          <AxisInsertMenuItem
            action="insert-rows-above"
            :label="t('axisMenu.insertRowsAboveAction')"
            :initial-count="rowCount"
            :maximum="maximumInsertCount('row', 'before')"
            :disabled="disabled"
            @insert="requestInsert('row', 'before', $event)"
            ><TableRowsSplit class="row-column-operations-menu__insert-icon" :size="15"
          /></AxisInsertMenuItem>
          <AxisInsertMenuItem
            action="insert-rows-below"
            :label="t('axisMenu.insertRowsBelowAction')"
            :initial-count="rowCount"
            :maximum="maximumInsertCount('row', 'after')"
            :disabled="disabled"
            @insert="requestInsert('row', 'after', $event)"
            ><TableRowsSplit class="row-column-operations-menu__insert-icon" :size="15"
          /></AxisInsertMenuItem>
          <AxisInsertMenuItem
            action="insert-columns-before"
            :label="t('axisMenu.insertColumnsBeforeAction')"
            :initial-count="columnCount"
            :maximum="maximumInsertCount('column', 'before')"
            :disabled="disabled"
            @insert="requestInsert('column', 'before', $event)"
            ><TableColumnsSplit class="row-column-operations-menu__insert-icon" :size="15"
          /></AxisInsertMenuItem>
          <AxisInsertMenuItem
            action="insert-columns-after"
            :label="t('axisMenu.insertColumnsAfterAction')"
            :initial-count="columnCount"
            :maximum="maximumInsertCount('column', 'after')"
            :disabled="disabled"
            @insert="requestInsert('column', 'after', $event)"
            ><TableColumnsSplit class="row-column-operations-menu__insert-icon" :size="15"
          /></AxisInsertMenuItem>
        </template>
        <template v-else-if="activeSubmenu === 'delete'">
          <MenuItem
            data-row-column-action="delete-cells"
            :disabled="disabled"
            @select="openCellDialog('delete')"
          >
            <template #icon
              ><TableCellsMerge class="row-column-operations-menu__delete-icon" :size="15"
            /></template>
            {{ t("axisMenu.deleteCellsDialog") }}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            data-row-column-action="delete-rows"
            :disabled="disabled"
            @select="requestDelete('row')"
          >
            <template #icon><Rows3 :size="15" /></template>
            {{ getDeleteLabel("row") }}
          </MenuItem>
          <MenuItem
            data-row-column-action="delete-columns"
            :disabled="disabled"
            @select="requestDelete('column')"
          >
            <template #icon><Columns3 :size="15" /></template>
            {{ getDeleteLabel("column") }}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            data-row-column-action="delete-empty-rows"
            :disabled="disabled"
            @select="requestDeleteEmptyRows"
          >
            <template #icon
              ><Rows2 class="row-column-operations-menu__delete-icon" :size="15"
            /></template>
            {{ t("axisMenu.deleteEmptyRows") }}
          </MenuItem>
        </template>
        <template v-else>
          <MenuItem
            data-row-column-action="hide-rows"
            :disabled="disabled"
            @select="requestVisibility('row', true)"
          >
            {{ t("axisMenu.hideRows") }}
          </MenuItem>
          <MenuItem
            data-row-column-action="unhide-rows"
            :disabled="disabled"
            @select="requestVisibility('row', false)"
          >
            {{ t("axisMenu.unhideRows") }}
          </MenuItem>
          <MenuItem
            data-row-column-action="hide-columns"
            :disabled="disabled"
            @select="requestVisibility('column', true)"
          >
            {{ t("axisMenu.hideColumns") }}
          </MenuItem>
          <MenuItem
            data-row-column-action="unhide-columns"
            :disabled="disabled"
            @select="requestVisibility('column', false)"
          >
            {{ t("axisMenu.unhideColumns") }}
          </MenuItem>
        </template>
      </MenuSurface>
    </Teleport>
    <CellOperationDialog
      v-if="cellTarget"
      :operation="cellTarget.operation"
      :range="cellTarget.range"
      :disabled="disabled"
      @confirm="confirmCellOperation"
      @close="closeCellDialog()"
    />
    <Dialog
      role="dialog"
      aria-modal="true"
      :aria-label="t(sizeTarget?.axis === 'row' ? 'axisMenu.rowHeight' : 'axisMenu.columnWidth')"
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
    <Dialog
      role="dialog"
      aria-modal="true"
      :aria-label="t('axisMenu.standardColumnWidth')"
      :visible="isStandardWidthDialogOpen"
      :header="t('axisMenu.standardColumnWidth')"
      :confirm-btn="{ content: t('cellFormat.confirm'), disabled }"
      :cancel-btn="t('cellFormat.cancel')"
      :close-on-overlay-click="false"
      :destroy-on-close="true"
      :confirm-on-enter="true"
      width="min(360px, calc(100vw - 32px))"
      placement="center"
      class="row-column-operations-menu__dialog"
      @confirm="confirmStandardWidth"
      @close="closeStandardWidthDialog()"
    >
      <div
        class="row-column-operations-menu__size-field"
        role="group"
        :aria-label="t('axisMenu.standardColumnWidth')"
      >
        <span>{{ t("axisMenu.standardColumnWidth") }}</span>
        <TInputNumber
          class="idea-input-number--persistent-controls"
          :model-value="standardWidthDraft"
          :min="MIN_COLUMN_WIDTH"
          :max="MAX_COLUMN_WIDTH"
          :decimal-places="0"
          :step="1"
          theme="column"
          :suffix="t('axisMenu.pixels')"
          :aria-label="t('axisMenu.standardColumnWidth')"
          data-standard-column-width-input
          @change="standardWidthDraft = $event"
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

  &__submenu:has([data-axis-insert-count]) {
    min-width: 284px;
  }

  &__insert-icon {
    color: var(--idea-status-success);
  }
  &__delete-icon {
    color: var(--idea-status-error);
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
