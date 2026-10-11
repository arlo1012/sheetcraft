<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { navigateSymbolGrid } from "../symbols/symbol-dialog-model";
import { symbolCharacterCode, type SymbolUnicodeCatalog } from "../symbols/unicode-catalog";
const props = defineProps<{
  points: Uint32Array;
  selected?: number;
  family?: string;
  catalog: SymbolUnicodeCatalog;
  label: string;
}>();
const emit = defineEmits<{ select: [codePoint: number]; insert: [codePoint: number] }>();
const viewport = ref<HTMLElement>();
const columns = ref(17);
const scrollTop = ref(0);
const viewportHeight = ref(216);
const rowHeight = 36;
const id = `symbol-grid-${useId().replaceAll(":", "")}`;
const selectedIndex = computed(() =>
  props.selected === undefined ? -1 : props.points.indexOf(props.selected),
);
const rowCount = computed(() => Math.ceil(props.points.length / columns.value));
const visibleRows = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / rowHeight) - 1);
  const end = Math.min(rowCount.value, start + Math.ceil(viewportHeight.value / rowHeight) + 3);
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
    const row = start + offset;
    return {
      row,
      points: Array.from(props.points.slice(row * columns.value, (row + 1) * columns.value)),
    };
  });
});
const activeVisible = computed(
  () =>
    props.selected !== undefined &&
    visibleRows.value.some((row) => row.points.includes(props.selected!)),
);
function reveal(): void {
  const element = viewport.value;
  if (!element || selectedIndex.value < 0) return;
  const top = Math.floor(selectedIndex.value / columns.value) * rowHeight;
  if (top < element.scrollTop) element.scrollTop = top;
  else if (top + rowHeight > element.scrollTop + viewportHeight.value)
    element.scrollTop = top + rowHeight - viewportHeight.value;
  scrollTop.value = element.scrollTop;
}
watch(
  () => [props.selected, props.points, columns.value],
  () => void nextTick(reveal),
);
function select(cp: number): void {
  emit("select", cp);
  viewport.value?.focus({ preventScroll: true });
}
function keydown(event: KeyboardEvent): void {
  if (event.isComposing || event.altKey) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    if (props.selected !== undefined && selectedIndex.value >= 0) emit("insert", props.selected);
  } else if (
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ].includes(event.key)
  ) {
    event.preventDefault();
    event.stopPropagation();
    const index = navigateSymbolGrid(
      selectedIndex.value,
      props.points.length,
      columns.value,
      Math.max(1, Math.floor(viewportHeight.value / rowHeight)),
      event.key,
      event.ctrlKey || event.metaKey,
    );
    if (index >= 0) emit("select", props.points[index]!);
  }
}
function name(cp: number): string {
  return `${String.fromCodePoint(cp)} · U+${symbolCharacterCode(cp)} · ${props.catalog.character(cp)?.name ?? ""}`;
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver !== "undefined" && viewport.value) {
    observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      columns.value = Math.max(4, Math.floor(entry.contentRect.width / 36));
      viewportHeight.value = Math.max(72, entry.contentRect.height);
    });
    observer.observe(viewport.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div
    ref="viewport"
    class="symbol-dialog__grid"
    role="grid"
    tabindex="0"
    :aria-label="label"
    :aria-rowcount="rowCount"
    :aria-colcount="columns"
    :aria-activedescendant="activeVisible ? `${id}-${selected}` : undefined"
    @keydown="keydown"
    @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
  >
    <div class="symbol-grid__canvas" :style="{ height: `${rowCount * rowHeight}px` }">
      <div
        v-for="row in visibleRows"
        :key="row.row"
        role="row"
        :aria-rowindex="row.row + 1"
        class="symbol-grid__row"
        :style="{
          top: `${row.row * rowHeight}px`,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }"
      >
        <button
          v-for="(cp, column) in row.points"
          :id="`${id}-${cp}`"
          :key="cp"
          type="button"
          role="gridcell"
          tabindex="-1"
          :aria-colindex="column + 1"
          :aria-selected="selected === cp"
          :aria-label="name(cp)"
          :title="name(cp)"
          :style="{ fontFamily: family }"
          :data-code-point="cp"
          @click="select(cp)"
          @dblclick="emit('insert', cp)"
        >
          {{ /\s/u.test(String.fromCodePoint(cp)) ? "␣" : String.fromCodePoint(cp) }}
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.symbol-dialog__grid {
  height: 216px;
  min-height: 108px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--sheetcraft-border-default);
  border-radius: 4px;
  background: var(--sheetcraft-surface-default);
}
.symbol-grid__canvas {
  position: relative;
}
.symbol-grid__row {
  position: absolute;
  inset-inline: 0;
  height: 36px;
  display: grid;
}
button {
  min-width: 0;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sheetcraft-text-primary);
  font-size: 23px;
  line-height: 32px;
  cursor: pointer;
  &:hover {
    background: var(--sheetcraft-surface-hover);
  }
  &[aria-selected="true"] {
    border-color: var(--sheetcraft-action-primary);
    background: var(--sheetcraft-surface-hover);
  }
}
</style>
