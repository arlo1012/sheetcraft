<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import type { DataValidationFeedback } from "../useDataValidationInput";

defineProps<{ feedback: DataValidationFeedback }>();
const emit = defineEmits<{ retry: []; accept: []; cancel: [] }>();
const { t } = useAppI18n();
</script>

<template>
  <Dialog
    visible
    role="alertdialog"
    aria-modal="true"
    :aria-label="feedback.title || t('dataTools.validation.title')"
    :header="feedback.title || t('dataTools.validation.title')"
    :body="feedback.message || t('dataTools.validation.invalidValue')"
    :theme="
      feedback.style === 'stop' ? 'danger' : feedback.style === 'warning' ? 'warning' : 'info'
    "
    :confirm-btn="
      t(feedback.style === 'stop' ? 'dataTools.validation.retry' : 'dataTools.validation.keepValue')
    "
    :cancel-btn="t('dataTools.validation.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(420px, calc(100vw - 32px))"
    placement="center"
    @confirm="feedback.style === 'stop' ? emit('retry') : emit('accept')"
    @close="emit('cancel')"
  />
</template>
