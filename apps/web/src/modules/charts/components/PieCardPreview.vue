<script setup lang="ts">
import { computed, useId } from "vue";
import { rotateChartPalette, type PieFamily } from "@sheetcraft/core/chart-presentation";
import type { PieCard } from "../chart-pie-cards";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  family: PieFamily;
  card: PieCard;
  index: number;
  themeColors: readonly string[];
  followTheme: boolean;
}>();

const { t } = useAppI18n();
const uid = useId().replaceAll(":", "");

const isDefaultCard = computed(() => props.index === 0);
const isSplit = computed(() => props.family === "pieOfPie" || props.family === "barOfPie");
const colors = computed(() =>
  props.followTheme ? rotateChartPalette(props.themeColors, props.index % 6) : props.card.colors,
);
const fillKind = computed(() => props.card.format.pieFill ?? "solid");
const isOutline = computed(() => fillKind.value === "outline");
const strokeColor = computed(() => {
  if (isOutline.value) return undefined;
  if (props.card.format.pieStroke === "dark") return "#3b4252";
  if (props.card.format.pieStroke === "light") return "#ffffff";
  return "#ffffff";
});
const strokeWidth = computed(() => {
  if (isOutline.value) return 1.8;
  return props.card.format.pieStroke === "dark" ? 1 : 0.8;
});
const exploded = computed(() => props.card.format.pieExploded === true);
const holeRatio = computed(() => {
  if (props.family !== "doughnut") return 0;
  return Math.max(0.24, Math.min(0.76, (props.card.format.doughnutHole ?? 52) / 100));
});

interface Wedge {
  path: string;
  fill: string;
  stroke: string;
  lx: number;
  ly: number;
  ox: number;
  oy: number;
  ex: number;
  ey: number;
  pct: string;
  cat: string;
}

function buildWedges(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  weights: number[],
  hole: number,
  colorOffset = 0,
): Wedge[] {
  const sum = weights.reduce((acc, v) => acc + v, 0);
  let angle = -Math.PI / 2;
  return weights.map((raw, i) => {
    const share = raw / sum;
    const start = angle;
    const delta = share * Math.PI * 2;
    angle += delta;
    const mid = start + delta / 2;
    const shift = exploded.value ? 3.2 : 0;
    const x = cx + shift * Math.cos(mid);
    const y = cy + shift * Math.sin(mid);
    const pt = (a: number, s: number) =>
      `${(x + rx * s * Math.cos(a)).toFixed(2)},${(y + ry * s * Math.sin(a)).toFixed(2)}`;
    const large = share > 0.5 ? 1 : 0;
    const outerArc = `A${rx.toFixed(2)},${ry.toFixed(2)} 0 ${large} 1 ${pt(angle, 1)}`;
    const path = hole
      ? `M${pt(start, 1)} ${outerArc} L${pt(angle, hole)} A${(rx * hole).toFixed(2)},${(ry * hole).toFixed(2)} 0 ${large} 0 ${pt(start, hole)} Z`
      : `M${pt(start, 1)} ${outerArc} L${x.toFixed(2)},${y.toFixed(2)} Z`;
    const c = colors.value[(i + colorOffset) % colors.value.length] ?? "#4472c4";
    const labelScale = hole ? (1 + hole) / 2 : 0.62;
    return {
      path,
      fill: c,
      stroke: strokeColor.value ?? c,
      lx: x + rx * labelScale * Math.cos(mid),
      ly: y + ry * labelScale * Math.sin(mid),
      ox: x + rx * 1.04 * Math.cos(mid),
      oy: y + ry * 1.04 * Math.sin(mid),
      ex: x + rx * 1.32 * Math.cos(mid),
      ey: y + ry * 1.24 * Math.sin(mid),
      pct: `${Math.round(share * 100)}%`,
      cat: `${i + 1}`,
    };
  });
}

const mainWeights = computed(() => {
  if (props.card.format.pieFocusFirst) return [36, 64];
  if (isDefaultCard.value) return [34, 66];
  if (isSplit.value) return [28, 21, 16, 35];
  return [35, 27, 19, 12, 7];
});

