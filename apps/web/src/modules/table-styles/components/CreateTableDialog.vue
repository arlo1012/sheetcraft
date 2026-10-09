<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { CreateTableDraft } from "../table-ui-types";

const props = defineProps<{
  initial: CreateTableDraft;
  error?: string;
  suspended?: boolean;
  selectReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [draft: CreateTableDraft]; cancel: [] }>();
const { t } = useAppI18n();
const draft = ref({ ...props.initial });
const styleOnly = computed(() => draft.value.mode === "styleOnly");
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :visible="!suspended"
    :header="t('tables.applyStyle')"
    :aria-label="t('tables.applyStyle')"
    width="min(360px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('tables.confirm'), disabled: !draft.range.trim() }"
    :cancel-btn="t('tables.cancel')"
    @confirm="emit('confirm', { ...draft })"
    @close="emit('cancel')"
  >
    <div class="create-table-dialog">
      <div class="create-table-dialog__field">
        <span>{{ t("tables.sourceRange") }}</span>
        <RangeReferenceInput
          v-model="draft.range"
          :label="t('tables.sourceRange')"
          :pick-label="t('tables.selectRange')"
          :show-picker="true"
          :select-reference="selectReference"
        />
      </div>
      <RadioGroup
        v-model="draft.mode"
        class="create-table-dialog__modes"
        :aria-label="t('tables.applyStyle')"
      >
        <div class="create-table-dialog__mode">
          <Radio value="styleOnly">{{ t("tables.styleOnly") }}</Radio>
          <div
            class="create-table-dialog__header-rows"
            :class="{ 'is-disabled': !styleOnly }"
            role="group"
            :aria-label="t('tables.headerRows')"
          >
            <span>{{ t("tables.headerRows") }}</span>
            <InputNumber
              v-model="draft.headerRows"
              class="create-table-dialog__header-count idea-input-number--persistent-controls"
              theme="column"
              :aria-label="t('tables.headerRows')"
              :disabled="!styleOnly"
              :min="0"
              :decimal-places="0"
            />
          </div>
        </div>
        <div class="create-table-dialog__mode">
          <Radio value="table">{{ t("tables.convertAndApply") }}</Radio>
          <div class="create-table-dialog__table-options">
            <div>
              <Checkbox v-model="draft.hasHeaders" :disabled="styleOnly">{{
                t("tables.hasHeaders")
              }}</Checkbox>
            </div>
            <div>
              <Checkbox v-model="draft.filterButton" :disabled="styleOnly">{{
                t("tables.filterButton")
              }}</Checkbox>
            </div>
            <p v-if="!styleOnly && !draft.hasHeaders">{{ t("tables.generatedHeaders") }}</p>
          </div>
        </div>
      </RadioGroup>
      <p v-if="error" class="create-table-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.create-table-dialog {
  display: grid;
  gap: 12px;

  &__field {
    display: grid;
    gap: 4px;
  }
  &__modes,
  &__mode,
  &__table-options {
    display: grid;
    gap: 8px;
    justify-items: start;
    min-width: 0;
  }
  &__modes {
    gap: 12px;
  }
  &__header-rows {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-inline-start: 20px;

    &.is-disabled {
      color: var(--sheetcraft-text-disabled);
    }
  }
  &__header-count {
    width: 100px;
  }
  &__table-options {
    margin-inline-start: 20px;
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
