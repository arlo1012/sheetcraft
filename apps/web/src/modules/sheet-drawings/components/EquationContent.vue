<script setup lang="ts">
import { computed } from "vue";
import "katex/dist/katex.min.css";
import { renderEquationSource } from "../equation/equation-render";
const props = defineProps<{ source: string }>();
const result = computed(() => renderEquationSource(props.source));
</script>
<template>
  <div v-if="result.status === 'ready'" class="equation-content" v-html="result.html" />
  <div v-else class="equation-content equation-content--error" role="status">
    <span class="katex-error" :title="result.message">{{ source }}</span>
  </div>
</template>
<style scoped lang="scss">
.equation-content {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
</style>
