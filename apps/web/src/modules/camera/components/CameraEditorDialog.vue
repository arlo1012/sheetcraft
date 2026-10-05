<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetCameraDrawing } from "@idea10/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { formatRangeReference } from "../../../shared/range-reference/formatRangeReference";
const props = defineProps<{
  drawing: SheetCameraDrawing;
  sheetName: string;
  disabled: boolean;
  error: boolean;
  suspended: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ confirm: [drawing: SheetCameraDrawing, source: string]; close: [] }>();
const { t } = useAppI18n();
const draft = ref({ ...props.drawing, camera: { ...props.drawing.camera } });
const source = ref(
  props.drawing.camera.range
    ? formatRangeReference(props.sheetName, props.drawing.camera.range)
    : "",
);
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t('camera.title')"
    width="480px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft, source)"
    @close="emit('close')"
    ><div class="camera-editor">
      <label
        >{{ t("chart.source")
        }}<RangeReferenceInput
          v-model="source"
          :label="t('chart.source')"
          :select-reference="selectReference"
      /></label>
      <label>{{ t("chart.title") }}<Input v-model="draft.name" /></label>
      <Checkbox v-model="draft.camera.gridLines">{{ t("camera.gridLines") }}</Checkbox>
      <p>{{ t("camera.hint") }}</p>
      <p v-if="error" role="alert">{{ t("camera.invalid") }}</p>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.camera-editor {
  display: grid;
  gap: 12px;
  label {
    display: grid;
    gap: 6px;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
  }
  [role="alert"] {
    color: var(--td-error-color);
  }
}
</style>
