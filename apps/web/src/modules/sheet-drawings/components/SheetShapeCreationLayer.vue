<script setup lang="ts">
import { getVisibleShapeNodeIds } from "../shape-visibility";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import { isFramedShapeDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  resolveSheetShapeConnections,
  type ResolvedSheetShapeConnections,
} from "@sheetcraft/core/shape-connector-layout";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import type { ShapeCreationRequest, ShapeCreationDraft } from "../useShapeCreation";
import { createShapeConnectorDrawing } from "../create-shape-connector";
import { resolveShapeForestForRender } from "../resolved-shape-render-source";
import {
  pickNearestShapeConnectorSite,
  type ShapeConnectorSiteCandidate,
} from "../shape-connector-site-picking";
import {
  createShapeDrawingFromChoice,
  shapeCreationPointFromViewport,
} from "../shape-creation-geometry";
import { getStandardShapeViewportFragments } from "../standard-shape-layout";
import {
  getShapePageFragments,
  shapePagePointFromViewport,
  getShapePageProjectionBands,
} from "../shape-page-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { shapeFrameWorldToLocal } from "@sheetcraft/core/shape-frame";
import { shapeViewLayout } from "../shape-view-layout";
import DrawingContent from "./DrawingContent.vue";

const props = defineProps<{
  request: ShapeCreationRequest;
  layout: SheetViewportLayout;
  metrics?: PictureSheetMetrics;
  pageProjection?: PageLayoutProjection;
  scale: number;
  readOnly: boolean;
  revision?: number;
  locale?: string;
  commit: (request: ShapeCreationRequest, drawing: ShapeCreationDraft) => boolean;
  cancel: (request: ShapeCreationRequest) => void;
}>();
const root = ref<HTMLElement>();
const preview = shallowRef<ShapeCreationDraft>();
const hoverSites = shallowRef<readonly ShapeConnectorSiteCandidate[]>([]);
const emptyForest = Object.freeze([]);
const previewPresentation = computed(() => {
  const source = preview.value;
  if (!source) return;
  if (!isFramedShapeDrawing(source)) return { drawing: source, route: undefined };
  if (!props.metrics || !source.shapeConnector) return;
  if (previewLease && !previewLease()) return;
  const forest = [...(props.request.sheet.drawings ?? emptyForest), source];
  try {
    const pass = resolveShapeForestForRender({
      drawings: forest,
      metrics: props.metrics,
      revision: props.revision ?? 0,
    });
    const connector = pass.getLeaf(source.id)?.connector;
    if (connector?.status === "ready")
      return { drawing: connector.paintView, route: connector.route };
  } catch {
    // A stale target/derived metric may invalidate a retained draft before the next pointer event.
    return;
  }
});
const creationConnections = computed(() => {
  if (props.request.choice.kind !== "line" || !props.metrics) return;
  void props.revision;
  try {
    return resolveSheetShapeConnections(props.request.sheet.drawings ?? emptyForest, props.metrics);
  } catch {
    return;
  }
});
const visibleNodeIds = computed(() =>
  getVisibleShapeNodeIds(props.request.sheet.drawings ?? emptyForest),
);
function showSites(
  context: ResolvedSheetShapeConnections,
  point: { x: number; y: number },
  near?: ShapeConnectorSiteCandidate,
) {
  let target =
    near && visibleNodeIds.value.has(near.targetId) ? context.getTarget(near.targetId) : undefined;
  if (!target) {
    for (let index = context.targets.length - 1; index >= 0; index--) {
      const candidate = context.targets[index]!;
      const carrier = context.getNode(candidate.nodeId)?.carrierLayout;
      if (
        candidate.status !== "ready" ||
        !carrier ||
        carrier.collapsed ||
        !visibleNodeIds.value.has(candidate.nodeId)
      )
        continue;
      const local = shapeFrameWorldToLocal(carrier.rect, carrier.angleDeg, point);
      if (
        local.x >= 0 &&
        local.y >= 0 &&
        local.x <= carrier.rect.width &&
        local.y <= carrier.rect.height
      ) {
        target = candidate;
        break;
      }
    }
  }
  hoverSites.value =
    target?.sites.map((site) => ({
      targetId: target.nodeId,
      rootId: target.rootId,
      path: target.path,
      preset: site.identity.preset,
      siteIndex: site.identity.index,
      identity: site.identity,
      position: site.position,
      direction: site.direction,
      distance: Math.hypot(point.x - site.position.x, point.y - site.position.y),
    })) ?? [];
}
const visibleSites = computed(() => {
  if (!props.metrics) return [];
  const bands = props.pageProjection
    ? getShapePageProjectionBands(props.layout, props.pageProjection, props.metrics)
    : (["topLeft", "top", "left", "body"] as const).map((paneId) => ({
        pageKey: paneId,
        clip: props.layout.panes[paneId].clip,
        translation: getPicturePaneTranslation(paneId, props.layout),
      }));
  return hoverSites.value
    .filter((site) => visibleNodeIds.value.has(site.targetId))
    .flatMap((site) =>
      bands.flatMap((band) => {
        const point = {
          x: site.position.x + band.translation.x,
          y: site.position.y + band.translation.y,
        };
        const clip = band.clip;
        return point.x >= clip.x &&
          point.y >= clip.y &&
          point.x < clip.x + clip.width &&
          point.y < clip.y + clip.height
          ? [
              {
                key: `${site.targetId}:${site.siteIndex}:${band.pageKey}`,
                point,
                targetId: site.targetId,
                siteIndex: site.siteIndex,
              },
            ]
          : [];
      }),
    );
});
function hover(event: PointerEvent) {
  if (
    session?.active ||
    props.readOnly ||
    props.request.choice.kind !== "line" ||
    !creationConnections.value
  )
    return;
  const position = props.pageProjection
    ? props.metrics &&
      shapePagePointFromViewport(
        point(event, props.scale),
        props.layout,
        props.pageProjection,
        props.metrics,
      )
    : shapeCreationPointFromViewport(point(event, props.scale), props.layout);
  if (!position) {
    hoverSites.value = [];
    return;
  }
  const context = creationConnections.value;
  showSites(
    context,
    position.point,
    pickNearestShapeConnectorSite(context, position.point, 10 / props.scale, visibleNodeIds.value),
  );
}
const failure = ref<"invalid" | "rejected">();
let session: PointerSession | undefined;
let previewLease: (() => boolean) | undefined;
const labels = computed(() =>
  props.locale === "zh-CN"
    ? {
        instruction: "在工作表上拖动以绘制；单击使用默认大小",
        continuous: "连续绘制",
        cancel: "结束绘制",
        retry: "重试插入",
        invalid: "此位置或大小无法绘制，请在工作表内重新拖动。",
        rejected: "插入未成功，预览已保留。请重试或结束绘制。",
      }
    : {
        instruction: "Drag on the sheet to draw; click for the default size",
        continuous: "Continuous drawing",
        cancel: "Finish drawing",
        retry: "Retry insertion",
        invalid: "This position or size cannot be drawn. Drag again within the sheet.",
        rejected: "Insertion did not succeed. Your preview is preserved; retry or finish drawing.",
      },
);
const fragments = computed(() => {
  const presentation = previewPresentation.value;
  if (!presentation) return [];
  const value = presentation.drawing;
  if (props.pageProjection)
    return props.metrics
      ? getShapePageFragments(
          value,
          props.layout,
          props.pageProjection,
          props.metrics,
          false,
          presentation.route,
        )
      : [];
  return value.kind === "shape"
    ? getStandardShapeViewportFragments(value, props.layout, false, false, presentation.route)
    : getFloatingImageViewportFragments(value, props.layout);
});
function fragmentKey(fragment: FloatingImageViewportFragment & { pageKey?: string }): string {
  return fragment.pageKey ?? fragment.paneId;
}
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
function point(event: MouseEvent, scale: number) {
  const bounds = root.value?.getBoundingClientRect();
  return {
    x: (event.clientX - (bounds?.left ?? 0)) / scale,
    y: (event.clientY - (bounds?.top ?? 0)) / scale,
  };
}
function retry(): void {
  if (props.readOnly || !preview.value || (previewLease && !previewLease())) return;
  const value = preview.value;
  attemptCommit(props.request, value);
}
function attemptCommit(request: ShapeCreationRequest, value: ShapeCreationDraft): void {
  let success = false;
  try {
    success = props.commit(request, value);
  } catch {
    // Keep the detached result available for an explicit retry.
  }
  if (success) {
    preview.value = undefined;
    hoverSites.value = [];
    previewLease = undefined;
    failure.value = undefined;
  } else if (props.request === request && preview.value === value) failure.value = "rejected";
}
function start(event: PointerEvent): void {
  if (
    event.button !== 0 ||
    props.readOnly ||
    session?.active ||
    (event.target instanceof Element && event.target.closest("[data-shape-creation-controls]"))
  )
    return;
  const request = props.request,
    layout = props.layout,
    metrics = props.metrics,
    pageProjection = props.pageProjection,
    scale = props.scale,
    revision = props.revision,
    workbook = request.workbook,
    sheet = request.sheet,
    generation = request.generation;
  const sourceForest = sheet.drawings ?? emptyForest;
  const choice = request.choice;
  if (
    choice.kind === "drawingTool" ||
    !(scale > 0) ||
    !Number.isFinite(scale) ||
    (pageProjection && !metrics)
  )
    return;
  const creationLayout = pageProjection && metrics ? shapeViewLayout(layout, metrics) : layout;
  const startPoint = pageProjection
    ? shapePagePointFromViewport(point(event, scale), layout, pageProjection, metrics!)
    : shapeCreationPointFromViewport(point(event, scale), layout);
  if (!startPoint) return;
  let connectionContext: ResolvedSheetShapeConnections | undefined;
  let beginSite: ShapeConnectorSiteCandidate | undefined;
  let sourcePass: ReturnType<typeof resolveShapeForestForRender> | undefined;
  if (choice.kind === "line" && metrics) {
    try {
      connectionContext = creationConnections.value;
      if (!connectionContext) throw new Error("The complete connection targets are unavailable.");
      sourcePass = resolveShapeForestForRender({
        drawings: sourceForest,
        metrics,
        revision: revision ?? 0,
      });
      beginSite = pickNearestShapeConnectorSite(
        connectionContext,
        startPoint.point,
        10 / scale,
        visibleNodeIds.value,
      );
    } catch {
      failure.value = "invalid";
      return;
    }
  }
  event.preventDefault();
  event.stopPropagation();
  root.value?.focus();
  failure.value = undefined;
  preview.value = undefined;
  const valid = () => {
    if (
      !(
        props.request === request &&
        props.request.workbook === workbook &&
        props.request.sheet === sheet &&
        props.request.generation === generation &&
        props.layout === layout &&
        props.metrics === metrics &&
        props.pageProjection === pageProjection &&
        props.scale === scale &&
        props.revision === revision &&
        (sheet.drawings ?? emptyForest) === sourceForest &&
        !props.readOnly
      )
    )
      return false;
    try {
      if (metrics) sourcePass?.assertCurrent(sourceForest, metrics, revision ?? 0);
      return true;
    } catch {
      return false;
    }
  };
  previewLease = valid;
  let moved = false;
  const update = (next: MouseEvent) => {
    if (!valid()) {
      session?.cancel();
      return;
    }
    moved ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) >= 3;
    const end = pageProjection
      ? shapePagePointFromViewport(point(next, scale), layout, pageProjection, metrics!)
      : shapeCreationPointFromViewport(point(next, scale), layout, startPoint.paneId);
    if (choice.kind === "line" && metrics && connectionContext) {
      if (!end) {
        preview.value = undefined;
        hoverSites.value = [];
        return;
      }
      const endSite = moved
        ? pickNearestShapeConnectorSite(
            connectionContext,
            end.point,
            10 / scale,
            visibleNodeIds.value,
          )
        : undefined;
      showSites(connectionContext, end.point, endSite);
      preview.value =
        createShapeConnectorDrawing({
          base: request.base,
          choice,
          start: startPoint.point,
          end: moved
            ? end.point
            : {
                x: startPoint.point.x + 120,
                y: startPoint.point.y + (choice.preset === "line" ? 0 : 80),
              },
          beginSite,
          endSite,
          shiftKey: next.shiftKey,
          forest: sourceForest,
          metrics,
        }) ?? undefined;
      return;
    }
    preview.value = end
      ? (createShapeDrawingFromChoice({
          base: request.base,
          choice,
          start: startPoint.point,
          end: end.point,
          layout: creationLayout,
          mode: moved ? "drag" : "click",
          shiftKey: next.shiftKey,
        }) ?? undefined)
      : undefined;
  };
  update(event);
  session = startPointerSession({
    event,
    captureTarget: root.value,
    onMove: update,
    onEnd: (next) => {
      update(next);
      if (!valid()) {
        preview.value = undefined;
        return;
      }
      const value = preview.value;
      if (!value) {
        failure.value = "invalid";
        return;
      }
      attemptCommit(request, value);
    },
    onCancel: () => {
      preview.value = undefined;
      hoverSites.value = [];
      previewLease = undefined;
      failure.value = undefined;
    },
  });
}
function cancel(): void {
  session?.cancel();
  preview.value = undefined;
  hoverSites.value = [];
  previewLease = undefined;
  failure.value = undefined;
  props.cancel(props.request);
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
  // Do not own shortcuts or dismissal in another dialog, form, or menu.
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest('[role="dialog"], [role="menu"], input, textarea, [contenteditable="true"]')
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
}
onMounted(() => {
  root.value?.focus({ preventScroll: true });
  window.addEventListener("keydown", keydown, true);
});
onBeforeUnmount(() => {
  session?.cancel();
  window.removeEventListener("keydown", keydown, true);
});
watch(
  () => [
    props.request,
    props.request.workbook,
    props.request.sheet,
    props.request.generation,
    props.layout,
    props.metrics,
    props.pageProjection,
    props.scale,
    props.revision,
    props.readOnly,
  ],
  () => {
    session?.cancel();
    preview.value = undefined;
    hoverSites.value = [];
    previewLease = undefined;
    failure.value = undefined;
  },
  { flush: "sync" },
);
</script>
<template>
  <div
    ref="root"
    class="shape-creation-layer"
    tabindex="-1"
    data-shape-creation-layer
    @pointerdown="start"
    @pointermove="hover"
  >
    <div class="shape-creation-layer__controls" data-shape-creation-controls>
      <span>{{ request.choice.label[locale === "zh-CN" ? "zh-CN" : "en-US"] }}</span>
      <span v-if="request.continuous" class="shape-creation-layer__mode">{{
        labels.continuous
      }}</span>
      <button
        v-if="failure === 'rejected' && preview"
        type="button"
        :disabled="readOnly"
        @click="retry"
      >
        {{ labels.retry }}
      </button>
      <button type="button" @click="cancel">{{ labels.cancel }}</button>
    </div>
    <div class="shape-creation-layer__hint" role="status">
      {{ failure ? labels[failure] : labels.instruction }}
    </div>
    <div
      v-for="fragment in fragments"
      :key="fragmentKey(fragment)"
      class="shape-creation-layer__fragment"
      :style="fragmentStyle(fragment)"
    >
      <div class="shape-creation-layer__preview" :style="contentStyle(fragment)">
        <DrawingContent
          v-if="previewPresentation"
          :drawing="previewPresentation.drawing"
          :connector-route="previewPresentation.route"
        />
      </div>
    </div>
    <span
      v-for="site in visibleSites"
      :key="site.key"
      class="shape-creation-layer__site"
      :style="{ left: `${site.point.x}px`, top: `${site.point.y}px` }"
      :data-shape-connection-target="site.targetId"
      :data-shape-connection-site="site.siteIndex"
      aria-hidden="true"
    />
  </div>
</template>
<style scoped lang="scss">
.shape-creation-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  cursor: crosshair;
  touch-action: none;
  outline: none;
  pointer-events: auto;
  &__fragment {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
  }
  &__preview {
    position: absolute;
    pointer-events: none;
    opacity: 0.75;
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
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 8px;
    background: var(--sheetcraft-surface-default);
    box-shadow: var(--sheetcraft-shadow-menu);
    cursor: default;
    z-index: 1;
  }
  &__controls span {
    color: var(--sheetcraft-text-primary);
    font-size: 12px;
    white-space: nowrap;
  }
  &__controls button {
    padding: 4px 8px;
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 4px;
    background: var(--sheetcraft-surface-default);
    color: var(--sheetcraft-text-primary);
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      background: var(--sheetcraft-surface-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 2px;
    }
  }
  &__hint {
    position: absolute;
    bottom: 12px;
    left: 12px;
    max-width: calc(100% - 24px);
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--sheetcraft-text-secondary);
    background: var(--sheetcraft-surface-default);
    font-size: 12px;
    pointer-events: none;
  }
  &__site {
    position: absolute;
    width: 8px;
    height: 8px;
    border: 1px solid #666;
    border-radius: 50%;
    background: #bbb;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
}
</style>
