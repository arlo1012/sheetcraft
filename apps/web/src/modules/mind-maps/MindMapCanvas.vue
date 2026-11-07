<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppI18n } from "../../shared/i18n";
import type { MindMapDocument, MindMapTopic } from "./mind-map-document";
import { layoutMindMap } from "./mind-map-layout";
const props = defineProps<{
  document: MindMapDocument;
  selected?: string;
  interactive?: boolean;
}>();
const emit = defineEmits<{
  select: [topic: MindMapTopic];
  edit: [topic: MindMapTopic];
  toggle: [topic: MindMapTopic];
  key: [topic: MindMapTopic, event: KeyboardEvent];
}>();
const { t } = useAppI18n();
const layout = computed(() => layoutMindMap(props.document));
const viewBox = computed(() => {
  if (!props.interactive) return layout.value.viewBox;
  const [left, top] = layout.value.viewBox.split(" ").map(Number);
  const width = Math.max(590, layout.value.width),
    height = Math.max(340, layout.value.height);
  return [
    left! - (width - layout.value.width) / 2,
    top! - (height - layout.value.height) / 2,
    width,
    height,
  ].join(" ");
});
const themeColor = computed(
  () => ({ green: "#158451", blue: "#286187", plum: "#7a476f" })[props.document.theme],
);
const svg = ref<SVGSVGElement>();
function fill(n: MindMapTopic) {
  return n.fill || (n.id === props.document.root.id ? themeColor.value : "#ffffff");
}
function textColor(n: MindMapTopic) {
  const color = fill(n);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return r! * 0.299 + g! * 0.587 + b! * 0.114 < 145 ? "#ffffff" : "#202a29";
}
function focusTopic(id: string) {
  svg.value?.querySelector<SVGGElement>('[data-topic-id="' + CSS.escape(id) + '"]')?.focus();
}
defineExpose({ focusTopic });
</script>
<template>
  <svg ref="svg" class="mind-map-canvas" :viewBox="viewBox" :aria-label="document.title">
    <path
      v-for="link in layout.links"
      :key="link.to"
      :d="link.path"
      fill="none"
      :stroke="themeColor"
      stroke-width="2"
    />
    <g v-for="box in layout.boxes" :key="box.topic.id" :transform="`translate(${box.x},${box.y})`">
      <g
        :data-topic-id="box.topic.id"
        :role="interactive ? 'button' : undefined"
        :tabindex="interactive ? (selected === box.topic.id ? 0 : -1) : undefined"
        :aria-label="interactive ? box.topic.text : undefined"
        :aria-pressed="interactive ? selected === box.topic.id : undefined"
        @click="interactive && emit('select', box.topic)"
        @dblclick="interactive && emit('edit', box.topic)"
        @keydown="interactive && emit('key', box.topic, $event)"
      >
        <title>{{ box.topic.note || box.topic.text }}</title>
        <rect
          :width="box.width"
          :height="box.height"
          :rx="document.root.id === box.topic.id ? 20 : 4"
          :fill="fill(box.topic)"
          :stroke="themeColor"
          stroke-width="1.6"
        />
        <foreignObject x="8" y="0" :width="box.width - 16" :height="box.height">
          <div
            class="topic-text"
            :style="{
              color: textColor(box.topic),
              fontSize: (box.topic.fontSize ?? 15) + 'px',
              fontWeight: (box.topic.bold ?? box.topic.id === document.root.id) ? 700 : 400,
            }"
          >
            {{ box.topic.text }}
          </div>
        </foreignObject>
        <rect
          v-if="interactive && selected === box.topic.id"
          x="-3"
          y="-3"
          :width="box.width + 6"
          :height="box.height + 6"
          rx="4"
          fill="none"
          stroke="#346dc3"
          stroke-dasharray="4 2"
          pointer-events="none"
        />
      </g>
      <g
        v-if="interactive && box.topic.children.length"
        class="fold"
        role="button"
        tabindex="0"
        :aria-label="
          t(box.topic.collapsed ? 'mindMap.expand' : 'mindMap.collapse') + ' · ' + box.topic.text
        "
        :transform="`translate(${box.width},${box.height / 2})`"
        @click.stop="emit('toggle', box.topic)"
        @keydown.enter.prevent.stop="emit('toggle', box.topic)"
      >
        <circle r="7" fill="white" :stroke="themeColor" />
        <path :d="box.topic.collapsed ? 'M-3 0H3 M0 -3V3' : 'M-3 0H3'" :stroke="themeColor" />
      </g>
    </g>
  </svg>
</template>
<style scoped lang="scss">
.mind-map-canvas {
  display: block;
  background: white;
  width: 100%;
  height: 100%;
  user-select: none;
}
.topic-text {
  height: 100%;
  display: grid;
  align-content: center;
  text-align: center;
  white-space: pre-wrap;
  overflow: hidden;
  overflow-wrap: anywhere;
  font: 15px/1.25 var(--sheetcraft-font-sans, sans-serif);
  pointer-events: none;
}
.fold,
[role="button"] {
  cursor: pointer;
}
</style>
