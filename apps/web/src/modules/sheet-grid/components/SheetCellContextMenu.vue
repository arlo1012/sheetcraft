<script setup lang="ts">
import { ChevronRight, Eraser, Filter, Paintbrush, Settings2, Trash2 } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, useId } from "vue";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellRange,
  type Sheet,
} from "@idea10/core/workbook";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { SheetContextAction, SheetContextMenuState } from "../context-menu-contracts";
import ContextClipboardActions from "./ContextClipboardActions.vue";
import SheetContextFormatToolbar from "./SheetContextFormatToolbar.vue";
import AxisInsertMenuItem from "./AxisInsertMenuItem.vue";

type Submenu = "insert" | "delete" | "clear" | "sort" | null;
const props = withDefaults(
  defineProps<{
    anchor: FloatingReference;
    pasteSpecialDisabled?: boolean;
    pasteFormatsDisabled?: boolean;
    cutDisabledReason?: string;
    hasImage?: boolean;
    readOnly?: boolean;
    state?: SheetContextMenuState;
    sheet?: Sheet;
    range?: CellRange;
  }>(),
  { pasteSpecialDisabled: false, pasteFormatsDisabled: false, readOnly: false },
);
const emit = defineEmits<{
  cut: [];
  copy: [];
  paste: [];
  pasteValues: [];
  pasteFormats: [];
  convertImageToFloating: [];
  previewImage: [];
  clear: [];
  action: [action: SheetContextAction];
  close: [restoreFocus: boolean];
}>();
const { t } = useAppI18n();
const panelRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const submenuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const submenuRef = computed<HTMLElement | null>(() => submenuSurfaceRef.value?.rootElement ?? null);
const activeSubmenu = ref<Submenu>(null);
const isOpen = ref(true);
const submenuId = `sheet-cell-context-submenu-${useId().replaceAll(":", "")}`;
const menuAnchor = computed(() => props.anchor);
const submenuTrigger = computed<HTMLElement | null>(() =>
  activeSubmenu.value
    ? (menuRef.value?.querySelector(`[data-cell-action="${activeSubmenu.value}"]`) ?? null)
    : null,
);
const { floatingStyles } = useDismissibleFloatingPanel(menuAnchor, panelRef, isOpen, {
  offset: 4,
  additionalInside: () => [submenuRef.value],
  onDismiss: ({ restoreFocus }) => close(restoreFocus),
});
const { floatingStyles: submenuStyles } = useFloatingPanel(
  submenuTrigger,
  submenuRef,
  computed(() => activeSubmenu.value !== null),
  { placement: "right-start", offset: 4 },
);
const insertRowCount = computed(() =>
  props.range ? props.range.end.row - props.range.start.row + 1 : 1,
);
const insertColumnCount = computed(() =>
  props.range ? props.range.end.column - props.range.start.column + 1 : 1,
);
const maximumRowsBefore = computed(() => MAX_SHEET_ROWS - (props.range?.start.row ?? 0));
const maximumRowsAfter = computed(() => MAX_SHEET_ROWS - 1 - (props.range?.end.row ?? 0));
const maximumColumnsBefore = computed(() => MAX_SHEET_COLUMNS - (props.range?.start.column ?? 0));
const maximumColumnsAfter = computed(() => MAX_SHEET_COLUMNS - 1 - (props.range?.end.column ?? 0));
const submenuLabel = computed<MessageKey>(() => {
  if (activeSubmenu.value === "insert") return "contextMenu.insert";
  if (activeSubmenu.value === "delete") return "contextMenu.delete";
  if (activeSubmenu.value === "clear") return "contextMenu.clear";
  return "contextMenu.sort";
});
const formatActionDisabled = computed(
  () => props.readOnly || Boolean(props.state?.formattingDisabled),
);
function close(restoreFocus: boolean): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  activeSubmenu.value = null;
  emit("close", restoreFocus);
}
function dispatch(action: SheetContextAction): void {
  if (isOpen.value && !props.readOnly) emit("action", action);
}
function requestClear(mode: "contents" | "formats" | "all"): void {
  if (props.readOnly) return;
  if (mode === "contents" && !props.state) emit("clear");
  dispatch({ type: "clear", mode });
}
function openSubmenu(name: Exclude<Submenu, null>): void {
  if (isOpen.value && !props.readOnly) {
    activeSubmenu.value = name;
    void nextTick(() => submenuSurfaceRef.value?.focusFirstItem());
  }
}
function openSubmenuOnHover(name: Exclude<Submenu, null>): void {
  if (isOpen.value && !props.readOnly) activeSubmenu.value = name;
}
function closeSubmenu(): void {
  const trigger = submenuTrigger.value;
  activeSubmenu.value = null;
  void nextTick(() => trigger?.focus());
}
function onMenuKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (key === "x" || key === "c" || key === "v") {
      event.preventDefault();
      if (key === "x" && !props.readOnly && !props.cutDisabledReason) emit("cut");
      if (key === "c") emit("copy");
      if (key === "v" && !props.readOnly) emit("paste");
      return;
    }
  }
  if (event.key === "ArrowRight" && event.target instanceof HTMLElement) {
    const name = event.target.dataset.cellAction as Submenu;
    if (name === "insert" || name === "delete" || name === "clear" || name === "sort") {
      event.preventDefault();
      openSubmenu(name);
    }
  }
}
function onSubmenuKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" && event.key !== "ArrowLeft") return;
  if (event.key === "ArrowLeft" && event.target instanceof HTMLInputElement) return;
  event.preventDefault();
  event.stopPropagation();
  closeSubmenu();
}
onMounted(() => void nextTick(() => menuSurfaceRef.value?.focusFirstItem()));
</script>

