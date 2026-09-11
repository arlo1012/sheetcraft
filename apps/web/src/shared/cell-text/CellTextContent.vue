<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from "vue";
import type { FormulaValue } from "@idea10/core/formula";
import type { CellStyle } from "@idea10/core/style";
import type { CellNumberFormatPresentation } from "@idea10/core/number-format";
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from "@idea10/core/workbook";
import { browserCellTextMeasurer, cellTextFontRevision } from "./text-metrics";
import { layoutCellText } from "./text-presentation";

const props = defineProps<{
  text: string;
  value?: FormulaValue;
  cellStyle?: Readonly<CellStyle>;
  fill?: CellNumberFormatPresentation["fill"];
  width?: number;
  height?: number;
}>();
const root = ref<HTMLElement>();
const measuredWidth = ref(DEFAULT_COLUMN_WIDTH);
const measuredHeight = ref(DEFAULT_ROW_HEIGHT);
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (props.width !== undefined && props.height !== undefined) return;
  const measure = () => {
    if (!root.value) return;
    measuredWidth.value = root.value.clientWidth || DEFAULT_COLUMN_WIDTH;
    measuredHeight.value = root.value.clientHeight || DEFAULT_ROW_HEIGHT;
  };
  measure();
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(measure);
    if (root.value) observer.observe(root.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
const layout = computed(() => {
  void cellTextFontRevision.value;
  return layoutCellText({
    text: props.text,
    value: props.value,
    style: props.cellStyle,
    fill: props.fill,
    width: props.width ?? measuredWidth.value,
    height: props.height ?? measuredHeight.value,
    measurer: browserCellTextMeasurer,
  });
});
const placementStyle = computed<CSSProperties>(() => {
  const current = layout.value;
  return {
    left: `${current.x + current.rotationX}px`,
    top: `${current.y + current.rotationY}px`,
    transform: current.angle ? `rotate(${current.angle}deg)` : undefined,
  };
});
const contentStyle = computed<CSSProperties>(() => ({
  ...placementStyle.value,
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
  fontFamily: layout.value.font.family,
  fontSize: `${layout.value.font.size}px`,
  fontWeight: layout.value.font.weight,
  fontStyle: layout.value.font.italic ? "italic" : undefined,
  textDecoration: props.cellStyle?.underline ? "underline" : undefined,
  lineHeight: `${layout.value.lineHeight}px`,
  ...(props.cellStyle?.textColor ? { color: props.cellStyle.textColor } : {}),
}));
</script>
<template>
  <div
    ref="root"
    class="cell-text"
    :dir="layout.direction"
    :data-cell-text-alignment="layout.horizontal"
    :aria-label="text"
  >
    <div class="cell-text__content" :style="contentStyle" aria-hidden="true">
      <span
        v-for="(line, index) in layout.lines"
        :key="index"
        class="cell-text__line"
        :style="{
          left: `${line.x}px`,
          top: `${line.y}px`,
          width: `${line.width}px`,
          height: `${layout.lineHeight}px`,
          textAlign: line.align,
          textAlignLast: line.align,
        }"
        >{{ line.text }}</span
      >
    </div>
  </div>
</template>
<style scoped lang="scss">
.cell-text {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  &__content {
    position: absolute;
    transform-origin: 0 0;
  }
  &__line {
    position: absolute;
    display: block;
    white-space: pre;
  }
}
</style>
