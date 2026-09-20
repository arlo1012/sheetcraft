<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ChevronDown, ChevronUp, Pencil, PlusCircle, Trash2 } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput, type InputValue } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import type { DropdownListDraft, DropdownListInitial } from "../dropdown-list-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: DropdownListInitial;
    error?: string;
    suspended?: boolean;
    selectReference?: (
      current: string,
      options?: RangeReferenceSelectionOptions,
    ) => Promise<string | undefined>;
  }>(),
  { error: "", suspended: false, selectReference: undefined },
);
const emit = defineEmits<{ close: []; apply: [draft: DropdownListDraft] }>();
const { t } = useAppI18n();

function copy(value: DropdownListDraft): DropdownListDraft {
  return { ...value, items: [...value.items] };
}
function createDraft(value: DropdownListInitial): DropdownListDraft {
  return {
    mode: value.mode,
    items: [...value.items],
    source: value.source,
    applyToMatching: value.canApplyToMatching ? value.applyToMatching : false,
    clear: false,
  };
}

const draft = ref<DropdownListDraft>(createDraft(props.initial));
const selectedIndex = ref(-1);
const editingIndex = ref<number>();
const editingValue = ref("");
const itemInput = ref<{ focus(): void }>();
const canConfirm = computed(() => {
  if (draft.value.clear) return true;
  if (draft.value.mode === "range") return Boolean(draft.value.source.trim());
  const items = draft.value.items.map((item, index) =>
    editingIndex.value === index ? editingValue.value : item,
  );
  return items.length > 0 && items.every((item) => item.trim());
});
const canEditSelected = computed(
  () => selectedIndex.value >= 0 && selectedIndex.value < draft.value.items.length,
);

function reset(): void {
  draft.value = createDraft(props.initial);
  selectedIndex.value = draft.value.items.length ? 0 : -1;
  editingIndex.value = undefined;
}
watch(
  () => props.visible,
  (visible, wasVisible) => {
    if (visible && !wasVisible && !props.suspended) reset();
  },
  { immediate: true },
);

