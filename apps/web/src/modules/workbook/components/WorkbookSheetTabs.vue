<script setup lang="ts">
import { MoreHorizontal, Plus } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { Sheet } from "../workbook";

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
const menuTriggerButtons = new Map<string, HTMLButtonElement>();
const openMenuSheetId = ref<string>();
const root = ref<HTMLElement>();
const menuRoot = ref<HTMLElement>();
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

function setMenuTriggerButton(
  sheetId: string,
  element: Element | ComponentPublicInstance | null,
): void {
  if (element instanceof HTMLButtonElement) {
    menuTriggerButtons.set(sheetId, element);
  } else {
    menuTriggerButtons.delete(sheetId);
  }
}

function setMenuRoot(element: Element | ComponentPublicInstance | null): void {
  menuRoot.value = element instanceof HTMLElement ? element : undefined;
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

function menuId(sheetId: string): string {
  return `workbook-sheet-menu-${sheetId}`;
}

function closeMenu(restoreFocus = false): void {
  const sheetId = openMenuSheetId.value;
  openMenuSheetId.value = undefined;
  if (restoreFocus && sheetId) {
    void nextTick(() => menuTriggerButtons.get(sheetId)?.focus());
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
    const rect = menuTriggerButtons.get(sheet.id)?.getBoundingClientRect();
    setMenuPosition(rect?.left ?? 4, rect?.top ?? window.innerHeight - 30);
  }
  openMenuSheetId.value = sheet.id;
  void nextTick(() => {
    menuRoot.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  });
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

function onDocumentPointerDown(event: PointerEvent): void {
  if (
    openMenuSheetId.value &&
    event.target instanceof Node &&
    !root.value?.contains(event.target) &&
    !menuRoot.value?.contains(event.target)
  ) {
    closeMenu();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && openMenuSheetId.value) {
    event.preventDefault();
    closeMenu(true);
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu(true);
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }
  const items = Array.from(
    menuRoot.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
  );
  if (items.length === 0) {
    return;
  }
  event.preventDefault();
  const currentIndex = items.findIndex((item) => item === document.activeElement);
  let nextIndex: number;
  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = items.length - 1;
  } else if (event.key === "ArrowUp") {
    nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  } else {
    nextIndex = currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1;
  }
  items[nextIndex]?.focus();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});

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
  <div ref="root" class="workbook-sheet-tabs">
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
        <button
          :ref="(element) => setMenuTriggerButton(sheet.id, element)"
          class="workbook-sheet-tabs__menu-trigger"
          type="button"
          :aria-label="t('sheetTabs.menu', { name: sheet.name })"
          aria-haspopup="menu"
          :aria-controls="openMenuSheetId === sheet.id ? menuId(sheet.id) : undefined"
          :aria-expanded="openMenuSheetId === sheet.id"
          @click="toggleMenu(sheet)"
        >
          <MoreHorizontal :size="15" aria-hidden="true" />
        </button>
        <Teleport to="body">
          <div
            v-if="openMenuSheetId === sheet.id"
            :id="menuId(sheet.id)"
            :ref="setMenuRoot"
            class="workbook-sheet-tabs__menu"
            role="menu"
            :aria-label="t('sheetTabs.menu', { name: sheet.name })"
            :style="{ left: `${menuPosition.left}px`, bottom: `${menuPosition.bottom}px` }"
            @keydown="onMenuKeydown"
          >
            <button type="button" role="menuitem" @click="renameFromMenu(sheet)">
              {{ t("sheetTabs.renameAction") }}
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="props.sheets.length === 1"
              @click="deleteFromMenu(sheet)"
            >
              {{ t("sheetTabs.deleteAction") }}
            </button>
          </div>
        </Teleport>
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
  &__rename-input,
  &__menu-trigger {
    width: 112px;
    min-width: 72px;
    padding: 0 10px;
    overflow: hidden;
    background: transparent;
    border: 0;
    color: var(--td-text-color-secondary);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tab {
    cursor: pointer;

    &.is-active {
      position: relative;
      background: var(--td-bg-color-container);
      color: var(--td-text-color-primary);
      font-weight: 600;

      &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--td-brand-color);
        content: "";
      }
    }
  }

  &__menu-trigger {
    display: grid;
    width: 24px;
    min-width: 24px;
    place-items: center;
    padding: 0;
    cursor: pointer;

    &[aria-expanded="true"],
    &:hover,
    &:focus-visible {
      background: var(--td-bg-color-container-hover);
      outline: none;
    }
  }

  &__rename-input {
    outline: 2px solid var(--td-brand-color);
    outline-offset: -2px;
  }

  &__add {
    display: inline-grid;
    flex: 0 0 30px;
    width: 30px;
    height: 100%;
    place-items: center;
    border-left: 1px solid var(--td-component-border);
    padding: 0;
    background: transparent;
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    cursor: pointer;
    color: var(--td-text-color-secondary);

    &:hover,
    &:focus-visible {
      background: var(--td-bg-color-container-hover);
      outline: none;
    }
  }

  &__menu {
    position: fixed;
    z-index: 80;
    display: grid;
    min-width: 132px;
    padding: 4px;
    background: var(--td-bg-color-container);
    border: 1px solid var(--td-component-border);
    border-radius: 4px;
    box-shadow: var(--td-shadow-2, 0 3px 10px rgb(0 0 0 / 12%));

    button {
      min-height: 28px;
      padding: 0 8px;
      background: transparent;
      border: 0;
      border-radius: 3px;
      color: var(--td-text-color-primary);
      font: inherit;
      text-align: left;
      white-space: nowrap;

      &:not(:disabled) {
        cursor: pointer;
      }

      &:hover:not(:disabled),
      &:focus-visible:not(:disabled) {
        background: var(--td-bg-color-container-hover);
        outline: none;
      }

      &:disabled {
        color: var(--td-text-color-disabled);
        cursor: not-allowed;
      }
    }
  }
}
</style>
