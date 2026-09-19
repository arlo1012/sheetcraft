<script setup lang="ts">
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  visible: boolean;
  enabled: boolean;
  ignoredCount: number;
}>();
const emit = defineEmits<{
  close: [];
  "update:enabled": [enabled: boolean];
  resetIgnored: [];
}>();
const { t } = useAppI18n();

function updateEnabled(enabled: boolean): void {
  emit("update:enabled", enabled);
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    width="min(460px, calc(100vw - 32px))"
    :visible="visible"
    :header="t('dataTools.duplicates.errorChecks.title')"
    :aria-label="t('dataTools.duplicates.errorChecks.title')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <div class="duplicate-error-check-options-dialog">
      <TCheckbox :checked="enabled" @change="updateEnabled(Boolean($event))">
        {{ t("dataTools.duplicates.errorChecks.enabled") }}
      </TCheckbox>
      <p>{{ t("dataTools.duplicates.errorChecks.enabledHint") }}</p>
      <TButton
        variant="outline"
        :disabled="ignoredCount === 0"
        :title="
          ignoredCount === 0 ? t('dataTools.duplicates.errorChecks.resetIgnoredHint') : undefined
        "
        data-duplicate-error-reset-ignored
        @click="emit('resetIgnored')"
      >
        {{ t("dataTools.duplicates.errorChecks.resetIgnored", { count: ignoredCount }) }}
      </TButton>
    </div>
    <template #footer>
      <TButton theme="primary" @click="emit('close')">
        {{ t("dataTools.duplicates.errorChecks.confirm") }}
      </TButton>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.duplicate-error-check-options-dialog {
  display: grid;
  gap: var(--idea-space-3);

  p {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-medium);
  }
}
</style>
