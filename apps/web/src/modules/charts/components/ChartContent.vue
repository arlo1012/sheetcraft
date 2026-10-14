<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import { init, type EChartsType } from "../chart-runtime";
import { createChartOption } from "../chart-option";
import { getChartElementSettings } from "../chart-elements";
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
const result = computed(() => {
  void props.revision;
  try {
    const data = getSheetChartData(
      props.sheet,
      props.drawing.chart,
      props.evaluator,
      props.resolveSheet,
    );
    return {
      data,
      invalid: Boolean(
        data.diagnostics?.some(
          (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
        ),
      ),
    };
  } catch {
    return { data: { categories: [], series: [], records: [] }, invalid: true };
  }
});
const data = computed(() => result.value.data);
const error = ref(false);
const fontError = ref(false);
let eventCleanup: (() => void) | undefined;
let fontRequest = 0;
const fontFamilies = computed(() => {
  const format = props.drawing.chart.format;
  return [
    ...new Set(
      [
        format?.title?.fontFamily,
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
      if (request === fontRequest && owner === props.drawing && revision === props.revision) {
        fontError.value = false;
        render();
      }
    },
    () => {
      if (request === fontRequest && owner === props.drawing && revision === props.revision)
        fontError.value = true;
    },
  );
}
function bindEvents(instance: EChartsType) {
  eventCleanup?.();
  const owner = props.drawing,
    revision = props.revision,
    sheet = props.sheet,
    source = data.value;
  const current = () =>
    chart === instance &&
    owner === props.drawing &&
    revision === props.revision &&
    sheet === props.sheet;
  const handled = new WeakSet<object>();
  const component = (openPane: boolean) => (event: unknown) => {
    if (!current()) return;
    const target = getChartFormatClickTarget(event, owner.chart, source);
    if (
      event &&
      typeof event === "object" &&
      "event" in event &&
      event.event &&
      typeof event.event === "object"
    )
      handled.add(event.event);
    if (target) emit("selectElement", target, openPane);
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
  instance.on("click", click);
  instance.on("dblclick", doubleClick);
  instance.getZr().on("click", plotClick);
  instance.getZr().on("dblclick", plotDoubleClick);
  eventCleanup = () => {
    instance.off("click", click);
    instance.off("dblclick", doubleClick);
    instance.getZr().off("click", plotClick);
    instance.getZr().off("dblclick", plotDoubleClick);
  };
}
function render() {
  if (!root.value || props.drawing.chart.type === "wordCloud") {
    eventCleanup?.();
    eventCleanup = undefined;
    chart?.dispose();
    chart = undefined;
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
      return;
    }
    const option = createChartOption(props.drawing.chart, data.value, {
      width: props.drawing.width,
      height: props.drawing.height,
    });
    // Enable native title/axis hit events without changing legacy serialized options.
    if (option.title && !Array.isArray(option.title))
      option.title = { ...option.title, triggerEvent: true };
    for (const axis of [option.xAxis, option.yAxis]) {
      if (Array.isArray(axis)) for (const item of axis) item.triggerEvent = true;
      else if (axis) axis.triggerEvent = true;
    }
    chart.setOption(option, { notMerge: true });
    bindEvents(chart);
    error.value = false;
  } catch {
    chart?.clear();
    error.value = true;
  }
}
const wordTitle = computed(() => {
  const position = getChartElementSettings(props.drawing.chart).titlePosition;
  return {
    show: position !== "none",
    // Preserve the original word layout until a title placement is explicitly chosen.
    offset:
      props.drawing.chart.elements?.titlePosition === undefined
        ? 30
        : position === "above" && props.drawing.chart.title
          ? Math.min(30, props.drawing.height * 0.24)
          : 0,
  };
});
const words = computed(() => {
  const source = data.value.categories
    .map((text, index) => ({ text, value: data.value.series[0]?.values[index] ?? 0 }))
    .filter((word) => word.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 100);
  const columns = Math.max(
    1,
    Math.ceil(Math.sqrt((source.length * props.drawing.width) / Math.max(1, props.drawing.height))),
  );
  const rows = Math.ceil(source.length / columns);
  const width = props.drawing.width / columns;
  const height = Math.max(
    1,
    (props.drawing.height - wordTitle.value.offset - 5) / Math.max(1, rows),
  );
  const max = source[0]?.value ?? 1;
  return source.map((word, index) => ({
    ...word,
    x: ((index % columns) + 0.5) * width,
    y: (Math.floor(index / columns) + 0.5) * height + wordTitle.value.offset,
    size: Math.max(
      6,
      Math.min(
        height * 0.8,
        (width / Math.max(1, [...word.text].length)) * 1.5,
        12 + 36 * Math.sqrt(word.value / max),
      ),
    ),
    color: ["#2563eb", "#16a34a", "#8b5cf6", "#ef4444", "#f59e0b"][index % 5],
  }));
});
onMounted(() => {
  render();
  observer = new ResizeObserver(render);
  if (root.value) observer.observe(root.value);
});
watch([() => props.drawing, result], render, { deep: true, flush: "post" });
watch([fontFamilies, () => props.drawing, () => props.revision], () => loadFonts(), {
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
  <div class="chart-content" style="pointer-events: auto" @dblclick.stop>
    <svg
      v-if="drawing.chart.type === 'wordCloud'"
      :viewBox="`0 0 ${drawing.width} ${drawing.height}`"
      width="100%"
      height="100%"
      role="img"
      :aria-label="drawing.chart.title"
    >
      <rect width="100%" height="100%" fill="white" />
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
      {{ t("chart.invalidSource") }}
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
