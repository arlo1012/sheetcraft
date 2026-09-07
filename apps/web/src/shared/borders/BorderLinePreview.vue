<script setup lang="ts">
import { computed } from "vue";
import type { CellBorderLineStyle } from "@idea10/core/style";
import { getBorderLinePresentation } from "./borderPresentation";

const props = withDefaults(
  defineProps<{
    lineStyle: CellBorderLineStyle;
    color?: string;
    width?: number;
    height?: number;
  }>(),
  { color: "currentColor", width: 48, height: 12 },
);

const presentation = computed(() => getBorderLinePresentation(props.lineStyle));
const centerY = computed(() => props.height / 2);
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    aria-hidden="true"
    focusable="false"
  >
    <line
      v-for="offset in presentation.offsets"
      :key="offset"
      x1="0"
      :y1="centerY + offset"
      :x2="width"
      :y2="centerY + offset"
      :stroke="color"
      :stroke-width="presentation.strokeWidth"
      :stroke-dasharray="presentation.dashArray"
      :stroke-linecap="presentation.lineCap"
    />
  </svg>
</template>
