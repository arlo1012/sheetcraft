<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";

type OutlineAxis = "rows" | "columns";

const props = defineProps<{
  visible: boolean;
  ungroupRows: boolean;
  ungroupColumns: boolean;
}>();
const emit = defineEmits<{
  close: [];
  confirm: [axis: OutlineAxis];
}>();
const { t } = useAppI18n();
const axis = ref<OutlineAxis>("rows");
const availableAxes = computed<OutlineAxis[]>(() => {
  const axes: OutlineAxis[] = [];
  if (props.ungroupRows) axes.push("rows");
  if (props.ungroupColumns) axes.push("columns");
  return axes;
});

function restoreAxis(): void {
  axis.value = props.ungroupRows ? "rows" : "columns";
}
function confirm(): void {
  if (availableAxes.value.includes(axis.value)) emit("confirm", axis.value);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) restoreAxis();
  },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.outline.ungroupDialogTitle')"
    width="360px"
    :close-on-overlay-click="false"
    :confirm-btn="t('dataTools.common.confirm')"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="confirm"
  >
    <div class="outline-ungroup-dialog">
      <span class="outline-ungroup-dialog__label">{{ t("dataTools.outline.ungroupAxis") }}</span>
      <TRadioGroup v-model="axis" class="outline-ungroup-dialog__axes">
        <TRadio value="rows" :disabled="!ungroupRows">{{ t("dataTools.outline.rows") }}</TRadio>
        <TRadio value="columns" :disabled="!ungroupColumns">{{
          t("dataTools.outline.columns")
        }}</TRadio>
      </TRadioGroup>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.outline-ungroup-dialog {
  display: flex;
  align-items: center;
  gap: 16px;

  &__label {
    color: var(--sheetcraft-text-primary);
  }

  &__axes {
    display: flex;
    gap: 16px;
  }
}
</style>
