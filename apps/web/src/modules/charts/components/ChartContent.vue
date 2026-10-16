<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getSheetChartData,
  getSheetChartSourceData,
  normalizeSheetChart,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { ChartComboSeriesChange } from "@sheetcraft/core/chart-combo";
import { init, type EChartsType } from "../chart-runtime";
import { createChartOption } from "../chart-option";
import {
  countChartDataTableText,
  createChartDataTablePlan,
  prepareChartDataTableOption,
  applyChartDataTableGraphics,
  ChartDataTableUnavailableError,
} from "../chart-data-table";
import { createWordCloudLayout } from "../chart-wordcloud-layout";
import { getChartPresentationBackground } from "../chart-presentation-render";
import { getChartLegendLayout, chartLegendContainsPoint } from "../chart-element-layout";
import { getChartFormatClickTarget } from "../chart-format-selection";
import { getChartFormatTargets, type ChartFormatTarget } from "../chart-format-pane";
import {
  ensureCellFontResource,
  getCellFontResourceFamilies,
  getCellFontResourceStatus,
  retryCellFontResource,
} from "../../../shared/cell-text/font-resources";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  drawing: SheetChartDrawing;
  paintChart?: SheetChart;
  editableLegend?: boolean;
  selectedElement?: ChartFormatTarget;
  comboSeriesChanges?: readonly ChartComboSeriesChange[];
  sheet: Sheet;
  evaluator: SheetEvaluator;
  resolveSheet?: (sheetId: string) => Sheet | undefined;
  revision: number;
}>();
const emit = defineEmits<{ selectElement: [target: ChartFormatTarget, openPane: boolean] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement>();
let chart: EChartsType | undefined;
let observer: ResizeObserver | undefined;
const paintChart = computed(() => props.paintChart ?? props.drawing.chart);
const result = computed(() => {
  void props.revision;
  try {
    const data = getSheetChartData(
      props.sheet,
      normalizeSheetChart(paintChart.value),
      props.evaluator,
      props.resolveSheet,
    );
    const sourceData = getSheetChartSourceData(
      props.sheet,
      normalizeSheetChart(paintChart.value),
      props.evaluator,
      props.resolveSheet,
    );
    return {
      data,
      sourceData,
      invalid: Boolean(
        data.diagnostics?.some(
          (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
        ),
      ),
    };
  } catch {
    return {
      data: { categories: [], series: [], records: [] },
      sourceData: { categories: [], series: [], records: [] },
      invalid: true,
    };
  }
});
const data = computed(() => result.value.data);
const fontRevision = ref(0);
const legendLayout = computed(() => {
  void fontRevision.value;
  return props.editableLegend && !result.value.invalid
    ? getChartLegendLayout(paintChart.value, data.value, props.drawing)
    : undefined;
});
const legendSelectionStyle = computed(() => {
  const bounds = legendLayout.value?.bounds;
  return bounds
    ? {
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }
    : undefined;
});
const error = ref(false);
const tableError = ref(false);
const fontError = ref(false);
let eventCleanup: (() => void) | undefined;
let paginationPoint: { x: number; y: number } | undefined;
let legendDoubleClickHandled = false;
let fontRequest = 0;
const fontFamilies = computed(() => {
  const format = paintChart.value.format;
  return [
    ...new Set(
      [
        format?.title?.fontFamily,
        format?.legend?.text?.fontFamily,
        format?.categoryAxis?.text?.fontFamily,
        format?.valueAxis?.text?.fontFamily,
        format?.secondaryValueAxis?.text?.fontFamily,
      ].flatMap((family) => (family ? getCellFontResourceFamilies(family) : [])),
    ),
  ];
});
function loadFonts(retry = false) {
  const owner = props.drawing,
    revision = props.revision,
    paint = paintChart.value,
    request = ++fontRequest;
  const pending = fontFamilies.value.filter(
    (family) => retry || getCellFontResourceStatus(family).state !== "ready",
  );
  if (!pending.length) {
    fontError.value = false;
    return;
  }
  fontError.value = pending.some((family) => getCellFontResourceStatus(family).state === "error");
  if (!retry && fontError.value) return;
  void Promise.all(
    pending.map((family) =>
      retry ? retryCellFontResource(family) : ensureCellFontResource(family),
    ),
  ).then(
    () => {
      if (
        request === fontRequest &&
        owner === props.drawing &&
        revision === props.revision &&
        paint === paintChart.value
      ) {
        fontError.value = false;
        fontRevision.value++;
        render();
      }
    },
    () => {
      if (
        request === fontRequest &&
        owner === props.drawing &&
        revision === props.revision &&
        paint === paintChart.value
      )
        fontError.value = true;
    },
  );
}
/** Browser click detail already applies the platform's double-click timing.
 * A selection repaint can replace SVG nodes before dblclick is dispatched, so
 * consume the second native click without adding a separate timing heuristic.
 */
function legendClickOpensPane(event: unknown): boolean {
  const native = event && typeof event === "object" && "event" in event ? event.event : undefined;
  const detail =
    native && typeof native === "object" && "detail" in native && typeof native.detail === "number"
      ? native.detail
      : 1;
  if (detail < 2) legendDoubleClickHandled = false;
  if (detail < 2 || legendDoubleClickHandled) return false;
  legendDoubleClickHandled = true;
  return true;
}
function bindEvents(instance: EChartsType) {
  eventCleanup?.();
  const owner = props.drawing,
    revision = props.revision,
    sheet = props.sheet,
    paint = paintChart.value,
    source = data.value;
  const current = () =>
    chart === instance &&
    owner === props.drawing &&
    revision === props.revision &&
    sheet === props.sheet &&
    paint === paintChart.value;
  const handled = new WeakSet<object>();
  let scrollingLegend = false;
  paginationPoint = undefined;
  const legendScroll = () => {
    scrollingLegend = true;
    queueMicrotask(() => {
      scrollingLegend = false;
    });
  };
  const component = (openPane: boolean) => (event: unknown) => {
    if (!current()) return;
    const pointer =
      event && typeof event === "object" && "event" in event ? event.event : undefined;
    const legendHit =
      pointer &&
      typeof pointer === "object" &&
      "offsetX" in pointer &&
      "offsetY" in pointer &&
      typeof pointer.offsetX === "number" &&
      typeof pointer.offsetY === "number" &&
      chartLegendContainsPoint(legendLayout.value?.bounds, pointer.offsetX, pointer.offsetY);
    // With selectedMode:false, native legend items are silent; an overlaid
    // legend can otherwise expose a series underneath to component events.
    const target: ChartFormatTarget | undefined =
      legendHit && !scrollingLegend
        ? { kind: "legend" }
        : getChartFormatClickTarget(event, owner.chart, source);
    if (
      target &&
      event &&
      typeof event === "object" &&
      "event" in event &&
      event.event &&
      typeof event.event === "object"
    )
      handled.add(event.event);
    if (target && !(openPane && target.kind === "legend"))
      emit(
        "selectElement",
        target,
        target.kind === "legend" ? legendClickOpensPane(pointer) : openPane,
      );
  };
  const plot = (openPane: boolean) => (event: unknown) => {
    if (!current() || !event || typeof event !== "object" || handled.has(event)) return;
    if (
      !("offsetX" in event) ||
      !("offsetY" in event) ||
      typeof event.offsetX !== "number" ||
      typeof event.offsetY !== "number"
    )
      return;
    // Native pagination runs first. Observe it without cancelling its action;
    // the same pointer event must not also select the legend or the plot.
    if (scrollingLegend) {
      paginationPoint = { x: event.offsetX, y: event.offsetY };
      return;
    }
    if (openPane && paginationPoint?.x === event.offsetX && paginationPoint.y === event.offsetY)
      return;
    if (!openPane) paginationPoint = undefined;
    if (chartLegendContainsPoint(legendLayout.value?.bounds, event.offsetX, event.offsetY)) {
      if (!openPane) emit("selectElement", { kind: "legend" }, legendClickOpensPane(event));
      return;
    }
    if (
      getChartFormatTargets(owner.chart, source).some((target) => target.kind === "plot") &&
      instance.containPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])
    )
      emit("selectElement", { kind: "plot" }, openPane);
  };
  const click = component(false),
    doubleClick = component(true),
    plotClick = plot(false),
    plotDoubleClick = plot(true);
  instance.on("legendscroll", legendScroll);
  instance.on("click", click);
  instance.on("dblclick", doubleClick);
  instance.getZr().on("click", plotClick);
  instance.getZr().on("dblclick", plotDoubleClick);
  eventCleanup = () => {
    instance.off("legendscroll", legendScroll);
    instance.off("click", click);
    instance.off("dblclick", doubleClick);
    instance.getZr().off("click", plotClick);
    instance.getZr().off("dblclick", plotDoubleClick);
  };
}
/** Keep legend input out of the drawing move gesture. Its preventDefault would
 * suppress the mouse sequence ZRender needs, including native page buttons.
 * SVG's public screen transform handles drawing zoom and rotation.
 */
