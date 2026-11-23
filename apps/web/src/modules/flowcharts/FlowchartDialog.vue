<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { useDiagramHistory } from "../attachments/useDiagramHistory";
import { attachmentBlob } from "../attachments/attachment-file";
import { downloadBlob } from "../../shared/files/download";
import { Trash2, Undo2, Redo2, Download, ZoomIn, ZoomOut } from "lucide-vue-next";
import { useAppI18n } from "../../shared/i18n";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { evaluateShapePreset, shapePresetPathToSvg } from "@sheetcraft/core/shape-presets";
import {
  encodeFlowchartAttachment,
  parseFlowchartDocument,
  flowchartShapes,
  FLOWCHART_WIDTH,
  FLOWCHART_HEIGHT,
  type FlowchartDocument,
  type FlowchartNode,
} from "./flowchart-document";
import FlowchartPicker from "./FlowchartPicker.vue";
import { createFlowchartTemplate, type FlowchartStart } from "./flowchart-templates";
import FlowchartCanvas from "./FlowchartCanvas.vue";

const props = defineProps<{
  start: FlowchartStart;
  existing: { sheetName: string; document: FlowchartDocument }[];
  source?: FlowchartDocument;
  error: boolean;
}>();
const emit = defineEmits<{ save: [document: FlowchartDocument]; close: [] }>();
const { locale, t } = useAppI18n();
const zh = computed(() => locale.value === "zh-CN");
const language = computed(() => (zh.value ? "zh-CN" : "en-US"));
const draft = ref(
  props.source
    ? parseFlowchartDocument(props.source)
    : props.start === "blank"
      ? createFlowchartTemplate("blank", language.value)
      : undefined,
);
const { history, cursor, record, travel } = useDiagramHistory(draft, () => clearSelection());
function choose(chart: FlowchartDocument) {
  draft.value = chart;
  record();
}
const exportError = ref(false);
function download() {
  if (!draft.value) return;
  try {
    const chart = encodeFlowchartAttachment(draft.value);
    downloadBlob(attachmentBlob(chart), chart.filename);
    exportError.value = false;
  } catch {
    exportError.value = true;
  }
}

const zoom = ref(100);

const selected = ref<string>();
const node = computed(() => draft.value?.nodes.find((n) => n.id === selected.value));
const edge = computed(() => draft.value?.edges.find((e) => e.id === selected.value));
const connecting = ref(false);
const id = createBrowserIdFactory();

