<script setup lang="ts">
import { decodeFlowchartAttachment, FLOWCHART_MIME } from "../../flowcharts/flowchart-document";
import { decodeMindMapAttachment, MIND_MAP_MIME } from "../../mind-maps/mind-map-document";
import MindMapCanvas from "../../mind-maps/MindMapCanvas.vue";
import FlowchartCanvas from "../../flowcharts/FlowchartCanvas.vue";
import WordAttachmentPreview from "./WordAttachmentPreview.vue";
import { isWordAttachment } from "../word-preview";
import { computed } from "vue";
import { FileText, Paperclip } from "lucide-vue-next";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import { attachmentText } from "../attachment-file";
const props = defineProps<{ drawing: SheetAttachmentDrawing }>();
const chart = computed(
  () =>
    props.drawing.attachment.display === "document" &&
    decodeFlowchartAttachment(props.drawing.attachment),
);
const map = computed(
  () =>
    props.drawing.attachment.display === "document" &&
    decodeMindMapAttachment(props.drawing.attachment),
);
const text = computed(() =>
  props.drawing.attachment.display === "document" &&
  props.drawing.attachment.mimeType !== FLOWCHART_MIME &&
  props.drawing.attachment.mimeType !== MIND_MAP_MIME
    ? attachmentText(props.drawing.attachment)
    : undefined,
);
</script>
<template>
  <FlowchartCanvas v-if="chart" :document="chart" />
  <MindMapCanvas v-else-if="map" :document="map" />
  <WordAttachmentPreview
    v-else-if="drawing.attachment.display === 'document' && isWordAttachment(drawing.attachment)"
    :attachment="drawing.attachment"
    inline
  />
  <div v-else class="attachment-content">
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
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: var(--sheetcraft-radius-default);
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-primary);
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
      color: var(--sheetcraft-action-primary);
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
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
