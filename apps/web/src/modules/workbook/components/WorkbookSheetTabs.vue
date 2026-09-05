<script setup lang="ts">
import { ChevronLeft, ChevronRight, Plus } from "lucide-vue-next";
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { Sheet } from "@idea10/core/workbook";
import SheetTabMenu from "./SheetTabMenu.vue";
import WorkbookSheetNavigator from "./WorkbookSheetNavigator.vue";

const { t } = useAppI18n();

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
}>();

const emit = defineEmits<{
  select: [sheetId: string];
  add: [];
  duplicate: [sheetId: string];
  rename: [payload: { sheetId: string; name: string }];
  move: [payload: { sheetId: string; toIndex: number }];
  delete: [sheetId: string];
}>();

const renamingSheetId = ref<string>();
const renameValue = ref("");
const renameInput = ref<HTMLInputElement>();
const tabButtons = new Map<string, HTMLButtonElement>();
const tabList = ref<HTMLDivElement>();
const hasOverflow = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let resizeObserver: ResizeObserver | undefined;
type SheetTabMenuInstance = ComponentPublicInstance & {
  focusTrigger: () => void;
  getTriggerRect: () => DOMRect | undefined;
};

const sheetTabMenus = new Map<string, SheetTabMenuInstance>();
const openMenuSheetId = ref<string>();
const menuPosition = ref({ left: 4, bottom: 34 });
const draggedSheetId = ref<string>();
const dropTarget = ref<{ sheetId: string; side: "before" | "after" }>();
let suppressNextTabClick = false;
let suppressClickTimer: ReturnType<typeof setTimeout> | undefined;

function setRenameInput(input: Element | ComponentPublicInstance | null): void {
  renameInput.value = input instanceof HTMLInputElement ? input : undefined;
}

function setTabButton(sheetId: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLButtonElement) {
    tabButtons.set(sheetId, element);
  } else {
    tabButtons.delete(sheetId);
  }
}

function setSheetTabMenu(
  sheetId: string,
  instance: Element | ComponentPublicInstance | null,
): void {
  if (instance && "focusTrigger" in instance && "getTriggerRect" in instance) {
    sheetTabMenus.set(sheetId, instance as SheetTabMenuInstance);
  } else {
    sheetTabMenus.delete(sheetId);
  }
}

function startRename(sheet: Sheet): void {
  closeMenu();
  renamingSheetId.value = sheet.id;
  renameValue.value = sheet.name;
  void nextTick(() => renameInput.value?.focus());
}

function commitRename(sheet: Sheet): void {
  const name = renameValue.value.trim();
  renamingSheetId.value = undefined;
  if (name !== sheet.name) {
    emit("rename", { sheetId: sheet.id, name });
  }
}

function cancelRename(): void {
  renamingSheetId.value = undefined;
}

function closeMenu(restoreFocus = false): void {
  const sheetId = openMenuSheetId.value;
  openMenuSheetId.value = undefined;
  if (restoreFocus && sheetId) {
    void nextTick(() => sheetTabMenus.get(sheetId)?.focusTrigger());
  }
}

function setMenuPosition(clientX: number, clientY: number): void {
  menuPosition.value = {
    left: Math.max(4, Math.min(clientX, window.innerWidth - 140)),
    bottom: Math.max(4, Math.min(window.innerHeight - clientY + 4, window.innerHeight - 76)),
  };
}

function openMenu(sheet: Sheet, pointer?: { clientX: number; clientY: number }): void {
  if (pointer) {
    setMenuPosition(pointer.clientX, pointer.clientY);
  } else {
    const rect = sheetTabMenus.get(sheet.id)?.getTriggerRect();
    setMenuPosition(rect?.left ?? 4, rect?.top ?? window.innerHeight - 30);
  }
  openMenuSheetId.value = sheet.id;
}

function toggleMenu(sheet: Sheet): void {
  if (openMenuSheetId.value === sheet.id) {
    closeMenu(true);
    return;
  }
  openMenu(sheet);
}

function renameFromMenu(sheet: Sheet): void {
  closeMenu();
  startRename(sheet);
}

function duplicateFromMenu(sheet: Sheet): void {
  closeMenu();
  emit("duplicate", sheet.id);
  void nextTick(() => tabButtons.get(props.activeSheetId)?.focus());
}

