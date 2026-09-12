<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

defineSlots<{ default(props: { height: number }): unknown }>();
const containerRef = ref<HTMLElement | null>(null);
const height = ref(0);
let observer: ResizeObserver | undefined;

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;
  height.value = container.clientHeight;
  observer = new ResizeObserver(([entry]) => {
    if (entry) height.value = Math.max(0, Math.floor(entry.contentRect.height));
  });
  observer.observe(container);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="containerRef" class="table-height-wrapper">
    <slot :height="height" />
  </div>
</template>

<style scoped lang="scss">
.table-height-wrapper {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
