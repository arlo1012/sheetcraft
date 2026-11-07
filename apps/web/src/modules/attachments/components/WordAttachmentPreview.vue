<script setup lang="ts">
import { shallowRef, watch } from "vue";
import { FileText } from "lucide-vue-next";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import { useAppI18n } from "../../../shared/i18n";
import { readWordAttachmentPreview, type WordAttachmentPreview } from "../word-preview";
const props = defineProps<{ attachment: SheetAttachment; inline?: boolean }>();
const { t } = useAppI18n();
const preview = shallowRef<WordAttachmentPreview>();
const loaded = shallowRef(false);
watch(
  () => props.attachment.data,
  async (_data, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    loaded.value = false;
    preview.value = undefined;
    const result = await readWordAttachmentPreview(props.attachment);
    if (current) {
      preview.value = result;
      loaded.value = true;
    }
  },
  { immediate: true },
);
</script>
<template>
  <iframe
    v-if="preview"
    class="word-preview"
    :class="{ 'word-preview--inline': inline }"
    :srcdoc="preview.html"
    sandbox=""
    :title="attachment.filename"
    :tabindex="inline ? -1 : 0"
    :scrolling="inline ? 'no' : 'auto'"
  />
  <div v-else class="word-preview__fallback">
    <FileText :size="24" aria-hidden="true" /><span>{{ attachment.filename }}</span>
    <small role="status">{{
      t(loaded ? "attachment.wordUnavailable" : "attachment.wordLoading")
    }}</small>
  </div>
</template>
<style scoped lang="scss">
.word-preview {
  display: block;
  width: 100%;
  height: min(55dvh, 540px);
  border: 0;
  background: #fff;
}
.word-preview--inline {
  height: 100%;
  pointer-events: none;
}
.word-preview__fallback {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: 8px;
  overflow-wrap: anywhere;
}
</style>
