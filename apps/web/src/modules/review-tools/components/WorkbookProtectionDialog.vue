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
const { t } = useAppI18n();
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
    v-if="visible"
    :visible="visible"
    :header="t(protected ? 'review.unprotectWorkbook' : 'review.protectWorkbook')"
    :confirm-btn="t('review.confirm')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <div class="workbook-protection">
      <TForm class="workbook-protection__form sheetcraft-form-grid" label-align="top">
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
            :placeholder="protected ? undefined : t('review.optionalPasswordPlaceholder')"
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
      <p v-if="validationError || error" class="workbook-protection__error" role="alert">
        {{ validationError || error }}
      </p>
    </div>
  </TDialog>
</template>
<style scoped lang="scss">
.workbook-protection {
  display: grid;
  gap: 10px;

  &__form {
    display: grid;
    gap: 10px;
  }

  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
