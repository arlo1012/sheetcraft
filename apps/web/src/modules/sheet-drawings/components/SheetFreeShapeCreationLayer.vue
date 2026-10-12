<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import { Button as TButton } from "tdesign-vue-next";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  startPointerSession,
  type GestureEvent,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import type { ShapeCreationRequest } from "../useShapeCreation";
import {
  shapeCreationPointFromViewport,
  type ShapeCreationPoint,
} from "../shape-creation-geometry";
import { createFreeShapeDrawingFromPoints, MAX_FREE_SHAPE_POINTS } from "../free-shape-creation";
import { getStandardShapeViewportFragments } from "../standard-shape-layout";
import DrawingContent from "./DrawingContent.vue";

const props = defineProps<{
  request: ShapeCreationRequest;
  layout: SheetViewportLayout;
  scale: number;
  readOnly: boolean;
  revision?: number;
  locale?: string;
  commit: (request: ShapeCreationRequest, drawing: SheetGraphicDrawing) => boolean;
  cancel: (request: ShapeCreationRequest) => void;
}>();
type FreeTool = "curve" | "freeform" | "scribble";
type Lease = Readonly<{
  request: ShapeCreationRequest;
  layout: SheetViewportLayout;
  scale: number;
  revision: number | undefined;
  paneId: FrozenPaneId;
  tool: FreeTool;
}>;
type CompletedGesture = Readonly<{
  startIndex: number;
  origin: ShapeCreationPoint;
  dragged: boolean;
}>;
const RAW_POINT_LIMIT = 4096;
const STORED_POINT_LIMIT = MAX_FREE_SHAPE_POINTS;
const root = ref<HTMLElement>();
const points = shallowRef<readonly ShapeCreationPoint[]>([]);
const hover = shallowRef<ShapeCreationPoint>();
const lease = shallowRef<Lease>();
const preview = shallowRef<SheetGraphicDrawing>();
const pending = shallowRef<SheetGraphicDrawing>();
const failure = ref<"invalid" | "rejected" | "budget">();
let session: PointerSession | undefined;
let suppressPointerCancel = false;
let rawPointCount = 0;
let previousGesture: CompletedGesture | undefined;
let lastGesture: CompletedGesture | undefined;
let lastClosedAt = -Infinity;
const tool = computed<FreeTool | undefined>(() => {
  const choice = props.request.choice;
  return choice.kind === "drawingTool" &&
    (choice.tool === "curve" || choice.tool === "freeform" || choice.tool === "scribble")
    ? choice.tool
    : undefined;
});
const labels = computed(() =>
  props.locale === "zh-CN"
    ? {
        curve: "单击添加曲线节点；双击或选择“完成”结束绘制。",
        freeform: "单击添加顶点，按住拖动绘制自由线段；双击完成，单击起点闭合。",
        scribble: "按住并拖动绘制，松开完成。",
        continuous: "连续绘制",
        cancel: "取消绘制",
        finish: "完成",
        close: "闭合路径",
        retry: "重试插入",
        restart: "重新绘制",
        invalid: "路径过短或此位置无法绘制，请继续添加节点或重新绘制。",
        rejected: "插入未成功，预览已保留。请重试或取消绘制。",
        budget: "路径节点过多，未插入截断的路径。请重新绘制较短的路径。",
      }
    : {
        curve: "Click to add curve nodes; double-click or choose Finish to complete.",
        freeform:
          "Click for vertices or drag for freehand segments; double-click to finish, click the first node to close.",
        scribble: "Press and drag to draw; release to finish.",
        continuous: "Continuous drawing",
        cancel: "Cancel drawing",
        finish: "Finish",
        close: "Close path",
        retry: "Retry insertion",
        restart: "Start again",
        invalid: "The path is too short or cannot be drawn here. Add more nodes or start again.",
        rejected: "Insertion did not succeed. Your preview is preserved; retry or cancel drawing.",
        budget:
          "This path has too many nodes. No truncated path was inserted; start again with a shorter path.",
      },
);
const fragments = computed(() =>
  preview.value ? getStandardShapeViewportFragments(preview.value, props.layout) : [],
);
const firstNode = computed(() => {
  const owner = lease.value;
  const first = points.value[0];
  if (!owner || !first) return;
  const clip = owner.layout.panes[owner.paneId].clip;
  const translation = getPicturePaneTranslation(owner.paneId, owner.layout);
  return {
    clip,
    x: first.x + translation.x - clip.x,
    y: first.y + translation.y - clip.y,
    radius: 4 / owner.scale,
  };
});
const canFinish = computed(
  () => points.value.length >= 2 && !pending.value && failure.value !== "budget",
);
const canClose = computed(
  () => tool.value !== "scribble" && points.value.length >= 3 && canFinish.value,
);
function fragmentStyle(fragment: FloatingImageViewportFragment): CSSProperties {
  return {
    left: `${fragment.clippedRect.x}px`,
    top: `${fragment.clippedRect.y}px`,
    width: `${fragment.clippedRect.width}px`,
    height: `${fragment.clippedRect.height}px`,
  };
}
function contentStyle(fragment: FloatingImageViewportFragment): CSSProperties {
  return {
    left: `${fragment.rect.x - fragment.clippedRect.x}px`,
    top: `${fragment.rect.y - fragment.clippedRect.y}px`,
    width: `${fragment.rect.width}px`,
    height: `${fragment.rect.height}px`,
  };
}
function viewportPoint(event: MouseEvent, scale: number): ShapeCreationPoint {
  const bounds = root.value?.getBoundingClientRect();
  return {
    x: (event.clientX - (bounds?.left ?? 0)) / scale,
    y: (event.clientY - (bounds?.top ?? 0)) / scale,
  };
}
function owned(owner: Lease): boolean {
  return (
    props.request === owner.request &&
    props.layout === owner.layout &&
    props.scale === owner.scale &&
    props.revision === owner.revision &&
    !props.readOnly &&
    tool.value === owner.tool
  );
}
function sheetPoint(event: MouseEvent, owner: Lease): ShapeCreationPoint | undefined {
  return shapeCreationPointFromViewport(
    viewportPoint(event, owner.scale),
    owner.layout,
    owner.paneId,
  )?.point;
}
function cancelPointer(): void {
  const active = session;
  session = undefined;
  suppressPointerCancel = true;
  active?.cancel();
  suppressPointerCancel = false;
}
function resetDraft(): void {
  cancelPointer();
  points.value = [];
  hover.value = undefined;
  lease.value = undefined;
  preview.value = undefined;
  pending.value = undefined;
  failure.value = undefined;
  rawPointCount = 0;
  previousGesture = undefined;
  lastGesture = undefined;
}
function cancel(): void {
  const request = lease.value?.request ?? props.request;
  resetDraft();
  props.cancel(request);
}
function restart(): void {
  resetDraft();
  root.value?.focus({ preventScroll: true });
}
function updatePreview(): void {
  const owner = lease.value;
  if (!owner || pending.value) return;
  const draft = hover.value ? [...points.value, hover.value] : points.value;
  const value = createFreeShapeDrawingFromPoints({
    base: owner.request.base,
    tool: owner.tool,
    points: draft,
    layout: owner.layout,
  });
  // An out-of-bounds rubber band must not hide an otherwise valid draft.
  preview.value =
    value ??
    (hover.value
      ? createFreeShapeDrawingFromPoints({
          base: owner.request.base,
          tool: owner.tool,
          points: points.value,
          layout: owner.layout,
        })
      : undefined);
}
function exceededBudget(): void {
  hover.value = undefined;
  failure.value = "budget";
  cancelPointer();
  updatePreview();
}
/** Sampling is explicit and bounded; a budget failure blocks insertion of the partial trail. */
function appendSamples(samples: readonly ShapeCreationPoint[], final = false): boolean {
  const owner = lease.value;
  if (!owner || failure.value === "budget") return false;
  if (rawPointCount + samples.length > RAW_POINT_LIMIT) {
    exceededBudget();
    return false;
  }
  rawPointCount += samples.length;
  const next = [...points.value];
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    const previous = next.at(-1);
    const distance = previous ? Math.hypot(sample.x - previous.x, sample.y - previous.y) : Infinity;
    if (distance < 1e-7 || (!final && owner.tool !== "curve" && distance * owner.scale < 1))
      continue;
    if (next.length >= STORED_POINT_LIMIT) {
      exceededBudget();
      return false;
    }
    next.push(sample);
  }
  points.value = next;
  return true;
}
function attemptCommit(value: SheetGraphicDrawing, owner: Lease): void {
  if (!owned(owner)) {
    cancel();
    return;
  }
  pending.value = value;
  preview.value = value;
  hover.value = undefined;
  let success = false;
  try {
    success = props.commit(owner.request, value);
  } catch {
    // The session owns the detached result until a successful commit is acknowledged.
  }
  if (success) resetDraft();
  else if (lease.value === owner && owned(owner)) failure.value = "rejected";
}
function finish(closed = false): void {
  const owner = lease.value;
  if (!owner || pending.value || failure.value === "budget" || session?.active) return;
  if (!owned(owner)) {
    cancel();
    return;
  }
  const xs = points.value.map((p) => p.x),
    ys = points.value.map((p) => p.y);
  const extent = points.value.length
    ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    : 0;
  const distinct = new Set(points.value.map((p) => `${p.x},${p.y}`)).size;
  hover.value = undefined;
  if (distinct < (closed ? 3 : 2) || extent * owner.scale < 3) {
    failure.value = "invalid";
    updatePreview();
    return;
  }
  const value = createFreeShapeDrawingFromPoints({
    base: owner.request.base,
    tool: owner.tool,
    points: points.value,
    layout: owner.layout,
    ...(closed ? { closed: true } : {}),
  });
  if (!value) {
    failure.value = "invalid";
    updatePreview();
    return;
  }
  if (closed) lastClosedAt = performance.now();
  attemptCommit(value, owner);
}
function retry(): void {
  if (pending.value && lease.value && !props.readOnly) attemptCommit(pending.value, lease.value);
}
function isControl(event: Event): boolean {
  return (
    event.target instanceof Element && !!event.target.closest("[data-shape-creation-controls]")
  );
}
function start(event: PointerEvent): void {
  if (
    event.button !== 0 ||
    props.readOnly ||
    !tool.value ||
    pending.value ||
    failure.value === "budget" ||
    session?.active ||
    isControl(event)
  )
    return;
  // A close-on-first-node click may be the first click of a browser double-click.
  if (event.detail >= 2 && performance.now() - lastClosedAt < 600) return;
  // A new scribble press begins a new stroke after a short/invalid release.
  if (tool.value === "scribble" && lease.value && failure.value === "invalid") resetDraft();
  let owner = lease.value;
  if (owner && !owned(owner)) {
    cancel();
    return;
  }
  if (!owner) {
    if (!(props.scale > 0) || !Number.isFinite(props.scale)) return;
    const first = shapeCreationPointFromViewport(viewportPoint(event, props.scale), props.layout);
    if (!first) return;
    owner = {
      request: props.request,
      layout: props.layout,
      scale: props.scale,
      revision: props.revision,
      paneId: first.paneId,
      tool: tool.value,
    };
    lease.value = owner;
  }
  const origin = sheetPoint(event, owner);
  if (!origin) return;
  event.preventDefault();
  event.stopPropagation();
  root.value?.focus({ preventScroll: true });
  failure.value = undefined;
  hover.value = undefined;
  const first = points.value[0];
  if (
    owner.tool !== "scribble" &&
    points.value.length >= 3 &&
    first &&
    Math.hypot(origin.x - first.x, origin.y - first.y) * owner.scale <= 6
  ) {
    finish(true);
    return;
  }
  const startIndex = points.value.length;
  if (!appendSamples([origin], true)) return;
  updatePreview();
  const captured = owner;
  let dragged = false;
  const update = (next: GestureEvent, final = false): void => {
    if (!owned(captured)) {
      cancel();
      return;
    }
    const end = sheetPoint(next, captured);
    if (!end) {
      hover.value = undefined;
      if (final) failure.value = "invalid";
      updatePreview();
      return;
    }
    dragged ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) >= 3;
    if (captured.tool === "curve" || (captured.tool === "freeform" && !dragged)) hover.value = end;
    else {
      const coalesced = (next as PointerEvent).getCoalescedEvents?.() ?? [];
      if (coalesced.length + 1 > RAW_POINT_LIMIT - rawPointCount) {
        exceededBudget();
        return;
      }
      const events: readonly MouseEvent[] = coalesced.length ? [...coalesced, next] : [next];
      const samples = events
        .map((entry) => sheetPoint(entry, captured))
        .filter((entry): entry is ShapeCreationPoint => !!entry);
      if (!appendSamples(samples, final)) return;
      hover.value = undefined;
    }
    updatePreview();
  };
  session = startPointerSession({
    event,
    captureTarget: root.value,
    onMove: (next) => update(next),
    onEnd: (next) => {
      session = undefined;
      update(next, true);
      if (!owned(captured) || failure.value === "budget") return;
      previousGesture = lastGesture;
      lastGesture = { startIndex, origin, dragged };
      hover.value = undefined;
      updatePreview();
      if (captured.tool === "scribble" && failure.value !== "invalid") finish();
    },
    onCancel: () => {
      if (!suppressPointerCancel) cancel();
    },
  });
}
function move(event: PointerEvent): void {
  const owner = lease.value;
  if (!owner || session?.active || pending.value || failure.value === "budget") return;
  if (!owned(owner)) {
    cancel();
    return;
  }
  hover.value = isControl(event) ? undefined : sheetPoint(event, owner);
  updatePreview();
}
function leave(): void {
  if (session?.active || pending.value) return;
  hover.value = undefined;
  updatePreview();
}
function doubleClick(event: MouseEvent): void {
  if (isControl(event) || tool.value === "scribble" || pending.value || failure.value === "budget")
    return;
  event.preventDefault();
  event.stopPropagation();
  const owner = lease.value;
  if (!owner) return;
  // Browsers deliver both constituent clicks before dblclick. Keep the first
  // endpoint and remove only the second click's duplicate vertex, never a drag.
  if (
    lastGesture &&
    previousGesture &&
    !lastGesture.dragged &&
    !previousGesture.dragged &&
    Math.hypot(
      lastGesture.origin.x - previousGesture.origin.x,
      lastGesture.origin.y - previousGesture.origin.y,
    ) *
      owner.scale <=
      6
  ) {
    points.value = points.value.slice(0, lastGesture.startIndex);
  }
  finish();
}
function excludedShortcut(event: KeyboardEvent): boolean {
  return (
    event.isComposing ||
    event.defaultPrevented ||
    (event.target instanceof Element &&
      !!event.target.closest(
        '[role="dialog"], [role="menu"], form, input, textarea, select, [contenteditable="true"], [role="textbox"]',
      ))
  );
}
function escape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || excludedShortcut(event)) return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
}
function ownKeydown(event: KeyboardEvent): void {
  if (
    event.target !== root.value ||
    document.activeElement !== root.value ||
    excludedShortcut(event)
  )
    return;
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    event.stopPropagation();
    finish(event.shiftKey);
  } else if (
    event.key === "Backspace" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !session?.active &&
    !pending.value &&
    failure.value !== "budget"
  ) {
    event.preventDefault();
    event.stopPropagation();
    points.value = points.value.slice(0, -1);
    hover.value = undefined;
    failure.value = undefined;
    previousGesture = undefined;
    lastGesture = undefined;
    updatePreview();
  }
}
onMounted(() => {
  if (!props.readOnly && tool.value) root.value?.focus({ preventScroll: true });
  window.addEventListener("keydown", escape, true);
  window.addEventListener("blur", cancel);
});
onBeforeUnmount(() => {
  resetDraft();
  window.removeEventListener("keydown", escape, true);
  window.removeEventListener("blur", cancel);
});
watch(
  () => [props.request, props.layout, props.scale, props.revision, props.readOnly],
  () => {
    const owner = lease.value;
    resetDraft();
    if (owner && props.request === owner.request) props.cancel(owner.request);
  },
  { flush: "sync" },
);
</script>
<template>
  <div
    ref="root"
    class="free-shape-creation-layer"
    tabindex="-1"
    data-shape-creation-layer
    :data-free-shape-tool="tool"
    :data-free-shape-points="points.length"
    @pointerdown="start"
    @pointermove="move"
    @pointerleave="leave"
    @dblclick="doubleClick"
    @keydown="ownKeydown"
  >
    <div class="free-shape-creation-layer__controls" data-shape-creation-controls>
      <span>{{ request.choice.label[locale === "zh-CN" ? "zh-CN" : "en-US"] }}</span>
      <span v-if="request.continuous">{{ labels.continuous }}</span>
      <TButton size="small" theme="default" variant="base" @click="cancel">{{
        labels.cancel
      }}</TButton>
      <TButton
        v-if="failure === 'budget' || failure === 'invalid'"
        size="small"
        theme="default"
        variant="base"
        @click="restart"
        >{{ labels.restart }}</TButton
      >
      <TButton
        v-if="tool !== 'scribble' && !pending"
        size="small"
        theme="default"
        variant="base"
        :disabled="readOnly || !canClose"
        data-free-shape-close
        @click="finish(true)"
        >{{ labels.close }}</TButton
      >
      <TButton
        v-if="tool !== 'scribble' && !pending"
        size="small"
        theme="primary"
        variant="base"
        :disabled="readOnly || !canFinish"
        data-free-shape-finish
        @click="finish()"
        >{{ labels.finish }}</TButton
      >
      <TButton
        v-if="pending"
        size="small"
        theme="primary"
        variant="base"
        :disabled="readOnly"
        data-free-shape-retry
        @click="retry"
        >{{ labels.retry }}</TButton
      >
    </div>
    <div class="free-shape-creation-layer__hint" role="status">
      {{ failure ? labels[failure] : tool ? labels[tool] : "" }}
    </div>
    <div
      v-for="fragment in fragments"
      :key="fragment.paneId"
      class="free-shape-creation-layer__fragment"
      :style="fragmentStyle(fragment)"
    >
      <div class="free-shape-creation-layer__preview" :style="contentStyle(fragment)">
        <DrawingContent v-if="preview" :drawing="preview" />
      </div>
    </div>
    <svg
      v-if="firstNode && !pending"
      class="free-shape-creation-layer__nodes"
      :style="{
        left: `${firstNode.clip.x}px`,
        top: `${firstNode.clip.y}px`,
        width: `${firstNode.clip.width}px`,
        height: `${firstNode.clip.height}px`,
      }"
    >
      <circle :cx="firstNode.x" :cy="firstNode.y" :r="firstNode.radius" />
    </svg>
  </div>
</template>
<style scoped lang="scss">
.free-shape-creation-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  cursor: crosshair;
  touch-action: none;
  outline: none;
  pointer-events: auto;
  &__fragment,
  &__nodes {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
  }
  &__preview {
    position: absolute;
    pointer-events: none;
    opacity: 0.75;
  }
  &__nodes circle {
    fill: var(--sheetcraft-surface-panel);
    stroke: var(--sheetcraft-action-primary);
    stroke-width: 1;
  }
  &__controls {
    position: absolute;
    top: 12px;
    right: 12px;
    max-width: calc(100% - 24px);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: 8px;
    background: var(--sheetcraft-surface-panel);
    box-shadow: var(--sheetcraft-shadow-menu);
    cursor: default;
    z-index: 1;
  }
  &__controls span {
    color: var(--sheetcraft-text-primary);
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
  }
  &__hint {
    position: absolute;
    bottom: 12px;
    left: 12px;
    max-width: calc(100% - 24px);
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--sheetcraft-text-secondary);
    background: var(--sheetcraft-surface-panel);
    font-size: 12px;
    line-height: 18px;
    pointer-events: none;
  }
}
</style>
