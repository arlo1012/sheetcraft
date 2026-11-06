import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { browserCellTextMeasurer } from "../../shared/cell-text/text-metrics";
import { createSheetDisplaySnapshot } from "../sheet-grid/canvas/sheet-display-snapshot";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
} from "../sheet-grid/canvas/cell-scene";
import { type CanvasImageCache } from "../sheet-grid/canvas/image-painter";
import { paintSheetScene } from "../sheet-grid/canvas/scene-painter";
import { createBorderPaintPlan, paintSheetBorders } from "../sheet-grid/canvas/border-painter";
import { createCameraRangeLayout } from "./camera-range-layout";
export type CameraPaintOptions = {
  drawing: SheetCameraDrawing;
  sheet: Sheet;
  evaluator: SheetEvaluator;
  revision: number;
  theme?: WorkbookTheme;
  imageAssetUrls?: ReadonlyMap<string, string>;
  locale?: string;
  dateSystem?: "1900" | "1904";
};
export function paintCameraContent(
  element: HTMLCanvasElement,
  options: CameraPaintOptions,
  images: CanvasImageCache,
  cache = createCellPresentationCache(browserCellTextMeasurer),
): void {
  const range = options.drawing.camera.range;
  const context = element.getContext("2d");
  if (!context) return;
  const sheet = options.sheet;
  const scale = Math.min(2, 4096 / Math.max(options.drawing.width, options.drawing.height));
  element.width = Math.max(1, Math.ceil(options.drawing.width * scale));
  element.height = Math.max(1, Math.ceil(options.drawing.height * scale));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, element.width, element.height);
  if (!range) {
    context.fillStyle = "#666666";
    context.font = "16px sans-serif";
    context.fillText("#REF!", 8, 24);
    return;
  }
  const { geometry, rows, columnCount, x, y, width, height } = createCameraRangeLayout(
    sheet,
    range,
    options.evaluator,
  );
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
    evaluator: options.evaluator,
    theme: options.theme,
    revision: options.revision,
    dateSystem: options.dateSystem,
  });
  const scene = createSheetCanvasScene({
    display,
    layout,
    columnCount,
    locale: options.locale ?? "zh-CN",
    dateSystem: options.dateSystem ?? "1900",
    fontRevision: 0,
    cache,
  });
  context.scale(element.width / width, element.height / height);
  paintSheetScene(context, scene, layout, {
    palette: { background: "#fff", text: "#202124", gridLine: "#d9d9d9", mutedText: "#666" },
    showGridLines: options.drawing.camera.gridLines,
    screenScale: scale,
    skipBackground: true,
    imageUrls: options.imageAssetUrls,
    imageTheme: options.theme,
    images,
    imagePlaceholder: () => "",
  });
  paintSheetBorders(
    context,
    createBorderPaintPlan(sheet, geometry, layout, rows, display.getCellStyle),
    layout,
  );
}
