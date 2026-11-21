<script setup lang="ts">
import { computed } from "vue";
import { getLineLayoutRecipe, type LineQuickLayoutId } from "../chart-quick-layout";

const props = defineProps<{ layout: LineQuickLayoutId }>();
const recipe = computed(() => getLineLayoutRecipe(props.layout));
const left = computed(() => (recipe.value.valueTitle ? 21 : 14));
const right = computed(() => (recipe.value.legend === "right" ? 82 : 104));
const top = computed(
  () => (recipe.value.title === "above" ? 17 : 8) + (recipe.value.legend === "top" ? 8 : 0),
);
const bottom = computed(
  () =>
    63 -
    (recipe.value.table ? 16 : 0) -
    (recipe.value.categoryTitle ? 6 : 0) -
    (recipe.value.legend === "bottom" ? 7 : 0),
);

function mapPoint(colFraction: number, valFraction: number): string {
  const x = left.value + (right.value - left.value) * colFraction;
  const y = bottom.value - (bottom.value - top.value) * valFraction;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

const firstLine = computed(
  () =>
    `${mapPoint(0.1, 0.32)} ${mapPoint(0.4, 0.64)} ${mapPoint(0.7, 0.52)} ${mapPoint(0.92, 0.85)}`,
);
const secondLine = computed(
  () =>
    `${mapPoint(0.1, 0.18)} ${mapPoint(0.4, 0.36)} ${mapPoint(0.7, 0.44)} ${mapPoint(0.92, 0.55)}`,
);
</script>

<template>
  <svg viewBox="0 0 112 76" aria-hidden="true" class="line-layout-thumbnail">
    <path v-if="recipe.title === 'above'" d="M36 7h40" class="heading" />
    <g v-if="recipe.legend === 'top'" class="legend">
      <line x1="36" y1="18" x2="42" y2="18" class="first-stroke" />
      <line x1="44" y1="18" x2="53" y2="18" class="label" />
      <line x1="60" y1="18" x2="66" y2="18" class="second-stroke" />
      <line x1="68" y1="18" x2="77" y2="18" class="label" />
    </g>
    <g v-if="recipe.grid !== 'none'" class="grid">
      <line
        v-for="tick in 3"
        :key="tick"
        :x1="left"
        :x2="right"
        :y1="top + ((bottom - top) * tick) / 4"
        :y2="top + ((bottom - top) * tick) / 4"
      />
      <template v-if="recipe.grid === 'majorMinor'">
        <line
          v-for="tick in 3"
          :key="'minor' + tick"
          class="minor"
          :x1="left"
          :x2="right"
          :y1="top + ((bottom - top) * (tick - 0.5)) / 4"
          :y2="top + ((bottom - top) * (tick - 0.5)) / 4"
        />
      </template>
    </g>
    <line v-if="recipe.valueAxis" :x1="left" :x2="left" :y1="top" :y2="bottom" class="axis" />
    <line :x1="left" :x2="right" :y1="bottom" :y2="bottom" class="axis" />
    <line v-if="recipe.valueTitle" x1="6" x2="6" :y1="top + 6" :y2="bottom - 6" class="heading" />
    <line
      v-if="recipe.categoryTitle"
      :x1="(left + right) / 2 - 14"
      :x2="(left + right) / 2 + 14"
      :y1="bottom + 6"
      :y2="bottom + 6"
      class="heading"
    />
    <polyline :points="firstLine" class="first-stroke" />
    <polyline :points="secondLine" class="second-stroke" />
    <g v-if="recipe.labels === 'outside'" class="label">
      <line
        :x1="left + (right - left) * 0.36"
        :x2="left + (right - left) * 0.44"
        :y1="bottom - (bottom - top) * 0.72"
        :y2="bottom - (bottom - top) * 0.72"
      />
      <line
        :x1="left + (right - left) * 0.86"
        :x2="left + (right - left) * 0.96"
        :y1="bottom - (bottom - top) * 0.92"
        :y2="bottom - (bottom - top) * 0.92"
      />
    </g>
    <g v-if="recipe.labels === 'lastCategory'" class="label">
      <line
        :x1="right - 14"
        :x2="right"
        :y1="bottom - (bottom - top) * 0.85"
        :y2="bottom - (bottom - top) * 0.85"
      />
      <line
        :x1="right - 14"
        :x2="right"
        :y1="bottom - (bottom - top) * 0.55"
        :y2="bottom - (bottom - top) * 0.55"
      />
    </g>
    <g v-if="recipe.legend === 'right'">
      <line x1="87" y1="32" x2="92" y2="32" class="first-stroke" />
      <line x1="94" y1="32" x2="106" y2="32" class="label" />
      <line x1="87" y1="41" x2="92" y2="41" class="second-stroke" />
      <line x1="94" y1="41" x2="106" y2="41" class="label" />
    </g>
    <g v-if="recipe.legend === 'bottom'">
      <line x1="36" y1="70" x2="42" y2="70" class="first-stroke" />
      <line x1="44" y1="70" x2="53" y2="70" class="label" />
      <line x1="60" y1="70" x2="66" y2="70" class="second-stroke" />
      <line x1="68" y1="70" x2="77" y2="70" class="label" />
    </g>
    <g v-if="recipe.table" class="table">
      <rect :x="left" :y="bottom + 3" :width="right - left" height="12" />
      <line :x1="left" :x2="right" :y1="bottom + 9" :y2="bottom + 9" />
      <line
        :x1="left + (right - left) / 3"
        :x2="left + (right - left) / 3"
        :y1="bottom + 3"
        :y2="bottom + 15"
      />
      <line
        :x1="left + ((right - left) * 2) / 3"
        :x2="left + ((right - left) * 2) / 3"
        :y1="bottom + 3"
        :y2="bottom + 15"
      />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.line-layout-thumbnail {
  width: 100%;
  max-width: 112px;
  height: 76px;

  .heading,
  .axis,
  .label,
  .grid line,
  .table rect,
  .table line {
    fill: none;
    stroke: currentColor;
  }

  .heading {
    stroke-width: 2.2;
    opacity: 0.7;
  }

  .axis,
  .label {
    stroke-width: 1;
    opacity: 0.65;
  }

  .grid line {
    stroke-width: 0.75;
    opacity: 0.28;
  }

  .grid line.minor {
    stroke-width: 0.5;
    opacity: 0.18;
  }

  .table rect,
  .table line {
    stroke-width: 0.75;
    opacity: 0.45;
  }

  .first-stroke {
    fill: none;
    stroke: #5470c6;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .second-stroke {
    fill: none;
    stroke: #eea34a;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}
</style>
