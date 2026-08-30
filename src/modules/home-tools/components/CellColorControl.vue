<script setup lang="ts">
import { Baseline, PaintBucket } from "lucide-vue-next";
import { computed } from "vue";
import {
  DEFAULT_CELL_FILL_COLOR,
  DEFAULT_CELL_TEXT_COLOR,
  type CellStylePatch,
} from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorPicker from "./CellColorPicker.vue";

const props = defineProps<{
  kind: "text" | "fill";
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const colorState = computed(() =>
  props.kind === "text" ? props.state.textColor : props.state.fillColor,
);
const defaultColor = computed(() =>
  props.kind === "text" ? DEFAULT_CELL_TEXT_COLOR : DEFAULT_CELL_FILL_COLOR,
);
const label = computed(() => {
  if (props.kind === "text") {
    return t(props.state.textColor.mixed ? "format.textColorMixed" : "format.textColor");
  }
  return t(props.state.fillColor.mixed ? "format.fillColorMixed" : "format.fillColor");
});

function applyColor(color: string | null): void {
  emit("applyStyle", props.kind === "text" ? { textColor: color } : { fillColor: color });
}
</script>

<template>
  <div class="cell-color-control" :data-cell-color-control="kind">
    <CellColorPicker
      :label="label"
      :value="colorState.value"
      :default-color="defaultColor"
      :mixed="colorState.mixed"
      :disabled="disabled"
      @change="applyColor"
    >
      <Baseline v-if="kind === 'text'" :size="17" :stroke-width="2" aria-hidden="true" />
      <PaintBucket v-else :size="17" :stroke-width="2" aria-hidden="true" />
    </CellColorPicker>
  </div>
</template>

<style scoped lang="scss">
.cell-color-control {
  display: inline-flex;
  align-items: center;
}
</style>