<template>
  <Teleport to="body">
    <div
      ref="panelRef"
      class="sheet-cell-context-menu-panel"
      :class="{ 'sheet-cell-context-menu-panel--formatted': state }"
      :style="floatingStyles"
    >
      <SheetContextFormatToolbar
        v-if="state"
        :state="state"
        :read-only="readOnly"
        @action="dispatch"
      />
      <ContextClipboardActions
        :read-only="readOnly"
        :cut-disabled-reason="cutDisabledReason"
        :paste-special-disabled="pasteSpecialDisabled"
        :paste-formats-disabled="pasteFormatsDisabled"
        @cut="emit('cut')"
        @copy="emit('copy')"
        @paste="emit('paste')"
        @paste-values="emit('pasteValues')"
        @paste-formats="emit('pasteFormats')"
      />
      <MenuSurface
        ref="menuSurfaceRef"
        class="sheet-cell-context-menu"
        :label="t('cellMenu.actions')"
        @keydown="onMenuKeydown"
      >
        <MenuSeparator />
        <MenuItem
          data-cell-action="insert"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'insert'"
          :aria-controls="activeSubmenu === 'insert' ? submenuId : undefined"
          :disabled="readOnly"
          @mouseenter="openSubmenuOnHover('insert')"
          @select="openSubmenu('insert')"
          >{{ t("contextMenu.insert") }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuItem
          data-cell-action="delete"
          danger
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'delete'"
          :aria-controls="activeSubmenu === 'delete' ? submenuId : undefined"
          :disabled="readOnly"
          @mouseenter="openSubmenuOnHover('delete')"
          @select="openSubmenu('delete')"
          ><template #icon><Trash2 :size="16" /></template>{{ t("contextMenu.delete")
          }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuItem
          data-cell-action="clear"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'clear'"
          :aria-controls="activeSubmenu === 'clear' ? submenuId : undefined"
          :disabled="readOnly"
          @mouseenter="openSubmenuOnHover('clear')"
          @select="openSubmenu('clear')"
          ><template #icon><Eraser :size="16" /></template>{{ t("contextMenu.clear")
          }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuSeparator />
        <MenuItem
          data-cell-action="choose-from-column"
          :disabled="readOnly"
          @select="dispatch({ type: 'chooseFromColumn' })"
          >{{ t("contextMenu.chooseFromColumn") }}</MenuItem
        >
        <MenuItem
          data-cell-action="filter"
          :disabled="readOnly || !state?.data.filterEnabled"
          @select="dispatch({ type: 'filter' })"
          ><template #icon><Filter :size="16" /></template>{{ t("contextMenu.filter") }}</MenuItem
        >
        <MenuItem
          data-cell-action="clear-filter"
          :disabled="readOnly || !state?.data.filter.active"
          @select="dispatch({ type: 'clearFilter' })"
          >{{ t("contextMenu.clearFilter") }}</MenuItem
        >
        <MenuItem
          data-cell-action="sort"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'sort'"
          :aria-controls="activeSubmenu === 'sort' ? submenuId : undefined"
          :disabled="!state?.data.sortEnabled || readOnly"
          @mouseenter="openSubmenuOnHover('sort')"
          @select="openSubmenu('sort')"
          >{{ t("contextMenu.sort") }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuSeparator />
        <template v-if="hasImage"
          ><MenuItem data-cell-action="preview-image" @select="emit('previewImage')">{{
            t("image.preview")
          }}</MenuItem
          ><MenuItem
            data-cell-action="convert-image-to-floating"
            :disabled="readOnly"
            @select="emit('convertImageToFloating')"
            >{{ t("image.convertToFloating") }}</MenuItem
          ><MenuSeparator
        /></template>
        <MenuItem
          data-cell-action="format-painter"
          :disabled="formatActionDisabled"
          @select="dispatch({ type: 'formatPainter' })"
          ><template #icon><Paintbrush :size="16" /></template
          >{{ t("contextMenu.formatPainter") }}</MenuItem
        >
        <MenuItem
          data-cell-action="format-cells"
          :disabled="formatActionDisabled"
          @select="dispatch({ type: 'formatCells' })"
          ><template #icon><Settings2 :size="16" /></template
          >{{ t("contextMenu.formatCells") }}</MenuItem
        >
      </MenuSurface>
    </div>
    <MenuSurface
      v-if="activeSubmenu"
      :id="submenuId"
      ref="submenuSurfaceRef"
      class="sheet-cell-context-menu sheet-cell-context-menu--submenu"
      :class="{ 'sheet-cell-context-menu--counted': activeSubmenu === 'insert' }"
      :style="submenuStyles"
      :label="t(submenuLabel)"
      @keydown="onSubmenuKeydown"
    >
      <template v-if="activeSubmenu === 'insert'"
        ><MenuItem
          data-cell-action="insert-right"
          @select="dispatch({ type: 'cellOperation', operation: 'insert', direction: 'right' })"
          >{{ t("axisMenu.shiftRight") }}</MenuItem
        ><MenuItem
          data-cell-action="insert-down"
          @select="dispatch({ type: 'cellOperation', operation: 'insert', direction: 'down' })"
          >{{ t("axisMenu.shiftDown") }}</MenuItem
        ><MenuSeparator /><AxisInsertMenuItem
          data-cell-action="insert-above"
          action="cell-insert-above"
          :label="t('axisMenu.insertRowsAboveAction')"
          :initial-count="insertRowCount"
          :maximum="maximumRowsBefore"
          :disabled="Boolean(readOnly)"
          @insert="
            dispatch({ type: 'insert', axis: 'row', direction: 'before', count: $event })
          " /><AxisInsertMenuItem
          data-cell-action="insert-below"
          action="cell-insert-below"
          :label="t('axisMenu.insertRowsBelowAction')"
          :initial-count="insertRowCount"
          :maximum="maximumRowsAfter"
          :disabled="Boolean(readOnly)"
          @insert="
            dispatch({ type: 'insert', axis: 'row', direction: 'after', count: $event })
          " /><AxisInsertMenuItem
          data-cell-action="insert-left"
          action="cell-insert-left"
          :label="t('axisMenu.insertColumnsBeforeAction')"
          :initial-count="insertColumnCount"
          :maximum="maximumColumnsBefore"
          :disabled="Boolean(readOnly)"
          @insert="
            dispatch({ type: 'insert', axis: 'column', direction: 'before', count: $event })
          " /><AxisInsertMenuItem
          data-cell-action="insert-column"
          action="cell-insert-right"
          :label="t('axisMenu.insertColumnsAfterAction')"
          :initial-count="insertColumnCount"
          :maximum="maximumColumnsAfter"
          :disabled="Boolean(readOnly)"
          @insert="dispatch({ type: 'insert', axis: 'column', direction: 'after', count: $event })"
      /></template>
      <template v-else-if="activeSubmenu === 'delete'"
        ><MenuItem
          data-cell-action="delete-left"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'left' })"
          >{{ t("axisMenu.shiftLeft") }}</MenuItem
        ><MenuItem
          data-cell-action="delete-up"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'up' })"
          >{{ t("axisMenu.shiftUp") }}</MenuItem
        ><MenuSeparator /><MenuItem
          data-cell-action="delete-row"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'row' })"
          >{{ t("axisMenu.entireRow") }}</MenuItem
        ><MenuItem
          data-cell-action="delete-column"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'column' })"
          >{{ t("axisMenu.entireColumn") }}</MenuItem
        ><MenuItem
          data-cell-action="delete-empty-rows"
          danger
          @select="dispatch({ type: 'deleteEmptyRows' })"
          >{{ t("axisMenu.deleteEmptyRows") }}</MenuItem
        ></template
      >
      <template v-else-if="activeSubmenu === 'clear'"
        ><MenuItem
          data-cell-action="clear-contents"
          :disabled="readOnly"
          @select="requestClear('contents')"
          >{{ t("contextMenu.clearContents") }}</MenuItem
        ><MenuItem
          data-cell-action="clear-formats"
          :disabled="readOnly"
          @select="requestClear('formats')"
          >{{ t("contextMenu.clearFormats") }}</MenuItem
        ><MenuItem
          data-cell-action="clear-all"
          :disabled="readOnly"
          @select="requestClear('all')"
          >{{ t("contextMenu.clearAll") }}</MenuItem
        ></template
      >
      <template v-else
        ><MenuItem
          data-cell-action="sort-ascending"
          @select="dispatch({ type: 'sort', direction: 'ascending' })"
          >{{ t("contextMenu.sortAscending") }}</MenuItem
        ><MenuItem
          data-cell-action="sort-descending"
          @select="dispatch({ type: 'sort', direction: 'descending' })"
          >{{ t("contextMenu.sortDescending") }}</MenuItem
        ></template
      >
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-cell-context-menu-panel {
  z-index: 100;
  width: 236px;
  &--formatted {
    width: 328px;
  }
}
.sheet-cell-context-menu {
  width: 195px;
  border-radius: 0 0 var(--idea-radius-default) var(--idea-radius-default);
  &--submenu {
    z-index: 101;
    width: 190px;
    border-radius: var(--idea-radius-default);
  }
  &--counted {
    width: 328px;
  }
}
</style>
