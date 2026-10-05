<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ width: number; height: number }>();
const emit = defineEmits<{
  confirm: [value: { width: number; height: number; locked: boolean; all: boolean }];
  close: [];
}>();
const { t } = useAppI18n();
const width = ref(props.width * 0.75);
const height = ref(props.height * 0.75);
const locked = ref(true);
const all = ref(false);
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('picture.batchSize')"
    width="400px"
    :close-on-overlay-click="false"
    :confirm-btn="t('picture.confirm')"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('confirm', { width: (width * 4) / 3, height: (height * 4) / 3, locked, all })"
    @close="emit('close')"
  >
    <div class="picture-batch-size">
      <div class="picture-batch-size__field" role="group" :aria-label="t('image.widthPoints')">
        <span>{{ t("image.widthPoints") }}</span
        ><InputNumber
          v-model="width"
          :min="0.75"
          :max="7500"
          :decimal-places="2"
          theme="column"
          class="idea-input-number--persistent-controls"
        />
      </div>
      <div class="picture-batch-size__field" role="group" :aria-label="t('image.heightPoints')">
        <span>{{ t("image.heightPoints") }}</span
        ><InputNumber
          v-model="height"
          :disabled="locked"
          :min="0.75"
          :max="7500"
          :decimal-places="2"
          theme="column"
          class="idea-input-number--persistent-controls"
        />
      </div>
      <Checkbox v-model="locked">{{ t("picture.keepEachRatio") }}</Checkbox>
      <Checkbox v-model="all">{{ t("picture.allPictures") }}</Checkbox>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.picture-batch-size {
  display: grid;
  gap: 12px;
  &__field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
}
</style>
