<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../i18n";

defineProps<{ reference: string; editSessionId?: string; title?: string; hint?: string }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useAppI18n();
</script>

<template>
  <Dialog
    visible
    mode="modeless"
    draggable
    :header="title ?? t('formulaTools.selectRange')"
    :confirm-btn="t('formulaTools.confirmRange')"
    :cancel-btn="t('formulaTools.cancel')"
    :confirm-on-enter="false"
    :close-on-esc-keydown="true"
    :prevent-scroll-through="false"
    :show-overlay="false"
    dialog-class-name="range-reference-picker-dialog"
    width="min(460px, calc(100vw - 32px))"
    :data-cell-edit-session="editSessionId"
    @confirm="emit('confirm')"
    @close="emit('cancel')"
  >
    <div
      class="range-reference-picker"
      :data-cell-edit-session="editSessionId"
      @keydown.enter.stop.prevent="emit('confirm')"
      @keydown.esc.stop.prevent="emit('cancel')"
    >
      <TInput :value="reference" readonly :aria-label="t('formulaTools.reference')" />
      <p v-if="hint" class="range-reference-picker__hint">{{ hint }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.range-reference-picker {
  &__hint {
    margin: var(--sheetcraft-space-2) 0 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
  }
}
</style>
