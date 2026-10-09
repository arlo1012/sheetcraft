<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Button } from "tdesign-vue-next/es/button";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { TableSettingsDraft } from "../table-ui-types";

const props = defineProps<{
  initial: TableSettingsDraft;
  error?: string;
  suspended?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  confirm: [draft: TableSettingsDraft];
  convert: [];
  cancel: [];
}>();
const { t } = useAppI18n();
const draft = ref({ ...props.initial });
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :visible="!suspended"
    :header="t('tables.settings')"
    :aria-label="t('tables.settings')"
    width="min(480px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{
      content: t('tables.confirm'),
      disabled: !draft.name.trim() || !draft.range.trim(),
    }"
    :cancel-btn="t('tables.cancel')"
    @confirm="emit('confirm', { ...draft })"
    @close="emit('cancel')"
  >
    <div class="table-settings-dialog">
      <div class="table-settings-dialog__field">
        <span>{{ t("tables.name") }}</span>
        <Input v-model="draft.name" :aria-label="t('tables.name')" />
      </div>
      <div class="table-settings-dialog__field">
        <span>{{ t("tables.range") }}</span>
        <RangeReferenceInput
          v-model="draft.range"
          :label="t('tables.range')"
          :pick-label="t('tables.selectRange')"
          :show-picker="true"
          :select-reference="selectReference"
        />
      </div>
      <section class="table-settings-dialog__options" :aria-label="t('tables.styleOptions')">
        <Checkbox v-model="draft.headerRow">{{ t("tables.headerRow") }}</Checkbox>
        <Checkbox v-model="draft.totalRow">{{ t("tables.totalRow") }}</Checkbox>
        <Checkbox v-model="draft.firstColumn">{{ t("tables.firstColumn") }}</Checkbox>
        <Checkbox v-model="draft.lastColumn">{{ t("tables.lastColumn") }}</Checkbox>
        <Checkbox v-model="draft.bandedRows">{{ t("tables.bandedRows") }}</Checkbox>
        <Checkbox v-model="draft.bandedColumns">{{ t("tables.bandedColumns") }}</Checkbox>
        <Checkbox v-model="draft.filterButton" :disabled="!draft.headerRow">{{
          t("tables.filterButton")
        }}</Checkbox>
      </section>
      <p>{{ t("tables.structuredHint", { name: draft.name }) }}</p>
      <div class="table-settings-dialog__convert">
        <Button variant="outline" @click="emit('convert')">{{ t("tables.convertToRange") }}</Button>
        <p>{{ t("tables.convertHint") }}</p>
      </div>
      <p v-if="error" class="table-settings-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.table-settings-dialog {
  display: grid;
  gap: var(--sheetcraft-space-3);

  &__field {
    display: grid;
    gap: var(--sheetcraft-space-1);
  }
  &__options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sheetcraft-space-2);
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__convert {
    display: grid;
    justify-items: start;
    gap: var(--sheetcraft-space-2);
    padding-top: var(--sheetcraft-space-3);
    border-top: 1px solid var(--sheetcraft-border-subtle);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
