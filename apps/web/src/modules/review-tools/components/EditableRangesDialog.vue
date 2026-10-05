<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { normalizeSheetProtection, type SheetProtection } from "@idea10/core";
import type { CellRange } from "@idea10/core/workbook";
import { formatCellAddress, parseCellAddress } from "@idea10/core/coordinates";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  visible: boolean;
  configuration: SheetProtection;
  selection: CellRange;
  error: string;
}>();
const emit = defineEmits<{ close: []; save: [value: SheetProtection] }>();
const { t } = useAppI18n();
const rows = ref<Array<{ id: number; name: string; reference: string }>>([]);
const validationError = ref("");
let nextId = 0;
function reference(range: CellRange): string {
  return `${formatCellAddress(range.start)}:${formatCellAddress(range.end)}`;
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      rows.value = props.configuration.editableRanges.map((entry) => ({
        id: nextId++,
        name: entry.name,
        reference: reference(entry.range),
      }));
      validationError.value = "";
    }
  },
  { immediate: true },
);
function add(): void {
  let index = 1;
  while (rows.value.some((entry) => entry.name.toLowerCase() === `range${index}`)) index++;
  rows.value.push({ id: nextId++, name: `Range${index}`, reference: reference(props.selection) });
}
function save(): void {
  try {
    const editableRanges = rows.value.map((entry) => {
      const parts = entry.reference.trim().replace(/^=/, "").replaceAll("$", "").split(":");
      const start = parseCellAddress(parts[0] ?? "");
      const end = parseCellAddress(parts[1] ?? parts[0] ?? "");
      if (parts.length > 2 || !start || !end) throw new Error();
      return { name: entry.name, range: { start, end } };
    });
    emit("save", normalizeSheetProtection({ ...props.configuration, editableRanges })!);
  } catch {
    validationError.value = t("review.invalidEditableRange");
  }
}
</script>
<template>
  <TDialog
    :visible="visible"
    :header="t('review.editableRanges')"
    :confirm-btn="t('review.save')"
    :cancel-btn="t('review.cancel')"
    :close-on-overlay-click="false"
    width="580px"
    @confirm="save"
    @close="emit('close')"
  >
    <p>{{ t("review.editableRangesHint") }}</p>
    <TForm label-align="right" label-width="90px" class="editable-ranges">
      <div v-for="row in rows" :key="row.id" class="editable-ranges__entry">
        <TFormItem :label="t('review.rangeName')"><TInput v-model="row.name" /></TFormItem>
        <TFormItem :label="t('review.rangeReference')">
          <RangeReferenceInput
            v-model="row.reference"
            :show-picker="false"
            :label="t('review.rangeReference')"
          />
          <TButton
            variant="text"
            theme="danger"
            @click="rows = rows.filter((entry) => entry.id !== row.id)"
            >{{ t("review.removeRange") }}</TButton
          >
        </TFormItem>
      </div>
    </TForm>
    <TButton variant="outline" @click="add">{{ t("review.addRange") }}</TButton>
    <p v-if="validationError || error" role="alert">{{ validationError || error }}</p>
  </TDialog>
</template>
<style scoped lang="scss">
.editable-ranges {
  max-height: 360px;
  overflow: auto;
  &__entry {
    margin-bottom: 16px;
  }
}
</style>
