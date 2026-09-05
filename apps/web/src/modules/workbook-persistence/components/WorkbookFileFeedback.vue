<script setup lang="ts">
import { computed } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { WorkbookPersistenceError } from "../useWorkbookPersistence";
import type { WorkbookFileConfirmation, WorkbookFileFeedback } from "../useWorkbookFileActions";

const props = defineProps<{
  error?: WorkbookPersistenceError;
  feedback?: WorkbookFileFeedback;
  confirmation?: WorkbookFileConfirmation;
  busy: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useAppI18n();
const errorKeys: Record<WorkbookPersistenceError, MessageKey> = {
  unavailable: "persistence.unavailable",
  "invalid-record": "persistence.invalidSnapshot",
  "invalid-snapshot": "persistence.invalidSnapshot",
  conflict: "persistence.conflict",
  quota: "persistence.quota",
};
const notice = computed(() => {
  if (props.feedback?.error) return props.feedback;
  if (props.error) return { key: errorKeys[props.error], error: true };
  return props.feedback;
});
</script>

<template>
  <p
    v-if="notice"
    class="workbook-file-feedback"
    :class="{ 'workbook-file-feedback--error': notice.error }"
    :role="notice.error ? 'alert' : 'status'"
    data-workbook-file="feedback"
  >
    {{ t(notice.key) }}
  </p>
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

<style scoped lang="scss">
.workbook-file-feedback {
  padding: 6px 12px;
  margin: 0;
  color: var(--idea-text-secondary);
  font-size: 12px;
  line-height: 18px;
  background: var(--idea-surface-secondary);
  border-bottom: 1px solid var(--idea-border-subtle);

  &--error {
    color: var(--idea-status-error);
  }
}
</style>
