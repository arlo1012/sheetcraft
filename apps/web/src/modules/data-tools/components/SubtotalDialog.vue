<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolColumn, SubtotalDraft } from "../data-tools-types";
const props = defineProps<{
  visible: boolean;
  columns: readonly DataToolColumn[];
  hasSubtotals?: boolean;
}>();
const emit = defineEmits<{ close: []; apply: [draft: SubtotalDraft]; removeAll: [] }>();
const { t } = useAppI18n();
function createDraft(): SubtotalDraft {
  return {
    groupColumn: props.columns[0]?.column ?? 0,
    function: "sum",
    valueColumns: props.columns.slice(1).map((column) => column.column),
    replaceExisting: true,
    pageBreaks: false,
    summaryBelow: true,
  };
}
const draft = ref<SubtotalDraft>(createDraft());
const columns = computed(() =>
  props.columns.map((column) => ({
    label: column.header ? `${column.label} (${column.header})` : column.label,
    value: column.column,
  })),
);
const functions = computed(() => [
  { label: t("dataTools.outline.sum"), value: "sum" },
  { label: t("dataTools.outline.count"), value: "count" },
  { label: t("dataTools.outline.average"), value: "average" },
  { label: t("dataTools.outline.maximum"), value: "max" },
  { label: t("dataTools.outline.minimum"), value: "min" },
  { label: t("dataTools.outline.product"), value: "product" },
]);
watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = createDraft();
  },
);
function toggle(column: number, checked: boolean): void {
  draft.value.valueColumns = checked
    ? [...new Set([...draft.value.valueColumns, column])]
    : draft.value.valueColumns.filter((item) => item !== column);
}
function apply(): void {
  if (!draft.value.valueColumns.length) return;
  emit("apply", { ...draft.value, valueColumns: [...draft.value.valueColumns] });
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.outline.subtotalTitle')"
    :visible="visible"
    :header="t('dataTools.outline.subtotalTitle')"
    width="min(480px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <template #footer>
      <TButton v-if="hasSubtotals" variant="text" @click="emit('removeAll')">{{
        t("dataTools.outline.removeAll")
      }}</TButton>
      <span class="subtotal-dialog__space" />
      <TButton variant="outline" @click="emit('close')">{{ t("dataTools.common.cancel") }}</TButton>
      <TButton theme="primary" :disabled="draft.valueColumns.length === 0" @click="apply">{{
        t("dataTools.outline.confirm")
      }}</TButton>
    </template>
    <div class="subtotal-dialog">
      <div class="subtotal-dialog__field">
        <span>{{ t("dataTools.outline.groupBy") }}</span>
        <TSelect
          v-model="draft.groupColumn"
          :aria-label="t('dataTools.outline.groupBy')"
          :options="columns"
        />
      </div>
      <div class="subtotal-dialog__field">
        <span>{{ t("dataTools.outline.useFunction") }}</span>
        <TSelect
          v-model="draft.function"
          :aria-label="t('dataTools.outline.useFunction')"
          :options="functions"
        />
      </div>
      <div class="subtotal-dialog__field subtotal-dialog__summaries">
        <span>{{ t("dataTools.outline.addSubtotalTo") }}</span>
        <div
          class="subtotal-dialog__columns"
          role="group"
          :aria-label="t('dataTools.outline.addSubtotalTo')"
        >
          <TCheckbox
            v-for="column in columns"
            :key="column.value"
            :checked="draft.valueColumns.includes(column.value)"
            @change="toggle(column.value, Boolean($event))"
            >{{ column.label }}</TCheckbox
          >
        </div>
      </div>
      <div class="subtotal-dialog__field">
        <div class="subtotal-dialog__options">
          <TCheckbox v-model="draft.replaceExisting">{{
            t("dataTools.outline.replace")
          }}</TCheckbox>
          <TCheckbox v-model="draft.pageBreaks">{{ t("dataTools.outline.pageBreaks") }}</TCheckbox>
          <TCheckbox v-model="draft.summaryBelow">{{
            t("dataTools.outline.summaryBelow")
          }}</TCheckbox>
        </div>
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.subtotal-dialog {
  display: grid;
  gap: var(--idea-space-2);
  &__field {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: var(--idea-space-2);
    align-items: center;
    > span {
      text-align: right;
    }
  }
  &__summaries {
    align-items: start;
  }
  &__columns {
    display: grid;
    gap: var(--idea-space-1);
    max-height: 180px;
    overflow: auto;
  }
  &__options {
    grid-column: 2;
    display: grid;
    gap: var(--idea-space-1);
    margin-top: var(--idea-space-1);
  }
  &__space {
    flex: 1;
  }
}
</style>
