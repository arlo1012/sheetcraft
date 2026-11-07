<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Undo2, Redo2, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Download } from "lucide-vue-next";
import { useAppI18n } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { downloadBlob } from "../../shared/files/download";
import { attachmentBlob } from "../attachments/attachment-file";
import { useDiagramHistory } from "../attachments/useDiagramHistory";
import {
  mindMapLayouts,
  mindMapThemes,
  MIND_MAP_TOPIC_LIMIT,
  MIND_MAP_DEPTH_LIMIT,
  parseMindMapDocument,
  encodeMindMapAttachment,
  topicLocations,
  type MindMapDocument,
  type MindMapTopic,
  type MindMapStart,
} from "./mind-map-document";
import MindMapPicker from "./MindMapPicker.vue";
import MindMapCanvas from "./MindMapCanvas.vue";

const props = defineProps<{
  source?: MindMapDocument;
  start: MindMapStart;
  existing: { sheetName: string; document: MindMapDocument }[];
  error: boolean;
}>();
const emit = defineEmits<{ save: [doc: MindMapDocument]; close: [] }>();
const { t, locale } = useAppI18n();
const draft = ref(props.source ? parseMindMapDocument(props.source) : undefined);
const {
  history,
  cursor,
  record,
  travel: restore,
} = useDiagramHistory(draft, () => {
  if (draft.value) select(draft.value.root);
});
const makeId = createBrowserIdFactory();
const canvas = ref<InstanceType<typeof MindMapCanvas>>();
const textInput = ref<HTMLDivElement>();
const selection = ref(draft.value?.root.id);
const locations = computed(() => draft.value && topicLocations(draft.value.root));
const selected = computed(
  () => (selection.value && locations.value?.get(selection.value)) || undefined,
);
const parent = computed(() => selected.value?.parent);
const active = computed(() => selected.value?.topic);
const index = computed(
  () => parent.value?.children.findIndex((n) => n.id === selection.value) ?? -1,
);
const zoom = ref(100);
const errorKey = ref<"mindMap.error" | "mindMap.unavailable">();
const layoutOptions = computed(() =>
  mindMapLayouts.map((value) => ({ value, label: t(`mindMap.${value}`) })),
);
const themeOptions = computed(() =>
  mindMapThemes.map((value) => ({ value, label: t(`mindMap.${value}`) })),
);
function choose(doc: MindMapDocument) {
  draft.value = doc;
  record();
  select(doc.root);
}
function select(n: MindMapTopic, focus = true) {
  selection.value = n.id;
  errorKey.value = undefined;
  if (focus) void nextTick(() => canvas.value?.focusTopic(n.id));
}
function edit(n: MindMapTopic) {
  select(n, false);
  void nextTick(() => {
    const input = textInput.value?.querySelector("input");
    input?.focus();
    input?.select();
  });
}
function add(kind: "child" | "sibling" | "parent") {
  const chart = draft.value,
    location = selected.value;
  if (!chart || !location || !locations.value) return;
  const { topic, parent, depth } = location;
  if (!parent && kind === "sibling") kind = "child";
  const subtreeDepth = (n: MindMapTopic): number =>
    n.children.length ? 1 + Math.max(...n.children.map(subtreeDepth)) : 0;
  const deepest =
    kind === "parent" ? depth + 1 + subtreeDepth(topic) : depth + (kind === "child" ? 1 : 0);
  if (deepest > MIND_MAP_DEPTH_LIMIT || locations.value.size >= MIND_MAP_TOPIC_LIMIT) {
    errorKey.value = "mindMap.unavailable";
    return;
  }
  const item: MindMapTopic = {
    id: makeId("topic"),
    text: t("mindMap.topic"),
    children: [],
    collapsed: false,
  };
  if (kind === "child") {
    topic.collapsed = false;
    topic.children.push(item);
  } else if (kind === "sibling") {
    parent!.children.splice(index.value + 1, 0, item);
  } else {
    item.children = [topic];
    if (parent) parent.children.splice(index.value, 1, item);
    else chart.root = item;
  }
  record();
  select(item);
}
function remove() {
  if (!parent.value) return;
  const target = parent.value;
  target.children.splice(index.value, 1);
  record();
  select(target);
}
function move(step: number) {
  const target = parent.value,
    from = index.value,
    to = from + step;
  if (!target || to < 0 || to >= target.children.length) return;
  const [n] = target.children.splice(from, 1);
  target.children.splice(to, 0, n!);
  record();
  select(n!);
}
function toggle(n: MindMapTopic) {
  if (n.children.length) {
    n.collapsed = !n.collapsed;
    record();
    select(n);
  }
}
function keys(topic: MindMapTopic, event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  switch (event.key) {
    case "Tab":
    case "Enter":
    case "Delete":
    case "F2":
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
      break;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
  select(topic, false);
  if (event.key === "Tab") add(event.shiftKey ? "parent" : "child");
  else if (event.key === "Enter") add("sibling");
  else if (event.key === "Delete") remove();
  else if (event.key === "F2") edit(topic);
  else if (event.key === "ArrowLeft") {
    if (topic.children.length && !topic.collapsed) toggle(topic);
    else if (parent.value) select(parent.value);
  } else if (event.key === "ArrowRight") {
    if (topic.collapsed) toggle(topic);
    else if (topic.children[0]) select(topic.children[0]);
  } else if (parent.value) {
    const sibling = parent.value.children[index.value + (event.key === "ArrowUp" ? -1 : 1)];
    if (sibling) select(sibling);
  }
}
function download() {
  if (!draft.value) return;
  try {
    const attachment = encodeMindMapAttachment(draft.value);
    downloadBlob(attachmentBlob(attachment), attachment.filename);
  } catch {
    errorKey.value = "mindMap.error";
  }
}
function fontSize(value: string | number) {
  if (active.value && typeof value === "number" && Number.isFinite(value)) {
    active.value.fontSize = Math.max(8, Math.min(48, value));
    record();
  }
}
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('mindMap.title')"
    width="min(1080px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="
      draft
        ? { content: t(source ? 'mindMap.save' : 'mindMap.insert'), disabled: !draft.title.trim() }
        : null
    "
    :cancel-btn="t('picture.cancel')"
    @confirm="draft && emit('save', draft)"
    @close="emit('close')"
  >
    <MindMapPicker v-if="!draft" :start="start" :existing="existing" @choose="choose" />
    <div v-else ref="historyElement" class="map-editor">
      <div class="commands">
        <Button
          variant="text"
          :aria-label="t('flowchart.undo')"
          :disabled="cursor < 1"
          @click="restore(-1)"
          ><Undo2 :size="16"
        /></Button>
        <Button
          variant="text"
          :aria-label="t('flowchart.redo')"
          :disabled="cursor >= history.length - 1"
          @click="restore(1)"
          ><Redo2 :size="16"
        /></Button>
        <Button variant="outline" @click="add('sibling')">{{ t("mindMap.topic") }}</Button>
        <Button variant="outline" @click="add('child')">{{ t("mindMap.child") }}</Button>
        <Button variant="text" @click="add('parent')">{{ t("mindMap.parent") }}</Button>
        <Button variant="text" :disabled="!parent" @click="remove">{{
          t("mindMap.remove")
        }}</Button>
        <Button
          variant="text"
          :aria-label="t('mindMap.moveUp')"
          :disabled="index < 1"
          @click="move(-1)"
          ><ArrowUp :size="16"
        /></Button>
        <Button
          variant="text"
          :aria-label="t('mindMap.moveDown')"
          :disabled="!parent || index >= parent.children.length - 1"
          @click="move(1)"
          ><ArrowDown :size="16"
        /></Button>
        <Button
          variant="text"
          :aria-label="t('mindMap.export')"
          :disabled="!draft.title.trim()"
          @click="download"
          ><Download :size="16"
        /></Button>
      </div>
      <div class="map-body">
        <div class="viewport">
          <MindMapCanvas
            ref="canvas"
            :style="{ width: zoom + '%', height: zoom + '%' }"
            :document="draft"
            :selected="selection"
            interactive
            @select="select"
            @edit="edit"
            @toggle="toggle"
            @key="keys"
          />
        </div>
        <Form
          class="properties"
          :label-width="locale === 'zh-CN' ? 65 : 80"
          label-align="right"
          :prevent-submit-default="true"
        >
          <FormItem :label="t('mindMap.name')"
            ><Input
              :aria-label="t('mindMap.name')"
              v-model="draft.title"
              :maxlength="128"
              @blur="record"
          /></FormItem>
          <FormItem :label="t('mindMap.layout')"
            ><Select
              :aria-label="t('mindMap.layout')"
              v-model="draft.layout"
              :options="layoutOptions"
              @change="record"
          /></FormItem>
          <FormItem :label="t('mindMap.theme')"
            ><Select
              :aria-label="t('mindMap.theme')"
              v-model="draft.theme"
              :options="themeOptions"
              @change="record"
          /></FormItem>
          <template v-if="active">
            <h3>{{ t("mindMap.style") }}</h3>
            <FormItem :label="t('mindMap.edit')"
              ><div ref="textInput">
                <Input
                  :aria-label="t('mindMap.edit')"
                  v-model="active.text"
                  :maxlength="4096"
                  @blur="record"
                /></div
            ></FormItem>
            <FormItem :label="t('mindMap.font')"
              ><InputNumber :value="active.fontSize ?? 15" :min="8" :max="48" @change="fontSize"
            /></FormItem>
            <FormItem :label="t('mindMap.fill')">
              <input
                class="fill"
                type="color"
                :aria-label="t('mindMap.fill')"
                :value="
                  active.fill ||
                  (active.id === draft.root.id
                    ? { green: '#158451', blue: '#286187', plum: '#7a476f' }[draft.theme]
                    : '#ffffff')
                "
                @change="
                  active.fill = ($event.target as HTMLInputElement).value;
                  record();
                "
              />
              <Button
                variant="text"
                size="small"
                :disabled="!active.fill"
                @click="
                  delete active.fill;
                  record();
                "
                >{{ t("mindMap.setDefault") }}</Button
              >
            </FormItem>
            <FormItem
              ><Checkbox
                :checked="active.bold ?? active.id === draft.root.id"
                @change="
                  active.bold = !!$event;
                  record();
                "
                >{{ t("mindMap.bold") }}</Checkbox
              ></FormItem
            >
            <FormItem :label="t('mindMap.note')"
              ><Textarea
                :aria-label="t('mindMap.note')"
                v-model="active.note"
                :maxlength="4096"
                @blur="record"
            /></FormItem>
          </template>
        </Form>
      </div>
      <div class="zoom" role="group" :aria-label="t('mindMap.zoom')">
        <Button
          variant="text"
          :aria-label="t('statusBar.zoomOut')"
          :disabled="zoom <= 100"
          @click="zoom -= 50"
          ><ZoomOut :size="16"
        /></Button>
        <span>{{ zoom }}%</span
        ><Button
          variant="text"
          :aria-label="t('statusBar.zoomIn')"
          :disabled="zoom >= 400"
          @click="zoom += 50"
          ><ZoomIn :size="16"
        /></Button>
      </div>
      <span v-if="error || errorKey" role="alert">{{ t(errorKey || "mindMap.error") }}</span>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.map-editor {
  display: grid;
  gap: 8px;
}
.commands,
.zoom {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.map-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(205px, 28%);
  height: min(58vh, 540px);
  border: 1px solid var(--sheetcraft-border-subtle);
}
.viewport {
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
.properties {
  border-left: 1px solid var(--sheetcraft-border-subtle);
  padding: 10px;
  overflow: auto;
}
h3 {
  font-size: 14px;
  margin: 16px 0 10px;
}
.zoom {
  justify-content: flex-end;
}
.fill {
  width: 32px;
  height: 24px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
</style>
