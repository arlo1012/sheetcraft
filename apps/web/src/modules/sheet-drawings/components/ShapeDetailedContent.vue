<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { getShapeStyleAssetIds } from "@sheetcraft/core/shape-style";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";
import { prepareShapeDetailedPaint } from "../shape-detailed-paint";
import { getDrawingShapeGeometry } from "../shape-geometry";
import {
  shapePresentationBounds,
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
  type ShapeDetailedPresentation,
} from "../shape-detailed-presentation";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  drawing: SheetGraphicDrawing;
  theme?: WorkbookTheme;
  assetUrls?: ReadonlyMap<string, string>;
  density?: number;
}>();
const emit = defineEmits<{
  paint: [presentation: ShapeDetailedPresentation | undefined];
}>();
const { t } = useAppI18n();
const canvas = ref<HTMLCanvasElement>();
const status = ref<"loading" | "ready" | "unavailable">("loading");
const bounds = ref({
  left: 0,
  top: 0,
  width: props.drawing.width,
  height: props.drawing.height,
});
let generation = 0;
const images = createCanvasImageCache(() => void render());
const style = computed(() => ({
  left: `${bounds.value.left}px`,
  top: `${bounds.value.top}px`,
  width: `${bounds.value.width}px`,
  height: `${bounds.value.height}px`,
}));
const mirror = computed(() => ({
  transform: `matrix(${props.drawing.shapeFlipX ? -1 : 1},0,0,${props.drawing.shapeFlipY ? -1 : 1},${props.drawing.shapeFlipX ? props.drawing.width : 0},${props.drawing.shapeFlipY ? props.drawing.height : 0})`,
}));
async function render() {
  const request = ++generation;
  const drawing = props.drawing;
  status.value = "loading";
  emit("paint", undefined);
  try {
    // Wait for our own canvas before acquiring a shared cache result: eviction can
    // zero that result, so the subsequent prepare/copy segment must never yield.
    await nextTick();
    if (request !== generation || drawing !== props.drawing || !canvas.value) return;
    const geometry = getDrawingShapeGeometry(drawing);
    if (!geometry) throw new Error("Shape geometry unavailable.");
    const retained = new Set<string>();
    for (const id of getShapeStyleAssetIds(drawing.shapeStyle)) {
      const url = props.assetUrls?.get(id);
      if (url) {
        retained.add(url);
        images.get(url);
      }
    }
    images.retain(retained);
    const result = prepareShapeDetailedPaint({
      drawing,
      geometry,
      density: props.density ?? 1,
      resources: createPicturePaintResources(props.theme, props.assetUrls, images),
    });
    if (result.kind !== "ready") {
      status.value = result.missingAssetIds.every((id) => {
        const url = props.assetUrls?.get(id);
        return !!url && images.state?.(url) === "loading";
      })
        ? "loading"
        : "unavailable";
      return;
    }
    bounds.value = shapePresentationBounds(result);
    resizeShapePresentationCanvas(canvas.value, result.canvas.width, result.canvas.height);
    const context = canvas.value.getContext("2d");
    if (!context) throw new Error("Shape canvas unavailable.");
    context.clearRect(0, 0, canvas.value.width, canvas.value.height);
    context.drawImage(result.canvas, 0, 0);
    status.value = "ready";
    emit("paint", {
      drawing,
      canvas: canvas.value,
      density: result.actualDensity,
      bounds: { ...bounds.value },
    });
  } catch {
    if (request === generation) status.value = "unavailable";
  }
}
watch(
  () =>
    [
      props.drawing,
      props.drawing.width,
      props.drawing.height,
      props.drawing.rotation,
      props.drawing.fill,
      props.drawing.stroke,
      props.drawing.strokeWidth,
      props.drawing.text,
      props.drawing.shape,
      props.drawing.shapeGeometry,
      props.drawing.shapePath,
      props.drawing.shapeStyle,
      props.drawing.shapeLineEnds,
      props.drawing.shapeFlipX,
      props.drawing.shapeFlipY,
      props.theme,
      props.assetUrls,
      props.density,
    ] as const,
  () => void render(),
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  images.dispose();
  if (canvas.value) releaseShapePresentationCanvas(canvas.value);
  emit("paint", undefined);
});
</script>
<template>
  <div class="shape-detailed-content" :style="mirror" data-shape-detailed-content>
    <canvas ref="canvas" v-show="status === 'ready'" :style="style" aria-hidden="true" />
  </div>
  <span v-if="status !== 'ready'" class="shape-detailed-content__status" role="status">
    {{ status === "loading" ? t("image.loading") : t("image.assetUnavailable") }}
  </span>
</template>
<style scoped>
.shape-detailed-content {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  pointer-events: none;
}
.shape-detailed-content canvas {
  position: absolute;
  pointer-events: auto;
}
.shape-detailed-content__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--sheetcraft-text-secondary);
  pointer-events: auto;
}
</style>
