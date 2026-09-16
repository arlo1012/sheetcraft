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
const draft = ref<SubtotalDraft>({ groupColumn: 0, function: "sum", valueColumns: [] });
const columns = computed(() =>
  props.columns.map((column) => ({
    label: column.header ? `${column.label} (${column.header})` : column.label,
    value: column.column,
  })),
);
watch(
  () => props.visible,
  (visible) => {
    if (visible)
      draft.value = {
        groupColumn: props.columns[0]?.column ?? 0,
        function: "sum",
        valueColumns: props.columns.slice(1).map((column) => column.column),
      };
  },
);
function toggle(column: number, checked: boolean): void {
  draft.value.valueColumns = checked
    ? [...draft.value.valueColumns, column]
    : draft.value.valueColumns.filter((item) => item !== column);
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.outline.subtotalTitle')"
    :visible="visible"
    :header="t('dataTools.outline.subtotalTitle')"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    ><template #footer
      ><TButton v-if="hasSubtotals" variant="text" @click="emit('removeAll')">{{
        t("dataTools.outline.removeAll")
      }}</TButton
      ><span class="subtotal-dialog__space" /><TButton variant="outline" @click="emit('close')">{{
        t("dataTools.common.cancel")
      }}</TButton
      ><TButton
        theme="primary"
        :disabled="draft.valueColumns.length === 0"
        @click="emit('apply', draft)"
        >{{ t("dataTools.outline.confirm") }}</TButton
      ></template
    >
    <div class="subtotal-dialog">
      <label
        >{{ t("dataTools.outline.groupBy")
        }}<TSelect v-model="draft.groupColumn" :options="columns" /></label
      ><label
        >{{ t("dataTools.outline.useFunction")
        }}<TSelect
          v-model="draft.function"
          :options="[
            { label: t('dataTools.outline.count'), value: 'count' },
            { label: t('dataTools.outline.sum'), value: 'sum' },
            { label: t('dataTools.outline.average'), value: 'average' },
            { label: t('dataTools.outline.maximum'), value: 'max' },
            { label: t('dataTools.outline.minimum'), value: 'min' },
          ]" /></label
      ><strong>{{ t("dataTools.outline.addSubtotalTo") }}</strong
      ><label v-for="column in props.columns" :key="column.column"
        ><TCheckbox
          :checked="draft.valueColumns.includes(column.column)"
          @change="toggle(column.column, Boolean($event))"
        />{{ column.header ? `${column.label} (${column.header})` : column.label }}</label
      >
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.subtotal-dialog {
  display: grid;
  gap: var(--idea-space-2);
  min-width: min(380px, calc(100vw - 64px));
  label {
    display: grid;
    gap: var(--idea-space-1);
  }
  &__space {
    flex: 1;
  }
}
</style>
