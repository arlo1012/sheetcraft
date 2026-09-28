<script setup lang="ts">
import type { ConditionalFormatStyle } from "@idea10/core/conditional-formatting";
import type { CellFormatChange } from "@idea10/core/commands";
import CellFormatDialog from "../../cell-format/components/CellFormatDialog.vue";
import {
  conditionalStyleToBorderState,
  conditionalStyleToPatch,
  conditionalStyleToSelectionState,
  mergeConditionalStyleChange,
} from "../conditional-format-style-dialog";
const props = withDefaults(
  defineProps<{
    style: ConditionalFormatStyle;
    sampleValue?: string | number | boolean | null;
    dateSystem?: "1900" | "1904";
  }>(),
  { sampleValue: null, dateSystem: "1900" },
);
const emit = defineEmits<{
  confirm: [style: ConditionalFormatStyle];
  cancel: [];
}>();
function confirm(change: CellFormatChange): void {
  emit(
    "confirm",
    mergeConditionalStyleChange(props.style, change.style, change.borders, change.borderFormat),
  );
}
</script>
<template>
  <Teleport to="body">
    <CellFormatDialog
      :state="conditionalStyleToSelectionState(style)"
      :border-state="conditionalStyleToBorderState(style)"
      :border-capabilities="{ innerHorizontal: false, innerVertical: false }"
      :initial-style-patch="conditionalStyleToPatch(style)"
      :sample-value="sampleValue"
      :date-system="dateSystem"
      initial-tab="number"
      :available-tabs="['number', 'font', 'border', 'fill']"
      @confirm="confirm"
      @cancel="emit('cancel')"
    />
  </Teleport>
</template>
