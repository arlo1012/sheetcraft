<script setup lang="ts">
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Pin,
  Plus,
} from "lucide-vue-next";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { createContextMenuPoint } from "../../../shared/menu/useContextMenu";
import type { Sheet, SheetProperties } from "@idea10/core/workbook";
import { getVisibleSheets } from "../sheet-navigation";
import { getSheetTabColorStyles } from "../sheet-tab-color";
import SheetTabMenu from "./SheetTabMenu.vue";
import WorkbookSheetNavigator from "./WorkbookSheetNavigator.vue";

const { t } = useAppI18n();

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
  structureProtected?: boolean;
}>();

const emit = defineEmits<{
  contentWidth: [width: number];
  select: [sheetId: string];
  add: [];
  duplicate: [sheetId: string];
  rename: [payload: { sheetId: string; name: string }];
  move: [payload: { sheetId: string; toIndex: number }];
  delete: [sheetId: string];
  updateProperties: [payload: { sheetId: string; patch: Partial<SheetProperties> }];
  restore: [sheetId: string];
}>();

const visibleSheets = computed(() => getVisibleSheets(props.sheets));

function moveTarget(sheet: Sheet, direction: -1 | 1): Sheet | undefined {
  if (props.structureProtected) return;
  const group = visibleSheets.value.filter(
    (entry) => entry.properties.pinned === sheet.properties.pinned,
  );
  return group[group.findIndex((entry) => entry.id === sheet.id) + direction];
}

function updatePropertiesFromMenu(sheet: Sheet, patch: Partial<SheetProperties>): void {
  closeMenu();
  emit("updateProperties", { sheetId: sheet.id, patch });
  void nextTick(() => tabButtons.get(patch.hidden ? props.activeSheetId : sheet.id)?.focus());
}

function setTabColor(sheet: Sheet, color: string | null): void {
  updatePropertiesFromMenu(sheet, { tabColor: color?.toUpperCase() ?? undefined });
}

const renamingSheetId = ref<string>();
const renameValue = ref("");
const renameInput = ref<HTMLInputElement>();
const tabButtons = new Map<string, HTMLButtonElement>();
const tabList = ref<HTMLDivElement>();
const navigation = ref<HTMLDivElement>();
const addButton = ref<HTMLElement>();
const overflowButton = ref<HTMLElement>();
const hasOverflow = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let resizeObserver: ResizeObserver | undefined;
const openMenuSheetId = ref<string>();
const menuSheet = computed(() => props.sheets.find((sheet) => sheet.id === openMenuSheetId.value));
const menuAnchor = ref<FloatingReference | null>(null);
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

function startRename(sheet: Sheet): void {
  if (props.structureProtected) return;
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
  menuAnchor.value = null;
  if (restoreFocus && sheetId) {
    void nextTick(() => tabButtons.get(sheetId)?.focus());
  }
}

function openMenu(sheet: Sheet, pointer?: { clientX: number; clientY: number }): void {
  const trigger = tabButtons.get(sheet.id) ?? null;
  menuAnchor.value = pointer ? createContextMenuPoint(pointer, trigger) : trigger;
  openMenuSheetId.value = sheet.id;
}

function renameFromMenu(sheet: Sheet): void {
  closeMenu();
  startRename(sheet);
}

function duplicateFromMenu(sheet: Sheet): void {
  if (props.structureProtected) return;
  closeMenu();
  emit("duplicate", sheet.id);
  void nextTick(() => tabButtons.get(props.activeSheetId)?.focus());
}

function moveFromMenu(sheet: Sheet, direction: -1 | 1): void {
  const target = moveTarget(sheet, direction);
  if (!target) return;
  const toIndex = props.sheets.indexOf(target);
  closeMenu();
  emit("move", { sheetId: sheet.id, toIndex });
  void nextTick(() => tabButtons.get(sheet.id)?.focus());
}

