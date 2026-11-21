<script setup lang="ts">
import { ref, useId, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
const props = defineProps<{
  visible: boolean;
  protected: boolean;
  hasPassword?: boolean;
  error: string;
}>();
const emit = defineEmits<{ close: []; save: [password: string] }>();
const { t, locale } = useAppI18n();
const passwordInputId = `workbook-protection-password-${useId()}`;
const confirmInputId = `workbook-protection-confirm-${useId()}`;
const password = ref(""),
  confirmation = ref(""),
  validationError = ref("");
watch(
  () => props.visible,
  () => {
    password.value = "";
    confirmation.value = "";
    validationError.value = "";
  },
);
function save(): void {
  if (!props.protected && password.value !== confirmation.value) {
    validationError.value = t("review.passwordMismatch");
    return;
  }
  emit("save", password.value);
}
</script>
<template>
  <TDialog
    :visible="visible"
    :header="t(protected ? 'review.unprotectWorkbook' : 'review.protectWorkbook')"
    :confirm-btn="t('review.confirm')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="420px"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm label-align="right" :label-width="locale === 'zh-CN' ? 96 : 144">
      <TFormItem
        v-if="!protected || hasPassword"
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
    <p v-if="validationError || error" role="alert">{{ validationError || error }}</p>
  </TDialog>
</template>