const centerY = computed(() => (isDefaultCard.value ? 62 : 52));
const mainRadius = computed(() => {
  if (isSplit.value) return { rx: 28, ry: 28 };
  if (props.family === "threeD") return { rx: 38, ry: 22 };
  const hasOutside =
    props.card.labels !== "none" &&
    (props.card.format.pieLabelPlacement === "outside" ||
      props.card.format.pieLabelPlacement === "boxedOutside");
  const r = isDefaultCard.value ? 27 : hasOutside ? 27 : 34;
  return { rx: r, ry: r };
});
const mainCenterX = computed(() => (isSplit.value ? 52 : 90));

const mainWedges = computed(() =>
  buildWedges(
    mainCenterX.value,
    centerY.value,
    mainRadius.value.rx,
    mainRadius.value.ry,
    mainWeights.value,
    holeRatio.value,
  ),
);

const secondaryWedges = computed(() =>
  props.family === "pieOfPie" ? buildWedges(132, centerY.value, 17, 17, [35, 38, 27], 0, 2) : [],
);

const barSlices = computed(() => {
  if (props.family !== "barOfPie") return [];
  const top = centerY.value - 22;
  const heights = [12, 18, 14];
  let y = top;
  return heights.map((h, i) => {
    const item = {
      y,
      h,
      fill: colors.value[(i + 2) % colors.value.length] ?? "#5b9bd5",
    };
    y += h;
    return item;
  });
});

const labelPlacement = computed(() => props.card.format.pieLabelPlacement ?? "inside");
const showOutsideLabels = computed(
  () =>
    props.card.labels !== "none" &&
    (labelPlacement.value === "outside" || labelPlacement.value === "boxedOutside"),
);
const showInsideLabels = computed(
  () =>
    props.card.labels !== "none" &&
    (labelPlacement.value === "inside" || labelPlacement.value === "boxedInside"),
);
const showBoxed = computed(
  () => labelPlacement.value === "boxedOutside" || labelPlacement.value === "boxedInside",
);
const patternOverlay = computed(() => {
  if (fillKind.value === "hatch" || fillKind.value === "hatchGradient") return `url(#${uid}-hatch)`;
  if (fillKind.value === "dots") return `url(#${uid}-dots)`;
  if (fillKind.value === "checker") return `url(#${uid}-checker)`;
  if (fillKind.value === "gradient") return `url(#${uid}-sheen)`;
  return undefined;
});
</script>

