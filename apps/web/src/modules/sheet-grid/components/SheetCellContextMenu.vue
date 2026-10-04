<script setup lang="ts">
import {
  PanelTopDashed,
  PanelBottomDashed,
  PanelLeftDashed,
  PanelRightDashed,
  ArrowDown,
  ArrowDownAZ,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpAZ,
  ChevronRight,
  Columns3,
  Delete,
  Eraser,
  Filter,
  FunnelX,
  Image as ImageIcon,
  ListChecks,
  ListMinus,
  MoveUpRight,
  Paintbrush,
  Plus,
  RemoveFormatting,
  Rows3,
  Settings2,
  Trash2,
} from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellRange,
  type Sheet,
} from "@idea10/core/workbook";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import { useContextMenu } from "../../../shared/menu/useContextMenu";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
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
const isOpen = ref(true);
const submenuId = `sheet-cell-context-submenu-${useId().replaceAll(":", "")}`;
const menuAnchor = computed(() => props.anchor);
const { floatingStyles } = useContextMenu({
  anchor: menuAnchor,
  panelRef,
  open: isOpen,
  surfaceRef: menuSurfaceRef,
  offset: 4,
  additionalInside: () => [submenuRef.value],
  onDismiss: ({ restoreFocus }) => close(restoreFocus),
});
const {
  activeSubmenu,
  submenuElement: submenuRef,
  submenuStyles,
  openSubmenu: revealSubmenu,
  onParentFocusin,
  onParentKeydown,
  onParentMouseover,
  onSubmenuKeydown: handleSubmenuKeydown,
} = useSubmenu<Exclude<Submenu, null>>({
  parentOpen: isOpen,
  submenuSurfaceRef,
  getAnchor: (name) =>
    menuRef.value?.querySelector<HTMLElement>(`[data-cell-action="${name}"]`) ?? null,
  placement: "right-start",
  offset: 4,
});
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
function submenuName(target: EventTarget | null): Exclude<Submenu, null> | undefined {
  if (!(target instanceof HTMLElement)) return undefined;
  const name = target.closest<HTMLElement>("[data-cell-action]")?.dataset.cellAction;
  return name === "insert" || name === "delete" || name === "clear" || name === "sort"
    ? name
    : undefined;
}
function canOpenSubmenu(name: Exclude<Submenu, null>): boolean {
  return !props.readOnly && (name !== "sort" || Boolean(props.state?.data.sortEnabled));
}
function openSubmenu(name: Exclude<Submenu, null>): void {
  if (canOpenSubmenu(name)) revealSubmenu(name);
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
  const name = submenuName(event.target);
  if (name && canOpenSubmenu(name)) onParentKeydown(event, name);
}
function onMenuFocusin(event: FocusEvent): void {
  onParentFocusin(submenuName(event.target));
}
function onMenuMouseover(event: MouseEvent): void {
  const name = submenuName(event.target);
  onParentMouseover(name && canOpenSubmenu(name) ? name : undefined);
}
function onSubmenuKeydown(event: KeyboardEvent): void {
  handleSubmenuKeydown(event, !(event.target instanceof HTMLInputElement));
}
</script>

