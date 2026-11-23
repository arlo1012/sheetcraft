<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import type { PictureCompression } from "../picture-asset-conversion";
defineProps<{ busy: boolean; error?: string }>();
const emit = defineEmits<{ confirm: [settings: PictureCompression]; close: [] }>();
const { t } = useAppI18n();
const maxSide = ref(1920);
const quality = ref(80);
const format = ref<"jpeg" | "webp">("webp");
const all = ref(false);
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('picture.compress')"
    width="min(420px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :close-btn="true"
    :confirm-btn="{ content: t('picture.compress'), loading: busy }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', { maxSide, quality: quality / 100, format, all })"
    @close="emit('close')"
  >
    <Form
      class="picture-compress sheetcraft-form-grid"
      label-align="top"
      :prevent-submit-default="true"
    >
      <p v-if="error" class="picture-compress__error" role="alert">{{ error }}</p>
      <div class="picture-compress__row">
        <FormItem :label="t('picture.maxSide')"
          ><InputNumber
            v-model="maxSide"
            v-native-control="{ attributes: { 'aria-label': t('picture.maxSide') } }"
            :min="96"
            :max="4096"
            :disabled="busy"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
          />
        </FormItem>
        <FormItem :label="t('picture.quality')"
          ><InputNumber
            v-model="quality"
            v-native-control="{ attributes: { 'aria-label': t('picture.quality') } }"
            :min="10"
            :max="100"
            :disabled="busy"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
          />
        </FormItem>
      </div>
      <div class="picture-compress__card">
        <RadioGroup v-model="format" :disabled="busy"
          ><Radio value="webp">WebP</Radio><Radio value="jpeg">JPEG</Radio></RadioGroup
        >
        <p>{{ t("picture.jpegHint") }}</p>
      </div>
      <div class="picture-compress__card">
        <Checkbox v-model="all" :disabled="busy">{{ t("picture.allPictures") }}</Checkbox>
      </div>
    </Form>
  </Dialog>
</template>
<style scoped lang="scss">
.picture-compress {
  display: grid;
  gap: 10px;
  &__row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  &__card {
    display: grid;
    gap: 6px;
    padding: 9px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
