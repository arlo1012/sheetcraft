<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";

export type NamedRangeRow = Readonly<{
  id: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
}>;
export type NamedRangeDraft = Readonly<{
  id?: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
}>;
export type NamedRangeSheet = Readonly<{ id: string; name: string }>;

const props = withDefaults(
  defineProps<{
    visible: boolean;
    ranges: readonly NamedRangeRow[];
    sheets: readonly NamedRangeSheet[];
    activeSheetId?: string;
    selectionReference?: string;
    editSessionId?: string;
  }>(),
  {
    activeSheetId: undefined,
    selectionReference: undefined,
    editSessionId: undefined,
  },
);
const emit = defineEmits<{
  close: [];
  save: [row: NamedRangeDraft];
  delete: [id: string];
  createFromSelection: [];
}>();
const { t } = useAppI18n();
const selectedId = ref<string | undefined>();
const draft = ref<NamedRangeDraft>({ name: "", reference: "" });
const selectedRange = computed(() =>
  props.ranges.find((range) => range.id === selectedId.value),
);

function resetDraft(): void {
  const range = selectedRange.value;
  draft.value = range
    ? { ...range }
    : {
        name: "",
        scopeSheetId: props.activeSheetId,
        reference: props.selectionReference ?? "",
      };
}
function selectRange(id: string): void {
  selectedId.value = id;
  resetDraft();
}
function createRange(): void {
  selectedId.value = undefined;
  resetDraft();
}
function save(): void {
  if (draft.value.name.trim() && draft.value.reference.trim())
    emit("save", {
      ...draft.value,
      name: draft.value.name.trim(),
      reference: draft.value.reference.trim(),
    });
}
function remove(): void {
  if (selectedId.value) {
    emit("delete", selectedId.value);
    createRange();
  }
}
function createFromSelection(): void {
  emit("createFromSelection");
  if (!selectedId.value && props.selectionReference)
    draft.value = { ...draft.value, reference: props.selectionReference };
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) createRange();
  },
);
watch(
  () => props.selectionReference,
  (reference) => {
    if (!selectedId.value && reference)
      draft.value = { ...draft.value, reference };
  },
);
if (props.visible) createRange();
</script>

<template>
  <Dialog
    v-if="visible"
    class="named-ranges-dialog"
    :visible="visible"
    :header="t('formulaTools.namedRanges')"
    :confirm-btn="{ content: t('formulaTools.saveName') }"
    :cancel-btn="t('formulaTools.cancel')"
    :width="650"
    :data-cell-edit-session="editSessionId"
    @confirm="save"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <div class="named-ranges-dialog__content" :data-cell-edit-session="editSessionId">
      <section
        class="named-ranges-dialog__list"
        :aria-label="t('formulaTools.namedRanges')"
      >
        <div class="named-ranges-dialog__list-actions">
          <button type="button" @click="createRange">
            {{ t("formulaTools.newName") }}</button
          ><button type="button" :disabled="!selectedId" @click="remove">
            {{ t("formulaTools.deleteName") }}
          </button>
        </div>
        <button
          v-for="range in ranges"
          :key="range.id"
          class="named-ranges-dialog__row"
          :class="{ active: selectedId === range.id }"
          type="button"
          @click="selectRange(range.id)"
        >
          <strong>{{ range.name }}</strong
          ><span>{{ range.reference }}</span>
        </button>
      </section>
      <form class="named-ranges-dialog__form" @submit.prevent="save">
        <label
          >{{ t("formulaTools.name")
          }}<input v-model="draft.name" autocomplete="off"
        /></label>
        <label
          >{{ t("formulaTools.scope")
          }}<select v-model="draft.scopeSheetId">
            <option :value="undefined">{{ t("formulaTools.workbook") }}</option>
            <option v-for="sheet in sheets" :key="sheet.id" :value="sheet.id">
              {{ sheet.name }}
            </option>
          </select></label
        >
        <label
          >{{ t("formulaTools.reference")
          }}<input v-model="draft.reference" autocomplete="off"
        /></label>
        <button
          type="button"
          class="named-ranges-dialog__selection"
          @click="createFromSelection"
        >
          {{ t("formulaTools.createFromSelection")
          }}<span v-if="selectionReference">{{ selectionReference }}</span>
        </button>
      </form>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.named-ranges-dialog {
  &__content {
    display: grid;
    grid-template-columns: 225px minmax(0, 1fr);
    min-height: 270px;
    border: 1px solid var(--idea-border-subtle);
  }
  &__list {
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 8px;
    border-right: 1px solid var(--idea-border-subtle);
    overflow: auto;
  }
  &__list-actions {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  button,
  input,
  select {
    font: inherit;
  }
  &__list-actions button,
  &__selection {
    min-height: 28px;
    padding: 0 8px;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    color: var(--idea-text-primary);
    &:hover:not(:disabled) {
      background: var(--idea-surface-hover);
    }
  }
  &__row {
    display: grid;
    gap: 1px;
    min-height: 44px;
    padding: 5px 8px;
    background: transparent;
    border: 0;
    border-radius: 2px;
    color: var(--idea-text-primary);
    font: inherit;
    text-align: left;
    &:hover,
    &.active {
      background: var(--idea-surface-hover);
    }
    span {
      overflow: hidden;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-supporting);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__form {
    display: grid;
    align-content: start;
    gap: 12px;
    padding: 16px;
    label {
      display: grid;
      gap: 4px;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-supporting);
      line-height: var(--idea-line-height-supporting);
    }
    input,
    select {
      height: 28px;
      padding: 0 7px;
      background: var(--idea-surface-panel);
      border: 1px solid var(--idea-border-subtle);
      border-radius: var(--idea-radius-default);
      color: var(--idea-text-primary);
      font-size: var(--idea-font-size-body-medium);
      outline: none;
      &:focus {
        border-color: var(--idea-action-primary);
        box-shadow: 0 0 0 2px var(--idea-action-focus);
      }
    }
  }
  &__selection {
    display: grid;
    justify-items: start;
    gap: 1px;
    text-align: left;
    span {
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-supporting);
    }
  }
}
</style>
