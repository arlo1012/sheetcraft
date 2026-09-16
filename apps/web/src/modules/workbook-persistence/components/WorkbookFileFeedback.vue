<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import type { WorkbookFileConfirmation } from "../useWorkbookFileActions";

defineProps<{
  confirmation?: WorkbookFileConfirmation;
  busy: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useAppI18n();
</script>

<template>
  <Dialog
    :visible="confirmation !== undefined"
    :header="t(confirmation === 'import' ? 'persistence.importTitle' : 'persistence.reloadTitle')"
    :body="
      t(
        confirmation === 'import'
          ? 'persistence.importDescription'
          : 'persistence.reloadDescription',
      )
    "
    :confirm-btn="
      t(confirmation === 'import' ? 'persistence.importConfirm' : 'persistence.reloadConfirm')
    "
    :cancel-btn="{ content: t('persistence.cancel'), disabled: busy }"
    :confirm-loading="busy"
    :close-btn="false"
    :close-on-esc-keydown="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    theme="warning"
    @confirm="emit('confirm')"
    @close="emit('cancel')"
  />
</template>
