<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { computed } from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { WorkbookFileConfirmation } from "../useWorkbookFileActions";

const props = defineProps<{
  confirmation?: WorkbookFileConfirmation;
  busy: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useAppI18n();
const messages: Record<
  WorkbookFileConfirmation,
  { title: MessageKey; description: MessageKey; confirm: MessageKey }
> = {
  import: {
    title: "persistence.importTitle",
    description: "persistence.importDescription",
    confirm: "persistence.importConfirm",
  },
  reload: {
    title: "persistence.reloadTitle",
    description: "persistence.reloadDescription",
    confirm: "persistence.reloadConfirm",
  },
  reset: {
    title: "persistence.resetTitle",
    description: "persistence.resetDescription",
    confirm: "persistence.resetConfirm",
  },
};
const labels = computed(() => messages[props.confirmation ?? "reload"]);
</script>

<template>
  <Dialog
    :visible="confirmation !== undefined"
    :header="t(labels.title)"
    :body="t(labels.description)"
    :confirm-btn="{
      content: t(labels.confirm),
      theme: confirmation === 'reset' ? 'danger' : 'primary',
    }"
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
