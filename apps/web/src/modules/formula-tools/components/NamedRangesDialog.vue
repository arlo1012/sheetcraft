<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";

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
const contentRef = ref<HTMLElement | null>(null);
const scopePopupProps = { attach: () => contentRef.value ?? document.body };
const workbookScopeValue = "__idea10_workbook_scope__";
const selectedId = ref<string | undefined>();
const draft = ref<NamedRangeDraft>({ name: "", reference: "" });
const selectedRange = computed(() => props.ranges.find((range) => range.id === selectedId.value));
const rangeOptions = computed(() =>
  props.ranges.map((range) => ({ value: range.id, label: range.name, reference: range.reference })),
);
const scopeOptions = computed(() => [
  { label: t("formulaTools.workbook"), value: workbookScopeValue },
  ...props.sheets.map((sheet) => ({ label: sheet.name, value: sheet.id })),
]);
const scopeSelectValue = computed({
  get: () => draft.value.scopeSheetId ?? workbookScopeValue,
  set: (value: string) => {
    draft.value = {
      ...draft.value,
      scopeSheetId: value === workbookScopeValue ? undefined : value,
    };
  },
});

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
    if (!selectedId.value && reference) draft.value = { ...draft.value, reference };
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
    <div
      ref="contentRef"
      class="named-ranges-dialog__content"
      :data-cell-edit-session="editSessionId"
    >
      <section class="named-ranges-dialog__list" :aria-label="t('formulaTools.namedRanges')">
        <div class="named-ranges-dialog__list-actions">
          <TButton variant="outline" @click="createRange">
            {{ t("formulaTools.newName") }}
          </TButton>
          <TButton theme="danger" variant="outline" :disabled="!selectedId" @click="remove">
            {{ t("formulaTools.deleteName") }}
          </TButton>
        </div>
        <OptionList
          class="named-ranges-dialog__range-menu"
          :model-value="selectedId"
          :options="rangeOptions"
          :label="t('formulaTools.namedRanges')"
          variant="navigation"
          item-data-attribute="data-named-range"
          @select="selectRange"
        >
          <template #option="{ option }">
            <span class="named-ranges-dialog__row-content"
              ><strong>{{ option.label }}</strong
              ><span>{{ option.reference }}</span></span
            >
          </template>
        </OptionList>
      </section>
      <TForm class="named-ranges-dialog__form" layout="vertical" @submit="save">
        <TFormItem :label="t('formulaTools.name')">
          <TInput
            v-model="draft.name"
            :aria-label="t('formulaTools.name')"
            data-formula-name
            autocomplete="off"
          />
        </TFormItem>
        <TFormItem :label="t('formulaTools.scope')">
          <TSelect
            v-model="scopeSelectValue"
            :options="scopeOptions"
            :popup-props="scopePopupProps"
            :aria-label="t('formulaTools.scope')"
            :disabled="Boolean(selectedId)"
          />
        </TFormItem>
        <TFormItem :label="t('formulaTools.reference')">
          <TInput
            v-model="draft.reference"
            :aria-label="t('formulaTools.reference')"
            data-formula-reference
            autocomplete="off"
          />
        </TFormItem>
        <TButton
          class="named-ranges-dialog__selection"
          variant="outline"
          @click="createFromSelection"
        >
          <span class="named-ranges-dialog__selection-content"
            >{{ t("formulaTools.createFromSelection")
            }}<span v-if="selectionReference">{{ selectionReference }}</span></span
          >
        </TButton>
      </TForm>
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
    grid-template-rows: auto minmax(0, 1fr);
    align-content: start;
    padding: 8px;
    border-right: 1px solid var(--idea-border-subtle);
    min-height: 0;
  }
  &__list-actions {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  &__range-menu {
    min-width: 0;
    min-height: 0;
  }
  &__row-content {
    display: grid;
    gap: 1px;
    min-width: 0;
    > span {
      overflow: hidden;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__form {
    display: grid;
    align-content: start;
    padding: var(--idea-tool-panel-padding);
  }
  &__selection {
    height: auto;
  }
  &__selection-content {
    display: grid;
    justify-items: start;
    gap: 1px;
    text-align: left;
    > span {
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
    }
  }
}
</style>
