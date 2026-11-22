<script setup lang="ts">
import { reactive, ref, useId, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { normalizeSheetProtection, type SheetProtection } from "@sheetcraft/core";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
const props = defineProps<{
  visible: boolean;
  protected: boolean;
  configuration: SheetProtection;
  error: string;
}>();
const emit = defineEmits<{ close: []; save: [value: SheetProtection, password: string] }>();
const { t, locale } = useAppI18n();
const passwordInputId = `sheet-protection-password-${useId()}`;
const confirmInputId = `sheet-protection-confirm-${useId()}`;
const password = ref(""),
  confirmation = ref(""),
  validationError = ref("");
const permissions = reactive({
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatRows: false,
  formatColumns: false,
  insertColumns: false,
  insertRows: false,
  insertHyperlinks: false,
  deleteColumns: false,
  deleteRows: false,
  sort: false,
  autoFilter: false,
  pivotTables: false,
  editObjects: false,
});
watch(
  () => props.visible,
  (visible) => {
    password.value = "";
    confirmation.value = "";
    validationError.value = "";
    if (!visible) return;
    for (const key of Object.keys(permissions) as Array<keyof typeof permissions>)
      permissions[key] =
        key === "selectLockedCells" || key === "selectUnlockedCells"
          ? props.configuration[key] !== false
          : Boolean(props.configuration[key]);
  },
  { immediate: true },
);
function save(): void {
  if (!props.protected && password.value !== confirmation.value) {
    validationError.value = t("review.passwordMismatch");
    return;
  }
  const configuration = normalizeSheetProtection({
    ...props.configuration,
    ...permissions,
  } as SheetProtection)!;
  emit("save", props.protected ? props.configuration : configuration, password.value);
}
</script>
<template>
  <TDialog
    v-if="visible"
    :visible="visible"
    :header="t(protected ? 'review.unprotectSheet' : 'review.protectSheet')"
    :confirm-btn="t('review.confirm')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="460px"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm label-align="right" :label-width="locale === 'zh-CN' ? 96 : 144">
      <TFormItem
        v-if="!protected || configuration.password"
        :for="passwordInputId"
        :label="t(protected ? 'review.password' : 'review.optionalPassword')"
      >
        <TInput
          v-model="password"
          v-native-control="{
            attributes: {
              id: passwordInputId,
              name: passwordInputId,
              'aria-label': t(protected ? 'review.password' : 'review.optionalPassword'),
            },
          }"
          type="password"
          autocomplete="new-password"
          :maxlength="255"
        />
      </TFormItem>
      <TFormItem
        v-if="!protected && password"
        :for="confirmInputId"
        :label="t('review.confirmPassword')"
      >
        <TInput
          v-model="confirmation"
          v-native-control="{
            attributes: {
              id: confirmInputId,
              name: confirmInputId,
              'aria-label': t('review.confirmPassword'),
            },
          }"
          type="password"
          autocomplete="new-password"
          :maxlength="255"
        />
      </TFormItem>
    </TForm>
    <p>{{ t(protected ? "review.unprotectHint" : "review.sheetProtectionHint") }}</p>
    <div
      v-if="!protected"
      class="sheet-protection-options"
      role="group"
      :aria-label="t('review.allowedOperations')"
    >
      <TCheckbox v-model="permissions.selectLockedCells">{{
        t("review.selectLockedCells")
      }}</TCheckbox>
      <TCheckbox v-model="permissions.selectUnlockedCells">{{
        t("review.selectUnlockedCells")
      }}</TCheckbox>
      <TCheckbox v-model="permissions.formatCells">{{ t("review.allowFormatCells") }}</TCheckbox>
      <TCheckbox v-model="permissions.formatColumns">{{
        t("review.allowFormatColumns")
      }}</TCheckbox>
      <TCheckbox v-model="permissions.formatRows">{{ t("review.allowFormatRows") }}</TCheckbox>
      <TCheckbox v-model="permissions.insertColumns">{{
        t("review.allowInsertColumns")
      }}</TCheckbox>
      <TCheckbox v-model="permissions.insertRows">{{ t("review.allowInsertRows") }}</TCheckbox>
      <TCheckbox v-model="permissions.insertHyperlinks">{{
        t("review.allowInsertHyperlinks")
      }}</TCheckbox>
      <TCheckbox v-model="permissions.deleteColumns">{{
        t("review.allowDeleteColumns")
      }}</TCheckbox>
      <TCheckbox v-model="permissions.deleteRows">{{ t("review.allowDeleteRows") }}</TCheckbox>
      <TCheckbox v-model="permissions.sort">{{ t("review.allowSort") }}</TCheckbox>
      <TCheckbox v-model="permissions.autoFilter">{{ t("review.allowAutoFilter") }}</TCheckbox>
      <TCheckbox v-model="permissions.pivotTables">{{ t("review.allowPivotTables") }}</TCheckbox>
      <TCheckbox v-model="permissions.editObjects">{{ t("review.allowEditObjects") }}</TCheckbox>
    </div>
    <p v-if="validationError || error" role="alert">{{ validationError || error }}</p>
  </TDialog>
</template>
<style scoped lang="scss">
.sheet-protection-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
