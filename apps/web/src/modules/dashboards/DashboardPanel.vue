<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, shallowRef } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import {
  GripVertical,
  Scaling,
  Plus,
  Type,
  Palette,
  Expand,
  Settings,
  Download,
  Undo2,
  Redo2,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ChartColumn,
  ChartLine,
  ChartBar,
  ChartPie,
  ChartNoAxesCombined,
  Hash,
  LetterText,
  FileSpreadsheet,
} from "lucide-vue-next";
import {
  dashboardKinds,
  type SheetDashboard,
  type DashboardKind,
  type DashboardWidget,
} from "@sheetcraft/core/dashboard";
import type { Sheet, Workbook, SheetEvaluator } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { downloadBlob } from "../../shared/files/download";
import DashboardWidgetView from "./DashboardWidgetView.vue";
import { dashboardLayout } from "./dashboard-layout";
const props = defineProps<{
  sheet: Sheet;
  workbook: Workbook;
  revision: number;
  evaluator: SheetEvaluator;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  update: (board: SheetDashboard) => boolean;
}>();
const emit = defineEmits<{
  add: [kind: DashboardKind];
  edit: [widget: DashboardWidget];
  undo: [];
  redo: [];
  xlsx: [];
}>();
const { t, locale } = useAppI18n();
const root = ref<HTMLElement>();
const board = computed(() => {
  void props.revision;
  return props.sheet.dashboard!;
});
const preference = ref<"boardTitle" | "theme" | "settings" | undefined>();
const draft = shallowRef<{
  title: string;
  showTitle: boolean;
  theme: SheetDashboard["theme"];
  snapshot: boolean;
}>();
const adding = ref(false),
  exporting = ref(false),
  failed = ref(false),
  columns = ref(3);
