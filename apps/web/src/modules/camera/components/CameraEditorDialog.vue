<script setup lang="ts">
import { ref, useId } from "vue";
import { Alert as TAlert } from "tdesign-vue-next/es/alert";
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
const { t } = useAppI18n();
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
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', draft, source)"
    @close="emit('close')"
    ><Form
      class="camera-editor sheetcraft-form-grid"
      label-align="top"
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
      <div class="camera-editor__toggle">
        <Checkbox v-model="draft.camera.gridLines">{{ t("camera.gridLines") }}</Checkbox>
      </div>
      <p class="camera-editor__hint">{{ t("camera.hint") }}</p>
      <TAlert v-if="error" theme="error" :message="t('camera.invalid')" role="alert" /> </Form
  ></Dialog>
</template>
<style scoped lang="scss">
.camera-editor {
  display: grid;
  gap: 12px;
  &__reference {
    width: 100%;
  }
  &__toggle {
    padding-top: 2px;
  }
  &__hint {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: 1.5;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