function markChanged(): void {
  draft.value.clear = false;
}
function setMode(mode: DropdownListDraft["mode"]): void {
  if (draft.value.mode === mode) return;
  draft.value.mode = mode;
  markChanged();
  cancelEdit();
}
async function focusEditor(): Promise<void> {
  await nextTick();
  itemInput.value?.focus();
}
function setItemInput(element: unknown): void {
  itemInput.value = element ? (element as { focus(): void }) : undefined;
}
function onEditorFocus(_value: InputValue, { e }: { e: FocusEvent }): void {
  if (e.target instanceof HTMLInputElement) e.target.select();
}
function onEditorKeydown(_value: InputValue, { e }: { e: KeyboardEvent }): void {
  if (e.isComposing || (e.key !== "Enter" && e.key !== "Escape")) return;
  e.stopPropagation();
  e.preventDefault();
  if (e.key === "Enter") commitEdit();
  else cancelEdit();
}
function addItem(): void {
  if (editingIndex.value !== undefined) commitEdit();
  draft.value.items.push("");
  selectedIndex.value = draft.value.items.length - 1;
  editingIndex.value = selectedIndex.value;
  editingValue.value = "";
  markChanged();
  void focusEditor();
}
function beginEdit(index = selectedIndex.value): void {
  if (index < 0 || index >= draft.value.items.length) return;
  selectedIndex.value = index;
  editingIndex.value = index;
  editingValue.value = draft.value.items[index] ?? "";
  void focusEditor();
}
function commitEdit(): void {
  const index = editingIndex.value;
  if (index === undefined) return;
  const value = editingValue.value.trim();
  if (value) {
    draft.value.items[index] = value;
    markChanged();
  } else if (!draft.value.items[index]?.trim()) {
    draft.value.items.splice(index, 1);
    selectedIndex.value = Math.min(index, draft.value.items.length - 1);
  }
  editingIndex.value = undefined;
}
function cancelEdit(): void {
  const index = editingIndex.value;
  if (index !== undefined && !draft.value.items[index]?.trim()) {
    draft.value.items.splice(index, 1);
    selectedIndex.value = Math.min(index, draft.value.items.length - 1);
  }
  editingIndex.value = undefined;
}
function removeSelected(): void {
  if (!canEditSelected.value) return;
  const index = selectedIndex.value;
  draft.value.items.splice(index, 1);
  selectedIndex.value = Math.min(index, draft.value.items.length - 1);
  editingIndex.value = undefined;
  markChanged();
}
function moveSelected(offset: number): void {
  const index = selectedIndex.value;
  const target = index + offset;
  if (index < 0 || target < 0 || target >= draft.value.items.length) return;
  const [item] = draft.value.items.splice(index, 1);
  draft.value.items.splice(target, 0, item!);
  selectedIndex.value = target;
  markChanged();
}
function onListKeydown(event: KeyboardEvent): void {
  if (editingIndex.value !== undefined) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, draft.value.items.length - 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (event.key === "Enter" || event.key === "F2") {
    event.preventDefault();
    beginEdit();
  } else if (event.key === "Delete") {
    event.preventDefault();
    removeSelected();
  }
}
function clearAll(): void {
  draft.value.items = [];
  draft.value.source = "";
  draft.value.mode = "manual";
  draft.value.clear = true;
  selectedIndex.value = -1;
  editingIndex.value = undefined;
}
function apply(): void {
  commitEdit();
  if (!canConfirm.value) return;
  emit("apply", copy(draft.value));
}
async function selectRange(current: string): Promise<string | undefined> {
  const original = draft.value;
  const selected = await props.selectReference?.(current, { singleCell: false });
  return props.visible && draft.value === original ? selected : undefined;
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.dropdown.title')"
    :visible="visible && !suspended"
    :header="t('dataTools.dropdown.title')"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <div class="dropdown-list-dialog">
      <div class="dropdown-list-dialog__mode">
        <TRadioGroup
          class="dropdown-list-dialog__choice"
          :model-value="draft.mode"
          @update:model-value="setMode"
        >
          <TRadio value="manual" @click="setMode('manual')">{{
            t("dataTools.dropdown.manual")
          }}</TRadio>
        </TRadioGroup>
        <div class="dropdown-list-dialog__actions">
          <TButton
            variant="text"
            shape="square"
            :disabled="draft.mode !== 'manual'"
            :title="t('dataTools.dropdown.add')"
            :aria-label="t('dataTools.dropdown.add')"
            data-dropdown-add
            @click="addItem"
            ><PlusCircle :size="17"
          /></TButton>
          <TButton
            variant="text"
            shape="square"
            :disabled="draft.mode !== 'manual' || !canEditSelected"
            :title="t('dataTools.dropdown.remove')"
            :aria-label="t('dataTools.dropdown.remove')"
            data-dropdown-remove
            @click="removeSelected"
            ><Trash2 :size="17"
          /></TButton>
          <TButton
            variant="text"
            shape="square"
            :disabled="draft.mode !== 'manual' || selectedIndex >= draft.items.length - 1"
            :title="t('dataTools.dropdown.moveDown')"
            :aria-label="t('dataTools.dropdown.moveDown')"
            data-dropdown-move-down
            @click="moveSelected(1)"
            ><ChevronDown :size="17"
          /></TButton>
          <TButton
            variant="text"
            shape="square"
            :disabled="draft.mode !== 'manual' || selectedIndex <= 0"
            :title="t('dataTools.dropdown.moveUp')"
            :aria-label="t('dataTools.dropdown.moveUp')"
            data-dropdown-move-up
            @click="moveSelected(-1)"
            ><ChevronUp :size="17"
          /></TButton>
          <TButton
            variant="text"
            shape="square"
            :disabled="draft.mode !== 'manual' || !canEditSelected"
            :title="t('dataTools.dropdown.edit')"
            :aria-label="t('dataTools.dropdown.edit')"
            data-dropdown-edit
            @click="beginEdit()"
            ><Pencil :size="16"
          /></TButton>
        </div>
      </div>
      <div
        class="dropdown-list-dialog__list"
        :class="{ 'dropdown-list-dialog__list--disabled': draft.mode !== 'manual' }"
        :tabindex="draft.mode === 'manual' ? 0 : -1"
        role="listbox"
        :aria-label="t('dataTools.dropdown.manual')"
        @keydown="onListKeydown"
      >
        <div
          v-for="(item, index) in draft.items"
          :key="`${index}:${item}`"
          class="dropdown-list-dialog__item"
          role="option"
          :aria-selected="selectedIndex === index"
          @click="selectedIndex = index"
          @dblclick="beginEdit(index)"
        >
          <TInput
            v-if="editingIndex === index"
            :ref="setItemInput"
            v-model="editingValue"
            :aria-label="t('dataTools.dropdown.edit')"
            @focus="onEditorFocus"
            @keydown="onEditorKeydown"
            @blur="commitEdit"
          />
          <span v-else>{{ item }}</span>
        </div>
      </div>
      <TRadioGroup
        :model-value="draft.mode"
        class="dropdown-list-dialog__mode"
        @update:model-value="setMode"
      >
        <TRadio value="range" @click="setMode('range')">{{
          t("dataTools.dropdown.fromCells")
        }}</TRadio>
      </TRadioGroup>
      <RangeReferenceInput
        v-model="draft.source"
        :disabled="draft.mode !== 'range'"
        :label="t('dataTools.dropdown.fromCells')"
        :pick-label="t('dataTools.dropdown.pickSource')"
        :placeholder="t('dataTools.dropdown.sourcePlaceholder')"
        :select-reference="selectReference ? selectRange : undefined"
        @update:model-value="markChanged"
      />
      <TCheckbox v-model="draft.applyToMatching" :disabled="!initial.canApplyToMatching">{{
        t("dataTools.dropdown.applyToMatching")
      }}</TCheckbox>
      <p v-if="error" class="dropdown-list-dialog__error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="dropdown-list-dialog__footer">
        <TButton theme="default" data-dropdown-clear @click="clearAll">{{
          t("dataTools.dropdown.clearAll")
        }}</TButton>
        <div>
          <TButton theme="default" data-dropdown-cancel @click="emit('close')">{{
            t("dataTools.dropdown.cancel")
          }}</TButton>
          <TButton theme="primary" :disabled="!canConfirm" data-dropdown-confirm @click="apply">{{
            t("dataTools.dropdown.confirm")
          }}</TButton>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
@use "../../../shared/option-list/option-list";

.dropdown-list-dialog {
  display: grid;
  gap: var(--idea-space-2);
  color: var(--idea-text-primary);
}
.dropdown-list-dialog__mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dropdown-list-dialog__choice {
  --td-comp-margin-xxl: 0;
  flex-shrink: 0;
  white-space: nowrap;
}
.dropdown-list-dialog__actions {
  display: flex;
  gap: 1px;
  margin-left: auto;
}
.dropdown-list-dialog__list {
  @include option-list.surface;
  height: 190px;
  outline: none;
}
.dropdown-list-dialog__list--disabled {
  color: var(--idea-text-disabled);
  background: var(--td-bg-color-container-disabled);
}
.dropdown-list-dialog__item {
  @include option-list.item;
  min-height: 28px;
  padding: 4px 8px;
  white-space: normal;

  &[aria-selected="true"] {
    font-weight: var(--idea-font-weight-medium);
  }
}
.dropdown-list-dialog__error {
  margin: 0;
  color: var(--td-error-color);
}
.dropdown-list-dialog__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
