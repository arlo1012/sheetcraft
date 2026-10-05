<script setup lang="ts">
import { computed } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import type { SheetAttachmentDrawing } from "@idea10/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import { attachmentText } from "../attachment-file";
const props = defineProps<{ drawing: SheetAttachmentDrawing }>();
const emit = defineEmits<{ download: []; close: [] }>();
const { t } = useAppI18n();
const text = computed(() => attachmentText(props.drawing.attachment));
</script>
<template>
  <Dialog
    :visible="true"
    :header="drawing.attachment.filename"
    width="680px"
    :confirm-btn="t('attachment.download')"
    :cancel-btn="t('picture.cancel')"
    @confirm="emit('download')"
    @close="emit('close')"
    ><div class="attachment-dialog">
      <p>{{ t("attachment.hint") }}</p>
      <pre v-if="text !== undefined">{{ text }}</pre>
      <p v-else>
        {{ drawing.attachment.mimeType }} · {{ (drawing.attachment.size / 1024).toFixed(1) }} KB
      </p>
    </div></Dialog
  >
</template>
<style scoped lang="scss">
.attachment-dialog {
  p {
    margin: 0 0 12px;
    color: var(--text-secondary);
  }
  pre {
    max-height: 400px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 12px;
    background: var(--surface-secondary);
    font: 13px/1.5 monospace;
  }
}
</style>
