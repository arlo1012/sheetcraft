<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import { nextTick, ref, type ComponentPublicInstance } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { Sheet } from "@idea10/core/workbook";
import SheetTabMenu from "./SheetTabMenu.vue";

const { t } = useAppI18n();

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
}>();

const emit = defineEmits<{
  select: [sheetId: string];
  add: [];
  rename: [payload: { sheetId: string; name: string }];
  delete: [sheetId: string];
}>();

const renamingSheetId = ref<string>();
const renameValue = ref("");
const renameInput = ref<HTMLInputElement>();
const tabButtons = new Map<string, HTMLButtonElement>();
type SheetTabMenuInstance = ComponentPublicInstance & {
  focusTrigger: () => void;
  getTriggerRect: () => DOMRect | undefined;
};

const sheetTabMenus = new Map<string, SheetTabMenuInstance>();
const openMenuSheetId = ref<string>();
const menuPosition = ref({ left: 4, bottom: 34 });

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

function onSheetContextMenu(sheet: Sheet, event: MouseEvent): void {
  event.preventDefault();
  openMenu(sheet, event);
}

function onTabKeydown(sheetId: string, event: KeyboardEvent): void {
  const index = props.sheets.findIndex((sheet) => sheet.id === sheetId);
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
    <div class="workbook-sheet-tabs__list" role="tablist" :aria-label="t('sheetTabs.list')">
      <div
        v-for="sheet in props.sheets"
        :key="sheet.id"
        class="workbook-sheet-tabs__item"
        @contextmenu="onSheetContextMenu(sheet, $event)"
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
          :tabindex="sheet.id === props.activeSheetId ? 0 : -1"
          :title="t('sheetTabs.renameHint', { name: sheet.name })"
          @click="selectSheet(sheet.id)"
          @dblclick="startRename(sheet)"
          @keydown="onTabKeydown(sheet.id, $event)"
        >
          {{ sheet.name }}
        </button>
        <SheetTabMenu
          :ref="(instance) => setSheetTabMenu(sheet.id, instance)"
          :sheet="sheet"
          :sheet-count="props.sheets.length"
          :is-open="openMenuSheetId === sheet.id"
          :position="menuPosition"
          @toggle="toggleMenu(sheet)"
          @rename="renameFromMenu(sheet)"
          @delete="deleteFromMenu(sheet)"
          @close="closeMenu"
        />
      </div>
    </div>
    <button
      class="workbook-sheet-tabs__add"
      type="button"
      :aria-label="t('sheetTabs.add')"
      :title="t('sheetTabs.add')"
      @click="emit('add')"
    >
      <Plus :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.workbook-sheet-tabs {
  display: flex;
  min-width: 0;

  &__list {
    display: flex;
    min-width: 0;
    overflow-x: auto;
  }

  &__item {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
  }

  &__tab,
  &__rename-input {
    width: 112px;
    min-width: 72px;
    padding: 0 10px;
    overflow: hidden;
    background: transparent;
    border: 0;
    color: var(--idea-text-secondary);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tab {
    cursor: pointer;

    &.is-active {
      position: relative;
      background: var(--idea-surface-panel);
      color: var(--idea-text-primary);
      font-weight: 600;

      &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--idea-action-primary);
        content: "";
      }
    }
  }

  &__rename-input {
    outline: 2px solid var(--idea-action-primary);
    outline-offset: -2px;
  }

  &__add {
    display: inline-grid;
    flex: 0 0 30px;
    width: 30px;
    height: 100%;
    place-items: center;
    border-left: 1px solid var(--idea-border-control);
    padding: 0;
    background: transparent;
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    cursor: pointer;
    color: var(--idea-text-secondary);

    &:hover,
    &:focus-visible {
      background: var(--idea-surface-hover);
      outline: none;
    }
  }
}
</style>
