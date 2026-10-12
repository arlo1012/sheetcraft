import { type CellRange, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import {
  createSheetPagination,
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
} from "@sheetcraft/sheet-engine/page-layout";
import { projectShapePointToViewport } from "../../../modules/sheet-drawings/shape-page-layout";

export function shapePageFixture(
  showWhiteSpace = true,
  options: { printRange?: CellRange; firstColumnWidth?: number } = {},
) {
  const workbook = createWorkbook({ id: "page-book", sheetId: "page-sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.defaultColumnWidth = 80;
  if (options.firstColumnWidth) sheet.columnWidths.set(0, options.firstColumnWidth);
  const metrics = createPictureSheetMetrics(sheet);
  const geometry = createSheetGeometry({
    rowCount: 140,
    columnCount: 18,
    rowHeight: 24,
    columnWidth: 80,
    columnWidths: sheet.columnWidths,
  });
  const rows = createRowVisibilityIndex({ rowCount: 140, defaultRowHeight: 24 });
  const pagination = createSheetPagination({
    geometry,
    rows,
    setup: DEFAULT_SHEET_PAGE_SETUP,
    printRange: options.printRange ?? {
      start: { row: 0, column: 0 },
      end: { row: 139, column: 17 },
    },
    layoutRange: { start: { row: 0, column: 0 }, end: { row: 139, column: 17 } },
  });
  const projection = createPageLayoutProjection({
    geometry,
    rows,
    pagination,
    pagePadding: 12,
    showWhiteSpace,
  });
  const layout = (scroll = { x: 0, y: 0 }, viewportSize = { width: 2000, height: 3600 }) =>
    createPageLayoutViewportLayout({
      geometry,
      rows,
      pagination,
      pagePadding: 12,
      showWhiteSpace,
      viewportSize,
      bodyScrollPosition: scroll,
    });
  const viewport = layout();
  const project = (point: { x: number; y: number }) => {
    const result = projectShapePointToViewport(point, viewport, projection, metrics);
    if (!result) throw new Error(`Point is outside visible page content: ${JSON.stringify(point)}`);
    return result.point;
  };
  return {
    workbook,
    sheet,
    metrics,
    geometry,
    rows,
    pagination,
    projection,
    layout,
    viewport,
    project,
  };
}
