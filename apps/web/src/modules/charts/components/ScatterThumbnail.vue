<script setup lang="ts">
import type { ScatterStyle } from "@sheetcraft/core/chart-presentation";
defineProps<{ variant: ScatterStyle; colors: readonly string[] }>();
const series = [
  {
    points: [
      [12, 42],
      [25, 29],
      [39, 36],
      [56, 15],
      [71, 22],
    ],
    straight: "M12 42L25 29 39 36 56 15 71 22",
    curve: "M12 42Q21 28 25 29C30 30 34 39 39 36S51 13 56 15L71 22",
  },
  {
    points: [
      [14, 46],
      [28, 39],
      [45, 43],
      [58, 28],
      [73, 32],
    ],
    straight: "M14 46L28 39 45 43 58 28 73 32",
    curve: "M14 46Q23 38 28 39T45 43C50 42 54 27 58 28L73 32",
  },
];
</script>
<template>
  <svg viewBox="0 0 82 56" aria-hidden="true" :data-scatter-thumb="variant">
    <path d="M8 6V50H78" fill="none" stroke="currentColor" opacity=".45" />
    <g
      v-for="(s, i) in series"
      :key="i"
      :stroke="colors[i % colors.length]"
      :fill="colors[i % colors.length]"
    >
      <path
        v-if="variant !== 'marker'"
        :d="variant === 'smooth' || variant === 'smoothMarker' ? s.curve : s.straight"
        fill="none"
        stroke-width="1.5"
      />
      <template
        v-if="variant === 'marker' || variant === 'smoothMarker' || variant === 'lineMarker'"
      >
        <circle v-for="(p, j) in s.points" :key="j" :cx="p[0]" :cy="p[1]" r="1.8" />
      </template>
    </g>
  </svg>
</template>
