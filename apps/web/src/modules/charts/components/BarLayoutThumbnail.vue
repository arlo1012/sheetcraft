<script setup lang="ts">
import { computed } from "vue";
import { getBarLayoutRecipe, type BarQuickLayoutId } from "../chart-quick-layout";

const props = defineProps<{ layout: BarQuickLayoutId; stacked: boolean }>();
const recipe = computed(() => getBarLayoutRecipe(props.layout, props.stacked));
const left = computed(() => (recipe.value.categoryTitle ? 19 : 12));
const right = computed(() => (recipe.value.legend === "right" ? 84 : 105));
const top = computed(
  () => (recipe.value.title === "above" ? 17 : 8) + (recipe.value.legend === "top" ? 8 : 0),
);
const bottom = computed(
  () =>
    65 -
    (recipe.value.table ? 17 : 0) -
    (recipe.value.valueTitle ? 6 : 0) -
    (recipe.value.legend === "bottom" ? 7 : 0),
);
const rows = computed(() => {
  const span = (bottom.value - top.value) / 3;
  const plotWidth = right.value - left.value;
  const overlap = recipe.value.overlap / 100;
  const height = span / ((props.stacked ? 1 : 2 - overlap) + recipe.value.gap / 100);
  return [
    [0.83, 0.58],
    [0.65, 0.79],
    [0.53, 0.4],
  ].map(([a, b], index) => {
    const mid = top.value + (index + 0.5) * span;
    const scale = props.stacked ? 0.65 : 0.9;
    const firstWidth = a! * plotWidth * scale,
      secondWidth = b! * plotWidth * scale;
    const shift = props.stacked ? 0 : (height * (1 - overlap)) / 2;
    return {
      mid,
      height,
      firstX: left.value,
      firstY: mid + shift - height / 2,
      firstWidth,
      secondX: left.value + (props.stacked ? firstWidth : 0),
      secondY: mid - shift - height / 2,
      secondWidth,
    };
  });
});
</script>
<template>
  <svg viewBox="0 0 112 76" aria-hidden="true" class="bar-layout-thumbnail">
    <path v-if="recipe.title === 'above'" d="M36 7h40" class="heading" />
    <g v-if="recipe.grid !== 'none'" class="grid">
      <line
        v-for="tick in 4"
        :key="tick"
        :x1="left + ((right - left) * tick) / 4"
        :x2="left + ((right - left) * tick) / 4"
        :y1="top"
        :y2="bottom"
      />
      <template v-if="recipe.grid === 'majorMinor'">
        <line
          v-for="tick in 4"
          :key="'minor' + tick"
          class="minor"
          :x1="left + ((right - left) * (tick - 0.5)) / 4"
          :x2="left + ((right - left) * (tick - 0.5)) / 4"
          :y1="top"
          :y2="bottom"
        />
      </template>
    </g>
    <line :x1="left" :x2="left" :y1="top" :y2="bottom" />
    <line v-if="recipe.valueAxis" :x1="left" :x2="right" :y1="bottom" :y2="bottom" />
    <line
      v-if="recipe.categoryTitle"
      x1="5"
      x2="5"
      :y1="top + 8"
      :y2="bottom - 8"
      class="heading"
    />
    <line
      v-if="recipe.valueTitle"
      :x1="left + 12"
      :x2="right - 12"
      :y1="bottom + 6"
      :y2="bottom + 6"
      class="heading"
    />
    <g v-for="(row, i) in rows" :key="i">
      <line :x1="left - 5" :x2="left - 2" :y1="row.mid" :y2="row.mid" />
      <rect
        class="first"
        :x="row.firstX"
        :y="row.firstY"
        :width="row.firstWidth"
        :height="row.height"
      />
      <rect
        class="second"
        :x="row.secondX"
        :y="row.secondY"
        :width="row.secondWidth"
        :height="row.height"
      />
      <g
        v-if="recipe.labels === 'outside' || (recipe.labels === 'lastCategory' && i === 0)"
        class="labels"
      >
        <text
          :x="row.firstX + row.firstWidth * (stacked ? 0.4 : 1) + 1"
          :y="row.firstY + row.height / 2 + 2"
        >
          {{ i + 3 }}
        </text>
        <text
          :x="row.secondX + row.secondWidth * (stacked ? 0.4 : 1) + 1"
          :y="row.secondY + row.height / 2 + 2"
        >
          {{ i + 4 }}
        </text>
      </g>
      <text
        v-if="recipe.labels === 'inside'"
        :x="row.secondX + row.secondWidth - 5"
        :y="row.secondY + row.height / 2 + 2"
        class="labels"
      >
        {{ i + 4 }}
      </text>
    </g>
    <g
      v-if="recipe.legend !== 'none'"
      :transform="
        recipe.legend === 'right'
          ? 'translate(88 32)'
          : recipe.legend === 'top'
            ? 'translate(38 13)'
            : 'translate(38 68)'
      "
    >
      <rect class="second" width="4" height="4" />
      <path d="M6 2h10" />
      <g :transform="recipe.legend === 'right' ? 'translate(0 7)' : 'translate(20 0)'">
        <rect class="first" width="4" height="4" />
        <path d="M6 2h10" />
      </g>
    </g>
    <g v-if="recipe.table" class="table">
      <path d="M5 52H105V72H5Z M5 58H105M5 65H105 M20 52V72M48 52V72M76 52V72" />
      <rect class="second" x="8" y="60" width="4" height="3" />
      <rect class="first" x="8" y="67" width="4" height="3" />
    </g>
  </svg>
</template>
<style scoped lang="scss">
.bar-layout-thumbnail {
  fill: none;
  stroke: currentColor;
  .heading {
    stroke-width: 2;
  }
  .grid,
  .table {
    opacity: 0.46;
    stroke-width: 0.75;
  }
  .minor {
    opacity: 0.5;
  }
  rect,
  text {
    stroke: none;
  }
  .first {
    fill: #5470c6;
  }
  .second {
    fill: #eea34a;
  }
  .labels {
    fill: currentColor;
    font: 6px sans-serif;
  }
}
</style>
