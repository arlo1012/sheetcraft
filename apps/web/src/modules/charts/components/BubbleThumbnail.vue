<script setup lang="ts">
import { useId } from "vue";
defineProps<{ shaded: boolean; colors: readonly string[] }>();
const gradient = useId();
const points = [
  [15, 37, 4],
  [34, 28, 9],
  [48, 38, 5],
  [64, 16, 11],
] as const;
</script>
<template>
  <svg viewBox="0 0 82 56" aria-hidden="true">
    <defs v-if="shaded">
      <radialGradient :id="gradient" cx="33%" cy="28%" r="80%">
        <stop stop-color="white" />
        <stop offset=".45" :stop-color="colors[0]" />
        <stop offset="1" :stop-color="colors[0]" style="filter: brightness(0.6)" />
      </radialGradient>
    </defs>
    <path d="M8 6V50H78" fill="none" stroke="currentColor" opacity=".45" />
    <circle
      v-for="[x, y, r] in points"
      :key="x"
      :cx="x"
      :cy="y"
      :r="r"
      :fill="shaded ? 'url(#' + gradient + ')' : colors[0]"
    />
  </svg>
</template>
