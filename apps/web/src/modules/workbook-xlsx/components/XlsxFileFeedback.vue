<script setup lang="ts">
import { computed } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import type { XlsxConfirmation, XlsxFeedback } from "../useWorkbookXlsxActions";

const props = defineProps<{
  busy: boolean;
  confirmation?: XlsxConfirmation;
  feedback?: XlsxFeedback;
}>();
const emit = defineEmits<{ confirm: []; cancel: []; dismiss: [] }>();
const { t } = useAppI18n();
const dialogContent = computed(() => {
  if (props.confirmation === "import") {
    return {
      kind: "confirmation" as const,
      theme: "warning" as const,
      header: t("xlsx.confirm.importTitle"),
      description: t("xlsx.confirm.importDescription"),
      confirm: t("xlsx.confirm.importConfirm"),
    };
  }
  if (props.feedback?.error) {
    return {
      kind: "error" as const,
      theme: "danger" as const,
      header: t("xlsx.feedback.errorTitle"),
      description: t(props.feedback.key),
      confirm: t("xlsx.confirm.close"),
    };
  }
  return undefined;
});

function confirm(): void {
  if (dialogContent.value?.kind === "error") emit("dismiss");
  else emit("confirm");
}

function close(): void {
  if (dialogContent.value?.kind === "error") emit("dismiss");
  else emit("cancel");
}
</script>

<template>
  <Dialog
    v-if="dialogContent"
    :key="dialogContent.kind"
    :visible="true"
    attach="body"
    :header="dialogContent.header"
    :footer="dialogContent.kind !== 'error'"
    :confirm-btn="dialogContent.confirm"
    :cancel-btn="
      dialogContent.kind === 'error' ? null : { content: t('xlsx.confirm.cancel'), disabled: busy }
    "
    :confirm-loading="busy"
    :close-btn="dialogContent.kind === 'error' && !busy"
    :close-on-esc-keydown="!busy"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :theme="dialogContent.theme"
    @confirm="confirm"
    @close="close"
  >
    <p
      class="xlsx-file-feedback__dialog-description"
      :data-xlsx-error="dialogContent.kind === 'error' ? '' : undefined"
    >
      {{ dialogContent.description }}
    </p>
  </Dialog>
</template>

<style scoped lang="scss">
.xlsx-file-feedback {
  &__dialog-description {
    margin: 0;
  }
}
</style>
