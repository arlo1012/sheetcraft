<script setup lang="ts">
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
defineProps<{ visible: boolean; protected: boolean; error: string }>();
const emit = defineEmits<{ close: []; save: [] }>();
const { t } = useAppI18n();
</script>
<template>
  <TDialog
    :visible="visible"
    :header="t(protected ? 'review.unprotectWorkbook' : 'review.protectWorkbook')"
    :confirm-btn="t(protected ? 'review.unprotectWorkbook' : 'review.protectWorkbook')"
    :cancel-btn="t('review.cancel')"
    width="420px"
    @confirm="emit('save')"
    @close="emit('close')"
  >
    <p>{{ t(protected ? "review.unprotectWorkbookHint" : "review.workbookProtectionHint") }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </TDialog>
</template>