function moveFromMenu(sheet: Sheet, direction: -1 | 1): void {
  const index = props.sheets.findIndex((entry) => entry.id === sheet.id);
  const toIndex = index + direction;
  if (index < 0 || toIndex < 0 || toIndex >= props.sheets.length) {
    return;
  }
  closeMenu();
  emit("move", { sheetId: sheet.id, toIndex });
  void nextTick(() => tabButtons.get(sheet.id)?.focus());
}

function deleteFromMenu(sheet: Sheet): void {
  if (props.sheets.length <= 1) {
    return;
  }
  closeMenu();
  emit("delete", sheet.id);
}

function selectSheet(sheetId: string): void {
  closeMenu();
  emit("select", sheetId);
}

function updateScrollState(): void {
  const list = tabList.value;
  if (!list) return;
  hasOverflow.value = list.scrollWidth > list.clientWidth + 1;
  canScrollLeft.value = list.scrollLeft > 1;
  canScrollRight.value = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
}

function revealActiveSheet(): void {
  const list = tabList.value;
  const item = tabButtons.get(props.activeSheetId)?.parentElement;
  if (!list || !item) return;
  const viewport = list.getBoundingClientRect();
  const tab = item.getBoundingClientRect();
  if (tab.left < viewport.left) {
    list.scrollLeft += tab.left - viewport.left;
  } else if (tab.right > viewport.right) {
    list.scrollLeft += tab.right - viewport.right;
  }
  updateScrollState();
}

function scrollTabs(direction: -1 | 1): void {
  const list = tabList.value;
  if (!list) return;
  closeMenu();
  list.scrollLeft += direction * Math.max(80, list.clientWidth * 0.7);
  updateScrollState();
}

function onTabWheel(event: WheelEvent): void {
  const list = tabList.value;
  if (!list || !hasOverflow.value || event.ctrlKey || event.deltaX !== 0) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1;
  const previous = list.scrollLeft;
  list.scrollLeft += event.deltaY * unit;
  if (list.scrollLeft !== previous) {
    event.preventDefault();
    closeMenu();
    updateScrollState();
  }
}

watch(
  () => [props.activeSheetId, ...props.sheets.map((sheet) => `${sheet.id}:${sheet.name}`)],
  () => void nextTick(revealActiveSheet),
  { flush: "post" },
);

onMounted(() => {
  if (typeof ResizeObserver !== "undefined" && tabList.value) {
    resizeObserver = new ResizeObserver(revealActiveSheet);
    resizeObserver.observe(tabList.value);
  }
  revealActiveSheet();
});

function onTabClick(sheetId: string): void {
  if (suppressNextTabClick) {
    suppressNextTabClick = false;
    return;
  }
  selectSheet(sheetId);
}

function onSheetContextMenu(sheet: Sheet, event: MouseEvent): void {
  if (draggedSheetId.value) {
    return;
  }
  event.preventDefault();
  openMenu(sheet, event);
}

function getDragSide(event: DragEvent): "before" | "after" {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return "after";
  }
  const rect = target.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
}

function getDropIndex(targetSheetId: string, side: "before" | "after"): number | undefined {
  const sourceSheetId = draggedSheetId.value;
  if (!sourceSheetId || sourceSheetId === targetSheetId) {
    return undefined;
  }
  const sourceIndex = props.sheets.findIndex((sheet) => sheet.id === sourceSheetId);
  const targetIndex = props.sheets.findIndex((sheet) => sheet.id === targetSheetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return undefined;
  }
  const insertionIndex = targetIndex + (side === "after" ? 1 : 0);
  return Math.max(
    0,
    Math.min(props.sheets.length - 1, insertionIndex - (sourceIndex < insertionIndex ? 1 : 0)),
  );
}

function clearDragState(): void {
  draggedSheetId.value = undefined;
  dropTarget.value = undefined;
}

function suppressTabClick(): void {
  suppressNextTabClick = true;
  if (suppressClickTimer !== undefined) {
    clearTimeout(suppressClickTimer);
  }
  suppressClickTimer = setTimeout(() => {
    suppressNextTabClick = false;
    suppressClickTimer = undefined;
  });
}

