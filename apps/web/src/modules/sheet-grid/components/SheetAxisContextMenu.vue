<script setup lang="ts">
import {
  PanelTopDashed,
  PanelBottomDashed,
  PanelLeftDashed,
  PanelRightDashed,
  BarChart3,
  Delete,
  Eraser,
  RemoveFormatting,
  Eye,
  EyeOff,
  Paintbrush,
  Settings2,
  Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import type { CellRange, Sheet, SheetDimensionAxis } from "@idea10/core/workbook";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import { useContextMenu } from "../../../shared/menu/useContextMenu";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { SheetContextAction, SheetContextMenuState } from "../context-menu-contracts";
import AxisInsertMenuItem from "./AxisInsertMenuItem.vue";
import SheetDimensionInput from "./SheetDimensionInput.vue";
import ContextClipboardActions from "./ContextClipboardActions.vue";
import SheetContextFormatToolbar from "./SheetContextFormatToolbar.vue";

const props = withDefaults(
  defineProps<{
    axis: SheetDimensionAxis;
    selectionCount: number;
    maxBeforeCount: number;
    maxAfterCount: number;
    currentSize?: number;
    minimumSize: number;
    maximumSize: number;
    anchor: FloatingReference;
    readOnly?: boolean;
    dimensionReadOnly?: boolean;
    insertReadOnly?: boolean;
    deleteReadOnly?: boolean;
    pasteSpecialDisabled?: boolean;
    pasteFormatsDisabled?: boolean;
    cutDisabledReason?: string;
    state?: SheetContextMenuState;
    sheet?: Sheet;
    range?: CellRange;
  }>(),
  { dimensionReadOnly: undefined, insertReadOnly: undefined, deleteReadOnly: undefined },
);
const emit = defineEmits<{
  insert: [payload: { direction: "before" | "after"; count: number }];
  resize: [size: number];
  delete: [];
  clear: [];
  cut: [];
  copy: [];
  paste: [];
  pasteValues: [];
  pasteFormats: [];
  action: [action: SheetContextAction];
  close: [restoreFocus: boolean];
}>();
const { t } = useAppI18n();
const panelRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const isOpen = ref(true);
const menuAnchor = computed(() => props.anchor);
const { floatingStyles: menuStyle } = useContextMenu({
  anchor: menuAnchor,
  panelRef,
  open: isOpen,
  surfaceRef: menuSurfaceRef,
  offset: 4,
  onDismiss: ({ restoreFocus }) => close(restoreFocus),
});
const sizeLabel = computed(() =>
  t(props.axis === "row" ? "axisMenu.rowHeight" : "axisMenu.columnWidth"),
);
const autoFitLabel = computed(() =>
  t(props.axis === "row" ? "axisMenu.autoFitRowHeight" : "axisMenu.autoFitColumnWidth"),
);
const insertBeforeLabel = computed(() =>
  t(props.axis === "row" ? "axisMenu.insertRowsAboveAction" : "axisMenu.insertColumnsBeforeAction"),
);
const insertAfterLabel = computed(() =>
  t(props.axis === "row" ? "axisMenu.insertRowsBelowAction" : "axisMenu.insertColumnsAfterAction"),
);
const formatActionDisabled = computed(
  () => props.readOnly || Boolean(props.state?.formattingDisabled),
);
function close(restoreFocus: boolean): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  emit("close", restoreFocus);
}
function dispatch(action: SheetContextAction): void {
  if (
    isOpen.value &&
    (!props.readOnly ||
      action.type === "columnStatistics" ||
      (action.type === "insert" && !(props.insertReadOnly ?? props.readOnly)) ||
      (action.type === "delete" && !(props.deleteReadOnly ?? props.readOnly)) ||
      (!(props.dimensionReadOnly ?? props.readOnly) &&
        (action.type === "resize" || action.type === "autoFit" || action.type === "visibility")))
  )
    emit("action", action);
}
function onKeydown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key !== "c" && key !== "x" && key !== "v") return;
  event.preventDefault();
  if (key === "c") emit("copy");
  if (key === "x" && !props.readOnly && !props.cutDisabledReason) emit("cut");
  if (key === "v" && !props.readOnly) emit("paste");
}
function requestInsert(direction: "before" | "after", count: number): void {
  if (props.insertReadOnly ?? props.readOnly) return;
  if (!props.state) emit("insert", { direction, count });
  dispatch({ type: "insert", axis: props.axis, direction, count });
}
function requestResize(size: number): void {
  if (
    (props.dimensionReadOnly ?? props.readOnly) ||
    !Number.isInteger(size) ||
    size < props.minimumSize ||
    size > props.maximumSize ||
    (size === props.currentSize && props.selectionCount === 1)
  )
    return;
  if (!props.state) emit("resize", size);
  dispatch({ type: "resize", axis: props.axis, size });
}
function requestDelete(): void {
  if (props.deleteReadOnly ?? props.readOnly) return;
  if (!props.state) emit("delete");
  dispatch({ type: "delete", axis: props.axis });
}
function requestClear(mode: "contents" | "formats" | "all"): void {
  if (props.readOnly) return;
  if (mode === "contents" && !props.state) emit("clear");
  dispatch({ type: "clear", mode });
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="panelRef"
      class="sheet-axis-context-menu-panel"
      :style="menuStyle"
      @keydown="onKeydown"
    >
      <SheetContextFormatToolbar
        v-if="state"
        :state="state"
        :read-only="readOnly"
        @action="dispatch"
      />
      <MenuSurface
        ref="menuSurfaceRef"
        class="sheet-axis-context-menu"
        :label="t(axis === 'row' ? 'axisMenu.rowActions' : 'axisMenu.columnActions')"
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
        <AxisInsertMenuItem
          compact
          data-axis-action="insert-before"
          :action="axis === 'row' ? 'insert-above' : 'insert-before'"
          :label="insertBeforeLabel"
          :initial-count="selectionCount"
          :maximum="maxBeforeCount"
          :disabled="Boolean(readOnly)"
          @insert="requestInsert('before', $event)"
          ><template #default
            ><PanelTopDashed v-if="axis === 'row'" :size="16" /><PanelLeftDashed
              v-else
              :size="16" /></template
        ></AxisInsertMenuItem>
        <AxisInsertMenuItem
          compact
          data-axis-action="insert-after"
          :action="axis === 'row' ? 'insert-below' : 'insert-after'"
          :label="insertAfterLabel"
          :initial-count="selectionCount"
          :maximum="maxAfterCount"
          :disabled="Boolean(readOnly)"
          @insert="requestInsert('after', $event)"
          ><template #default
            ><PanelBottomDashed v-if="axis === 'row'" :size="16" /><PanelRightDashed
              v-else
              :size="16" /></template
        ></AxisInsertMenuItem>
        <MenuSeparator />
        <MenuItem
          data-axis-action="delete"
          danger
          :disabled="deleteReadOnly ?? readOnly"
          @select="requestDelete"
          ><template #icon><Trash2 :size="16" /></template>{{ t("contextMenu.delete") }}</MenuItem
        >
        <MenuItem
          data-axis-action="hide"
          :disabled="dimensionReadOnly ?? readOnly"
          @select="dispatch({ type: 'visibility', axis, hidden: true })"
          ><template #icon><EyeOff :size="16" /></template>{{ t("contextMenu.hide") }}</MenuItem
        >
        <MenuItem
          data-axis-action="unhide"
          :disabled="dimensionReadOnly ?? readOnly"
          @select="dispatch({ type: 'visibility', axis, hidden: false })"
          ><template #icon><Eye :size="16" /></template>{{ t("contextMenu.unhide") }}</MenuItem
        >
        <MenuSeparator />
        <li class="sheet-axis-context-menu__size-row" role="none">
          <span>{{ sizeLabel }}</span>
          <SheetDimensionInput
            :model-value="currentSize"
            :axis="axis"
            :minimum="minimumSize"
            :maximum="maximumSize"
            :disabled="dimensionReadOnly ?? readOnly"
            compact
            @commit="requestResize"
          />
        </li>
        <MenuItem
          data-axis-action="auto-fit"
          :disabled="dimensionReadOnly ?? readOnly"
          @select="dispatch({ type: 'autoFit', axis })"
          ><template #icon><Settings2 :size="16" /></template>{{ autoFitLabel }}</MenuItem
        >
        <MenuItem
          v-if="axis === 'column'"
          data-axis-action="column-statistics"
          @select="dispatch({ type: 'columnStatistics' })"
          ><template #icon><BarChart3 :size="16" /></template
          >{{ t("contextMenu.columnStatistics") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem
          data-axis-action="clear-contents"
          :disabled="readOnly"
          @select="requestClear('contents')"
          ><template #icon><Delete :size="16" /></template
          >{{ t("contextMenu.clearContents") }}</MenuItem
        >
        <MenuItem
          data-axis-action="clear-formats"
          :disabled="readOnly"
          @select="requestClear('formats')"
          ><template #icon><RemoveFormatting :size="16" /></template
          >{{ t("contextMenu.clearFormats") }}</MenuItem
        >
        <MenuItem data-axis-action="clear-all" :disabled="readOnly" @select="requestClear('all')"
          ><template #icon><Eraser :size="16" /></template>{{ t("contextMenu.clearAll") }}</MenuItem
        >
        <MenuSeparator />
        <MenuItem
          data-axis-action="format-painter"
          :disabled="formatActionDisabled"
          @select="dispatch({ type: 'formatPainter' })"
          ><template #icon><Paintbrush :size="16" /></template
          >{{ t("contextMenu.formatPainter") }}</MenuItem
        >
        <MenuItem
          data-axis-action="format-cells"
          :disabled="formatActionDisabled"
          @select="dispatch({ type: 'formatCells' })"
          ><template #icon><Settings2 :size="16" /></template
          >{{ t("contextMenu.formatCells") }}</MenuItem
        >
      </MenuSurface>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-axis-context-menu-panel {
  z-index: var(--idea-layer-context-menu);
  display: grid;
  gap: 6px;
  width: max-content;
}
.sheet-axis-context-menu {
  width: max-content;
  &__size-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 30px;
    gap: 8px;
    padding: 0 14px;
    list-style: none;
  }
}
</style>