function deleteFromMenu(sheet: Sheet): void {
  if (props.structureProtected || visibleSheets.value.length <= 1) {
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
  if (navigation.value && addButton.value) {
    const navigationMargin = Number.parseFloat(getComputedStyle(navigation.value).marginRight) || 0;
    emit(
      "contentWidth",
      Math.ceil(
        navigation.value.getBoundingClientRect().width +
          navigationMargin +
          list.scrollWidth +
          addButton.value.getBoundingClientRect().width,
      ),
    );
  }
  // Exclude the overflow entry's own space so it disappears once all tabs fit.
  const contentWidth = list.firstElementChild?.scrollWidth ?? list.scrollWidth;
  const availableWidth = list.clientWidth + (overflowButton.value?.offsetWidth ?? 0);
  hasOverflow.value = contentWidth > availableWidth + 1;
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

function scrollTabsToEdge(direction: -1 | 1): void {
  const list = tabList.value;
  if (!list) return;
  closeMenu();
  list.scrollLeft = direction === -1 ? 0 : Math.max(0, list.scrollWidth - list.clientWidth);
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
  () => [
    props.activeSheetId,
    ...visibleSheets.value.map(
      (sheet) =>
        `${sheet.id}:${sheet.name}:${sheet.properties.pinned}:${sheet.properties.protected}`,
    ),
  ],
  () => {
    if (
      openMenuSheetId.value &&
      !visibleSheets.value.some((sheet) => sheet.id === openMenuSheetId.value)
    )
      closeMenu();
    void nextTick(revealActiveSheet);
  },
  { flush: "post" },
);

onMounted(() => {
  if (typeof ResizeObserver !== "undefined" && tabList.value) {
    resizeObserver = new ResizeObserver(revealActiveSheet);
    resizeObserver.observe(tabList.value);
    if (tabList.value.firstElementChild) {
      resizeObserver.observe(tabList.value.firstElementChild);
    }
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
  if (props.sheets[sourceIndex]?.properties.pinned !== props.sheets[targetIndex]?.properties.pinned)
    return undefined;
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
  if (props.structureProtected || renamingSheetId.value === sheetId) {
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
  if (
    !draggedSheetId.value ||
    sheet.id === draggedSheetId.value ||
    getDropIndex(sheet.id, getDragSide(event)) === undefined
  ) {
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
  const index = visibleSheets.value.findIndex((sheet) => sheet.id === sheetId);
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const sheet = visibleSheets.value[index];
    if (sheet) openMenu(sheet);
    return;
  }
  if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const sheet = visibleSheets.value[index];
    if (sheet) moveFromMenu(sheet, event.key === "ArrowLeft" ? -1 : 1);
    return;
  }
  let nextIndex: number;
  if (event.key === "ArrowLeft") {
    nextIndex = (index - 1 + visibleSheets.value.length) % visibleSheets.value.length;
  } else if (event.key === "ArrowRight") {
    nextIndex = (index + 1) % visibleSheets.value.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = visibleSheets.value.length - 1;
  } else {
    return;
  }

  const sheet = visibleSheets.value[nextIndex];
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
    <div ref="navigation" class="workbook-sheet-tabs__navigation">
      <WorkbookSheetNavigator
        :sheets="sheets"
        :active-sheet-id="activeSheetId"
        @select="selectSheet"
        :structure-protected="structureProtected"
        @restore="!structureProtected && emit('restore', $event)"
        @open="closeMenu()"
      />
      <span
        v-icon-action="!canScrollLeft"
        class="workbook-sheet-tabs__scroll"
        :aria-label="t('sheetTabs.scrollFirst')"
        :title="t('sheetTabs.scrollFirst')"
        @click="scrollTabsToEdge(-1)"
      >
        <ChevronFirst :size="12" aria-hidden="true" />
      </span>
      <span
        v-icon-action="!canScrollLeft"
        class="workbook-sheet-tabs__scroll"
        :aria-label="t('sheetTabs.scrollLeft')"
        :title="t('sheetTabs.scrollLeft')"
        @click="scrollTabs(-1)"
      >
        <ChevronLeft :size="12" aria-hidden="true" />
      </span>
      <span
        v-icon-action="!canScrollRight"
        class="workbook-sheet-tabs__scroll"
        :aria-label="t('sheetTabs.scrollRight')"
        :title="t('sheetTabs.scrollRight')"
        @click="scrollTabs(1)"
      >
        <ChevronRight :size="12" aria-hidden="true" />
      </span>
      <span
        v-icon-action="!canScrollRight"
        class="workbook-sheet-tabs__scroll"
        :aria-label="t('sheetTabs.scrollLast')"
        :title="t('sheetTabs.scrollLast')"
        @click="scrollTabsToEdge(1)"
      >
        <ChevronLast :size="12" aria-hidden="true" />
      </span>
    </div>
    <div
      ref="tabList"
      class="workbook-sheet-tabs__viewport"
      @scroll="updateScrollState"
      @wheel="onTabWheel"
    >
      <div class="workbook-sheet-tabs__list" role="tablist" :aria-label="t('sheetTabs.list')">
        <div
          v-for="sheet in visibleSheets"
          :key="sheet.id"
          class="workbook-sheet-tabs__item"
          :class="{
            'is-active': sheet.id === props.activeSheetId,
            'has-tab-color': !!sheet.properties.tabColor,
            'is-menu-open': openMenuSheetId === sheet.id,
            'is-dragging': draggedSheetId === sheet.id,
            'is-drop-before': dropTarget?.sheetId === sheet.id && dropTarget.side === 'before',
            'is-drop-after': dropTarget?.sheetId === sheet.id && dropTarget.side === 'after',
          }"
          :style="getSheetTabColorStyles(sheet.properties.tabColor)"
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
            aria-haspopup="menu"
            :aria-expanded="openMenuSheetId === sheet.id"
            :aria-controls="
              openMenuSheetId === sheet.id ? `workbook-sheet-menu-${sheet.id}` : undefined
            "
            aria-keyshortcuts="Shift+F10 Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
            :tabindex="sheet.id === props.activeSheetId ? 0 : -1"
            :title="t('sheetTabs.renameHint', { name: sheet.name })"
            :draggable="!structureProtected && renamingSheetId !== sheet.id"
            @click="onTabClick(sheet.id)"
            @dblclick="startRename(sheet)"
            @dragstart="onTabDragStart(sheet.id, $event)"
            @dragend="onTabDragEnd"
            @keydown="onTabKeydown(sheet.id, $event)"
          >
            <Pin
              v-if="sheet.properties.pinned"
              class="workbook-sheet-tabs__state-icon"
              :size="12"
              :aria-label="t('sheetTabs.pinnedHint')"
            />
            <LockKeyhole
              v-if="sheet.properties.protected"
              class="workbook-sheet-tabs__state-icon"
              :size="12"
              :aria-label="t('sheetTabs.protectedHint')"
            />
            <span class="workbook-sheet-tabs__name">{{ sheet.name }}</span>
          </button>
        </div>
      </div>
    </div>
    <div v-if="hasOverflow" ref="overflowButton" class="workbook-sheet-tabs__overflow">
      <WorkbookSheetNavigator
        variant="overflow"
        :sheets="sheets"
        :active-sheet-id="activeSheetId"
        :structure-protected="structureProtected"
        @select="selectSheet"
        @restore="!structureProtected && emit('restore', $event)"
        @open="closeMenu()"
      />
    </div>
    <span
      ref="addButton"
      v-icon-action="structureProtected"
      class="workbook-sheet-tabs__add"
      :aria-label="t('sheetTabs.add')"
      :title="t('sheetTabs.add')"
      @click="
        closeMenu();
        if (!structureProtected) emit('add');
      "
    >
      <Plus :size="16" aria-hidden="true" />
    </span>
    <SheetTabMenu
      v-if="menuSheet"
      :sheet="menuSheet"
      :anchor="menuAnchor"
      :sheet-count="visibleSheets.length"
      :structure-protected="structureProtected"
      :sheet-index="visibleSheets.indexOf(menuSheet)"
      :can-move-left="!!moveTarget(menuSheet, -1)"
      :can-move-right="!!moveTarget(menuSheet, 1)"
      :can-hide="!structureProtected && visibleSheets.length > 1"
      :can-delete="!structureProtected && visibleSheets.length > 1"
      :is-open="true"
      @duplicate="duplicateFromMenu(menuSheet)"
      @rename="renameFromMenu(menuSheet)"
      @move-left="moveFromMenu(menuSheet, -1)"
      @move-right="moveFromMenu(menuSheet, 1)"
      @delete="deleteFromMenu(menuSheet)"
      @protect="updatePropertiesFromMenu(menuSheet, { protected: $event })"
      @pin="updatePropertiesFromMenu(menuSheet, { pinned: $event })"
      @hide="updatePropertiesFromMenu(menuSheet, { hidden: true })"
      @tab-color="setTabColor(menuSheet, $event)"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped lang="scss">
.workbook-sheet-tabs {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  height: 26px;
  min-width: 0;
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);

  &__navigation {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    margin-right: 2px;
    border-right: 1px solid var(--idea-sheet-bar-border);
  }

  &__viewport {
    display: flex;
    flex: 0 1 auto;
    height: 26px;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__list {
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    height: 26px;
    gap: 1px;
  }

  &__item {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    height: 24px;
    max-width: min(204px, 100%);
    margin-bottom: 2px;
    overflow: hidden;
    background: transparent;
    border-top: 2px solid transparent;
    border-radius: 0 0 6px 6px;
    color: var(--idea-text-secondary);

    &:hover,
    &:focus-within,
    &.is-menu-open {
      background: color-mix(in srgb, var(--idea-sheet-bar-surface), var(--idea-text-primary) 8%);
    }

    &.is-active {
      background: var(--idea-surface-panel);
      color: var(--idea-action-primary);

      &:hover {
        background: var(--idea-surface-hover);
      }
    }

    &.has-tab-color {
      border-top-color: var(--sheet-tab-color);

      &:not(.is-active) {
        background: var(--sheet-tab-color);
        color: var(--sheet-tab-contrast-color);

        &:hover,
        &:focus-within,
        &.is-menu-open {
          background: var(--sheet-tab-hover-color);
          border-top-color: var(--sheet-tab-hover-color);
          color: var(--sheet-tab-hover-contrast-color);
        }
      }
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
    height: 22px;
    min-width: 60px;
    max-width: 180px;
    padding: 0 12px;
    overflow: hidden;
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tab {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;

    &.is-active {
      font-weight: var(--idea-font-weight-medium);
    }
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__state-icon {
    flex: 0 0 auto;
    color: inherit;
  }

  &__rename-input {
    width: 132px;
    background: var(--idea-surface-panel);
    color: var(--idea-text-primary);
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

    &:hover:not([aria-disabled="true"]) {
      background: var(--idea-icon-button-hover-bg);
    }

    &[aria-disabled="true"] {
      color: var(--idea-text-disabled);
      cursor: default;
    }
  }

  &__add {
    flex: 0 0 26px;
    align-self: stretch;
    width: 26px;
    height: 26px;
    border-radius: 0;
  }

  &__overflow {
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
  }

  &__scroll {
    width: 18px;
    color: var(--idea-text-muted);
  }
}
</style>
