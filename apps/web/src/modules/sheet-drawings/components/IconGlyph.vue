<script setup lang="ts">
import { iconPaths, type SheetIconId } from "@sheetcraft/core/sheet-icons";
withDefaults(
  defineProps<{ id: SheetIconId; fill?: string; stroke?: string; strokeWidth?: number }>(),
  { fill: "currentColor", stroke: "none", strokeWidth: 0 },
);
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    :data-icon-glyph="id"
    preserveAspectRatio="xMidYMid meet"
  >
    <path
      :d="iconPaths[id]"
      :fill="fill"
      :stroke="stroke"
      :stroke-width="strokeWidth"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
