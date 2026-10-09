<script setup lang="ts">
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { BaseTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import type { DataTableDraft, DataTablePreview } from "../data-table-types";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: DataTableDraft;
    busy?: boolean;
    error?: string;
    suspended?: boolean;
    selectReference?: (
      current: string,
      options?: RangeReferenceSelectionOptions,
    ) => Promise<string | undefined>;
    result?: DataTablePreview;
  }>(),
  { busy: false, error: "", suspended: false, result: undefined, selectReference: undefined },
);

const emit = defineEmits<{
  close: [];
  solve: [draft: DataTableDraft];
  apply: [];
  draftChange: [draft: DataTableDraft];
}>();

const { t } = useAppI18n();
const draft = ref<DataTableDraft>({ ...props.initial });
const canSolve = computed(() =>
  Boolean(
    draft.value.range.trim() && (draft.value.rowInput.trim() || draft.value.columnInput.trim()),
  ),
);
const instructions = computed(() => {
  if (draft.value.rowInput.trim() && draft.value.columnInput.trim())
    return t("dataTable.instructionsBoth");
  if (draft.value.rowInput.trim()) return t("dataTable.instructionsRow");
  if (draft.value.columnInput.trim()) return t("dataTable.instructionsColumn");
  return t("dataTable.instructions");
});
const visibleRows = computed(() => props.result?.values.slice(0, 8) ?? []);
const previewRows = computed(() =>
  visibleRows.value.map((values, id) => ({
    id,
    ...Object.fromEntries(
      values.slice(0, 8).map((value, index) => [`c${index}`, displayValue(value)]),
    ),
  })),
);
const previewColumns = computed<BaseTableCol[]>(() =>
  Array.from(
    { length: Math.max(0, ...visibleRows.value.map((row) => Math.min(8, row.length))) },
    (_, index) => ({ colKey: `c${index}`, ellipsis: true }),
  ),
);
const hasHiddenPreviewValues = computed(() =>
  Boolean(
    props.result &&
    (props.result.rows > 8 ||
      props.result.columns > 8 ||
      props.result.values.length > 8 ||
      props.result.values.some((row) => row.length > 8)),
  ),
);
const confirmLabel = computed(() => (props.result ? t("dataTable.create") : t("dataTable.solve")));
const cancelLabel = computed(() => (props.result ? t("dataTable.close") : t("dataTable.cancel")));
const rangeReference = computed(() =>
  props.selectReference
    ? (current: string) => props.selectReference!(current, { singleCell: false })
    : undefined,
);
const cellReference = computed(() =>
  props.selectReference
    ? (current: string) => props.selectReference!(current, { singleCell: true })
    : undefined,
);

function copyDraft(value: DataTableDraft): DataTableDraft {
  return { ...value };
}

function displayValue(value: string | number | boolean | null): string {
  return value === null ? "" : String(value);
}

function confirm(): void {
  if (props.busy) return;
  if (props.result) {
    emit("apply");
    return;
  }
  if (canSolve.value) emit("solve", copyDraft(draft.value));
}

watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.suspended) draft.value = copyDraft(props.initial);
  },
);
watch(
  () => props.initial,
  (initial) => {
    if (props.visible && !props.suspended) draft.value = copyDraft(initial);
  },
  { deep: true },
);
watch(draft, (value) => emit("draftChange", copyDraft(value)), { deep: true });
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTable.title')"
    :visible="visible && !suspended"
    :header="t('dataTable.title')"
    width="min(600px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :close-btn="!busy"
    @close="emit('close')"
    @confirm="confirm"
  >
    <div class="data-table-dialog">
      <div class="data-table-dialog__field">
        <span>{{ t("dataTable.range") }}</span>
        <RangeReferenceInput
          v-model="draft.range"
          :disabled="busy"
          :label="t('dataTable.range')"
          :placeholder="t('dataTable.rangePlaceholder')"
          :pick-label="t('dataTable.selectRange')"
          :select-reference="rangeReference"
        />
      </div>

      <div class="data-table-dialog__inputs">
        <div class="data-table-dialog__field">
          <span>{{ t("dataTable.rowInput") }}</span>
          <RangeReferenceInput
            v-model="draft.rowInput"
            :disabled="busy"
            :label="t('dataTable.rowInput')"
            :placeholder="t('dataTable.inputPlaceholder')"
            :pick-label="t('dataTable.selectCell')"
            :select-reference="cellReference"
          />
        </div>
        <div class="data-table-dialog__field">
          <span>{{ t("dataTable.columnInput") }}</span>
          <RangeReferenceInput
            v-model="draft.columnInput"
            :disabled="busy"
            :label="t('dataTable.columnInput')"
            :placeholder="t('dataTable.inputPlaceholder')"
            :pick-label="t('dataTable.selectCell')"
            :select-reference="cellReference"
          />
        </div>
      </div>

      <p class="data-table-dialog__hint">{{ instructions }}</p>

      <section v-if="result" class="data-table-dialog__preview" aria-live="polite">
        <div class="data-table-dialog__preview-heading">
          <strong>{{ t("dataTable.preview") }}</strong>
          <span>{{
            t("dataTable.previewSize", { rows: result.rows, columns: result.columns })
          }}</span>
        </div>
        <div class="data-table-dialog__table-wrap">
          <TableHeightWrapper v-slot="{ height }">
            <BaseTable
              class="idea-table--mini"
              row-key="id"
              :data="previewRows"
              :columns="previewColumns"
              :height="height"
              :show-header="false"
              size="small"
              table-layout="fixed"
              bordered
            />
          </TableHeightWrapper>
        </div>
        <p v-if="hasHiddenPreviewValues">{{ t("dataTable.previewLimited") }}</p>
        <p>{{ t("dataTable.previewHelp") }}</p>
      </section>

      <p v-if="error" class="data-table-dialog__error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="data-table-dialog__footer">
        <p class="data-table-dialog__recalculation">{{ t("dataTable.recalculation") }}</p>
        <div class="data-table-dialog__footer-actions">
          <Button theme="default" @click="emit('close')">{{ cancelLabel }}</Button>
          <Button theme="primary" :disabled="busy || !canSolve" @click="confirm">{{
            confirmLabel
          }}</Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.data-table-dialog {
  display: grid;
  gap: var(--sheetcraft-space-3);

  &__inputs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sheetcraft-space-3);
  }

  &__field {
    display: grid;
    gap: var(--sheetcraft-space-1);
    min-width: 0;

    span {
      font-weight: 500;
    }
  }

  &__hint,
  &__recalculation,
  &__preview p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }

  &__hint {
    padding-top: var(--sheetcraft-space-1);
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  &__recalculation {
    flex: 1;
    text-align: left;
  }
  &__footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  &__preview {
    display: grid;
    gap: var(--sheetcraft-space-2);
    border-top: 1px solid var(--sheetcraft-border-subtle);
    padding-top: var(--sheetcraft-space-2);
  }

  &__preview-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sheetcraft-space-2);

    strong {
      font-weight: 600;
    }

    span {
      color: var(--sheetcraft-text-secondary);
      font-variant-numeric: tabular-nums;
    }
  }

  &__table-wrap {
    height: min(208px, calc(100dvh - 360px));
    min-height: 0;
  }

  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}

@media (max-width: 560px) {
  .data-table-dialog__inputs {
    grid-template-columns: 1fr;
  }
}
</style>