type CardGesture = {
  pointerId: number;
  kind: "move" | "resize";
  widget: DashboardWidget;
  board: SheetDashboard;
  startX: number;
  startY: number;
  columnPitch: number;
  rowPitch: number;
  width: DashboardWidget["width"];
  height: DashboardWidget["height"];
  targetId?: string;
};
const gesture = shallowRef<CardGesture>();
const grid = computed(() => {
  const active = gesture.value;
  const widgets =
    active?.kind === "resize" && active.board === board.value
      ? board.value.widgets.map((w) =>
          w.id === active.widget.id ? { ...w, width: active.width, height: active.height } : w,
        )
      : board.value.widgets;
  return dashboardLayout(widgets, columns.value);
});
function beginGesture(event: PointerEvent, widget: DashboardWidget, kind: CardGesture["kind"]) {
  if (props.disabled || event.button !== 0 || gesture.value) return;
  const handle = event.currentTarget as HTMLElement,
    gridElement = handle.closest(".board-grid");
  if (!gridElement) return;
  const style = getComputedStyle(gridElement);
  gesture.value = {
    pointerId: event.pointerId,
    kind,
    widget,
    board: board.value,
    startX: event.clientX,
    startY: event.clientY,
    columnPitch:
      (gridElement.getBoundingClientRect().width + parseFloat(style.columnGap)) / columns.value,
    rowPitch: parseFloat(style.gridAutoRows) + parseFloat(style.rowGap),
    width: widget.width,
    height: widget.height,
  };
  handle.setPointerCapture(event.pointerId);
}
function trackGesture(event: PointerEvent) {
  const active = gesture.value;
  if (!active || active.pointerId !== event.pointerId) return;
  if (active.kind === "move") {
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("article[data-widget-id]");
    gesture.value = {
      ...active,
      targetId: target && root.value?.contains(target) ? target.dataset.widgetId : undefined,
    };
  } else {
    const dx = Math.round((event.clientX - active.startX) / active.columnPitch);
    const dy = Math.round((event.clientY - active.startY) / active.rowPitch);
    const width =
      dx === 0
        ? active.widget.width
        : Math.max(1, Math.min(columns.value, Math.min(columns.value, active.widget.width) + dx));
    gesture.value = {
      ...active,
      width: width as DashboardWidget["width"],
      height: Math.max(1, Math.min(2, active.widget.height + dy)) as DashboardWidget["height"],
    };
  }
}
function finishGesture(event: PointerEvent) {
  trackGesture(event);
  const active = gesture.value;
  if (!active || active.pointerId !== event.pointerId) return;
  gesture.value = undefined;
  if (props.disabled || active.board !== board.value) return;
  const widgets = board.value.widgets;
  if (active.kind === "move") {
    const to = widgets.findIndex((w) => w.id === active.targetId);
    const from = widgets.findIndex((w) => w.id === active.widget.id);
    if (from >= 0 && to >= 0 && from !== to) move(active.widget, to - from);
  } else if (active.width !== active.widget.width || active.height !== active.widget.height) {
    failed.value = !props.update({
      ...board.value,
      widgets: widgets.map((w) =>
        w.id === active.widget.id ? { ...w, width: active.width, height: active.height } : w,
      ),
    });
  }
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!root.value) return;
  observer = new ResizeObserver(([entry]) => {
    if (entry)
      columns.value = entry.contentRect.width < 610 ? 1 : entry.contentRect.width < 1010 ? 2 : 3;
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
function settings(tab: "boardTitle" | "theme" | "settings") {
  preference.value = tab;
  const b = board.value;
  draft.value = {
    title: b.title || props.sheet.name,
    showTitle: tab === "boardTitle" ? true : b.showTitle,
    theme: b.theme,
    snapshot: b.snapshot,
  };
  failed.value = false;
}
function saveSettings() {
  if (!draft.value) return;
  if (props.update({ ...board.value, ...draft.value })) {
    preference.value = undefined;
    draft.value = undefined;
  } else failed.value = true;
}
function remove(widget: DashboardWidget) {
  failed.value = !props.update({
    ...board.value,
    widgets: board.value.widgets.filter((w) => w.id !== widget.id),
  });
}
function move(widget: DashboardWidget, step: number) {
  const widgets = board.value.widgets.slice(),
    index = widgets.findIndex((w) => w.id === widget.id);
  if (index + step < 0 || index + step >= widgets.length) return;
  widgets.splice(index, 1);
  widgets.splice(index + step, 0, widget);
  failed.value = !props.update({ ...board.value, widgets });
}
async function png() {
  if (exporting.value) return;
  exporting.value = true;
  failed.value = false;
  try {
    const { dashboardPng } = await import("./dashboard-snapshot");
    const { blob } = await dashboardPng(props.workbook, props.sheet, {
      records: t("dashboard.records"),
      blank: t("dashboard.blank"),
      noSource: t("dashboard.noSource"),
    });
    downloadBlob(blob, props.sheet.name + ".png");
  } catch {
    failed.value = true;
  } finally {
    exporting.value = false;
  }
}
async function fullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await root.value?.requestFullscreen();
}
function choose(kind: DashboardKind) {
  adding.value = false;
  emit("add", kind);
}
</script>
<template>
  <section
    ref="root"
    class="dashboard"
    :class="'theme-' + board.theme"
    :aria-label="t('dashboard.title')"
  >
    <header class="dashboard-bar">
      <Button
        variant="text"
        :disabled="disabled || board.widgets.length >= 128"
        @click="adding = true"
        ><Plus :size="16" />{{ t("dashboard.add") }}</Button
      >
      <Button variant="text" :disabled="disabled" @click="settings('boardTitle')"
        ><Type :size="16" />{{ t("dashboard.boardTitle") }}</Button
      >
      <Button variant="text" :disabled="disabled" @click="settings('theme')"
        ><Palette :size="16" />{{ t("dashboard.theme") }}</Button
      >
      <Button variant="text" @click="fullscreen"
        ><Expand :size="16" />{{ t("dashboard.full") }}</Button
      >
      <Button
        variant="text"
        :aria-label="t('flowchart.undo')"
        :disabled="!canUndo"
        @click="emit('undo')"
        ><Undo2 :size="15"
      /></Button>
      <Button
        variant="text"
        :aria-label="t('flowchart.redo')"
        :disabled="!canRedo"
        @click="emit('redo')"
        ><Redo2 :size="15"
      /></Button>
      <span class="grow" />
      <Button variant="text" :disabled="disabled" @click="settings('settings')"
        ><Settings :size="16" />{{ t("dashboard.settings") }}</Button
      >
      <Button variant="text" :loading="exporting" @click="png"
        ><Download :size="16" />{{ t("dashboard.export") }}</Button
      >
      <Button variant="text" :aria-label="t('xlsx.actions.export')" @click="emit('xlsx')"
        ><FileSpreadsheet :size="16"
      /></Button>
    </header>
    <div class="board-scroll">
      <h2 v-if="board.showTitle">{{ board.title || sheet.name }}</h2>
      <div v-if="!board.widgets.length" class="empty">
        <h2>{{ t("dashboard.heading") }}</h2>
        <div class="choices">
          <button
            v-for="kind in dashboardKinds"
            :key="kind"
            :disabled="disabled"
            @click="choose(kind)"
          >
            <ChartColumn v-if="kind === 'column'" /><ChartLine
              v-else-if="kind === 'line'"
            /><ChartBar v-else-if="kind === 'bar'" /><ChartPie
              v-else-if="kind === 'pie'"
            /><ChartNoAxesCombined v-else-if="kind === 'combo'" /><Hash
              v-else-if="kind === 'number'"
            /><LetterText v-else />{{ t(`dashboard.${kind}`) }}
          </button>
        </div>
      </div>
      <div
        v-else
        class="board-grid"
        @pointermove="trackGesture"
        @pointerup="finishGesture"
        @lostpointercapture="gesture = undefined"
        @pointercancel="gesture = undefined"
        :style="{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }"
      >
        <article
          v-for="(p, i) in grid"
          :key="p.widget.id"
          :data-widget-id="p.widget.id"
          :class="{
            'drop-target': gesture?.targetId === p.widget.id && gesture.widget.id !== p.widget.id,
          }"
          :aria-label="p.widget.title"
          :style="{
            gridColumn: `${p.col + 1} / span ${p.width}`,
            gridRow: `${p.row + 1} / span ${p.height}`,
          }"
          @dblclick="!disabled && emit('edit', p.widget)"
        >
          <header>
            <span
              v-if="!disabled"
              class="move-handle"
              :title="t('dashboard.drag')"
              @pointerdown.prevent="beginGesture($event, p.widget, 'move')"
              ><GripVertical :size="16" /></span
            ><strong>{{ p.widget.title }}</strong>
            <div class="card-tools">
              <Button
                variant="text"
                :aria-label="t('dashboard.earlier')"
                :disabled="disabled || i === 0"
                @click="move(p.widget, -1)"
                ><ArrowLeft :size="14"
              /></Button>
              <Button
                variant="text"
                :aria-label="t('dashboard.later')"
                :disabled="disabled || i === grid.length - 1"
                @click="move(p.widget, 1)"
                ><ArrowRight :size="14"
              /></Button>
              <Button
                variant="text"
                :aria-label="t('dashboard.edit')"
                :disabled="disabled"
                @click="emit('edit', p.widget)"
                ><Pencil :size="14"
              /></Button>
              <Button
                variant="text"
                :aria-label="t('dashboard.remove')"
                :disabled="disabled"
                @click="remove(p.widget)"
                ><Trash2 :size="14"
              /></Button>
            </div>
          </header>
          <DashboardWidgetView
            :key="p.widget.kind"
            :widget="p.widget"
            :workbook="workbook"
            :revision="revision"
            :evaluator="evaluator"
          />
          <span
            v-if="!disabled"
            class="resize-handle"
            :title="t('dashboard.resize')"
            @pointerdown.prevent="beginGesture($event, p.widget, 'resize')"
            ><Scaling :size="14"
          /></span>
        </article>
      </div>
      <p v-if="failed" role="alert">{{ t("dashboard.error") }}</p>
    </div>
    <Dialog
      :visible="adding"
      :header="t('dashboard.add')"
      width="460px"
      :footer="false"
      @close="adding = false"
    >
      <div class="add-list">
        <Button
          v-for="kind in dashboardKinds"
          :key="kind"
          variant="outline"
          @click="choose(kind)"
          >{{ t(`dashboard.${kind}`) }}</Button
        >
      </div>
    </Dialog>
    <Dialog
      v-if="preference && draft"
      :visible="true"
      :header="t(`dashboard.${preference}`)"
      :confirm-btn="t('dashboard.apply')"
      :cancel-btn="t('picture.cancel')"
      @confirm="saveSettings"
      @close="preference = undefined"
    >
      <Form label-align="right" :label-width="locale === 'zh-CN' ? 80 : 105">
        <template v-if="preference === 'boardTitle'"
          ><FormItem :label="t('dashboard.boardTitle')"
            ><Input
              v-model="draft.title"
              :maxlength="255"
              :aria-label="t('dashboard.boardTitle')" /></FormItem
          ><FormItem
            ><Checkbox v-model="draft.showTitle">{{ t("dashboard.showTitle") }}</Checkbox></FormItem
          ></template
        >
        <FormItem v-else-if="preference === 'theme'" :label="t('dashboard.theme')"
          ><Select
            v-model="draft.theme"
            :options="
              (['light', 'blue', 'dark'] as const).map((value) => ({
                value,
                label: t(`dashboard.${value}`),
              }))
            "
        /></FormItem>
        <FormItem v-else
          ><Checkbox v-model="draft.snapshot">{{ t("dashboard.snapshot") }}</Checkbox></FormItem
        >
      </Form>
    </Dialog>
  </section>
