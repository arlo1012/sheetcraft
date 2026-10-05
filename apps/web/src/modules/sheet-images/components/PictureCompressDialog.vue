<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";
import type { PictureCompression } from "../picture-asset-conversion";
defineProps<{ busy: boolean }>();
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
    width="400px"
    :close-on-overlay-click="false"
    :close-btn="!busy"
    :confirm-btn="{ content: t('picture.compress'), loading: busy }"
    :cancel-btn="{ content: t('picture.cancel'), disabled: busy }"
    @confirm="emit('confirm', { maxSide, quality: quality / 100, format, all })"
    @close="!busy && emit('close')"
  >
    <div class="picture-compress">
      <div class="picture-compress__field" role="group" :aria-label="t('picture.maxSide')">
        <span>{{ t("picture.maxSide") }}</span
        ><InputNumber
          v-model="maxSide"
          :min="96"
          :max="4096"
          :disabled="busy"
          theme="column"
          class="idea-input-number--persistent-controls"
        />
      </div>
      <div class="picture-compress__field" role="group" :aria-label="t('picture.quality')">
        <span>{{ t("picture.quality") }}</span
        ><InputNumber
          v-model="quality"
          :min="10"
          :max="100"
          :disabled="busy"
          theme="column"
          class="idea-input-number--persistent-controls"
        />
      </div>
      <RadioGroup v-model="format" :disabled="busy"
        ><Radio value="webp">WebP</Radio><Radio value="jpeg">JPEG</Radio></RadioGroup
      >
      <p>{{ t("picture.jpegHint") }}</p>
      <Checkbox v-model="all" :disabled="busy">{{ t("picture.allPictures") }}</Checkbox>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.picture-compress {
  display: grid;
  gap: 12px;
  &__field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  p {
    margin: 0;
    color: var(--idea-text-secondary);
  }
}
</style>
