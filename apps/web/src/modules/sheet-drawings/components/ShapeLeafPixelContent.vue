<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { cellTextFontRevision } from "../../../shared/cell-text/text-metrics";
import { useAppI18n } from "../../../shared/i18n";
import { ensureDrawingShapeTextFont } from "../shape-text-runtime";
import { prepareShapeLeafPixels } from "../shape-leaf-pixels";
import {
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
  type ShapeDetailedPresentation,
} from "../shape-detailed-presentation";
const props = defineProps<{
  drawing: SheetGraphicDrawing;
  theme?: WorkbookTheme;
  density?: number;
  hideText?: boolean;
}>();
const emit = defineEmits<{ paint: [presentation: ShapeDetailedPresentation | undefined] }>();
const { t } = useAppI18n(),
  canvas = ref<HTMLCanvasElement>(),
  status = ref<"loading" | "ready" | "unavailable">("loading");
const bounds = ref({ left: 0, top: 0, width: props.drawing.width, height: props.drawing.height });
const style = computed(() => ({
  left: `${bounds.value.left}px`,
  top: `${bounds.value.top}px`,
  width: `${bounds.value.width}px`,
  height: `${bounds.value.height}px`,
}));
let generation = 0;
async function render() {
  const request = ++generation,
    drawing = props.drawing,
    theme = props.theme,
    density = props.density,
    hideText = props.hideText;
  const current = () =>
    request === generation &&
    drawing === props.drawing &&
    theme === props.theme &&
    density === props.density &&
    hideText === props.hideText;
  status.value = "loading";
  emit("paint", undefined);
  try {
    if (drawing.text && !hideText) await ensureDrawingShapeTextFont(drawing);
    await nextTick();
    if (!current() || !canvas.value) return;
    const result = prepareShapeLeafPixels({
      drawing,
      density: density ?? 1,
      hideText,
      sourceIdentity: drawing,
      resources: { theme },
    });
    if (result.kind !== "ready") {
      status.value = "unavailable";
      return;
    }
    try {
      if (!current() || !canvas.value) return;
      resizeShapePresentationCanvas(canvas.value, result.canvas.width, result.canvas.height);
      const context = canvas.value.getContext("2d");
      if (!context) throw Error("Shape leaf presentation canvas unavailable.");
      context.clearRect(0, 0, canvas.value.width, canvas.value.height);
      context.drawImage(result.canvas, 0, 0);
      bounds.value = {
        left: result.logicalBounds.left,
        top: result.logicalBounds.top,
        width: result.canvas.width / result.actualDensity,
        height: result.canvas.height / result.actualDensity,
      };
      status.value = "ready";
      // Body flip, readable text orientation and projection are already united.
      emit("paint", {
        drawing,
        canvas: canvas.value,
        density: result.actualDensity,
        bounds: { ...bounds.value },
        unflipped: true,
      });
    } finally {
      result.dispose();
    }
  } catch {
    if (current()) status.value = "unavailable";
  }
}
watch(
  () => [
    props.drawing,
    props.drawing.width,
    props.drawing.height,
    props.drawing.rotation,
    props.drawing.text,
    props.drawing.fill,
    props.drawing.stroke,
    props.drawing.strokeWidth,
    props.drawing.fontSize,
    props.drawing.color,
    props.drawing.bold,
    props.drawing.italic,
    props.drawing.shapeFlipX,
    props.drawing.shapeFlipY,
    JSON.stringify(props.drawing.shapeStyle),
    props.theme,
    props.density,
    props.hideText,
    cellTextFontRevision.value,
  ],
  () => void render(),
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(() => {
  generation++;
  if (canvas.value) releaseShapePresentationCanvas(canvas.value);
  emit("paint", undefined);
});
</script>
<template>
  <div class="shape-leaf-pixel-content" data-shape-leaf-pixel-content>
    <canvas ref="canvas" v-show="status === 'ready'" :style="style" aria-hidden="true" />
    <span v-if="status !== 'ready'" class="shape-leaf-pixel-content__status" role="status">{{
      status === "loading" ? t("image.loading") : t("image.assetUnavailable")
    }}</span>
  </div>
</template>
<style scoped>
.shape-leaf-pixel-content {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.shape-leaf-pixel-content canvas {
  position: absolute;
  pointer-events: auto;
}
.shape-leaf-pixel-content__status {
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