function onTabDragStart(sheetId: string, event: DragEvent): void {
  if (renamingSheetId.value === sheetId) {
    event.preventDefault();
    return;
  }
  closeMenu();
  draggedSheetId.value = sheetId;
  event.dataTransfer?.setData("text/plain", sheetId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function onTabDragOver(sheet: Sheet, event: DragEvent): void {
  if (!draggedSheetId.value || sheet.id === draggedSheetId.value) {
    dropTarget.value = undefined;
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  dropTarget.value = { sheetId: sheet.id, side: getDragSide(event) };
}

function onTabDrop(sheet: Sheet, event: DragEvent): void {
  event.preventDefault();
  const side = getDragSide(event);
  const sourceSheetId = draggedSheetId.value;
  const toIndex = getDropIndex(sheet.id, side);
  suppressTabClick();
  clearDragState();
  if (!sourceSheetId || toIndex === undefined) {
    return;
  }
  emit("move", { sheetId: sourceSheetId, toIndex });
  void nextTick(() => tabButtons.get(sourceSheetId)?.focus());
}

function onTabDragEnd(): void {
  if (draggedSheetId.value) {
    suppressTabClick();
  }
  clearDragState();
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (suppressClickTimer !== undefined) {
    clearTimeout(suppressClickTimer);
  }
});

function onTabKeydown(sheetId: string, event: KeyboardEvent): void {
  const index = props.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    const toIndex = index + (event.key === "ArrowLeft" ? -1 : 1);
    event.preventDefault();
    if (index < 0 || toIndex < 0 || toIndex >= props.sheets.length) {
      return;
    }
    closeMenu();
    emit("move", { sheetId, toIndex });
    void nextTick(() => tabButtons.get(sheetId)?.focus());
    return;
  }
  let nextIndex: number;
  if (event.key === "ArrowLeft") {
    nextIndex = (index - 1 + props.sheets.length) % props.sheets.length;
  } else if (event.key === "ArrowRight") {
    nextIndex = (index + 1) % props.sheets.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = props.sheets.length - 1;
  } else {
    return;
  }

  const sheet = props.sheets[nextIndex];
  if (!sheet) {
    return;
  }
  event.preventDefault();
  closeMenu();
  emit("select", sheet.id);
  void nextTick(() => tabButtons.get(sheet.id)?.focus());
}
</script>

<template>
  <div class="workbook-sheet-tabs">
    <div class="workbook-sheet-tabs__navigation">
      <button
        class="workbook-sheet-tabs__add"
        type="button"
        :aria-label="t('sheetTabs.add')"
        :title="t('sheetTabs.add')"
        @click="
          closeMenu();
          emit('add');
        "
      >
        <Plus :size="16" aria-hidden="true" />
      </button>
      <WorkbookSheetNavigator
        :sheets="sheets"
        :active-sheet-id="activeSheetId"
        @select="selectSheet"
        @open="closeMenu()"
      />
    </div>
    <button
      v-if="hasOverflow"
      class="workbook-sheet-tabs__scroll"
      type="button"
      :disabled="!canScrollLeft"
      :aria-label="t('sheetTabs.scrollLeft')"
      :title="t('sheetTabs.scrollLeft')"
      @click="scrollTabs(-1)"
    >
      <ChevronLeft :size="14" aria-hidden="true" />
    </button>
    <div
      ref="tabList"
      class="workbook-sheet-tabs__list"
      role="tablist"
      :aria-label="t('sheetTabs.list')"
      @scroll="updateScrollState"
      @wheel="onTabWheel"
    >
      <div
        v-for="sheet in props.sheets"
        :key="sheet.id"
        class="workbook-sheet-tabs__item"
        :class="{
          'is-active': sheet.id === props.activeSheetId,
          'is-menu-open': openMenuSheetId === sheet.id,
          'is-dragging': draggedSheetId === sheet.id,
          'is-drop-before': dropTarget?.sheetId === sheet.id && dropTarget.side === 'before',
          'is-drop-after': dropTarget?.sheetId === sheet.id && dropTarget.side === 'after',
        }"
        @contextmenu="onSheetContextMenu(sheet, $event)"
        @dragover="onTabDragOver(sheet, $event)"
        @drop="onTabDrop(sheet, $event)"
      >
        <input
          v-if="renamingSheetId === sheet.id"
          :ref="setRenameInput"
          v-model="renameValue"
          class="workbook-sheet-tabs__rename-input"
          :aria-label="t('sheetTabs.rename', { name: sheet.name })"
          @blur="commitRename(sheet)"
          @keydown.enter.prevent="commitRename(sheet)"
          @keydown.escape.prevent="cancelRename"
        />
        <button
          v-else
          :ref="(element) => setTabButton(sheet.id, element)"
          class="workbook-sheet-tabs__tab"
          :class="{ 'is-active': sheet.id === props.activeSheetId }"
          type="button"
          role="tab"
          :aria-selected="sheet.id === props.activeSheetId"
          aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
          :tabindex="sheet.id === props.activeSheetId ? 0 : -1"
          :title="t('sheetTabs.renameHint', { name: sheet.name })"
          :draggable="renamingSheetId !== sheet.id"
          @click="onTabClick(sheet.id)"
          @dblclick="startRename(sheet)"
          @dragstart="onTabDragStart(sheet.id, $event)"
          @dragend="onTabDragEnd"
          @keydown="onTabKeydown(sheet.id, $event)"
        >
          <span class="workbook-sheet-tabs__name">{{ sheet.name }}</span>
        </button>
        <SheetTabMenu
          :ref="(instance) => setSheetTabMenu(sheet.id, instance)"
          :sheet="sheet"
          :sheet-count="props.sheets.length"
          :sheet-index="props.sheets.indexOf(sheet)"
          :is-open="openMenuSheetId === sheet.id"
          :position="menuPosition"
          @toggle="toggleMenu(sheet)"
          @duplicate="duplicateFromMenu(sheet)"
          @rename="renameFromMenu(sheet)"
          @move-left="moveFromMenu(sheet, -1)"
          @move-right="moveFromMenu(sheet, 1)"
          @delete="deleteFromMenu(sheet)"
          @close="closeMenu"
        />
      </div>
    </div>
    <button
      v-if="hasOverflow"
      class="workbook-sheet-tabs__scroll"
      type="button"
      :disabled="!canScrollRight"
      :aria-label="t('sheetTabs.scrollRight')"
      :title="t('sheetTabs.scrollRight')"
      @click="scrollTabs(1)"
    >
      <ChevronRight :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.workbook-sheet-tabs {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  min-width: 0;

  &__navigation {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    margin-right: 4px;
    border-right: 1px solid var(--idea-border-subtle);
  }

  &__list {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__item {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    max-width: min(204px, 100%);
    border-bottom: 2px solid transparent;

    &:hover,
    &:focus-within,
    &.is-menu-open {
      background: var(--idea-surface-secondary);
    }

    &.is-active {
      background: var(--idea-action-primary-subtle);
      border-bottom-color: var(--idea-action-primary);
    }

    &.is-dragging {
      opacity: 0.48;
    }

    &.is-drop-before::before,
    &.is-drop-after::after {
      position: absolute;
      z-index: 1;
      top: 3px;
      bottom: 3px;
      width: 2px;
      background: var(--idea-action-primary);
      content: "";
      pointer-events: none;
    }

    &.is-drop-before::before {
      left: 0;
    }

    &.is-drop-after::after {
      right: 0;
    }
  }

  &__tab,
  &__rename-input {
    min-width: 44px;
    max-width: 180px;
    padding: 0 4px 0 12px;
    overflow: hidden;
    background: transparent;
    border: 0;
    color: var(--idea-text-secondary);
    font: inherit;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tab {
    display: flex;
    align-items: center;
    cursor: pointer;

    &.is-active {
      color: var(--idea-action-primary);
      font-weight: 500;
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__rename-input {
    width: 132px;
    background: var(--idea-surface-panel);
    outline: 1px solid var(--idea-action-primary);
    outline-offset: -2px;
  }

  &__add,
  &__scroll {
    display: inline-grid;
    flex: 0 0 auto;
    align-self: center;
    width: 26px;
    height: 26px;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 3px;
    color: var(--idea-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--idea-surface-hover);
      color: var(--idea-text-primary);
    }

    &:focus-visible {
      background: var(--idea-surface-hover);
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -1px;
    }

    &:disabled {
      color: var(--idea-text-disabled);
      cursor: default;
    }
  }

  &__scroll {
    width: 20px;
  }
}
</style>
