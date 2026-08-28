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
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const textColorLabel = computed(() =>
  t(props.state.textColor.mixed ? "format.textColorMixed" : "format.textColor"),
);
const fillColorLabel = computed(() =>
  t(props.state.fillColor.mixed ? "format.fillColorMixed" : "format.fillColor"),
);
</script>

<template>
  <div class="cell-color-controls" role="group" :aria-label="t('format.colors')">
    <CellColorPicker
      :label="textColorLabel"
      :value="state.textColor.value"
      :default-color="DEFAULT_CELL_TEXT_COLOR"
      :mixed="state.textColor.mixed"
      :disabled="disabled"
      @change="emit('applyStyle', { textColor: $event })"
    >
      <Baseline :size="17" :stroke-width="2" aria-hidden="true" />
    </CellColorPicker>
    <CellColorPicker
      :label="fillColorLabel"
      :value="state.fillColor.value"
      :default-color="DEFAULT_CELL_FILL_COLOR"
      :mixed="state.fillColor.mixed"
      :disabled="disabled"
      @change="emit('applyStyle', { fillColor: $event })"
    >
      <PaintBucket :size="17" :stroke-width="2" aria-hidden="true" />
    </CellColorPicker>
  </div>
</template>

<style scoped lang="scss">
.cell-color-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}
</style>
