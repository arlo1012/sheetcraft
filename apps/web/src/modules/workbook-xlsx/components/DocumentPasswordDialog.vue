<script setup lang="ts">
import { ref, useId } from "vue";
import { Alert as TAlert } from "tdesign-vue-next/es/alert";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
const props = defineProps<{ mode: "encrypt" | "decrypt"; busy: boolean; incorrect?: boolean }>();
const emit = defineEmits<{ close: []; submit: [password: string] }>();
const { t } = useAppI18n();
const passwordInputId = `document-password-${useId()}`;
const confirmInputId = `document-password-confirm-${useId()}`;
const password = ref(""),
  confirmation = ref(""),
  error = ref("");
function submit() {
  if (!password.value) {
    error.value = t("review.passwordRequired");
    return;
  }
  if (props.mode === "encrypt" && password.value !== confirmation.value) {
    error.value = t("review.passwordMismatch");
    return;
  }
  error.value = "";
  emit("submit", password.value);
}
</script>
<template>
  <TDialog
    visible
    :header="t(mode === 'encrypt' ? 'review.encryptDocument' : 'review.openEncryptedDocument')"
    :confirm-btn="{
      content: t('review.confirm'),
      loading: busy,
    }"
    :cancel-btn="{ content: t('review.cancel'), disabled: busy }"
    :close-btn="!busy"
    :close-on-esc-keydown="!busy"
    :close-on-overlay-click="false"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    @confirm="submit"
    @close="!busy && emit('close')"
  >
    <div class="document-password">
      <TForm
        class="document-password__form sheetcraft-form-grid"
        label-align="top"
        @submit.prevent="submit"
      >
        <TFormItem :for="passwordInputId" :label="t('review.password')"
          ><TInput
            v-model="password"
            v-native-control="{
              attributes: {
                id: passwordInputId,
                name: passwordInputId,
                'aria-label': t('review.password'),
              },
            }"
            type="password"
            :disabled="busy"
            :maxlength="255"
            :autocomplete="mode === 'encrypt' ? 'new-password' : 'current-password'"
        /></TFormItem>
        <TFormItem
          v-if="mode === 'encrypt'"
          :for="confirmInputId"
          :label="t('review.confirmPassword')"
          ><TInput
            v-model="confirmation"
            v-native-control="{
              attributes: {
                id: confirmInputId,
                name: confirmInputId,
                'aria-label': t('review.confirmPassword'),
              },
            }"
            type="password"
            :disabled="busy"
            :maxlength="255"
            autocomplete="new-password"
        /></TFormItem>
      </TForm>
      <TAlert
        v-if="error || incorrect"
        theme="error"
        :message="error || t('review.incorrectPassword')"
        role="alert"
      />
    </div>
  </TDialog>
</template>
<style scoped lang="scss">
.document-password {
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
