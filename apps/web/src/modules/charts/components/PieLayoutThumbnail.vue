<script setup lang="ts">
import { computed } from "vue";
import { getPieLayoutRecipe, type PieQuickLayoutId } from "../chart-quick-layout";

const props = defineProps<{ layout: PieQuickLayoutId; doughnut?: boolean }>();
const recipe = computed(() => getPieLayoutRecipe(props.layout));
const cx = computed(() => (recipe.value.legend === "right" ? 42 : 56));
const cy = computed(() => {
  let y = 39;
  if (recipe.value.title === "above") y += 4;
  if (recipe.value.legend === "top") y += 4;
  if (recipe.value.legend === "bottom") y -= 5;
  return y;
});
const r = computed(() =>
  recipe.value.legend === "top" || recipe.value.legend === "bottom" ? 19 : 21,
);
</script>

<template>
  <svg viewBox="0 0 112 76" aria-hidden="true" class="pie-layout-thumbnail">
    <path v-if="recipe.title === 'above'" d="M36 7h40" class="heading" />
    <g v-if="recipe.legend === 'top'">
      <rect x="34" y="14" width="4" height="4" class="first" />
      <line x1="40" y1="16" x2="50" y2="16" class="label" />
      <rect x="58" y="14" width="4" height="4" class="second" />
      <line x1="64" y1="16" x2="74" y2="16" class="label" />
    </g>
    <g :transform="`translate(${cx}, ${cy})`">
      <path :d="`M0 0 L0 ${-r} A${r} ${r} 0 1 1 ${-r * 0.87} ${r * 0.5} Z`" class="first" />
      <path
        :d="`M0 0 L${-r * 0.87} ${r * 0.5} A${r} ${r} 0 0 1 ${-r * 0.5} ${-r * 0.87} Z`"
        class="second"
      />
      <path :d="`M0 0 L${-r * 0.5} ${-r * 0.87} A${r} ${r} 0 0 1 0 ${-r} Z`" class="third" />
      <circle v-if="doughnut" cx="0" cy="0" :r="r * 0.48" class="hole" />
      <g v-if="recipe.labels !== 'none'" class="wedge-label">
        <line x1="5" y1="-4" x2="12" y2="-4" />
        <line x1="-13" y1="2" x2="-7" y2="2" />
        <line v-if="recipe.labels === 'categoryPercent'" x1="5" y1="1" x2="11" y2="1" />
      </g>
    </g>
    <g v-if="recipe.legend === 'right'">
      <rect x="76" y="30" width="4" height="4" class="first" />
      <line x1="83" y1="32" x2="98" y2="32" class="label" />
      <rect x="76" y="39" width="4" height="4" class="second" />
      <line x1="83" y1="41" x2="98" y2="41" class="label" />
      <rect x="76" y="48" width="4" height="4" class="third" />
      <line x1="83" y1="50" x2="98" y2="50" class="label" />
    </g>
    <g v-if="recipe.legend === 'bottom'">
      <rect x="34" y="66" width="4" height="4" class="first" />
      <line x1="40" y1="68" x2="50" y2="68" class="label" />
      <rect x="58" y="66" width="4" height="4" class="second" />
      <line x1="64" y1="68" x2="74" y2="68" class="label" />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.pie-layout-thumbnail {
  width: 100%;
  max-width: 112px;
  height: 76px;

  .heading,
  .label {
    fill: none;
    stroke: currentColor;
  }

  .heading {
    stroke-width: 2.2;
    opacity: 0.7;
  }

  .label {
    stroke-width: 1;
    opacity: 0.65;
  }

  .first {
    fill: #5470c6;
  }

  .second {
    fill: #eea34a;
  }

  .third {
    fill: #91cc75;
  }

  .hole {
    fill: var(--sheetcraft-surface-panel, #ffffff);
  }

  .wedge-label line {
    stroke: #ffffff;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
}
</style>