const shapes = flowchartShapes.map((shape) => ({
  ...shape,
  paths: evaluateShapePreset({ preset: shape.preset }, 36, 24).paths.map((p) => ({
    d: shapePresetPathToSvg(p),
    fill: p.filled,
    stroke: p.stroke,
  })),
}));
function addNode(shape: (typeof shapes)[number], position?: { x: number; y: number }) {
  const chart = draft.value;
  if (!chart || chart.nodes.length >= 256) return;
  const index = chart.nodes.length;
  const item: FlowchartNode = {
    id: id("node"),
    preset: shape.preset,
    text: shortLabel(shape.label[language.value]),
    x: 32 + (index % 4) * 180,
    y: 30 + (Math.floor(index / 4) % 5) * 90,
    width: 145,
    height: 65,
  };
  if (position) {
    item.x = Math.round(
      Math.max(0, Math.min(FLOWCHART_WIDTH - item.width, position.x - item.width / 2)),
    );
    item.y = Math.round(
      Math.max(0, Math.min(FLOWCHART_HEIGHT - item.height, position.y - item.height / 2)),
    );
  }
  chart.nodes.push(item);
  record();
  selected.value = item.id;
  connecting.value = false;
}
function shortLabel(text: string) {
  return text.replace(/^.*?[:：]\s*/, "");
}
let drag: { id: string; pointer: number; dx: number; dy: number; svg: SVGSVGElement } | undefined;
function point(svg: SVGSVGElement, event: MouseEvent) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
}
function selectNode(targetId: string) {
  if (connecting.value && node.value && draft.value) {
    const from = node.value.id;
    if (from === targetId) return false;
    const link = { id: id("edge"), from, to: targetId, label: "" };
    draft.value.edges.push(link);
    record();
    selected.value = link.id;
    connecting.value = false;
    return false;
  }
  selected.value = targetId;
  return true;
}
function nodeDown(item: FlowchartNode, event: PointerEvent) {
  if (event.button !== 0 || !selectNode(item.id)) return;
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement!;
  const pos = point(svg, event);
  drag = { id: item.id, pointer: event.pointerId, dx: pos.x - item.x, dy: pos.y - item.y, svg };
  svg.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer || node.value?.id !== drag.id) return;
  const pos = point(drag.svg, event);
  node.value.x = Math.round(
    Math.max(0, Math.min(FLOWCHART_WIDTH - node.value.width, pos.x - drag.dx)),
  );
  node.value.y = Math.round(
    Math.max(0, Math.min(FLOWCHART_HEIGHT - node.value.height, pos.y - drag.dy)),
  );
}
function drop(event: DragEvent) {
  const shape = shapes.find(
    (s) => s.preset === event.dataTransfer?.getData("application/x-sheetcraft-shape"),
  );
  if (shape) addNode(shape, point(event.currentTarget as SVGSVGElement, event));
}
function endDrag() {
  if (drag) record();
  drag = undefined;
}
function geometry(field: "x" | "y" | "width" | "height", value: string | number) {
  const n = node.value;
  if (!n || typeof value !== "number" || !Number.isFinite(value)) return;
  const max = {
    x: FLOWCHART_WIDTH - n.width,
    y: FLOWCHART_HEIGHT - n.height,
    width: FLOWCHART_WIDTH - n.x,
    height: FLOWCHART_HEIGHT - n.y,
  };
  n[field] = Math.max(
    field === "x" || field === "y" ? 0 : 1,
    Math.min(max[field], Math.round(value)),
  );
  record();
}
const labelInput = ref<InstanceType<typeof Input>>();
function focusLabel() {
  const control = labelInput.value?.$el as HTMLElement | undefined;
  control?.querySelector("input")?.focus();
}
function clearSelection(id?: string) {
  selected.value = id;
  connecting.value = false;
}
function remove() {
  const chart = draft.value;
  if (!chart || !selected.value) return;
  chart.nodes = chart.nodes.filter((n) => n.id !== selected.value);
  chart.edges = chart.edges.filter(
    (e) => e.id !== selected.value && e.from !== selected.value && e.to !== selected.value,
  );
  clearSelection();
  record();
}
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('flowchart.title')"
    width="min(1030px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="
      draft
        ? {
            content: source ? t('flowchart.save') : t('flowchart.insert'),
            disabled: !draft.nodes.length || !draft.title.trim(),
          }
        : null
    "
    :cancel-btn="t('picture.cancel')"
    @confirm="draft && emit('save', draft)"
    @close="emit('close')"
  >
    <FlowchartPicker v-if="!draft" :start="start" :existing="existing" @choose="choose" />
    <div v-else ref="historyElement" class="editor">
      <Form label-align="left" :label-width="zh ? 60 : 75" :prevent-submit-default="true"
        ><FormItem :label="t('flowchart.name')"
          ><Input
            :aria-label="t('flowchart.name')"
            v-model="draft.title"
            @blur="record"
            :maxlength="128" /></FormItem
      ></Form>
      <div class="surface">
        <div class="palette" :aria-label="t('flowchart.shapes')">
          <button
            v-for="shape in shapes"
            :key="shape.preset"
            type="button"
            :title="shape.label[language]"
            :aria-label="shape.label[language]"
            :disabled="draft.nodes.length >= 256"
            draggable="true"
            @dragstart="
              $event.dataTransfer?.setData('application/x-sheetcraft-shape', shape.preset)
            "
            @click="addNode(shape)"
          >
            <svg viewBox="-2 -2 40 28">
              <path
                v-for="(p, i) in shape.paths"
                :key="i"
                :d="p.d"
                :fill="p.fill ? '#e7f2fa' : 'none'"
                :stroke="p.stroke ? '#456780' : 'none'"
              />
            </svg>
          </button>
        </div>
        <div class="viewport">
          <FlowchartCanvas
            :style="{ width: zoom + '%', height: zoom + '%' }"
            class="canvas"
            :document="draft"
            :selected="selected"
            interactive
            @node-down="nodeDown"
            @select="selectNode"
            @edge-down="clearSelection"
            @background="clearSelection()"
            @pointermove="move"
            @edit-label="focusLabel"
            @dragover.prevent
            @drop.prevent="drop"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @lostpointercapture="endDrag"
          />
        </div>
      </div>
      <div class="tools">
        <div class="zoom" role="group" :aria-label="t('flowchart.zoom')">
          <Button
            variant="text"
            :aria-label="t('statusBar.zoomOut')"
            :disabled="zoom <= 100"
            @click="zoom -= 50"
            ><ZoomOut :size="16"
          /></Button>
          <span>{{ zoom }}%</span>
          <Button
            variant="text"
            :aria-label="t('statusBar.zoomIn')"
            :disabled="zoom >= 400"
            @click="zoom += 50"
            ><ZoomIn :size="16"
          /></Button>
        </div>
        <Button
          variant="text"
          :aria-label="t('flowchart.undo')"
          :disabled="cursor < 1"
          @click="travel(-1)"
          ><Undo2 :size="16"
        /></Button>
        <Button
          variant="text"
          :aria-label="t('flowchart.redo')"
          :disabled="cursor >= history.length - 1"
          @click="travel(1)"
          ><Redo2 :size="16"
        /></Button>
        <Button
          variant="outline"
          :theme="connecting ? 'primary' : 'default'"
          :disabled="!node || draft.nodes.length < 2 || draft.edges.length >= 512"
          @click="connecting = !connecting"
          >{{ connecting ? t("flowchart.destination") : t("flowchart.connect") }}</Button
        >
        <Button variant="text" :disabled="!selected" @click="remove"
          ><Trash2 :size="15" />{{ t("flowchart.delete") }}</Button
        >
        <Button
          variant="text"
          :disabled="!draft.title.trim() || !draft.nodes.length"
          @click="download"
          ><Download :size="15" />{{ t("flowchart.export") }}</Button
        >
      </div>
      <Form
        v-if="node || edge"
        label-align="left"
        :label-width="zh ? 76 : 96"
        :prevent-submit-default="true"
      >
        <FormItem v-if="node" :label="t('flowchart.nodeText')"
          ><Input
            :aria-label="t('flowchart.nodeText')"
            ref="labelInput"
            v-model="node.text"
            @blur="record"
            :maxlength="4096"
        /></FormItem>
        <FormItem v-else-if="edge" :label="t('flowchart.edgeText')"
          ><Input
            :aria-label="t('flowchart.edgeText')"
            ref="labelInput"
            v-model="edge.label"
            @blur="record"
            :maxlength="1024"
        /></FormItem>
      </Form>
      <Form
        v-if="node"
        class="geometry"
        label-align="left"
        :label-width="zh ? 36 : 52"
        :prevent-submit-default="true"
      >
        <FormItem
          v-for="field in ['x', 'y', 'width', 'height'] as const"
          :key="field"
          :label="t(`flowchart.${field}`)"
        >
          <InputNumber
            :aria-label="t(`flowchart.${field}`)"
            :value="node[field]"
            theme="normal"
            @change="geometry(field, $event)"
          />
        </FormItem>
      </Form>
      <span v-if="error || exportError" role="alert">{{ t("flowchart.failed") }}</span>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "../../shared/gallery/gallery-choice" as gallery;
.geometry {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.palette button {
  @include gallery.choice(4px);
}

.editor {
  display: grid;
  gap: 12px;
}
.surface {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  height: min(46vh, 500px);
  border: 1px solid var(--sheetcraft-border-subtle);
}
.palette {
  display: grid;
  align-content: start;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 5px;
  overflow: auto;
}
.palette svg {
  width: 100%;
  height: 25px;
}
.zoom {
  display: flex;
  align-items: center;
  gap: 4px;
}
.viewport {
  overflow: auto;
  min-height: 0;
  min-width: 0;
}
.canvas {
  touch-action: none;
  min-width: 0;
  min-height: 0;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
