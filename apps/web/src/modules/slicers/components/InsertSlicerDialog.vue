<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Checkbox, CheckboxGroup } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  fields: readonly { id: string; name: string }[];
  tables?: readonly { id: string; name: string }[];
  tableId?: string;
}>();
const emit = defineEmits<{
  confirm: [ids: string[], tableId?: string];
  selectTable: [tableId: string];
  close: [];
}>();
const { t } = useAppI18n();
const selected = ref<string[]>([]);

watch(
  () => props.tableId,
  () => {
    selected.value = [];
  },
);

const tableOptions = computed(() =>
  (props.tables ?? []).map((table) => ({ label: table.name, value: table.id })),
);
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('tables.insertSlicer')"
    :header="t('tables.insertSlicer')"
    visible
    width="min(320px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('tables.confirm'), disabled: !selected.length }"
    :cancel-btn="t('tables.cancel')"
    @close="emit('close')"
    @confirm="emit('confirm', selected, tableId)"
  >
    <div class="slicer-dialog">
      <Form v-if="tableOptions.length > 1" label-align="right" label-width="76px">
        <FormItem :label="t('tables.slicerTable')">
          <Select
            size="small"
            :value="tableId"
            :options="tableOptions"
            data-slicer-table-select
            @change="emit('selectTable', String($event))"
          />
        </FormItem>
      </Form>
      <CheckboxGroup v-model="selected" class="slicer-fields">
        <Checkbox v-for="field in fields" :key="field.id" :value="field.id">{{
          field.name
        }}</Checkbox>
      </CheckboxGroup>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.slicer-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slicer-fields {
  display: grid;
  gap: 6px;
  max-height: min(50vh, 320px);
  overflow: auto;
  padding: 4px;
}
</style>
