<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { nextTick, ref, type ComponentPublicInstance } from "vue";
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
  emit("select", sheet.id);
  void nextTick(() => tabButtons.get(sheet.id)?.focus());
}
</script>

<template>
  <div class="workbook-sheet-tabs">
    <div class="workbook-sheet-tabs__list" role="tablist" :aria-label="t('sheetTabs.list')">
      <div v-for="sheet in props.sheets" :key="sheet.id" class="workbook-sheet-tabs__item">
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
          @click="emit('select', sheet.id)"
          @dblclick="startRename(sheet)"
          @keydown="onTabKeydown(sheet.id, $event)"
        >
          {{ sheet.name }}
        </button>
      </div>
    </div>
    <TButton
      class="workbook-sheet-tabs__delete"
      type="button"
      variant="text"
      shape="square"
      size="small"
      :aria-label="t('sheetTabs.deleteActive')"
      :title="t('sheetTabs.deleteActive')"
      :disabled="props.sheets.length === 1"
      @click="emit('delete', props.activeSheetId)"
    >
      <template #icon>
        <Trash2 :size="14" aria-hidden="true" />
      </template>
    </TButton>
    <TButton
      class="workbook-sheet-tabs__add"
      type="button"
      variant="text"
      shape="square"
      size="small"
      :aria-label="t('sheetTabs.add')"
      :title="t('sheetTabs.add')"
      @click="emit('add')"
    >
      <template #icon>
        <Plus :size="16" aria-hidden="true" />
      </template>
    </TButton>
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

  &__rename-input {
    outline: 2px solid var(--td-brand-color);
    outline-offset: -2px;
  }

  &__delete,
  &__add {
    display: inline-grid;
    flex: 0 0 30px;
    width: 30px;
    height: 100%;
    place-items: center;
    border-left: 1px solid var(--td-component-border);
  }
}
</style>
