<script setup lang="ts">
import { ref, useId } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
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
const { t, locale } = useAppI18n();
const titleInputId = `camera-title-${useId()}`;
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
    width="min(480px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft, source)"
    @close="emit('close')"
    ><Form
      class="camera-editor sheetcraft-form-grid"
      label-align="right"
      :label-width="locale === 'zh-CN' ? 88 : 112"
      :prevent-submit-default="true"
    >
      <FormItem :label="t('chart.source')">
        <div class="camera-editor__reference">
          <RangeReferenceInput
            v-model="source"
            :label="t('chart.source')"
            :select-reference="selectReference"
          /></div
      ></FormItem>
      <FormItem :label="t('chart.title')"
        ><Input
          v-model="draft.name"
          v-native-control="{
            attributes: {
              id: titleInputId,
              name: titleInputId,
              'aria-label': t('chart.title'),
            },
          }"
      /></FormItem>
      <FormItem
        ><Checkbox v-model="draft.camera.gridLines">{{ t("camera.gridLines") }}</Checkbox></FormItem
      >
      <p>{{ t("camera.hint") }}</p>
      <p v-if="error" role="alert">{{ t("camera.invalid") }}</p>
    </Form></Dialog
  >
</template>
<style scoped lang="scss">
.camera-editor {
  display: grid;
  gap: 12px;
  &__reference {
    width: 100%;
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  [role="alert"] {
    color: var(--sheetcraft-status-error);
  }
}
</style>