<template>
  <Teleport to="body">
    <div ref="panelRef" class="sheet-cell-context-menu-panel" :style="floatingStyles">
      <SheetContextFormatToolbar
        v-if="state"
        :state="state"
        :read-only="readOnly"
        @action="dispatch"
      />
      <MenuSurface
        ref="menuSurfaceRef"
        class="sheet-cell-context-menu"
        :label="t('cellMenu.actions')"
        @focusin="onMenuFocusin"
        @keydown="onMenuKeydown"
        @mouseover="onMenuMouseover"
      >
        <li role="none">
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
        </li>
        <MenuSeparator />
        <MenuItem
          data-cell-action="insert"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'insert'"
          :aria-controls="activeSubmenu === 'insert' ? submenuId : undefined"
          :disabled="readOnly"
          @mouseenter="onMenuMouseover"
          @select="openSubmenu('insert')"
          ><template #icon><Plus :size="16" /></template>{{ t("contextMenu.insert")
          }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuItem
          data-cell-action="delete"
          danger
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'delete'"
          :aria-controls="activeSubmenu === 'delete' ? submenuId : undefined"
          :disabled="readOnly"
          @mouseenter="onMenuMouseover"
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
          @mouseenter="onMenuMouseover"
          @select="openSubmenu('clear')"
          ><template #icon><Eraser :size="16" /></template>{{ t("contextMenu.clear")
          }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuSeparator />
        <MenuItem
          data-cell-action="choose-from-column"
          :disabled="readOnly"
          @select="dispatch({ type: 'chooseFromColumn' })"
          ><template #icon><ListChecks :size="16" /></template
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
          ><template #icon><FunnelX :size="16" /></template
          >{{ t("contextMenu.clearFilter") }}</MenuItem
        >
        <MenuItem
          data-cell-action="sort"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'sort'"
          :aria-controls="activeSubmenu === 'sort' ? submenuId : undefined"
          :disabled="!state?.data.sortEnabled || readOnly"
          @mouseenter="onMenuMouseover"
          @select="openSubmenu('sort')"
          ><template #icon><ArrowDownUp :size="16" /></template>{{ t("contextMenu.sort")
          }}<template #shortcut><ChevronRight :size="15" /></template
        ></MenuItem>
        <MenuSeparator />
        <template v-if="hasImage"
          ><MenuItem data-cell-action="preview-image" @select="emit('previewImage')"
            ><template #icon><ImageIcon :size="16" /></template>{{ t("image.preview") }}</MenuItem
          ><MenuItem
            data-cell-action="convert-image-to-floating"
            :disabled="readOnly"
            @select="emit('convertImageToFloating')"
            ><template #icon><MoveUpRight :size="16" /></template
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
          ><template #icon><ArrowRight :size="16" /></template
          >{{ t("axisMenu.shiftRight") }}</MenuItem
        ><MenuItem
          data-cell-action="insert-down"
          @select="dispatch({ type: 'cellOperation', operation: 'insert', direction: 'down' })"
          ><template #icon><ArrowDown :size="16" /></template
          >{{ t("axisMenu.shiftDown") }}</MenuItem
        ><MenuSeparator /><AxisInsertMenuItem
          data-cell-action="insert-above"
          action="cell-insert-above"
          :label="t('axisMenu.insertRowsAboveAction')"
          :initial-count="insertRowCount"
          :maximum="maximumRowsBefore"
          :disabled="Boolean(readOnly)"
          @insert="dispatch({ type: 'insert', axis: 'row', direction: 'before', count: $event })"
          ><PanelTopDashed :size="16" /></AxisInsertMenuItem
        ><AxisInsertMenuItem
          data-cell-action="insert-below"
          action="cell-insert-below"
          :label="t('axisMenu.insertRowsBelowAction')"
          :initial-count="insertRowCount"
          :maximum="maximumRowsAfter"
          :disabled="Boolean(readOnly)"
          @insert="dispatch({ type: 'insert', axis: 'row', direction: 'after', count: $event })"
          ><PanelBottomDashed :size="16" /></AxisInsertMenuItem
        ><AxisInsertMenuItem
          data-cell-action="insert-left"
          action="cell-insert-left"
          :label="t('axisMenu.insertColumnsBeforeAction')"
          :initial-count="insertColumnCount"
          :maximum="maximumColumnsBefore"
          :disabled="Boolean(readOnly)"
          @insert="dispatch({ type: 'insert', axis: 'column', direction: 'before', count: $event })"
          ><PanelLeftDashed :size="16" /></AxisInsertMenuItem
        ><AxisInsertMenuItem
          data-cell-action="insert-column"
          action="cell-insert-right"
          :label="t('axisMenu.insertColumnsAfterAction')"
          :initial-count="insertColumnCount"
          :maximum="maximumColumnsAfter"
          :disabled="Boolean(readOnly)"
          @insert="dispatch({ type: 'insert', axis: 'column', direction: 'after', count: $event })"
          ><PanelRightDashed :size="16" /></AxisInsertMenuItem
      ></template>
      <template v-else-if="activeSubmenu === 'delete'"
        ><MenuItem
          data-cell-action="delete-left"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'left' })"
          ><template #icon><ArrowLeft :size="16" /></template
          >{{ t("axisMenu.shiftLeft") }}</MenuItem
        ><MenuItem
          data-cell-action="delete-up"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'up' })"
          ><template #icon><ArrowUp :size="16" /></template>{{ t("axisMenu.shiftUp") }}</MenuItem
        ><MenuSeparator /><MenuItem
          data-cell-action="delete-row"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'row' })"
          ><template #icon><Rows3 :size="16" /></template>{{ t("axisMenu.entireRow") }}</MenuItem
        ><MenuItem
          data-cell-action="delete-column"
          danger
          @select="dispatch({ type: 'cellOperation', operation: 'delete', direction: 'column' })"
          ><template #icon><Columns3 :size="16" /></template
          >{{ t("axisMenu.entireColumn") }}</MenuItem
        ><MenuItem
          data-cell-action="delete-empty-rows"
          danger
          @select="dispatch({ type: 'deleteEmptyRows' })"
          ><template #icon><ListMinus :size="16" /></template
          >{{ t("axisMenu.deleteEmptyRows") }}</MenuItem
        ></template
      >
      <template v-else-if="activeSubmenu === 'clear'"
        ><MenuItem
          data-cell-action="clear-contents"
          :disabled="readOnly"
          @select="requestClear('contents')"
          ><template #icon><Delete :size="16" /></template
          >{{ t("contextMenu.clearContents") }}</MenuItem
        ><MenuItem
          data-cell-action="clear-formats"
          :disabled="readOnly"
          @select="requestClear('formats')"
          ><template #icon><RemoveFormatting :size="16" /></template
          >{{ t("contextMenu.clearFormats") }}</MenuItem
        ><MenuItem data-cell-action="clear-all" :disabled="readOnly" @select="requestClear('all')"
          ><template #icon><Eraser :size="16" /></template>{{ t("contextMenu.clearAll") }}</MenuItem
        ></template
      >
      <template v-else
        ><MenuItem
          data-cell-action="sort-ascending"
          @select="dispatch({ type: 'sort', direction: 'ascending' })"
          ><template #icon><ArrowDownAZ :size="16" /></template
          >{{ t("contextMenu.sortAscending") }}</MenuItem
        ><MenuItem
          data-cell-action="sort-descending"
          @select="dispatch({ type: 'sort', direction: 'descending' })"
          ><template #icon><ArrowUpAZ :size="16" /></template
          >{{ t("contextMenu.sortDescending") }}</MenuItem
        ></template
      >
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-cell-context-menu-panel {
  z-index: var(--idea-layer-context-menu);
  display: grid;
  gap: 6px;
  width: max-content;
}
.sheet-cell-context-menu {
  width: max-content;
  border-radius: var(--idea-radius-default);
  &--submenu {
    z-index: var(--idea-layer-context-submenu);
    width: max-content;
    border-radius: var(--idea-radius-default);
  }
  &--counted {
    min-width: 248px;
  }
}
</style>
