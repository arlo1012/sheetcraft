<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { ref } from "vue";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellRange } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  operation: "insert" | "delete";
  range: CellRange;
  disabled: boolean;
}>();
const emit = defineEmits<{
  confirm: [direction: "right" | "down" | "left" | "up" | "row" | "column"];
  close: [];
}>();
const { t } = useAppI18n();
const direction = ref<"right" | "down" | "left" | "up" | "row" | "column">(
  props.range.end.column - props.range.start.column === MAX_SHEET_COLUMNS - 1
    ? "row"
    : props.range.end.row - props.range.start.row === MAX_SHEET_ROWS - 1
      ? "column"
      : props.operation === "insert"
        ? "down"
        : "up",
);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t(operation === 'insert' ? 'axisMenu.insertCells' : 'axisMenu.deleteCells')"
    :visible="true"
    :header="t(operation === 'insert' ? 'axisMenu.insertCells' : 'axisMenu.deleteCells')"
    :confirm-btn="{ content: t('cellFormat.confirm'), disabled }"
    :cancel-btn="t('cellFormat.cancel')"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    :confirm-on-enter="true"
    width="min(340px, calc(100vw - 32px))"
    placement="center"
    @confirm="!disabled && emit('confirm', direction)"
    @close="emit('close')"
  >
    <TRadioGroup v-model="direction" class="cell-operation-dialog__options" :disabled="disabled">
      <TRadio :value="operation === 'insert' ? 'right' : 'left'">
        {{ t(operation === "insert" ? "axisMenu.shiftRight" : "axisMenu.shiftLeft") }}
      </TRadio>
      <TRadio :value="operation === 'insert' ? 'down' : 'up'">
        {{ t(operation === "insert" ? "axisMenu.shiftDown" : "axisMenu.shiftUp") }}
      </TRadio>
      <TRadio value="row">{{ t("axisMenu.entireRow") }}</TRadio>
      <TRadio value="column">{{ t("axisMenu.entireColumn") }}</TRadio>
    </TRadioGroup>
  </Dialog>
</template>

<style scoped lang="scss">
.cell-operation-dialog__options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
</style>
