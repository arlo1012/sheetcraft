<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  initial: string;
  error?: string;
  suspended?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [range: string]; cancel: [] }>();
const { t } = useAppI18n();
const range = ref(props.initial);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :visible="!suspended"
    :header="t('tables.resize')"
    :aria-label="t('tables.resize')"
    width="min(380px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('tables.confirm'), disabled: !range.trim() }"
    :cancel-btn="t('tables.cancel')"
    @confirm="emit('confirm', range)"
    @close="emit('cancel')"
  >
    <div class="resize-table-dialog">
      <span>{{ t("tables.range") }}</span>
      <RangeReferenceInput
        v-model="range"
        :label="t('tables.range')"
        :pick-label="t('tables.selectRange')"
        :show-picker="true"
        :select-reference="selectReference"
      />
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.resize-table-dialog {
  display: grid;
  gap: var(--sheetcraft-space-2);

  p {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
