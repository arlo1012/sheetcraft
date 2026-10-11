<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { RotateCcw } from "lucide-vue-next";
import type { PictureFormatLabelKey, PictureFormatReset } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
const props = defineProps<{ controller: PictureFormatPaneController; type: PictureFormatReset }>();
const binding = computed(() => props.controller.reset(props.type));
const labelKeys: Record<PictureFormatReset, PictureFormatLabelKey> = {
  "reset-size": "resetSize",
  "reset-picture": "resetPicture",
  "reset-crop": "resetCrop",
  "reset-3d-format": "reset3dFormat",
  "reset-3d-rotation": "reset3dRotation",
};
</script>
<template>
  <div class="picture-format-reset">
    <TButton
      theme="default"
      variant="base"
      size="small"
      :disabled="binding.disabled"
      :data-picture-format-reset="type"
      @click="binding.activate"
      ><template #icon><RotateCcw :size="14" /></template
      >{{ controller.t(labelKeys[type]) }}</TButton
    >
    <p v-if="binding.error" role="alert">{{ binding.error }}</p>
    <p v-else-if="binding.reason">{{ binding.reason }}</p>
  </div>
</template>
<style scoped lang="scss">
.picture-format-reset {
  p {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 18px;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
