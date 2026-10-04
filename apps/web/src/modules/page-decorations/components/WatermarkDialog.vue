<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { SheetWatermark } from "@idea10/core/page-decoration";
import { DEFAULT_SHEET_WATERMARK } from "@idea10/core/page-decoration";
import { useAppI18n } from "../../../shared/i18n";
import ColorPalette from "../../../shared/color/ColorPalette.vue";

const props = defineProps<{ visible: boolean; watermark?: SheetWatermark }>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [watermark: SheetWatermark];
  remove: [];
}>();
const { locale, t } = useAppI18n();
const draft = ref<SheetWatermark>({ ...DEFAULT_SHEET_WATERMARK });
watch(
  () => [props.visible, props.watermark] as const,
  ([visible, watermark]) => {
    if (visible) draft.value = { ...DEFAULT_SHEET_WATERMARK, ...watermark };
  },
  { immediate: true },
);
const labelWidth = computed(() => (locale.value === "zh-CN" ? 72 : 104));
const opacityPercent = computed({
  get: () => Math.round(draft.value.opacity * 100),
  set: (value: number) => {
    draft.value.opacity = Math.max(0, Math.min(1, value / 100));
  },
});
function close(): void {
  emit("update:visible", false);
}
function save(): void {
  if (!draft.value.text.trim()) return;
  emit("save", { ...draft.value, text: draft.value.text.trim() });
  close();
}
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t('pageDecoration.watermark')"
    :confirm-btn="{ content: t('pageDecoration.confirm'), disabled: !draft.text.trim() }"
    :cancel-btn="t('pageDecoration.cancel')"
    width="440px"
    placement="center"
    @confirm="save"
    @close="close"
  >
    <TForm :data="draft" label-align="right" :label-width="labelWidth" class="watermark-dialog">
      <TFormItem name="text" :label="t('pageDecoration.watermarkText')"
        ><TInput v-model="draft.text" maxlength="256" data-watermark-text
      /></TFormItem>
      <TFormItem name="fontSize" :label="t('pageDecoration.fontSize')"
        ><TInputNumber
          v-model="draft.fontSize"
          theme="column"
          class="idea-input-number--persistent-controls"
          :min="8"
          :max="288"
          :decimal-places="0"
      /></TFormItem>
      <TFormItem name="color" :label="t('pageDecoration.color')"
        ><ColorPalette
          :model-value="draft.color"
          default-color="#808080"
          :default-label="t('pageDecoration.color')"
          @select="draft.color = $event ?? '#808080'"
      /></TFormItem>
      <TFormItem name="opacity" :label="t('pageDecoration.opacity')"
        ><TInputNumber
          v-model="opacityPercent"
          theme="column"
          class="idea-input-number--persistent-controls"
          :min="0"
          :max="100"
          :step="5"
          :decimal-places="0"
      /></TFormItem>
      <TFormItem name="angle" :label="t('pageDecoration.angle')"
        ><TInputNumber
          v-model="draft.angle"
          theme="column"
          class="idea-input-number--persistent-controls"
          :min="-360"
          :max="360"
          :decimal-places="0"
      /></TFormItem>
      <TFormItem v-if="watermark" :label-width="0"
        ><button
          type="button"
          class="watermark-dialog__remove"
          @click="
            emit('remove');
            close();
          "
        >
          {{ t("pageDecoration.removeWatermark") }}
        </button></TFormItem
      >
    </TForm>
  </Dialog>
</template>
<style scoped lang="scss">
.watermark-dialog {
  &__remove {
    border: 0;
    background: transparent;
    color: var(--idea-status-error);
    padding: 0;
    cursor: pointer;
  }
}
</style>
