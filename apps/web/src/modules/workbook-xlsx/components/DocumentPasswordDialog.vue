<script setup lang="ts">
import { ref } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ mode: "encrypt" | "decrypt"; busy: boolean; incorrect?: boolean }>();
const emit = defineEmits<{ close: []; submit: [password: string] }>();
const { t } = useAppI18n();
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
      content: t(mode === 'encrypt' ? 'review.encryptAndDownload' : 'review.openDocument'),
      loading: busy,
    }"
    :cancel-btn="{ content: t('review.cancel'), disabled: busy }"
    :close-btn="!busy"
    :close-on-esc-keydown="!busy"
    :close-on-overlay-click="false"
    width="460px"
    @confirm="submit"
    @close="!busy && emit('close')"
  >
    <p>{{ t(mode === "encrypt" ? "review.encryptionHint" : "review.decryptionHint") }}</p>
    <TForm label-align="top" @submit.prevent="submit">
      <TFormItem :label="t('review.password')"
        ><TInput
          v-model="password"
          type="password"
          :disabled="busy"
          :maxlength="255"
          :autocomplete="mode === 'encrypt' ? 'new-password' : 'current-password'"
      /></TFormItem>
      <TFormItem v-if="mode === 'encrypt'" :label="t('review.confirmPassword')"
        ><TInput
          v-model="confirmation"
          type="password"
          :disabled="busy"
          :maxlength="255"
          autocomplete="new-password"
      /></TFormItem>
    </TForm>
    <p v-if="error || incorrect" role="alert">{{ error || t("review.incorrectPassword") }}</p>
  </TDialog>
</template>
