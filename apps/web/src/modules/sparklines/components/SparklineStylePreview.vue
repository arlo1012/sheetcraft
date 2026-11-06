<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { paintSparkline } from "../sparkline-painter";
const props = defineProps<{ definition: CellSparkline }>();
const canvas = ref<HTMLCanvasElement>();
watchEffect(
  () => {
    const definition = props.definition;
    const context = canvas.value?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 120, 64);
    context.save();
    context.scale(2, 2);
    paintSparkline(context, { x: 0, y: 0, width: 60, height: 32 }, definition, [1, 9, -2, 6, 3, 8]);
    context.restore();
  },
  { flush: "post" },
);
</script>
<template>
  <canvas ref="canvas" width="120" height="64" aria-hidden="true" class="sparkline-style-preview" />
</template>
<style scoped>
.sparkline-style-preview {
  display: block;
  width: 60px;
  height: 32px;
}
</style>
