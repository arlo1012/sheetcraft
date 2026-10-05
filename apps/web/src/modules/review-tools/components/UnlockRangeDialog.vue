<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ visible: boolean; rangeName: string; error: string }>();
const emit = defineEmits<{ close: []; unlock: [password: string] }>();
const password = ref("");
const { t } = useAppI18n();
watch(
  () => props.visible,
  () => (password.value = ""),
);
</script>
<template>
  <TDialog
    :visible="visible"
    :header="t('review.unlockRange')"
    :confirm-btn="t('review.unlockRange')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="420px"
    @confirm="emit('unlock', password)"
    @close="emit('close')"
  >
    <p>{{ rangeName }}</p>
    <TForm label-align="top"
      ><TFormItem :label="t('review.password')"
        ><TInput
          v-model="password"
          type="password"
          :maxlength="255"
          autocomplete="current-password" /></TFormItem
    ></TForm>
    <p v-if="error" role="alert">{{ error }}</p>
  </TDialog>
</template>
