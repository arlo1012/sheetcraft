<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{
  startRow: number;
  endRow: number;
  rowHeight: number;
  scrollTop: number;
  selectedStartRow: number;
  selectedEndRow: number;
}>();

const rows = computed(() => {
  const result: number[] = [];
  for (let row = props.startRow; row <= props.endRow; row += 1) {
    result.push(row);
  }
  return result;
});

function getHeaderStyle(row: number): CSSProperties {
  return {
    top: `${row * props.rowHeight - props.scrollTop}px`,
    height: `${props.rowHeight}px`,
  };
}
</script>

<template>
  <div class="sheet-row-headers" aria-hidden="true">
    <div
      v-for="row in rows"
      :key="row"
      class="sheet-row-headers__item"
      :class="{ 'is-active': row >= selectedStartRow && row <= selectedEndRow }"
      :style="getHeaderStyle(row)"
      :data-row="row"
    >
      {{ row + 1 }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-row-headers {
  position: absolute;
  inset: var(--sheet-column-header-height) auto 0 0;
  z-index: 4;
  width: var(--sheet-row-header-width);
  overflow: hidden;
  background: var(--ui-surface-muted);
  border-right: 1px solid var(--ui-border-strong);
  user-select: none;

  &__item {
    position: absolute;
    left: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-bottom: 1px solid var(--ui-border-default);
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