<template>
  <svg
    class="pie-card-preview"
    viewBox="0 0 180 100"
    width="180"
    height="100"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <pattern
        :id="`${uid}-hatch`"
        width="5"
        height="5"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.42)" stroke-width="1.5" />
      </pattern>
      <pattern :id="`${uid}-dots`" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.9" fill="rgba(255,255,255,0.45)" />
      </pattern>
      <pattern :id="`${uid}-checker`" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="rgba(255,255,255,0.28)" />
        <rect x="3" y="3" width="3" height="3" fill="rgba(255,255,255,0.28)" />
      </pattern>
      <radialGradient :id="`${uid}-sheen`" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.34)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.08)" />
      </radialGradient>
    </defs>

    <template v-if="isDefaultCard">
      <text
        x="90"
        y="14"
        text-anchor="middle"
        fill="var(--sheetcraft-text-secondary)"
        font-size="8.5"
        font-weight="500"
      >
        {{ t("chart.defaultTitle") }}
      </text>
      <g transform="translate(62 20)">
        <rect width="7" height="4.5" rx="1" :fill="colors[0]" />
        <rect x="10" y="1" width="14" height="2.5" rx="1" fill="var(--sheetcraft-border-control)" />
        <rect x="30" width="7" height="4.5" rx="1" :fill="colors[1]" />
        <rect x="40" y="1" width="14" height="2.5" rx="1" fill="var(--sheetcraft-border-control)" />
      </g>
    </template>

    <g v-if="isSplit" stroke="var(--sheetcraft-border-control)" stroke-width="0.9" fill="none">
      <line :x1="mainCenterX + 12" :y1="centerY - 25" x2="124" :y2="centerY - 19" />
      <line :x1="mainCenterX + 12" :y1="centerY + 25" x2="124" :y2="centerY + 19" />
    </g>

    <circle
      v-if="family === 'doughnut' && card.format.doughnutRim"
      :cx="mainCenterX"
      :cy="centerY"
      :r="mainRadius.rx + 3.5"
      fill="none"
      stroke="var(--sheetcraft-border-subtle)"
      stroke-width="2"
    />

    <template v-if="family === 'threeD'">
      <g
        v-for="dy in [9, 7, 5, 3, 1.5]"
        :key="dy"
        :transform="`translate(0 ${dy})`"
        opacity="0.72"
        style="filter: brightness(0.72)"
      >
        <path
          v-for="(w, i) in mainWedges"
          :key="i"
          :d="w.path"
          :fill="isOutline ? 'none' : w.fill"
          :stroke="w.stroke"
          :stroke-width="strokeWidth"
        />
      </g>
    </template>

    <g>
      <path
        v-for="(w, i) in mainWedges"
        :key="i"
        :d="w.path"
        :fill="isOutline ? 'none' : w.fill"
        :stroke="w.stroke"
        :stroke-width="strokeWidth"
      />
      <template v-if="patternOverlay && !isOutline">
        <path
          v-for="(w, i) in mainWedges"
          :key="`p-${i}`"
          :d="w.path"
          :fill="patternOverlay"
          pointer-events="none"
        />
      </template>
    </g>

    <g v-if="family === 'pieOfPie'">
      <path
        v-for="(w, i) in secondaryWedges"
        :key="i"
        :d="w.path"
        :fill="isOutline ? 'none' : w.fill"
        :stroke="w.stroke"
        :stroke-width="strokeWidth"
      />
      <template v-if="patternOverlay && !isOutline">
        <path
          v-for="(w, i) in secondaryWedges"
          :key="`sp-${i}`"
          :d="w.path"
          :fill="patternOverlay"
        />
      </template>
    </g>

    <g v-if="family === 'barOfPie'">
      <rect
        v-for="(bar, i) in barSlices"
        :key="i"
        x="124"
        :y="bar.y"
        width="20"
        :height="bar.h"
        :fill="isOutline ? 'none' : bar.fill"
        :stroke="strokeColor ?? bar.fill"
        :stroke-width="strokeWidth"
      />
      <rect
        v-if="patternOverlay && !isOutline"
        x="124"
        :y="centerY - 22"
        width="20"
        height="44"
        :fill="patternOverlay"
      />
    </g>

    <template v-if="showInsideLabels">
      <g v-for="(w, i) in mainWedges.slice(0, 3)" :key="`il-${i}`">
        <rect
          v-if="showBoxed"
          :x="w.lx - 9"
          :y="w.ly - 4.5"
          width="18"
          height="9"
          rx="1.5"
          fill="rgba(255,255,255,0.88)"
          stroke="var(--sheetcraft-border-subtle)"
          stroke-width="0.5"
        />
        <text
          :x="w.lx"
          :y="w.ly"
          text-anchor="middle"
          dominant-baseline="central"
          :fill="showBoxed || isOutline ? 'var(--sheetcraft-text-primary)' : '#ffffff'"
          font-size="6.2"
          font-weight="600"
        >
          {{ w.pct }}
        </text>
      </g>
    </template>

    <template v-if="showOutsideLabels">
      <g v-for="(w, i) in mainWedges.slice(0, 3)" :key="`ol-${i}`">
        <line
          :x1="w.ox"
          :y1="w.oy"
          :x2="w.ex"
          :y2="w.ey"
          stroke="var(--sheetcraft-border-control)"
          stroke-width="0.7"
        />
        <rect
          v-if="showBoxed"
          :x="w.ex - 9"
          :y="w.ey - 4.5"
          width="18"
          height="9"
          rx="1.5"
          fill="var(--sheetcraft-surface-panel)"
          stroke="var(--sheetcraft-border-control)"
          stroke-width="0.6"
        />
        <text
          :x="w.ex"
          :y="w.ey"
          text-anchor="middle"
          dominant-baseline="central"
          fill="var(--sheetcraft-text-secondary)"
          font-size="6"
          font-weight="500"
        >
          {{ w.pct }}
        </text>
      </g>
    </template>
  </svg>
</template>

<style scoped lang="scss">
.pie-card-preview {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 180 / 100;
}
</style>
