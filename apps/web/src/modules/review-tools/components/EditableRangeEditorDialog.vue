<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { normalizeSheetProtection, type EditableRange } from "@sheetcraft/core";
import { formatCellAddress, parseCellAddress } from "@sheetcraft/core/coordinates";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import { createBrowserProtectionPassword } from "../protection-password";
const props = defineProps<{
  visible: boolean;
  suspended?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
  draft: EditableRange;
  names: string[];
  editing: boolean;
}>();
const emit = defineEmits<{ close: []; save: [range: EditableRange] }>();
const { t, locale } = useAppI18n();
const name = ref(""),
  reference = ref(""),
  password = ref(""),
  confirmation = ref(""),
  error = ref("");
const clearPassword = ref(false);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    name.value = props.draft.name;
    reference.value = `${formatCellAddress(props.draft.range.start)}:${formatCellAddress(props.draft.range.end)}`;
    password.value = "";
    confirmation.value = "";
    error.value = "";
    clearPassword.value = false;
  },
  { immediate: true },
);
function save(): void {
  if (password.value !== confirmation.value) {
    error.value = t("review.passwordMismatch");
    return;
  }
  try {
    const parts = reference.value.trim().replace(/^=/, "").replaceAll("$", "").split(":");
    const start = parseCellAddress(parts[0] ?? ""),
      end = parseCellAddress(parts[1] ?? parts[0] ?? "");
    if (
      parts.length > 2 ||
      !start ||
      !end ||
      props.names.some((existing) => existing.toLowerCase() === name.value.trim().toLowerCase())
    )
      throw new Error();
    const entry = normalizeSheetProtection({
      editableRanges: [
        {
          name: name.value,
          range: { start, end },
          password: clearPassword.value
            ? undefined
            : password.value
              ? createBrowserProtectionPassword(password.value)
              : props.draft.password,
        },
      ],
    })!.editableRanges[0]!;
    emit("save", entry);
  } catch {
    error.value = t("review.invalidEditableRange");
  }
}
</script>
<template>
  <TDialog
    :visible="visible && !suspended"
    :header="t(editing ? 'review.editRange' : 'review.addRange')"
    :confirm-btn="t('review.save')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="470px"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm label-align="right" :label-width="locale === 'zh-CN' ? 96 : 144">
      <TFormItem :label="t('review.rangeName')"
        ><TInput v-model="name" :maxlength="255"
      /></TFormItem>
      <TFormItem :label="t('review.rangeReference')">
        <div class="editable-range-editor__reference">
          <RangeReferenceInput
            v-model="reference"
            :select-reference="selectReference"
            :label="t('review.rangeReference')"
          />
        </div>
      </TFormItem>
      <TFormItem :label="t('review.optionalPassword')"
        ><TInput
          v-model="password"
          type="password"
          :disabled="clearPassword"
          :maxlength="255"
          autocomplete="new-password"
      /></TFormItem>
      <TFormItem v-if="password && !clearPassword" :label="t('review.confirmPassword')"
        ><TInput
          v-model="confirmation"
          type="password"
          :maxlength="255"
          autocomplete="new-password"
      /></TFormItem>
      <TFormItem v-if="draft.password"
        ><TCheckbox v-model="clearPassword">{{ t("review.removePassword") }}</TCheckbox></TFormItem
      >
    </TForm>
    <p v-if="draft.password && !clearPassword">{{ t("review.keepPasswordHint") }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </TDialog>
</template>

<style scoped lang="scss">
.editable-range-editor__reference {
  width: 100%;
}
</style>
