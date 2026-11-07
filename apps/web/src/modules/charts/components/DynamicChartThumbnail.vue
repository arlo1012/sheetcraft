<script setup lang="ts">
import { computed } from "vue";
import { init } from "../chart-runtime";
import { createChartOption } from "../chart-option";
import { createWordCloudLayout } from "../chart-wordcloud-layout";
import { templatePreview } from "../dynamic-chart-gallery";
import type { DynamicChartTemplate } from "../chart-design-intents";
const props = defineProps<{ template: DynamicChartTemplate }>();
const size = { width: 340, height: 190 };
const preview = computed(() => {
  const { chart, data, combo } = templatePreview(props.template, "");
  if (chart.type === "wordCloud")
    return {
      words: createWordCloudLayout(chart, data, size).words,
      background: chart.presentation?.background,
    };
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...size });
  try {
    instance.setOption(createChartOption(chart, data, size, combo));
    return {
      image: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(instance.renderToSVGString()),
    };
  } finally {
    instance.dispose();
  }
});
</script>
<template>
  <img v-if="preview.image" :src="preview.image" alt="" class="dynamic-thumb" />
  <svg v-else viewBox="0 0 340 190" class="dynamic-thumb" aria-hidden="true">
    <rect width="340" height="190" :fill="preview.background" />
    <text
      v-for="word in preview.words"
      :key="word.text"
      :x="word.x"
      :y="word.y"
      :fill="word.color"
      :font-size="word.size"
      text-anchor="middle"
      dominant-baseline="central"
    >
      {{ word.text }}
    </text>
  </svg>
</template>
<style scoped>
.dynamic-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 34/19;
  object-fit: contain;
}
</style>
