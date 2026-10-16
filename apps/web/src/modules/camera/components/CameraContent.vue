<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { getDefaultRowHeight, getDefaultColumnWidth } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { browserCellTextMeasurer } from "../../../shared/cell-text/text-metrics";
import { createSheetDisplaySnapshot } from "../../sheet-grid/canvas/sheet-display-snapshot";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
} from "../../sheet-grid/canvas/cell-scene";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { paintSheetScene } from "../../sheet-grid/canvas/scene-painter";
import { createBorderPaintPlan, paintSheetBorders } from "../../sheet-grid/canvas/border-painter";
import {
  createSheetHiddenColumnIntervals,
  createSheetHiddenRowIntervals,
} from "../../sheet-grid/data-visibility";
const props = defineProps<{
  drawing: SheetCameraDrawing;
  sheet: Sheet;
  evaluator: SheetEvaluator;
  revision: number;
  theme?: WorkbookTheme;
  imageAssetUrls?: ReadonlyMap<string, string>;
  locale?: string;
  dateSystem?: "1900" | "1904";
}>();
const canvas = ref<HTMLCanvasElement>();
const images = createCanvasImageCache(render);
const cache = createCellPresentationCache(browserCellTextMeasurer);
function render() {
  const element = canvas.value;
  const range = props.drawing.camera.range;
  if (!element) return;
  const context = element.getContext("2d");
  if (!context) return;
  const sheet = props.sheet;
  const scale = Math.min(2, 4096 / Math.max(props.drawing.width, props.drawing.height));
  element.width = Math.max(1, Math.ceil(props.drawing.width * scale));
  element.height = Math.max(1, Math.ceil(props.drawing.height * scale));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, element.width, element.height);
  if (!range) {
    context.fillStyle = "#666666";
    context.font = "16px sans-serif";
    context.fillText("#REF!", 8, 24);
    return;
  }
  const rowCount = range.end.row + 1;
  const columnCount = range.end.column + 1;
  const geometry = createSheetGeometry({
    rowCount,
    columnCount,
    rowHeight: getDefaultRowHeight(sheet),
    columnWidth: getDefaultColumnWidth(sheet),
    rowHeights: sheet.rowHeights,
    columnWidths: sheet.columnWidths,
    hiddenRows: sheet.hiddenRows,
    hiddenColumns: [
      ...(sheet.hiddenColumns ?? []),
      ...createSheetHiddenColumnIntervals(sheet).flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, i) => start + i),
      ),
    ],
  });
  const rows = createRowVisibilityIndex({
    rowCount,
    defaultRowHeight: getDefaultRowHeight(sheet),
    rowHeights: sheet.rowHeights,
    hiddenRows: sheet.hiddenRows,
    hiddenIntervals: createSheetHiddenRowIntervals(sheet, props.evaluator),
  });
  const x = geometry.getColumnOffset(range.start.column);
  const y = rows.getBoundaryOffset(range.start.row) ?? 0;
  const width = geometry.getTotalSize().width - x;
  const height = (rows.getBoundaryOffset(range.end.row + 1) ?? y) - y;
  if (width <= 0 || height <= 0) return;
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width, height },
    bodyScrollPosition: { x, y },
    mergeResolver: {
      getRangeAt: (address) =>
        sheet.mergedCells.find(
          (merge) =>
            address.row >= merge.start.row &&
            address.row <= merge.end.row &&
            address.column >= merge.start.column &&
            address.column <= merge.end.column,
        ) ?? null,
    },
  });
  const display = createSheetDisplaySnapshot({
    sheet,
    evaluator: props.evaluator,
    theme: props.theme,
    revision: props.revision,
    dateSystem: props.dateSystem,
  });
  const scene = createSheetCanvasScene({
    display,
    layout,
    columnCount,
    locale: props.locale ?? "zh-CN",
    dateSystem: props.dateSystem ?? "1900",
    fontRevision: 0,
    cache,
  });
  context.scale(element.width / width, element.height / height);
  paintSheetScene(context, scene, layout, {
    palette: { background: "#fff", text: "#202124", gridLine: "#d9d9d9", mutedText: "#666" },
    showGridLines: props.drawing.camera.gridLines,
    screenScale: scale,
    skipBackground: true,
    imageUrls: props.imageAssetUrls,
    imageTheme: props.theme,
    images,
    imagePlaceholder: () => "",
  });
  paintSheetBorders(
    context,
    createBorderPaintPlan(sheet, geometry, layout, rows, display.getCellStyle),
    layout,
  );
  images.retain(new Set(props.imageAssetUrls?.values() ?? []));
}
watch(
  () => [
    canvas.value,
    props.drawing,
    props.sheet,
    getDefaultRowHeight(props.sheet),
    props.revision,
    props.imageAssetUrls,
    props.theme,
    props.locale,
    props.dateSystem,
  ],
  render,
  { flush: "post" },
);
onBeforeUnmount(() => images.dispose());
</script>
<template><canvas ref="canvas" class="camera-content" :aria-label="drawing.name" /></template>
<style scoped lang="scss">
.camera-content {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
