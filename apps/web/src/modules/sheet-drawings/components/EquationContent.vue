<script setup lang="ts">
import { computed } from "vue";
import katex from "katex";
import "katex/dist/katex.min.css";
const props = defineProps<{ source: string }>();
// KaTeX escapes source text and disallows HTML / URLs with trust disabled.
const html = computed(() =>
  katex.renderToString(props.source, {
    throwOnError: false,
    trust: false,
    strict: "ignore",
    output: "htmlAndMathml",
    maxExpand: 1000,
    maxSize: 20,
  }),
);
</script>
<template><div class="equation-content" v-html="html" /></template>
<style scoped lang="scss">
.equation-content {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
</style>
