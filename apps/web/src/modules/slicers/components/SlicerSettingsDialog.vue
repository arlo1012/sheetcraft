<script setup lang="ts">
import { ref, watch } from "vue";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import type { SheetSlicerDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  MAX_TABLE_SLICER_COLUMNS,
  type TableSlicerSortOrder,
  type TableSlicerState,
} from "@sheetcraft/core/table-slicers";
import { useAppI18n } from "../../../shared/i18n";
import type { TableSlicerOptionsPatch } from "../useTableSlicers";

const props = defineProps<{
  drawing: SheetSlicerDrawing;
  state?: TableSlicerState;
}>();

const emit = defineEmits<{
  confirm: [patch: TableSlicerOptionsPatch];
  close: [];
}>();

const { t } = useAppI18n();
const caption = ref(props.drawing.slicer.caption ?? "");
const showHeader = ref(props.drawing.slicer.showHeader !== false);
const columns = ref(props.drawing.slicer.columns ?? 1);
const sortOrder = ref<TableSlicerSortOrder>(props.drawing.slicer.sortOrder ?? "asc");
const hideNoData = ref(props.drawing.slicer.hideNoData === true);

watch(
  () => props.drawing.id,
  () => {
    caption.value = props.drawing.slicer.caption ?? "";
    showHeader.value = props.drawing.slicer.showHeader !== false;
    columns.value = props.drawing.slicer.columns ?? 1;
    sortOrder.value = props.drawing.slicer.sortOrder ?? "asc";
    hideNoData.value = props.drawing.slicer.hideNoData === true;
  },
);

function onConfirm(): void {
  const trimmed = caption.value.trim();
  const fieldName = props.state?.fieldName ?? props.drawing.name;
  const clampedColumns = Math.max(
    1,
    Math.min(MAX_TABLE_SLICER_COLUMNS, Math.round(Number(columns.value) || 1)),
  );
  emit("confirm", {
    caption: !trimmed || trimmed === fieldName ? undefined : trimmed,
    showHeader: showHeader.value,
    columns: clampedColumns,
    sortOrder: sortOrder.value,
    hideNoData: hideNoData.value,
  });
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('tables.slicerSettings')"
    :header="t('tables.slicerSettings')"
    visible
    width="min(420px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="t('tables.confirm')"
    :cancel-btn="t('tables.cancel')"
    @close="emit('close')"
    @confirm="onConfirm"
  >
    <Form label-align="right" label-width="96px">
      <FormItem :label="t('tables.slicerCaption')">
        <Input
          v-model="caption"
          size="small"
          clearable
          :placeholder="state?.fieldName ?? t('tables.slicerCaptionPlaceholder')"
          data-slicer-settings-caption
        />
      </FormItem>
      <FormItem :label="t('tables.slicerColumns')">
        <InputNumber
          v-model="columns"
          theme="column"
          size="small"
          class="sheetcraft-input-number--persistent-controls slicer-settings__columns"
          :min="1"
          :max="MAX_TABLE_SLICER_COLUMNS"
          :step="1"
          :decimal-places="0"
          data-slicer-settings-columns
        />
      </FormItem>
      <FormItem :label="t('tables.slicerSortOrder')">
        <RadioGroup v-model="sortOrder" data-slicer-settings-sort>
          <Radio value="asc">{{ t("tables.slicerSortAsc") }}</Radio>
          <Radio value="desc">{{ t("tables.slicerSortDesc") }}</Radio>
        </RadioGroup>
      </FormItem>
      <FormItem :label="t('tables.slicerOptions')">
        <div class="slicer-settings__checks">
          <Checkbox v-model="showHeader" data-slicer-settings-header>{{
            t("tables.slicerShowHeader")
          }}</Checkbox>
          <Checkbox v-model="hideNoData" data-slicer-settings-hide-nodata>{{
            t("tables.slicerHideNoData")
          }}</Checkbox>
        </div>
      </FormItem>
    </Form>
  </Dialog>
</template>

<style scoped lang="scss">
.slicer-settings {
  &__columns {
    width: 112px;
  }

  &__checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
