<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox, CheckboxGroup } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";

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
const tableSelectId = `slicer-table-${useId()}`;
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
const allSelected = computed(
  () => props.fields.length > 0 && selected.value.length === props.fields.length,
);

function toggleAll(): void {
  selected.value = allSelected.value ? [] : props.fields.map((field) => field.id);
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('tables.insertSlicer')"
    :header="t('tables.insertSlicer')"
    visible
    width="min(340px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('tables.confirm'), disabled: !selected.length }"
    :cancel-btn="t('tables.cancel')"
    @close="emit('close')"
    @confirm="emit('confirm', selected, tableId)"
  >
    <div class="slicer-dialog">
      <Form v-if="tableOptions.length > 1" class="sheetcraft-form-grid" label-align="top">
        <FormItem :label="t('tables.slicerTable')">
          <Select
            v-native-control="{
              attributes: {
                id: tableSelectId,
                name: tableSelectId,
                'aria-label': t('tables.slicerTable'),
              },
            }"
            size="small"
            :value="tableId"
            :options="tableOptions"
            data-slicer-table-select
            @change="emit('selectTable', String($event))"
          />
        </FormItem>
      </Form>
      <div v-if="fields.length > 1" class="slicer-dialog__actions">
        <Button
          size="small"
          variant="text"
          theme="primary"
          data-slicer-toggle-all
          @click="toggleAll"
        >
          {{ allSelected ? t("contextMenu.selectNone") : t("contextMenu.selectAll") }}
        </Button>
      </div>
      <CheckboxGroup v-model="selected" class="slicer-fields">
        <Checkbox v-for="field in fields" :key="field.id" :value="field.id">{{
          field.name
        }}</Checkbox>
      </CheckboxGroup>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "../../../shared/option-list/option-list";

.slicer-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}

.slicer-fields {
  @include option-list.surface;
  display: grid;
  gap: 6px;
  max-height: min(50vh, 320px);
  padding: 10px 12px;
}
</style>
