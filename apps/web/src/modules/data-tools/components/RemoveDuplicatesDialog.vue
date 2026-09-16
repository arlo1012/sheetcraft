<script setup lang="ts">
import { ref, watch } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import type { DataToolColumn, RemoveDuplicatesDraft } from "../data-tools-types";
const props = defineProps<{
  visible: boolean;
  columns: readonly DataToolColumn[];
  removalCount?: number;
}>();
const emit = defineEmits<{
  close: [];
  apply: [draft: RemoveDuplicatesDraft];
  draftChange: [draft: RemoveDuplicatesDraft];
}>();
const { t } = useAppI18n();
const draft = ref<RemoveDuplicatesDraft>({ hasHeader: true, columns: [] });
watch(
  () => props.visible,
  (visible) => {
    if (visible)
      draft.value = { hasHeader: true, columns: props.columns.map((column) => column.column) };
  },
);
watch(draft, (value) => emit("draftChange", { ...value, columns: [...value.columns] }), {
  deep: true,
});
function toggle(column: number, checked: boolean): void {
  draft.value.columns = checked
    ? [...draft.value.columns, column]
    : draft.value.columns.filter((item) => item !== column);
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataTools.removeDuplicates.title')"
    :visible="visible"
    :header="t('dataTools.removeDuplicates.title')"
    :confirm-btn="{
      content: t('dataTools.removeDuplicates.confirm'),
      disabled: draft.columns.length === 0,
    }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="emit('apply', draft)"
    ><div class="remove-duplicates-dialog">
      <label
        ><TCheckbox v-model="draft.hasHeader" />{{ t("dataTools.removeDuplicates.header") }}</label
      ><strong>{{ t("dataTools.removeDuplicates.columns") }}</strong
      ><label v-for="column in columns" :key="column.column"
        ><TCheckbox
          :checked="draft.columns.includes(column.column)"
          @change="toggle(column.column, Boolean($event))"
        />{{ column.header ? `${column.label} (${column.header})` : column.label }}</label
      >
      <p v-if="removalCount !== undefined">
        {{ t("dataTools.removeDuplicates.removed", { count: removalCount }) }}
      </p>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.remove-duplicates-dialog {
  display: grid;
  gap: var(--idea-space-2);
  min-width: min(360px, calc(100vw - 64px));
  label {
    display: flex;
    align-items: center;
    gap: var(--idea-space-2);
  }
}
</style>
