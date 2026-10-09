<script setup lang="ts">
import type { ConditionalFormatIconSet } from "@sheetcraft/core/conditional-formatting";
import { ref, watchPostEffect } from "vue";
import { paintConditionalFormatIcon } from "./conditional-format-icons";

const props = defineProps<{ iconSet: ConditionalFormatIconSet; iconIndex: number }>();
const canvas = ref<HTMLCanvasElement>();

watchPostEffect(() => {
  const element = canvas.value;
  const context = element?.getContext("2d");
  if (!element || !context) return;
  const ratio = globalThis.devicePixelRatio || 1;
  element.width = 24 * ratio;
  element.height = 24 * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, 24, 24);
  paintConditionalFormatIcon(
    context,
    { x: 0, y: 0, width: 24, height: 24 },
    props.iconSet,
    props.iconIndex,
  );
});
</script>

<template>
  <canvas ref="canvas" class="conditional-format-icon" aria-hidden="true" />
</template>

<style scoped lang="scss">
.conditional-format-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
}
</style>
