<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, shallowRef, watch, type CSSProperties } from "vue";
import { collectShapeGroupAssetIds, type ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { PageLayoutProjection } from "@sheetcraft/sheet-engine/page-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";
import { cellTextFontRevision } from "../../../shared/cell-text/text-metrics";
import { useAppI18n } from "../../../shared/i18n";
import { resolveShapeGroupProjection } from "../resolved-shape-group";
import type { ResolvedShapeForestForRender } from "../resolved-shape-render-source";
import { ensureDrawingShapeTextFont } from "../shape-text-runtime";
import {
  getShapeGroupPaintFragments,
  type ShapeGroupFrameFragment,
} from "../shape-group-fragments";
import {
  planShapeGroupPaint,
  prepareShapeGroupPaint,
  getShapeGroupPaintAvailableBytes,
  type ShapeGroupPaintResult,
} from "../shape-group-paint";
import {
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
} from "../shape-detailed-presentation";

const props = defineProps<{
  root: ShapeGroupDrawing;
  metrics: PictureSheetMetrics;
  renderPass?: ResolvedShapeForestForRender;
  layout: SheetViewportLayout;
  pageProjection?: PageLayoutProjection;
  density: number;
  theme?: WorkbookTheme;
  assetUrls?: ReadonlyMap<string, string>;
  stackIndex: number;
}>();
const emit = defineEmits<{
  paint: [result: Extract<ShapeGroupPaintResult, { kind: "ready" }> | undefined];
  pointerdown: [fragment: ShapeGroupFrameFragment, event: PointerEvent];
  doubleclick: [fragment: ShapeGroupFrameFragment, event: MouseEvent];
  contextmenu: [fragment: ShapeGroupFrameFragment, event: MouseEvent];
  keydown: [event: KeyboardEvent];
}>();
const { t } = useAppI18n();
const status = shallowRef<"loading" | "ready" | "unavailable">("loading");
const presentation = shallowRef<Extract<ShapeGroupPaintResult, { kind: "ready" }>>();
const canvases = new Map<string, HTMLCanvasElement>();
let generation = 0;
let mounted = true;
const images = createCanvasImageCache(() => void render());
function projection() {
  if (!props.renderPass) return resolveShapeGroupProjection(props.root, props.metrics);
  const resolved = props.renderPass.getGroup(props.root.id);
  if (!resolved || resolved.sourceRoot !== props.root || props.renderPass.metrics !== props.metrics)
    throw new TypeError("The group presentation requires its exact whole-sheet pass.");
  return resolved;
}
const fragments = computed(() => {
  const frame = projection().layout;
  const bounds = presentation.value?.logicalBounds ?? {
    left: 0,
    top: 0,
    right: frame.rect.width,
    bottom: frame.rect.height,
  };
  return getShapeGroupPaintFragments(
    frame,
    bounds,
    props.layout,
    props.metrics,
    props.pageProjection,
  );
});
function key(fragment: ShapeGroupFrameFragment): string {
  return fragment.pageKey ?? fragment.paneId;
}
function bindCanvas(fragment: ShapeGroupFrameFragment, value: unknown): void {
  const id = key(fragment);
  if (value instanceof HTMLCanvasElement) {
    const previous = canvases.get(id);
    if (previous && previous !== value) releaseShapePresentationCanvas(previous);
    canvases.set(id, value);
  } else {
    const previous = canvases.get(id);
    if (previous) releaseShapePresentationCanvas(previous);
    canvases.delete(id);
  }
}
function fragmentStyle(fragment: ShapeGroupFrameFragment): CSSProperties {
  return {
    left: `${fragment.clippedRect.x}px`,
    top: `${fragment.clippedRect.y}px`,
    width: `${fragment.clippedRect.width}px`,
    height: `${fragment.clippedRect.height}px`,
    zIndex: props.stackIndex * 3,
  };
}
function contentStyle(fragment: ShapeGroupFrameFragment): CSSProperties {
  return {
    left: `${fragment.rect.x - fragment.clippedRect.x}px`,
    top: `${fragment.rect.y - fragment.clippedRect.y}px`,
    width: `${fragment.rect.width}px`,
    height: `${fragment.rect.height}px`,
    transform: `rotate(${props.root.rotation}deg)`,
  };
}
const canvasStyle = computed<CSSProperties>(() => {
  const result = presentation.value;
  return result
    ? {
        left: `${result.logicalBounds.left}px`,
        top: `${result.logicalBounds.top}px`,
        width: `${result.canvas.width / result.actualDensity}px`,
        height: `${result.canvas.height / result.actualDensity}px`,
      }
    : {};
});
function releasePresentation(): void {
  emit("paint", undefined);
  presentation.value?.dispose();
  presentation.value = undefined;
  for (const canvas of canvases.values()) releaseShapePresentationCanvas(canvas);
}
async function render(): Promise<void> {
  const request = ++generation;
  const root = props.root,
    metrics = props.metrics,
    renderPass = props.renderPass,
    theme = props.theme,
    assetUrls = props.assetUrls,
    density = props.density;
  const current = () =>
    mounted &&
    request === generation &&
    root === props.root &&
    metrics === props.metrics &&
    renderPass === props.renderPass &&
    theme === props.theme &&
    assetUrls === props.assetUrls &&
    density === props.density;
  releasePresentation();
  status.value = "loading";
  let owned: Extract<ShapeGroupPaintResult, { kind: "ready" }> | undefined;
  try {
    const resolved = projection();
    // Numeric validation and memory planning precede any new asset decoding.
    planShapeGroupPaint({
      root,
      metrics,
      renderPass,
      density,
      resources: { theme },
      interactive: true,
    });
    const urls = new Set<string>();
    for (const asset of collectShapeGroupAssetIds(root)) {
      const url = assetUrls?.get(asset);
      if (!url) throw new Error("A group paint asset is unavailable.");
      urls.add(url);
    }
    images.retain(urls);
    await Promise.all([
      ...resolved.leaves.flatMap((leaf) =>
        leaf.view && !leaf.collapsed && leaf.view.text
          ? [ensureDrawingShapeTextFont(leaf.view)]
          : [],
      ),
      ...[...urls].map((url) => images.load(url)),
    ]);
    if (!current()) return;
    renderPass?.assertCurrent(renderPass.sourceForest, metrics, renderPass.revision);
    let requestedDensity = density;
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = prepareShapeGroupPaint({
        root,
        metrics,
        renderPass,
        density: requestedDensity,
        interactive: true,
        resources: createPicturePaintResources(theme, assetUrls, images),
      });
      if (result.kind !== "ready") throw new Error("The complete group appearance is unavailable.");
      owned = result;
      const copies = getShapeGroupPaintFragments(
        result.layout,
        result.logicalBounds,
        props.layout,
        metrics,
        props.pageProjection,
      ).length;
      const copyBytes = result.canvas.width * result.canvas.height * 4 * copies;
      const available = getShapeGroupPaintAvailableBytes();
      if (copyBytes <= available) break;
      owned.dispose();
      owned = undefined;
      requestedDensity =
        result.actualDensity *
        Math.sqrt((result.ownedBytes + available) / (result.ownedBytes + copyBytes)) *
        0.95;
    }
    if (!owned) throw new RangeError("Group pane copies cannot satisfy their raster budget.");
    const result = owned;
    presentation.value = result;
    await nextTick();
    if (!current()) return;
    renderPass?.assertCurrent(renderPass.sourceForest, metrics, renderPass.revision);
    const copyBytes = result.canvas.width * result.canvas.height * 4 * canvases.size;
    if (copyBytes > getShapeGroupPaintAvailableBytes())
      throw new RangeError("Group pane copies exceed the presentation memory budget.");
    for (const canvas of canvases.values()) {
      resizeShapePresentationCanvas(canvas, result.canvas.width, result.canvas.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Group presentation canvas is unavailable.");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(result.canvas, 0, 0);
    }
    status.value = "ready";
    emit("paint", result);
    owned = undefined;
  } catch {
    if (current()) {
      releasePresentation();
      status.value = "unavailable";
    }
  } finally {
    if (owned) {
      if (presentation.value === owned) presentation.value = undefined;
      owned.dispose();
    }
  }
}
watch(
  () => [
    props.root,
    props.metrics,
    props.theme,
    props.assetUrls,
    props.density,
    cellTextFontRevision.value,
  ],
  () => void render(),
  { immediate: true, deep: true },
);
// A complete pass also captures unrelated worksheet drawings. Observe its
// identity without traversing optional caller data on those other sources.
watch(
  () => props.renderPass,
  () => void render(),
);
watch(
  () => [props.layout, props.pageProjection],
  () => void render(),
);
onBeforeUnmount(() => {
  mounted = false;
  generation++;
  releasePresentation();
  images.dispose();
  canvases.clear();
});
</script>
<template>
  <div
    v-for="fragment in fragments"
    :key="key(fragment)"
    class="shape-group-pixels"
    :style="fragmentStyle(fragment)"
    :data-shape-group-paint="root.id"
    :data-sheet-drawing-id="root.id"
    tabindex="0"
    role="group"
    :aria-label="root.name"
    @pointerdown="emit('pointerdown', fragment, $event)"
    @dblclick="emit('doubleclick', fragment, $event)"
    @contextmenu="emit('contextmenu', fragment, $event)"
    @keydown="emit('keydown', $event)"
  >
    <div class="shape-group-pixels__source" :style="contentStyle(fragment)">
      <canvas
        :ref="(value) => bindCanvas(fragment, value)"
        v-show="status === 'ready'"
        :style="canvasStyle"
        aria-hidden="true"
      />
    </div>
    <span v-if="status !== 'ready'" role="status" class="shape-group-pixels__status">{{
      status === "loading" ? t("drawing.groupLoading") : t("drawing.groupRenderingUnavailable")
    }}</span>
  </div>
</template>
<style scoped>
.shape-group-pixels {
  position: absolute;
  overflow: hidden;
  pointer-events: auto;
  touch-action: none;
  outline: none;
  cursor: move;
}
.shape-group-pixels__source {
  position: absolute;
  pointer-events: none;
}
.shape-group-pixels__source canvas {
  position: absolute;
  pointer-events: auto;
}
.shape-group-pixels__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
}
</style>
