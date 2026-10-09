<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import type { SheetFilterCondition } from "@sheetcraft/core/workbook";
import type { ExcelDateSystem } from "@sheetcraft/core/formula";
import { useAppI18n } from "../../i18n";
import type { FilterValueKind } from "../custom-filter-draft";
import type { FilterConditionAction } from "../filter-condition-actions";
import type { FilterValueOption } from "../filter-types";
import FilterConditionEditor from "./FilterConditionEditor.vue";
defineProps<{
  visible: boolean;
  columnLabel: string;
  kind: FilterValueKind;
  initial?: SheetFilterCondition;
  action?: FilterConditionAction;
  values: readonly FilterValueOption[];
  dateSystem: ExcelDateSystem;
  disabled?: boolean;
  caption?: string;
  title?: string;
  strictKind?: boolean;
}>();
const emit = defineEmits<{ close: []; apply: [condition: SheetFilterCondition] }>();
const { t } = useAppI18n();
const condition = ref<SheetFilterCondition>();
</script>
<template>
  <Dialog
    :visible="visible"
    :header="title ?? t('dataTools.filter.customFilterTitle')"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: disabled || !condition }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="!disabled && condition && emit('apply', condition)"
  >
    <div class="filter-condition-dialog">
      <p class="filter-condition-dialog__caption">
        {{ caption ?? t("dataTools.filter.showRows", { column: columnLabel }) }}
      </p>
      <FilterConditionEditor
        v-if="visible"
        @update:condition="condition = $event"
        :kind="kind"
        :initial="initial"
        :action="action"
        :values="values"
        :date-system="dateSystem"
        :disabled="disabled"
        :strict-kind="strictKind"
      />
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.filter-condition-dialog {
  display: grid;
  gap: var(--sheetcraft-space-4);
  &__caption {
    margin: 0;
  }
}
</style>
