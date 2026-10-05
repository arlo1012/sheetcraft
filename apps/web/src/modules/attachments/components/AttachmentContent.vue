<script setup lang="ts">
import { computed } from "vue";
import { FileText, Paperclip } from "lucide-vue-next";
import type { SheetAttachmentDrawing } from "@idea10/core/sheet-drawings";
import { attachmentText } from "../attachment-file";
const props = defineProps<{ drawing: SheetAttachmentDrawing }>();
const text = computed(() =>
  props.drawing.attachment.display === "document"
    ? attachmentText(props.drawing.attachment)
    : undefined,
);
</script>
<template>
  <div class="attachment-content">
    <div class="attachment-content__heading">
      <FileText v-if="drawing.attachment.display === 'document'" :size="28" /><Paperclip
        v-else
        :size="28"
      /><span>{{ drawing.attachment.filename }}</span>
    </div>
    <pre v-if="text !== undefined">{{ text }}</pre>
    <small v-else>{{ (drawing.attachment.size / 1024).toFixed(1) }} KB</small>
  </div>
</template>
<style scoped lang="scss">
.attachment-content {
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  color: #202124;
  overflow: hidden;
  &__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    svg {
      flex-shrink: 0;
      color: #2563eb;
    }
  }
  pre {
    white-space: pre-wrap;
    font: 12px/1.5 monospace;
    margin: 8px 0 0;
  }
  small {
    display: block;
    margin-top: 8px;
    color: #666;
  }
}
</style>
