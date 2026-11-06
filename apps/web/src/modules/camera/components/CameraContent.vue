<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { browserCellTextMeasurer } from "../../../shared/cell-text/text-metrics";
import { createCellPresentationCache } from "../../sheet-grid/canvas/cell-scene";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { paintCameraContent, type CameraPaintOptions } from "../camera-painter";
const props = defineProps<CameraPaintOptions>();
const canvas = ref<HTMLCanvasElement>();
const images = createCanvasImageCache(render);
const cache = createCellPresentationCache(browserCellTextMeasurer);
function render(): void {
  if (!canvas.value) return;
  paintCameraContent(canvas.value, props, images, cache);
  images.retain(new Set(props.imageAssetUrls?.values() ?? []));
}
watch(
  () => [
    canvas.value,
    props.drawing,
    props.sheet,
    props.resolveSheet,
    props.evaluator,
    props.sheet.defaultRowHeight,
    props.revision,
    props.imageAssetUrls,
    props.theme,
    props.locale,
    props.dateSystem,
  ],
  render,
  { flush: "post" },
);
onBeforeUnmount(() => images.dispose());
</script>
<template><canvas ref="canvas" class="camera-content" :aria-label="drawing.name" /></template>
<style scoped lang="scss">
.camera-content {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
