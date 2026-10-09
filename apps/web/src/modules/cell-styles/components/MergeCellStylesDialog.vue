<script setup lang="ts">
import { computed, ref } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import type { CellStyleDefinition } from "@sheetcraft/core/cell-styles";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  styles: readonly CellStyleDefinition[];
  loading?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  selectFile: [file: File];
  confirm: [value: { styles: CellStyleDefinition[]; replaceExisting: boolean }];
  cancel: [];
}>();
const { t } = useAppI18n();
const input = ref<HTMLInputElement>();
const replaceExisting = ref(false);
const fileSelected = ref(false);
const hasStyles = computed(() => props.styles.length > 0);

function chooseFile(): void {
  if (!props.loading) input.value?.click();
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (file) {
    fileSelected.value = true;
    emit("selectFile", file);
  }
}

function confirm(): void {
  if (!hasStyles.value || props.loading) return;
  emit("confirm", { styles: [...props.styles], replaceExisting: replaceExisting.value });
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('cellStyles.merge.title')"
    :visible="true"
    :header="t('cellStyles.merge.title')"
    :confirm-btn="{
      content: t('cellStyles.merge.confirm'),
      disabled: !hasStyles || loading,
      loading,
    }"
    :cancel-btn="t('cellStyles.merge.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(480px, calc(100vw - 32px))"
    placement="center"
    class="merge-cell-styles-dialog"
    @confirm="confirm"
    @close="emit('cancel')"
  >
    <div class="merge-cell-styles-dialog__content">
      <input
        ref="input"
        type="file"
        accept=".json,application/json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        tabindex="-1"
        :aria-label="t('cellStyles.merge.importFile')"
        data-cell-styles-merge-file
        @change="onFileChange"
      />
      <p class="merge-cell-styles-dialog__hint">{{ t("cellStyles.merge.importHint") }}</p>
      <TButton :loading="loading" data-cell-styles-merge-choose @click="chooseFile">
        {{ t("cellStyles.merge.importFile") }}
      </TButton>
      <p v-if="hasStyles" class="merge-cell-styles-dialog__count" aria-live="polite">
        {{ t("cellStyles.merge.importedStyles", { count: styles.length }) }}
      </p>
      <p v-else-if="fileSelected" class="merge-cell-styles-dialog__empty" aria-live="polite">
        {{ t("cellStyles.merge.empty") }}
      </p>
      <TCheckbox v-model="replaceExisting" :disabled="!hasStyles || loading">
        {{ t("cellStyles.merge.replaceExisting") }}
      </TCheckbox>
      <p v-if="error" class="merge-cell-styles-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.merge-cell-styles-dialog {
  &__content {
    display: grid;
    gap: 12px;
  }

  &__hint,
  &__count,
  &__empty,
  &__error {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-medium);
  }

  &__hint,
  &__empty {
    color: var(--sheetcraft-text-secondary);
  }

  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
