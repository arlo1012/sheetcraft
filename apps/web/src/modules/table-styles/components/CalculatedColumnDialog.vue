<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  initial: string;
  tableName: string;
  columnName: string;
  rangeLabel: string;
  anchorLabel: string;
  error?: string;
}>();
const emit = defineEmits<{ confirm: [source: string]; cancel: [] }>();
const { t } = useAppI18n();
const source = ref(props.initial);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    visible
    :header="t('tables.calculatedColumn')"
    :aria-label="t('tables.calculatedColumn')"
    width="min(480px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('tables.applyColumn'), disabled: !source.trim().startsWith('=') }"
    :cancel-btn="t('tables.cancel')"
    @confirm="emit('confirm', source)"
    @close="emit('cancel')"
  >
    <div class="calculated-column-dialog">
      <p>
        {{
          t("tables.calculatedOverwriteHint", {
            table: tableName,
            column: columnName,
            range: rangeLabel,
          })
        }}
      </p>
      <p>{{ t("tables.calculatedAnchorHint", { address: anchorLabel }) }}</p>
      <label>
        <span>{{ t("tables.calculatedFormula") }}</span>
        <Textarea
          v-model="source"
          v-native-control="{
            attributes: {
              'aria-label': t('tables.calculatedFormula'),
              'data-calculated-column-formula': '',
              spellcheck: false,
            },
          }"
          :autosize="{ minRows: 2, maxRows: 5 }"
        />
      </label>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.calculated-column-dialog {
  display: grid;
  gap: var(--sheetcraft-space-3);
  p {
    margin: 0;
  }
  label {
    display: grid;
    gap: var(--sheetcraft-space-2);
  }
  [role="alert"] {
    color: var(--sheetcraft-status-error);
  }
}
</style>
