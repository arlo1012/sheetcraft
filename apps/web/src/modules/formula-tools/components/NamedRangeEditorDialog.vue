<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import { useAppI18n } from "../../../shared/i18n";
import type { NamedRangeDraft, NamedRangeSheet } from "../named-range-types";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";

const props = withDefaults(
  defineProps<{
    initialDraft: NamedRangeDraft;
    sheets: readonly NamedRangeSheet[];
    selectionReference?: string;
    editSessionId?: string;
    suspended?: boolean;
    selectReference?: (current: string) => Promise<string | undefined>;
  }>(),
  {
    selectionReference: undefined,
    editSessionId: undefined,
    suspended: false,
    selectReference: undefined,
  },
);
const emit = defineEmits<{
  close: [];
  save: [draft: NamedRangeDraft];
}>();
const { t, locale } = useAppI18n();
const contentRef = ref<HTMLElement | null>(null);
const workbookScopeValue = "__sheetcraft_workbook_scope__";
const scopePopupProps = { attach: () => contentRef.value ?? document.body };
const draft = ref<NamedRangeDraft>({ name: "", reference: "" });
const nameError = computed(() =>
  /^\p{N}/u.test(draft.value.name.trim()) ? t("formulaTools.nameCannotStartWithNumber") : "",
);
const canSave = computed(
  () => Boolean(draft.value.name.trim() && draft.value.reference.trim()) && !nameError.value,
);

const isEditing = computed(() => Boolean(draft.value.id));
const header = computed(() =>
  t(isEditing.value ? "formulaTools.editName" : "formulaTools.newName"),
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
  draft.value = {
    ...props.initialDraft,
    reference:
      props.initialDraft.reference ||
      (!props.initialDraft.id ? (props.selectionReference ?? "") : ""),
  };
}

function save(): void {
  if (!canSave.value) return;
  emit("save", {
    ...draft.value,
    name: draft.value.name.trim(),
    reference: draft.value.reference.trim(),
  });
}

watch(() => props.initialDraft, resetDraft, { deep: true, immediate: true });
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    class="named-range-editor-dialog"
    :visible="!suspended"
    :header="header"
    :confirm-btn="{
      content: t('formulaTools.saveName'),
      disabled: !canSave,
    }"
    :cancel-btn="t('formulaTools.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :data-cell-edit-session="editSessionId"
    @confirm="save"
    @close="emit('close')"
  >
    <div
      ref="contentRef"
      class="named-range-editor-dialog__content"
      :data-cell-edit-session="editSessionId"
    >
      <TForm
        class="named-range-editor-dialog__form"
        layout="vertical"
        label-align="right"
        :label-width="locale === 'zh-CN' ? 64 : 80"
        @submit="save"
      >
        <TFormItem :label="t('formulaTools.name')">
          <TInput
            v-model="draft.name"
            :aria-label="t('formulaTools.name')"
            :status="nameError ? 'error' : 'default'"
            :tips="nameError"
            :aria-invalid="Boolean(nameError)"
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
            :disabled="isEditing"
          />
        </TFormItem>
        <TFormItem :label="t('formulaTools.reference')">
          <div class="named-range-editor-dialog__reference">
            <RangeReferenceInput
              v-model="draft.reference"
              :select-reference="selectReference"
              data-formula-reference
            />
          </div>
        </TFormItem>
        <TFormItem :label="t('formulaTools.comment')">
          <TTextarea
            v-model="draft.comment"
            :aria-label="t('formulaTools.comment')"
            :autosize="{ minRows: 3, maxRows: 5 }"
            :maxlength="255"
          />
        </TFormItem>
      </TForm>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.named-range-editor-dialog {
  &__content {
    min-width: 0;
  }

  &__reference {
    width: 100%;
    min-width: 0;
  }
}
</style>