function legendPointer(event: MouseEvent) {
  const bounds = legendLayout.value?.bounds;
  const canvas = root.value;
  if (!bounds || !canvas) return;
  const svg = canvas.querySelector("svg");
  const matrix = svg?.getScreenCTM?.();
  let x: number, y: number;
  if (svg && matrix && typeof svg.createSVGPoint === "function") {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    x = local.x;
    y = local.y;
  } else {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    x = ((event.clientX - rect.left) * props.drawing.width) / rect.width;
    y = ((event.clientY - rect.top) * props.drawing.height) / rect.height;
  }
  return chartLegendContainsPoint(bounds, x, y) ? { x, y } : undefined;
}
function legendPointerDown(event: PointerEvent) {
  if (legendPointer(event)) event.stopPropagation();
}
function legendDoubleClick(event: MouseEvent) {
  const point = legendPointer(event);
  if (!point || error.value || legendDoubleClickHandled) return;
  if (
    paginationPoint &&
    Math.abs(paginationPoint.x - point.x) < 2 &&
    Math.abs(paginationPoint.y - point.y) < 2
  )
    return;
  // Selection paint can replace the SVG target between the two clicks. Handle
  // the native event on the stable container, not on the replaced SVG subtree.
  legendDoubleClickHandled = true;
  emit("selectElement", { kind: "legend" }, true);
}
function render() {
  if (!root.value || paintChart.value.type === "wordCloud") {
    eventCleanup?.();
    eventCleanup = undefined;
    chart?.dispose();
    chart = undefined;
    error.value = false;
    tableError.value = false;
    return;
  }
  try {
    chart ??= init(root.value, undefined, {
      renderer: "svg",
      width: props.drawing.width,
      height: props.drawing.height,
    });
    chart.resize({ width: props.drawing.width, height: props.drawing.height });
    if (result.value.invalid) {
      chart.clear();
      error.value = false;
      tableError.value = false;
      return;
    }
    const option = createChartOption(
      paintChart.value,
      data.value,
      {
        width: props.drawing.width,
        height: props.drawing.height,
      },
      props.comboSeriesChanges,
    );
    if (legendLayout.value && option.legend && !Array.isArray(option.legend))
      option.legend = {
        ...option.legend,
        ...legendLayout.value.option,
        textStyle: { ...option.legend.textStyle, ...legendLayout.value.option.textStyle },
        formatter: option.legend.formatter,
        selectedMode: false,
        // Selection is a separate DOM outline; never replace the user's border.
      };
    // Enable native title/axis hit events without changing legacy serialized options.
    if (option.title && !Array.isArray(option.title))
      option.title = { ...option.title, triggerEvent: true };
    for (const axis of [option.xAxis, option.yAxis]) {
      if (Array.isArray(axis)) for (const item of axis) item.triggerEvent = true;
      else if (axis) axis.triggerEvent = true;
    }
    countChartDataTableText(paintChart.value, result.value.sourceData);
    const table = createChartDataTablePlan(
      paintChart.value,
      data.value,
      props.drawing,
      props.comboSeriesChanges,
    );
    chart.setOption(prepareChartDataTableOption(option, table), { notMerge: true });
    if (table) applyChartDataTableGraphics(chart, table);
    bindEvents(chart);
    error.value = false;
    tableError.value = false;
  } catch (cause) {
    chart?.clear();
    error.value = true;
    tableError.value = cause instanceof ChartDataTableUnavailableError;
  }
}
const wordLayout = computed(() =>
  result.value.invalid
    ? { title: { show: false, offset: 0 }, words: [] }
    : createWordCloudLayout(paintChart.value, data.value, props.drawing),
);
const wordBackground = computed(() =>
  result.value.invalid ? "#ffffff" : getChartPresentationBackground(paintChart.value),
);
const wordTitle = computed(() => wordLayout.value.title);
const words = computed(() => wordLayout.value.words);
onMounted(() => {
  render();
  observer = new ResizeObserver(render);
  if (root.value) observer.observe(root.value);
});
watch(
  [
    () => props.drawing,
    result,
    paintChart,
    () => props.comboSeriesChanges,
    () => props.editableLegend,
  ],
  render,
  {
    deep: true,
    flush: "post",
  },
);
watch([fontFamilies, () => props.drawing, () => props.revision, paintChart], () => loadFonts(), {
  immediate: true,
  flush: "post",
});
onBeforeUnmount(() => {
  fontRequest++;
  eventCleanup?.();
  observer?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <div
    class="chart-content"
    style="pointer-events: auto"
    @pointerdown="legendPointerDown"
    @dblclick.stop="legendDoubleClick"
  >
    <svg
      v-if="drawing.chart.type === 'wordCloud'"
      :viewBox="`0 0 ${drawing.width} ${drawing.height}`"
      width="100%"
      height="100%"
      role="img"
      :aria-label="drawing.chart.title"
    >
      <rect width="100%" height="100%" :fill="wordBackground" />
      <text
        v-if="wordTitle.show"
        :x="drawing.width / 2"
        y="22"
        text-anchor="middle"
        :font-size="drawing.chart.format?.title?.fontSize ?? 15"
        :font-family="drawing.chart.format?.title?.fontFamily"
        :font-weight="drawing.chart.format?.title?.bold ? 'bold' : 'normal'"
        :font-style="drawing.chart.format?.title?.italic ? 'italic' : 'normal'"
        :fill="drawing.chart.format?.title?.color ?? '#000000'"
        @click="emit('selectElement', { kind: 'title' }, false)"
        @dblclick="emit('selectElement', { kind: 'title' }, true)"
      >
        {{ drawing.chart.title }}
      </text>
      <text
        v-for="(word, index) in words"
        :key="index"
        :x="word.x"
        :y="word.y"
        :font-size="word.size"
        :fill="word.color"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ word.text }}
        <title>{{ word.text }}: {{ word.value }}</title>
      </text>
    </svg>
    <div v-else ref="root" class="chart-content__canvas" />
    <div
      v-if="legendLayout && selectedElement?.kind === 'legend' && !error"
      class="chart-content__legend-selection"
      :style="legendSelectionStyle"
      aria-hidden="true"
    />
    <div v-if="fontError" class="chart-content__font-error" role="status">
      {{ t("chart.formatFontLoadFailed") }}
      <button type="button" @pointerdown.stop @click.stop="loadFonts(true)">
        {{ t("chart.formatFontRetry") }}
      </button>
    </div>
    <div
      v-if="
        (!drawing.chart.source && !drawing.chart.range && !drawing.chart.dataCache) ||
        error ||
        result.invalid
      "
      class="chart-content__error"
      role="status"
    >
      {{ t(tableError ? "chart.dataTableUnavailable" : "chart.invalidSource") }}
    </div>
  </div>
</template>
<style scoped lang="scss">
.chart-content {
  width: 100%;
  height: 100%;
  position: relative;
  background: white;
  &__canvas {
    width: 100%;
    height: 100%;
  }
  &__legend-selection {
    position: absolute;
    pointer-events: none;
    box-sizing: border-box;
    outline: 1px solid var(--sheetcraft-action-primary, #2563eb);
    outline-offset: 2px;
  }
  &__error {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #b91c1c;
    background: white;
    padding: 16px;
    text-align: center;
  }
  &__font-error {
    position: absolute;
    inset: auto 4px 4px;
    color: #b91c1c;
    background: #fff;
    font-size: 12px;
  }
}
</style>
