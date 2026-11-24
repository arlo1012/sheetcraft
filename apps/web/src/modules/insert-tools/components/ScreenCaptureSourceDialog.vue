<script setup lang="ts">
import { ref } from "vue";
import { Alert as TAlert } from "tdesign-vue-next/es/alert";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import { readEncodedImageSource } from "../../image-assets/readEncodedImageSource";
defineProps<{ busy: boolean; canCapture: boolean }>();
const emit = defineEmits<{ screen: []; file: [file: File]; close: [] }>();
const { t } = useAppI18n();
const input = ref<HTMLInputElement>(),
  reading = ref(false),
  failed = ref(false);
async function openFile(event: Event) {
  const element = event.target as HTMLInputElement,
    file = element.files?.[0];
  if (!file || reading.value) return;
  reading.value = true;
  failed.value = false;
  try {
    const { blob, header } = await readEncodedImageSource(file);
    if (header.mimeType !== "image/png" && header.mimeType !== "image/jpeg") throw new Error();
    emit("file", new File([blob], file.name, { type: header.mimeType }));
  } catch {
    failed.value = true;
  } finally {
    reading.value = false;
    element.value = "";
  }
}
</script>
<template>
  <Dialog
    :visible="true"
    role="dialog"
    aria-modal="true"
    :aria-label="t('drawing.captureTools')"
    :header="t('drawing.captureTools')"
    :footer="false"
    width="min(420px, calc(100vw - 32px))"
    @close="emit('close')"
  >
    <div class="capture-source">
      <Button :disabled="busy || reading || !canCapture" @click="emit('screen')">{{
        t("drawing.captureStart")
      }}</Button>
      <Button :disabled="reading" @click="input?.click()">{{ t("drawing.captureOpen") }}</Button>
      <input
        ref="input"
        name="screen-capture-file"
        type="file"
        accept="image/png,image/jpeg"
        hidden
        :aria-label="t('drawing.captureOpen')"
        @change="openFile"
      />
      <p v-if="!canCapture">{{ t("drawing.captureUnsupported") }}</p>
      <TAlert
        v-if="failed"
        theme="error"
        :message="t('drawing.captureFileError')"
        role="alert"
      /></div
  ></Dialog>
</template>
<style scoped>
.capture-source {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.capture-source p {
  width: 100%;
  margin: 0;
}
</style>
