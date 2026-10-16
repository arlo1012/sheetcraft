<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { getShapeTextAssetIds } from "@sheetcraft/core/shape-text";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";
import { cellTextFontRevision } from "../../../shared/cell-text/text-metrics";
import { ensureDrawingShapeTextFont, layoutDrawingShapeText } from "../shape-text-runtime";
import { prepareShapeTextPaint } from "../shape-text-paint";
import { projectShapeTextSurface } from "../shape-text-projection";
import {
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
  type ShapeDetailedPresentation,
} from "../shape-detailed-presentation";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  drawing: SheetGraphicDrawing;
  theme?: WorkbookTheme;
  assetUrls?: ReadonlyMap<string, string>;
  loadingAssetIds?: ReadonlySet<string>;
  missingAssetIds?: ReadonlySet<string>;
  density?: number;
}>();
const emit = defineEmits<{ paint: [presentation: ShapeDetailedPresentation | undefined] }>();
const { t } = useAppI18n();
const canvas = ref<HTMLCanvasElement>();
const status = ref<"loading" | "ready" | "unavailable">("loading");
const bounds = ref({ left: 0, top: 0, width: props.drawing.width, height: props.drawing.height });
let generation = 0;
const images = createCanvasImageCache(() => void render());
const style = computed(() => ({
  left: `${bounds.value.left}px`,
  top: `${bounds.value.top}px`,
  width: `${bounds.value.width}px`,
  height: `${bounds.value.height}px`,
}));
async function render() {
  const request = ++generation,
    drawing = props.drawing;
  status.value = "loading";
  emit("paint", undefined);
  try {
    await ensureDrawingShapeTextFont(drawing);
    await nextTick();
    if (request !== generation || drawing !== props.drawing || !canvas.value) return;
    const retained = new Set<string>();
    for (const id of getShapeTextAssetIds(drawing.shapeText, drawing.text)) {
      const url = props.assetUrls?.get(id);
      if (url) {
        retained.add(url);
        images.get(url);
      }
    }
    images.retain(retained);
    const layout = layoutDrawingShapeText(drawing);
    const result = prepareShapeTextPaint({
      drawing,
      layout,
      density: props.density ?? 1,
      resources: createPicturePaintResources(props.theme, props.assetUrls, images),
    });
    if (result.kind !== "ready") {
      status.value =
        result.missingAssetIds.length > 0 &&
        result.missingAssetIds.every((id) => {
          if (!id || props.missingAssetIds?.has(id)) return false;
          const url = props.assetUrls?.get(id);
          return url ? images.state?.(url) === "loading" : !!props.loadingAssetIds?.has(id);
        })
          ? "loading"
          : "unavailable";
      return;
    }
    try {
      const projected = projectShapeTextSurface(drawing, result, props.theme);
      const density = result.actualDensity;
      const nextBounds = {
        left: projected.left / density,
        top: projected.top / density,
        width: projected.surface.width / density,
        height: projected.surface.height / density,
      };
      resizeShapePresentationCanvas(
        canvas.value,
        projected.surface.width,
        projected.surface.height,
      );
      const context = canvas.value.getContext("2d");
      if (!context) throw new Error("Shape text canvas unavailable.");
      const pixels = context.createImageData(projected.surface.width, projected.surface.height);
      pixels.data.set(projected.surface.data);
      context.putImageData(pixels, 0, 0);
      bounds.value = nextBounds;
      status.value = "ready";
      emit("paint", {
        drawing,
        canvas: canvas.value,
        density,
        bounds: { ...nextBounds },
        unflipped: true,
      });
    } finally {
      result.dispose();
    }
  } catch {
    if (request === generation) status.value = "unavailable";
  }
}
watch(
  () => [
    props.drawing,
    props.theme,
    props.assetUrls,
    props.loadingAssetIds,
    props.missingAssetIds,
    props.density,
    cellTextFontRevision.value,
  ],
  () => void render(),
  { immediate: true, deep: true },
);
onBeforeUnmount(() => {
  generation++;
  images.dispose();
  if (canvas.value) releaseShapePresentationCanvas(canvas.value);
  emit("paint", undefined);
});
</script>
<template>
  <div class="shape-text-content" data-shape-text-content>
    <canvas ref="canvas" v-show="status === 'ready'" :style="style" aria-hidden="true" />
  </div>
  <span v-if="status !== 'ready'" class="shape-text-content__status" role="status">{{
    status === "loading" ? t("drawing.textLoading") : t("drawing.textRenderingUnavailable")
  }}</span>
</template>
<style scoped>
.shape-text-content {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  pointer-events: none;
}
.shape-text-content canvas {
  position: absolute;
  pointer-events: auto;
}
.shape-text-content__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  pointer-events: auto;
}
</style>
