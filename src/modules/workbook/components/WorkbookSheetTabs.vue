<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";
import { nextTick, ref, type ComponentPublicInstance } from "vue";
import type { Sheet } from "../workbook";

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
  if (name && name !== sheet.name) {
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
    <div class="workbook-sheet-tabs__list" role="tablist" aria-label="Workbook sheets">
      <div v-for="sheet in props.sheets" :key="sheet.id" class="workbook-sheet-tabs__item">
        <input
          v-if="renamingSheetId === sheet.id"
          :ref="setRenameInput"
          v-model="renameValue"
          class="workbook-sheet-tabs__rename-input"
          :aria-label="`Rename ${sheet.name}`"
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
          :title="`${sheet.name} (double-click to rename)`"
          @click="emit('select', sheet.id)"
          @dblclick="startRename(sheet)"
          @keydown="onTabKeydown(sheet.id, $event)"
        >
          {{ sheet.name }}
        </button>
      </div>
    </div>
    <button
      class="workbook-sheet-tabs__delete"
      type="button"
      aria-label="Delete active sheet"
      title="Delete active sheet"
      :disabled="props.sheets.length === 1"
      @click="emit('delete', props.activeSheetId)"
    >
      <Trash2 :size="14" aria-hidden="true" />
    </button>
    <button
      class="workbook-sheet-tabs__add"
      type="button"
      aria-label="Add sheet"
      title="Add sheet"
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
    color: var(--ui-text-secondary);
    font: inherit;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tab {
    cursor: pointer;

    &.is-active {
      position: relative;
      background: var(--ui-surface-primary);
      color: var(--ui-text-primary);
      font-weight: 600;

      &::after {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--ui-brand-primary);
        content: "";
      }
    }
  }

  &__rename-input {
    outline: 2px solid var(--ui-brand-primary);
    outline-offset: -2px;
  }

  &__delete,
  &__add {
    display: inline-grid;
    width: 30px;
    place-items: center;
    background: transparent;
    border: 0;
    color: var(--ui-text-muted);
    cursor: pointer;
    border-left: 1px solid var(--ui-border-strong);

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
      background: var(--ui-surface-primary);
      color: var(--ui-text-primary);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &__add {
    flex: 0 0 30px;
  }
}
</style>
