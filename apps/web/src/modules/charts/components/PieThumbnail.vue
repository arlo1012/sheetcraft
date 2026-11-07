<script setup lang="ts">
import { computed } from "vue";
import type { PieFamily, PieLabel } from "@sheetcraft/core/chart-presentation";
const props = defineProps<{
  family: PieFamily;
  colors: readonly string[];
  exploded?: boolean;
  labels?: "none" | "value" | PieLabel;
}>();
const split = computed(() => props.family === "pieOfPie" || props.family === "barOfPie");
function wedges(cx: number, cy: number, r: number, h: number, weights: number[], hole: number) {
  let angle = -Math.PI / 2;
  return weights.map((v, index) => {
    const last = angle,
      delta = v * 2 * Math.PI;
    angle += delta;
    const mid = (angle + last) / 2,
      x = cx + (props.exploded ? 3 * Math.cos(mid) : 0),
      y = cy + (props.exploded ? 3 * Math.sin(mid) : 0);
    const point = (a: number, scale: number) =>
      `${x + r * scale * Math.cos(a)},${y + h * scale * Math.sin(a)}`;
    const arc = (scale: number, back = false) =>
      `A${r * scale},${h * scale} 0 ${v > 0.5 ? 1 : 0} ${back ? 0 : 1} ${point(back ? last : angle, scale)}`;
    const path = `M${point(last, 1)} ${arc(1)} ${hole ? `L${point(angle, hole)} ${arc(hole, true)}` : `L${x},${y}`} Z`;
    return {
      path,
      fill: props.colors[index % props.colors.length],
      x: x + r * (hole ? 0.77 : 0.62) * Math.cos(mid),
      y: y + h * (hole ? 0.77 : 0.62) * Math.sin(mid),
      label: Math.round(v * 100) + "%",
    };
  });
}
const main = computed(() =>
  split.value
    ? wedges(37, 45, 29, 29, [0.18, 0.13, 0.16, 0.53], 0)
    : wedges(
        72,
        43,
        31,
        props.family === "threeD" ? 18 : 31,
        [0.35, 0.27, 0.19, 0.12, 0.07],
        props.family === "doughnut" ? 0.5 : 0,
      ),
);
const second = computed(() => wedges(111, 45, 18, 18, [0.25, 0.4, 0.35], 0));
</script>
<template>
  <svg viewBox="0 0 144 88" aria-hidden="true">
    <g v-if="split" stroke="#8b909b" fill="none" stroke-width="1">
      <path d="M40 16L110 27 M40 74L110 63" />
    </g>
    <template v-if="family === 'threeD'">
      <g
        v-for="dy in [8, 6, 4, 2]"
        :key="dy"
        :transform="`translate(0,${dy})`"
        style="filter: brightness(0.68)"
      >
        <path v-for="(s, i) in main" :key="i" :d="s.path" :fill="s.fill" />
      </g>
    </template>
    <path
      v-for="(s, i) in main"
      :key="i"
      :d="s.path"
      :fill="s.fill"
      stroke="white"
      stroke-width=".6"
    />
    <template v-if="labels && labels !== 'none'">
      <text
        v-for="(s, i) in main"
        :key="i"
        :x="s.x"
        :y="s.y"
        text-anchor="middle"
        dominant-baseline="central"
        fill="white"
        font-size="5"
      >
        {{ s.label }}
      </text>
    </template>
    <template v-if="family === 'pieOfPie'">
      <path v-for="(s, i) in second" :key="i" :d="s.path" :fill="colors[(i + 3) % colors.length]" />
    </template>
    <template v-if="family === 'barOfPie'">
      <rect
        v-for="(h, i) in [9, 15, 12]"
        :key="i"
        x="104"
        :y="[27, 36, 51][i]"
        width="18"
        :height="h"
        :fill="colors[(i + 3) % colors.length]"
      />
    </template>
  </svg>
</template>
