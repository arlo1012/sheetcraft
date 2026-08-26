<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { columnIndexToLabel } from "../geometry";

const props = defineProps<{
  startColumn: number;
  endColumn: number;
  columnWidth: number;
  scrollLeft: number;
  activeColumn: number;
}>();

const columns = computed(() => {
  const result: number[] = [];
  for (let column = props.startColumn; column <= props.endColumn; column += 1) {
    result.push(column);
  }
  return result;
});

function getHeaderStyle(column: number): CSSProperties {
  return {
    left: `${column * props.columnWidth - props.scrollLeft}px`,
    width: `${props.columnWidth}px`,
  };
}
</script>

<template>
  <div class="sheet-column-headers" aria-hidden="true">
    <div
      v-for="column in columns"
      :key="column"
      class="sheet-column-headers__item"
      :class="{ 'is-active': column === activeColumn }"
      :style="getHeaderStyle(column)"
      :data-column="column"
    >
      {{ columnIndexToLabel(column) }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-column-headers {
  position: absolute;
  inset: 0 0 auto var(--sheet-row-header-width);
  z-index: 4;
  height: var(--sheet-column-header-height);
  overflow: hidden;
  background: var(--ui-surface-muted);
  border-bottom: 1px solid var(--ui-border-strong);
  user-select: none;

  &__item {
    position: absolute;
    top: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-right: 1px solid var(--ui-border-default);
    color: var(--ui-text-secondary);
    font-size: 12px;

    &.is-active {
      background: var(--ui-brand-soft);
      color: var(--ui-brand-primary);
      font-weight: 600;
    }
  }
}
</style>
