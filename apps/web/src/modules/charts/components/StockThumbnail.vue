<script setup lang="ts">
import type { StockStyle } from "@sheetcraft/core/chart-presentation";
defineProps<{ variant: StockStyle }>();
const days = [
  { x: 20, high: 12, low: 40, open: 33, close: 21, volume: 12 },
  { x: 36, high: 9, low: 35, open: 16, close: 27, volume: 20 },
  { x: 52, high: 17, low: 42, open: 32, close: 24, volume: 15 },
  { x: 68, high: 13, low: 39, open: 28, close: 28, volume: 27 },
];
</script>
<template>
  <svg viewBox="0 0 82 56" aria-hidden="true">
    <path d="M8 6V48H77" stroke="currentColor" opacity=".45" fill="none" />
    <g v-for="day in days" :key="day.x">
      <rect
        v-if="variant === 'vhlc' || variant === 'vohlc'"
        :x="day.x - 3.5"
        :y="48 - day.volume"
        width="7"
        :height="day.volume"
        fill="#4472c4"
      />
      <line :x1="day.x" :x2="day.x" :y1="day.high" :y2="day.low" stroke="#252525" />
      <line
        v-if="variant === 'hlc' || variant === 'vhlc'"
        :x1="day.x"
        :x2="day.x + 4"
        :y1="day.close"
        :y2="day.close"
        stroke="#d19d00"
        stroke-width="2"
      />
      <rect
        v-else
        :x="day.x - 3.5"
        :y="Math.min(day.open, day.close)"
        width="7"
        :height="Math.max(1, Math.abs(day.open - day.close))"
        :fill="day.close < day.open ? '#fafafa' : '#404040'"
        stroke="#252525"
      />
    </g>
  </svg>
</template>
