<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from "vue";
import type { CellTextFontRun, FormulaValue } from "@sheetcraft/core/formula";
import type { CellStyle } from "@sheetcraft/core/style";
import type { CellNumberFormatPresentation } from "@sheetcraft/core/number-format";
import { getAttributedTextSegments } from "@sheetcraft/sheet-engine/attributed-text-layout";
import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from "@sheetcraft/core/workbook";
import { browserCellTextMeasurer, cellTextFontRevision } from "./text-metrics";
import {
  isCellTextWrapped,
  layoutCellText,
  type CellTextFillFontRuns,
  type CellTextLayout,
} from "./text-presentation";
import {
  getCellTextScriptStyle,
  getCellTextStrikethroughStyle,
  getCellTextUnderlineStyle,
} from "./font-presentation";

const props = defineProps<{
  text: string;
  textLayout?: CellTextLayout;
  fontRuns?: readonly CellTextFontRun[];
  fillFontRuns?: CellTextFillFontRuns;
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
  if (props.textLayout || (props.width !== undefined && props.height !== undefined)) return;
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
  if (props.textLayout) return props.textLayout;
  void cellTextFontRevision.value;
  return layoutCellText({
    text: props.text,
    fontRuns: props.fontRuns,
    fillFontRuns: props.fillFontRuns,
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
  ...getCellTextUnderlineStyle(props.cellStyle),
  lineHeight: `${layout.value.lineHeight}px`,
  ...(props.cellStyle?.textColor ? { color: props.cellStyle.textColor } : {}),
}));
const bidiSegments = computed(() =>
  layout.value.bidiDocument
    ? getAttributedTextSegments(layout.value.bidiDocument, layout.value.font)
    : [],
);
const bidiStyle = computed<CSSProperties>(() => ({
  // Shared conservative advances reserve this same maximum for every estimated line.
  // Keep complete paragraphs native; measured wraps/justification are not pixel guarantees.
  lineHeight: `${layout.value.lineHeight}px`,
  whiteSpace: isCellTextWrapped(props.cellStyle) ? "pre-wrap" : "pre",
  overflowWrap: isCellTextWrapped(props.cellStyle) ? "anywhere" : undefined,
  textAlign:
    layout.value.horizontal === "distributed" || layout.value.horizontal === "justify"
      ? "justify"
      : layout.value.horizontal === "right" || layout.value.horizontal === "center"
        ? layout.value.horizontal
        : "left",
  textAlignLast: layout.value.horizontal === "distributed" ? "justify" : undefined,
}));
const scriptStyle = computed<CSSProperties>(() => getCellTextScriptStyle(props.cellStyle));
const strikethroughStyle = computed<CSSProperties>(() =>
  getCellTextStrikethroughStyle(props.cellStyle),
);
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
        v-if="layout.canvasBidiRequired"
        class="cell-text__bidi-paragraph"
        :style="{ ...bidiStyle, ...scriptStyle }"
        ><span class="cell-text__strikethrough" :style="strikethroughStyle"
          ><span
            v-for="(segment, segmentIndex) in bidiSegments"
            :key="segmentIndex"
            :style="{ fontFamily: segment.font.family }"
            >{{ segment.text }}</span
          ></span
        ></span
      >
      <template v-else
        ><span
          v-for="(line, index) in layout.lines"
          :key="index"
          class="cell-text__line"
          :style="{
            left: `${line.x}px`,
            top: `${line.y}px`,
            width: `${line.width}px`,
            height: `${line.height ?? layout.lineHeight}px`,
            lineHeight: line.height !== undefined ? `${line.height}px` : undefined,
            textAlign: line.align,
            textAlignLast: line.align,
            ...scriptStyle,
          }"
          ><span class="cell-text__strikethrough" :style="strikethroughStyle"
            ><template v-if="line.segments"
              ><span
                v-for="(segment, segmentIndex) in line.segments"
                :key="segmentIndex"
                :style="{ fontFamily: segment.font.family }"
                >{{ segment.text }}</span
              ></template
            ><template v-else>{{ line.text }}</template></span
          ></span
        ></template
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
  &__bidi-paragraph {
    display: block;
    unicode-bidi: normal;
  }
  &__line {
    position: absolute;
    display: block;
    white-space: pre;
  }
  &__strikethrough {
    display: block;
  }
}
</style>
