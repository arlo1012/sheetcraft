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
const { t, locale } = useAppI18n();
const maxSide = ref(1920);
const quality = ref(80);
const format = ref<"jpeg" | "webp">("webp");
const all = ref(false);
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('picture.compress')"
    width="min(440px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :close-btn="true"
    :confirm-btn="{ content: t('picture.compress'), loading: busy }"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', { maxSide, quality: quality / 100, format, all })"
    @close="emit('close')"
  >
    <Form
      class="picture-compress sheetcraft-form-grid"
      label-align="right"
      :label-width="locale === 'zh-CN' ? 112 : 144"
      :prevent-submit-default="true"
    >
      <p v-if="error" role="alert">{{ error }}</p>
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
      <FormItem
        ><RadioGroup v-model="format" :disabled="busy"
          ><Radio value="webp">WebP</Radio><Radio value="jpeg">JPEG</Radio></RadioGroup
        ></FormItem
      >
      <p>{{ t("picture.jpegHint") }}</p>
      <FormItem
        ><Checkbox v-model="all" :disabled="busy">{{
          t("picture.allPictures")
        }}</Checkbox></FormItem
      >
    </Form>
  </Dialog>
</template>
<style scoped lang="scss">
.picture-compress {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