</template>
<style scoped lang="scss">
@use "../../shared/gallery/gallery-choice" as gallery;
.dashboard {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: #f6f7f9;
}
.dashboard.theme-blue {
  background: #e9f2fc;
}
.dashboard.theme-dark {
  background: #192531;
}
.theme-dark .board-scroll > h2,
.theme-dark .empty > h2 {
  color: #fff;
}
.dashboard-bar,
article header {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--sheetcraft-surface-panel);
  padding: 6px;
}
.dashboard-bar {
  overflow-x: auto;
}
.grow {
  flex: 1;
}
.board-scroll {
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.board-grid {
  display: grid;
  grid-auto-rows: 244px;
  gap: 16px;
}
article {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: #fff;
  color: #24272c;
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: 5px;
  padding: 7px;
}
article strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.move-handle,
.resize-handle {
  display: inline-flex;
  touch-action: none;
  user-select: none;
  color: var(--sheetcraft-text-muted);
}
.move-handle {
  cursor: grab;
}
.resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  padding: 3px;
  cursor: nwse-resize;
}
.drop-target {
  outline: 2px solid var(--td-brand-color);
}
.card-tools {
  display: flex;
  margin-left: auto;
  opacity: 0;
}
article:hover .card-tools,
article:focus-within .card-tools {
  opacity: 1;
}
.empty {
  max-width: 800px;
  margin: 6vh auto;
  text-align: center;
}
.choices {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 40px 0;
}
.choices button {
  @include gallery.choice(22px);
  display: grid;
  justify-items: center;
  gap: 14px;
  background: white;
  border: 1px solid var(--sheetcraft-border-subtle);
}
.choices svg {
  width: 40px;
  height: 40px;
  color: #4e89bd;
}
.add-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
</style>
