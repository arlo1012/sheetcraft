<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { SheetProtection } from "@idea10/core";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  visible: boolean;
  protected: boolean;
  configuration: SheetProtection;
  error: string;
}>();
const emit = defineEmits<{ close: []; save: [value: SheetProtection] }>();
const { t } = useAppI18n();
const formatCells = ref(false),
  formatRows = ref(false),
  formatColumns = ref(false);
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      formatCells.value = Boolean(props.configuration.formatCells);
      formatRows.value = Boolean(props.configuration.formatRows);
      formatColumns.value = Boolean(props.configuration.formatColumns);
    }
  },
  { immediate: true },
);
function save(): void {
  emit(
    "save",
    props.protected
      ? props.configuration
      : {
          editableRanges: props.configuration.editableRanges,
          ...(formatCells.value ? { formatCells: true } : {}),
          ...(formatRows.value ? { formatRows: true } : {}),
          ...(formatColumns.value ? { formatColumns: true } : {}),
        },
  );
}
</script>
<template>
  <TDialog
    :visible="visible"
    :header="t(protected ? 'review.unprotectSheet' : 'review.protectSheet')"
    :confirm-btn="t(protected ? 'review.unprotectSheet' : 'review.protectSheet')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="420px"
    @confirm="save"
    @close="emit('close')"
  >
    <p>{{ t(protected ? "review.unprotectHint" : "review.sheetProtectionHint") }}</p>
    <TForm v-if="!protected" label-align="left" label-width="0">
      <TFormItem
        ><TCheckbox v-model="formatCells">{{ t("review.allowFormatCells") }}</TCheckbox></TFormItem
      >
      <TFormItem
        ><TCheckbox v-model="formatRows">{{ t("review.allowFormatRows") }}</TCheckbox></TFormItem
      >
      <TFormItem
        ><TCheckbox v-model="formatColumns">{{
          t("review.allowFormatColumns")
        }}</TCheckbox></TFormItem
      >
    </TForm>
    <p v-if="error" role="alert">{{ error }}</p>
  </TDialog>
</template>
