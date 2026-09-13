<script setup lang="ts">
import {
  BarChart3,
  Columns3,
  Eye,
  EyeOff,
  Paintbrush,
  Rows3,
  Settings2,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, ref } from "vue";
import type { CellRange, Sheet, SheetDimensionAxis } from "@idea10/core/workbook";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { SheetContextAction, SheetContextMenuState } from "../context-menu-contracts";
import AxisInsertMenuItem from "./AxisInsertMenuItem.vue";
import ContextClipboardActions from "./ContextClipboardActions.vue";
import SheetContextFormatToolbar from "./SheetContextFormatToolbar.vue";

const props = defineProps<{
  axis: SheetDimensionAxis;
  selectionCount: number;
  maxBeforeCount: number;
  maxAfterCount: number;
  currentSize?: number;
  minimumSize: number;
  maximumSize: number;
  anchor: FloatingReference;
  readOnly?: boolean;
  pasteSpecialDisabled?: boolean;
  pasteFormatsDisabled?: boolean;
  cutDisabledReason?: string;
  state?: SheetContextMenuState;
  sheet?: Sheet;
  range?: CellRange;
}>();
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
const sizeDraft = ref(props.currentSize === undefined ? "" : String(props.currentSize));
const isOpen = ref(true);
const menuAnchor = computed(() => props.anchor);
const { floatingStyles: menuStyle } = useDismissibleFloatingPanel(menuAnchor, panelRef, isOpen, {
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
  if (isOpen.value && (!props.readOnly || action.type === "columnStatistics"))
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
  if (props.readOnly) return;
  if (!props.state) emit("insert", { direction, count });
  dispatch({ type: "insert", axis: props.axis, direction, count });
}
function normalizeSize(): number | undefined {
  if (sizeDraft.value === "") return undefined;
  const numeric = Number(sizeDraft.value);
  if (!Number.isFinite(numeric)) return undefined;
  const size = Math.min(props.maximumSize, Math.max(props.minimumSize, Math.round(numeric)));
  sizeDraft.value = String(size);
  return size;
}
function requestResize(): void {
  const size = normalizeSize();
  if (props.readOnly || size === undefined || size === props.currentSize) return;
  if (!props.state) emit("resize", size);
  dispatch({ type: "resize", axis: props.axis, size });
}
function requestDelete(): void {
  if (props.readOnly) return;
  if (!props.state) emit("delete");
  dispatch({ type: "delete", axis: props.axis });
}
function requestClear(mode: "contents" | "formats" | "all"): void {
  if (props.readOnly) return;
  if (mode === "contents" && !props.state) emit("clear");
  dispatch({ type: "clear", mode });
}
onMounted(() => void nextTick(() => menuSurfaceRef.value?.focusFirstItem()));
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
        class="sheet-axis-context-menu"
        :class="{ 'sheet-axis-context-menu--unframed': !state }"
        :label="t(axis === 'row' ? 'axisMenu.rowActions' : 'axisMenu.columnActions')"
      >
        <AxisInsertMenuItem
          data-axis-action="insert-before"
          :action="axis === 'row' ? 'insert-above' : 'insert-before'"
          :label="insertBeforeLabel"
          :initial-count="selectionCount"
          :maximum="maxBeforeCount"
          :disabled="Boolean(readOnly)"
          @insert="requestInsert('before', $event)"
          ><template #default
            ><Rows3 v-if="axis === 'row'" :size="16" /><Columns3 v-else :size="16" /></template
        ></AxisInsertMenuItem>
        <AxisInsertMenuItem
          data-axis-action="insert-after"
          :action="axis === 'row' ? 'insert-below' : 'insert-after'"
          :label="insertAfterLabel"
          :initial-count="selectionCount"
          :maximum="maxAfterCount"
          :disabled="Boolean(readOnly)"
          @insert="requestInsert('after', $event)"
          ><template #default
            ><Rows3 v-if="axis === 'row'" :size="16" /><Columns3 v-else :size="16" /></template
        ></AxisInsertMenuItem>
        <MenuSeparator />
        <MenuItem data-axis-action="delete" danger :disabled="readOnly" @select="requestDelete"
          ><template #icon><Trash2 :size="16" /></template>{{ t("contextMenu.delete") }}</MenuItem
        >
        <MenuItem
          data-axis-action="hide"
          :disabled="readOnly"
          @select="dispatch({ type: 'visibility', axis, hidden: true })"
          ><template #icon><EyeOff :size="16" /></template>{{ t("contextMenu.hide") }}</MenuItem
        >
        <MenuItem
          data-axis-action="unhide"
          :disabled="readOnly"
          @select="dispatch({ type: 'visibility', axis, hidden: false })"
          ><template #icon><Eye :size="16" /></template>{{ t("contextMenu.unhide") }}</MenuItem
        >
        <MenuSeparator />
        <li v-if="currentSize !== undefined" class="sheet-axis-context-menu__size-row" role="none">
          <span>{{ sizeLabel }}</span
          ><label class="sheet-axis-context-menu__size-field"
            ><input
              class="sheet-axis-context-menu__number-input sheet-axis-context-menu__number-input--size"
              type="number"
              inputmode="numeric"
              :value="sizeDraft"
              :min="minimumSize"
              :max="maximumSize"
              step="1"
              :disabled="readOnly"
              :aria-label="sizeLabel"
              @input="sizeDraft = ($event.currentTarget as HTMLInputElement).value"
              @blur="requestResize"
              @keydown.enter.prevent="($event.currentTarget as HTMLInputElement).blur()"
            /><span>{{ t("axisMenu.pixels") }}</span></label
          >
        </li>
        <MenuItem
          data-axis-action="auto-fit"
          :disabled="readOnly"
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
          >{{ t("contextMenu.clearContents") }}</MenuItem
        >
        <MenuItem
          data-axis-action="clear-formats"
          :disabled="readOnly"
          @select="requestClear('formats')"
          >{{ t("contextMenu.clearFormats") }}</MenuItem
        >
        <MenuItem data-axis-action="clear-all" :disabled="readOnly" @select="requestClear('all')">{{
          t("contextMenu.clearAll")
        }}</MenuItem>
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
  z-index: 100;
  width: 328px;
}
.sheet-axis-context-menu {
  width: 100%;
  border-radius: 0 0 var(--idea-radius-default) var(--idea-radius-default);
  &--unframed {
    border-radius: var(--idea-radius-default);
  }
  &__number-input {
    width: 52px;
    height: 24px;
    padding: 0 4px;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-small);
    color: var(--idea-text-primary);
    font: inherit;
    text-align: center;
    &:focus {
      border-color: var(--idea-action-primary);
      outline: none;
    }
    &:disabled {
      color: var(--idea-text-disabled);
      background: var(--idea-surface-disabled);
    }
  }
  &__size-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 30px;
    gap: 8px;
    padding: 0 14px;
    list-style: none;
  }
  &__size-field {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--idea-text-secondary);
  }
}
</style>
