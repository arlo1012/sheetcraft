import { requireLegacyPictures } from "../sheet-images/picture-document-support";
import { getPrintablePictureRoots } from "./page-print-pictures";
import {
  createPrintShapeMetrics,
  getPrintableShapeRoots,
  getPrintShapeContentExtent,
  paintPrintShapes,
  preparePrintShapeFonts,
} from "./page-print-shapes";
import { getPictureProperties } from "@sheetcraft/core/picture-properties";
import { isFormulaError, type FormulaValue } from "@sheetcraft/core/formula";
import {
  DEFAULT_ROW_HEIGHT,
  getDefaultColumnWidth,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  DEFAULT_SHEET_PAGE_SETUP,
  cloneSheetPageSetup,
  getSheetHeaderFooterOptions,
  type SheetPageSetup,
} from "@sheetcraft/core/page-setup";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createSheetPagination, type SheetPagination } from "@sheetcraft/sheet-engine/page-layout";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { browserCellTextMeasurer } from "../../shared/cell-text/text-metrics";
import { createBorderPaintPlan, paintSheetBorders } from "../sheet-grid/canvas/border-painter";
import {
  createCellPresentationCache,
  createSheetCanvasScene,
} from "../sheet-grid/canvas/cell-scene";
import { createCanvasImageCache } from "../sheet-grid/canvas/image-painter";
import { paintSheetScene } from "../sheet-grid/canvas/scene-painter";
import { createSheetDisplaySnapshot } from "../sheet-grid/canvas/sheet-display-snapshot";
import {
  createSheetHiddenColumnIntervals,
  createSheetHiddenRowIntervals,
} from "../sheet-grid/data-visibility";
import {
  createFloatingImageCanvasCache,
  paintFloatingImages,
} from "../sheet-images/floating-image-painter";
import { getDrawingThemeEffects } from "../sheet-images/drawing-theme-effects";
import { paintWatermarkInRect } from "../page-decorations/page-decoration-painter";
import { previewHeaderFooterRuns, type HeaderFooterRun } from "./header-footer-text";

const PX_PER_MM = 96 / 25.4;

export type PrintPreviewPage = {
  pageNumber: number;
  row: { start: number; end: number };
  column: { start: number; end: number };
  titleRows: { start: number; end: number } | null;
  titleColumns: { start: number; end: number } | null;
};

export type PrintPreviewDocument = {
  sheet: Sheet;
  setup: SheetPageSetup;
  pagination: SheetPagination;
  pages: readonly PrintPreviewPage[];
  display: ReturnType<typeof createSheetDisplaySnapshot>;
  geometry: ReturnType<typeof createSheetGeometry>;
  rows: ReturnType<typeof createRowVisibilityIndex>;
  shapeMetrics: ReturnType<typeof createPrintShapeMetrics>;
  sheetName: string;
  fileName: string;
  locale: string;
  dateSystem: "1900" | "1904";
};

export type PrintPreviewRenderer = ReturnType<typeof createPrintPreviewRenderer>;

function printRangeFor(setup: SheetPageSetup, rowCount: number, columnCount: number) {
  return (
    setup.printArea ?? {
      start: { row: 0, column: 0 },
      end: { row: Math.max(0, rowCount - 1), column: Math.max(0, columnCount - 1) },
    }
  );
}

function pageSetupForPrint(sheet: Sheet, setup: SheetPageSetup): SheetPageSetup {
  const subtotalBreaks = (sheet.subtotalMetadata ?? []).flatMap(
    (entry) => entry.pageBreakRows ?? [],
  );
  return subtotalBreaks.length
    ? {
        ...setup,
        rowBreaks: [...new Set([...setup.rowBreaks, ...subtotalBreaks])].sort((a, b) => a - b),
      }
    : setup;
}

function clampTitle(
  title: { start: number; end: number } | null | undefined,
  maximum: number,
): { start: number; end: number } | null {
  if (!title) return null;
  const first = Math.max(0, title.start);
  const last = Math.min(maximum, title.end);
  return first <= last ? { start: first, end: last } : null;
}

function axisBands(options: {
  start: number;
  end: number;
  capacity: number;
  title: { start: number; end: number } | null;
  size: (index: number) => number;
  breaks: readonly number[];
}): Array<{ start: number; end: number; title: { start: number; end: number } | null }> {
  const bands: Array<{ start: number; end: number; title: { start: number; end: number } | null }> =
    [];
  let start = options.start;
  while (start <= options.end) {
    const repeat =
      start === options.start && options.title && options.title.start >= start
        ? null
        : options.title;
    const reserved = repeat
      ? Array.from({ length: repeat.end - repeat.start + 1 }, (_, index) =>
          options.size(repeat.start + index),
        ).reduce((sum, value) => sum + value, 0)
      : 0;
    const available = Math.max(1, options.capacity - reserved);
    let used = 0;
    let end = start;
    for (let index = start; index <= options.end; index += 1) {
      if (index !== start && options.breaks.includes(index)) break;
      const size = options.size(index);
      if (index !== start && used + size > available) break;
      used += size;
      end = index;
    }
    bands.push({ start, end, title: repeat });
    start = end + 1;
  }
  return bands;
}

function createPreviewBands(
  setup: SheetPageSetup,
  pagination: SheetPagination,
  range: { start: { row: number; column: number }; end: { row: number; column: number } },
  geometry: ReturnType<typeof createSheetGeometry>,
  rows: ReturnType<typeof createRowVisibilityIndex>,
) {
  const titles = setup.printTitles;
  const titleRows = clampTitle(titles?.rows, geometry.rowCount - 1);
  const titleColumns = clampTitle(titles?.columns, geometry.columnCount - 1);
  const rowBands = axisBands({
    start: range.start.row,
    end: range.end.row,
    capacity:
      pagination.contentSize.height -
      (setup.printOptions?.headings ? 20 / pagination.printScale : 0),
    title: titleRows,
    size: (row) => rows.getVisibleRow(row)?.height ?? 0,
    breaks: setup.fitToPage ? [] : setup.rowBreaks,
  });
  const columnBands = axisBands({
    start: range.start.column,
    end: range.end.column,
    capacity:
      pagination.contentSize.width -
      (setup.printOptions?.headings ? 36 / pagination.printScale : 0),
    title: titleColumns,
    size: (column) => geometry.getColumnWidth(column),
    breaks: setup.fitToPage ? [] : setup.columnBreaks,
  });
  return { rowBands, columnBands };
}

function createPreviewPages(
  setup: SheetPageSetup,
  { rowBands, columnBands }: ReturnType<typeof createPreviewBands>,
): PrintPreviewPage[] {
  if (rowBands.length * columnBands.length > 10_000)
    throw new RangeError("Print preview exceeds 10000 pages. Narrow the print area.");
  const pages = rowBands.flatMap((row, rowIndex) =>
    columnBands.map((column, columnIndex) => ({
      pageNumber:
        setup.pageOrder === "downThenOver"
          ? columnIndex * rowBands.length + rowIndex + 1
          : rowIndex * columnBands.length + columnIndex + 1,
      row,
      column,
      titleRows: row.title,
      titleColumns: column.title,
    })),
  );
  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}

export function createPrintPreviewDocument(options: {
  sheet: Sheet;
  theme?: WorkbookTheme;
  evaluator: SheetEvaluator;
  setup?: SheetPageSetup;
  sheetName?: string;
  fileName?: string;
  locale?: string;
  dateSystem?: "1900" | "1904";
  revision?: number;
}): PrintPreviewDocument {
  requireLegacyPictures(getPrintablePictureRoots(options.sheet));
  const requested = pageSetupForPrint(
    options.sheet,
    cloneSheetPageSetup(options.setup ?? options.sheet.pageSetup ?? DEFAULT_SHEET_PAGE_SETUP),
  );
  const baseDisplay = createSheetDisplaySnapshot({
    // Grid reachability includes every owned drawing. Print extent is a distinct
    // read-only projection; only its genuine printable shapes contribute below.
    sheet: { ...options.sheet, drawings: [] },
    theme: options.theme,
    evaluator: options.evaluator,
    revision: options.revision,
    dateSystem: options.dateSystem,
  });
  function printValue(value: FormulaValue): FormulaValue {
    if (!isFormulaError(value)) return value;
    switch (requested.printOptions?.errors) {
      case "blank":
        return null;
      case "dash":
        return "--";
      case "NA":
        return "#N/A";
      default:
        return value;
    }
  }
  const display = {
    ...baseDisplay,
    sheet: options.sheet,
    getComputedValue: (address: Parameters<typeof baseDisplay.getComputedValue>[0]) =>
      printValue(baseDisplay.getComputedValue(address)),
    getSpill: (address: Parameters<typeof baseDisplay.getSpill>[0]) => {
      const spill = baseDisplay.getSpill(address);
      return spill ? { ...spill, value: printValue(spill.value) } : undefined;
    },
  };
  const shapeMetrics = createPrintShapeMetrics(options.sheet, options.evaluator);
  const shapeExtent = getPrintShapeContentExtent(options.sheet, shapeMetrics, options.theme);
  const contentRowCount = Math.max(
    1,
    display.contentExtent.rowCount,
    shapeExtent.rowCount,
    (requested.printArea?.end.row ?? -1) + 1,
  );
  const contentColumnCount = Math.max(
    1,
    display.contentExtent.columnCount,
    shapeExtent.columnCount,
    (requested.printArea?.end.column ?? -1) + 1,
  );
  const rowCount = Math.max(contentRowCount, (requested.printTitles?.rows?.end ?? -1) + 1);
  const columnCount = Math.max(contentColumnCount, (requested.printTitles?.columns?.end ?? -1) + 1);
  const geometry = createSheetGeometry({
    rowCount,
    columnCount,
    rowHeights: options.sheet.rowHeights,
    columnWidths: options.sheet.columnWidths,
    rowHeight: DEFAULT_ROW_HEIGHT,
    columnWidth: getDefaultColumnWidth(options.sheet),
    hiddenRows: options.sheet.hiddenRows,
    hiddenColumns: [
      ...(options.sheet.hiddenColumns ?? []),
      ...createSheetHiddenColumnIntervals(options.sheet).flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ),
    ],
  });
  const rows = createRowVisibilityIndex({
    rowCount,
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    rowHeights: options.sheet.rowHeights,
    hiddenRows: options.sheet.hiddenRows,
    hiddenIntervals: createSheetHiddenRowIntervals(options.sheet, options.evaluator),
  });
  const range = printRangeFor(requested, contentRowCount, contentColumnCount);
  const paginate = (setup: SheetPageSetup) => {
    const pagination = createSheetPagination({
      geometry,
      rows,
      setup: setup.fitToPage
        ? { ...setup, fitToPage: null, rowBreaks: [], columnBreaks: [] }
        : setup,
      printRange: range,
      mergedCells: options.sheet.mergedCells,
    });
    return { pagination, bands: createPreviewBands(setup, pagination, range, geometry, rows) };
  };
  let setup = requested;
  let result = paginate(setup);
  if (requested.fitToPage) {
    let low = 10;
    let high = 400;
    let winner = 10;
    while (low <= high) {
      const scale = Math.floor((low + high) / 2);
      const candidate = paginate({ ...requested, scale });
      const rowPages = candidate.bands.rowBands.length;
      const columnPages = candidate.bands.columnBands.length;
      const fits =
        (requested.fitToPage.width === 0 || columnPages <= requested.fitToPage.width) &&
        (requested.fitToPage.height === 0 || rowPages <= requested.fitToPage.height);
      if (fits) {
        winner = scale;
        low = scale + 1;
      } else high = scale - 1;
    }
    setup = { ...requested, scale: winner };
    result = paginate(setup);
  }
  const { pagination } = result;
  const pages = createPreviewPages(setup, result.bands);
  return {
    sheet: options.sheet,
    setup,
    pagination,
    pages,
    display,
    geometry,
    rows,
    shapeMetrics,
    sheetName: options.sheetName ?? options.sheet.name,
    fileName: options.fileName ?? "workbook.xlsx",
    locale: options.locale ?? "en-US",
    dateSystem: options.dateSystem ?? "1900",
  };
}

function font(run: HeaderFooterRun, scale: number): string {
  const family = run.format.fontFamily.includes(",")
    ? run.format.fontFamily
    : JSON.stringify(run.format.fontFamily);
  return `${run.format.italic ? "italic " : ""}${run.format.bold ? "700" : "400"} ${(run.format.fontSize * 96) / 72 / scale}px ${family}`;
}

function drawHeaderFooterPart(
  context: CanvasRenderingContext2D,
  text: string,
  align: CanvasTextAlign,
  x: number,
  y: number,
  document: PrintPreviewDocument,
  pageNumber: number,
): void {
  const actualPageNumber = (document.setup.firstPageNumber ?? 1) + pageNumber - 1;
  const scale = getSheetHeaderFooterOptions(document.setup).scaleWithDocument
    ? document.pagination.printScale
    : 1;
  const lines = text.split("\n").map((line) =>
    previewHeaderFooterRuns(line, {
      pageNumber: actualPageNumber,
      pageCount: document.pages.length,
      sheetName: document.sheetName,
      fileName: document.fileName,
      now: new Date(),
      locale: document.locale,
    }),
  );
  const lineHeight = Math.max(
    ...lines.flat().map((run) => (run.format.fontSize * 96) / 72 / scale),
    12 / scale,
  );
  for (const [lineIndex, line] of text.split("\n").entries()) {
    void line;
    const lineRuns = lines[lineIndex] ?? [];
    const width = lineRuns.reduce((total, run) => {
      context.font = font(run, scale);
      return total + context.measureText(run.text).width;
    }, 0);
    let cursor = align === "left" ? x : align === "right" ? x - width : x - width / 2;
    for (const run of lineRuns) {
      context.font = font(run, scale);
      context.fillStyle = `#${run.format.color}`;
      context.textAlign = "left";
      context.fillText(run.text, cursor, y + lineIndex * lineHeight);
      cursor += context.measureText(run.text).width;
    }
  }
}

function drawHeaderFooter(
  context: CanvasRenderingContext2D,
  document: PrintPreviewDocument,
  page: PrintPreviewPage,
): void {
  const options = getSheetHeaderFooterOptions(document.setup);
  const number = page.pageNumber;
  const header =
    options.differentFirst && number === 1
      ? options.firstHeader
      : options.differentOddEven && number % 2 === 0
        ? options.evenHeader
        : document.setup.header;
  const footer =
    options.differentFirst && number === 1
      ? options.firstFooter
      : options.differentOddEven && number % 2 === 0
        ? options.evenFooter
        : document.setup.footer;
  const paper = document.pagination.paperSize;
  const scale = document.pagination.printScale;
  const aligned = options.alignWithMargins;
  const left = aligned ? (document.setup.margins.left * PX_PER_MM) / scale : 0;
  const right = aligned
    ? paper.width - (document.setup.margins.right * PX_PER_MM) / scale
    : paper.width;
  const headerY = Math.max(8 / scale, (document.setup.margins.header * PX_PER_MM) / scale);
  const footerY =
    paper.height - Math.max(8 / scale, (document.setup.margins.footer * PX_PER_MM) / scale);
  context.textBaseline = "alphabetic";
  drawHeaderFooterPart(context, header.left, "left", left, headerY, document, number);
  drawHeaderFooterPart(
    context,
    header.center,
    "center",
    paper.width / 2,
    headerY,
    document,
    number,
  );
  drawHeaderFooterPart(context, header.right, "right", right, headerY, document, number);
  drawHeaderFooterPart(context, footer.left, "left", left, footerY, document, number);
  drawHeaderFooterPart(
    context,
    footer.center,
    "center",
    paper.width / 2,
    footerY,
    document,
    number,
  );
  drawHeaderFooterPart(context, footer.right, "right", right, footerY, document, number);
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  document: PrintPreviewDocument,
  imageAssetUrls: ReadonlyMap<string, string> | undefined,
  images: ReturnType<typeof createCanvasImageCache>,
): void {
  const decoration = document.sheet.pageDecoration;
  const watermark = decoration?.watermark;
  if (!watermark || (!watermark.text && !watermark.image)) return;
  const paper = document.pagination.paperSize;
  const imageUrl = watermark.image?.assetId
    ? imageAssetUrls?.get(watermark.image.assetId)
    : undefined;
  paintWatermarkInRect(
    context,
    watermark,
    { x: 0, y: 0, width: paper.width, height: paper.height },
    {
      fontScale: 1 / document.pagination.printScale,
      image: imageUrl ? images.get(imageUrl) : undefined,
    },
  );
}

function columnLabel(column: number): string {
  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function drawPrintHeadings(
  context: CanvasRenderingContext2D,
  document: PrintPreviewDocument,
  page: PrintPreviewPage,
  x: number,
  y: number,
): void {
  if (!document.setup.printOptions?.headings) return;
  const scale = document.pagination.printScale;
  context.save();
  context.font = `400 ${8 / scale}px Arial`;
  context.fillStyle = "#444";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const columnBlocks = [
    ...(page.titleColumns ? [{ range: page.titleColumns, offset: 0 }] : []),
    { range: page.column, offset: x },
  ];
  for (const block of columnBlocks) {
    for (let column = block.range.start; column <= block.range.end; column += 1) {
      const width = document.geometry.getColumnWidth(column);
      if (width <= 0) continue;
      const left =
        document.geometry.getColumnOffset(column) -
        document.geometry.getColumnOffset(block.range.start);
      context.fillText(columnLabel(column), block.offset + left + width / 2, -2 / scale);
    }
  }
  context.textAlign = "right";
  context.textBaseline = "middle";
  const rowBlocks = [
    ...(page.titleRows ? [{ range: page.titleRows, offset: 0 }] : []),
    { range: page.row, offset: y },
  ];
  for (const block of rowBlocks) {
    for (let row = block.range.start; row <= block.range.end; row += 1) {
      const visible = document.rows.getVisibleRow(row);
      if (visible)
        context.fillText(
          String(row + 1),
          -2 / scale,
          block.offset +
            visible.offset -
            (document.rows.getBoundaryOffset(block.range.start) ?? 0) +
            visible.height / 2,
        );
    }
  }
  context.restore();
}

/** Creates a browser-only canvas renderer shared by thumbnail and final print output. */
export function createPrintPreviewRenderer(onImageLoad?: () => void) {
  const presentationCache = createCellPresentationCache(browserCellTextMeasurer);
  const images = createCanvasImageCache(() => onImageLoad?.());
  const floatingImages = createFloatingImageCanvasCache(() => onImageLoad?.());
  function render(options: {
    canvas: HTMLCanvasElement;
    document: PrintPreviewDocument;
    page: PrintPreviewPage;
    imageAssetUrls?: ReadonlyMap<string, string>;
    theme?: WorkbookTheme;
    scale?: number;
    density?: number;
  }): void {
    const printableRoots = getPrintablePictureRoots(options.document.sheet);
    requireLegacyPictures(printableRoots);
    const previewScale = options.scale ?? 1;
    const density = options.density ?? window.devicePixelRatio ?? 1;
    const { document, page, canvas } = options;
    const paperWidth =
      document.pagination.paperSize.width * document.pagination.printScale * previewScale;
    const paperHeight =
      document.pagination.paperSize.height * document.pagination.printScale * previewScale;
    canvas.width = Math.max(1, Math.ceil(paperWidth * density));
    canvas.height = Math.max(1, Math.ceil(paperHeight * density));
    canvas.style.width = `${paperWidth}px`;
    canvas.style.height = `${paperHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) {
      if (getPrintableShapeRoots(document.sheet).length)
        throw new Error("Shape print canvas is unavailable.");
      return;
    }
    context.setTransform(density, 0, 0, density, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, paperWidth, paperHeight);
    context.save();
    if (document.setup.printOptions?.blackAndWhite) context.filter = "grayscale(1) contrast(1.3)";
    context.scale(
      document.pagination.printScale * previewScale,
      document.pagination.printScale * previewScale,
    );
    drawHeaderFooter(context, document, page);
    const offset = {
      x: (document.setup.margins.left * PX_PER_MM) / document.pagination.printScale,
      y: (document.setup.margins.top * PX_PER_MM) / document.pagination.printScale,
    };
    context.save();
    context.translate(offset.x, offset.y);
    const rowSize = (start: number, end: number) =>
      (document.rows.getBoundaryOffset(end + 1) ?? 0) -
      (document.rows.getBoundaryOffset(start) ?? 0);
    const columnSize = (start: number, end: number) =>
      document.geometry.getColumnOffset(end) +
      document.geometry.getColumnWidth(end) -
      document.geometry.getColumnOffset(start);
    const titleHeight = page.titleRows ? rowSize(page.titleRows.start, page.titleRows.end) : 0;
    const titleWidth = page.titleColumns
      ? columnSize(page.titleColumns.start, page.titleColumns.end)
      : 0;
    const headingWidth = document.setup.printOptions?.headings
      ? 36 / document.pagination.printScale
      : 0;
    const headingHeight = document.setup.printOptions?.headings
      ? 20 / document.pagination.printScale
      : 0;
    const printedWidth = headingWidth + titleWidth + columnSize(page.column.start, page.column.end);
    const printedHeight = headingHeight + titleHeight + rowSize(page.row.start, page.row.end);
    const centered = document.setup.printOptions;
    const centerOffset = {
      x: centered?.horizontalCentered
        ? Math.max(0, (document.pagination.contentSize.width - printedWidth) / 2)
        : 0,
      y: centered?.verticalCentered
        ? Math.max(0, (document.pagination.contentSize.height - printedHeight) / 2)
        : 0,
    };
    context.translate(centerOffset.x + headingWidth, centerOffset.y + headingHeight);
    const paintFragment = (
      rows: { start: number; end: number },
      columns: { start: number; end: number },
      x: number,
      y: number,
    ) => {
      const viewportSize = {
        width: columnSize(columns.start, columns.end),
        height: rowSize(rows.start, rows.end),
      };
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
      const layout = createSheetViewportLayout({
        geometry: document.geometry,
        rows: document.rows,
        viewportSize,
        bodyScrollPosition: {
          x: document.geometry.getColumnOffset(columns.start),
          y: document.rows.getBoundaryOffset(rows.start) ?? 0,
        },
        mergeResolver: {
          getRangeAt: (address) =>
            document.sheet.mergedCells.find(
              (range) =>
                address.row >= range.start.row &&
                address.row <= range.end.row &&
                address.column >= range.start.column &&
                address.column <= range.end.column,
            ) ?? null,
        },
      });
      const scene = createSheetCanvasScene({
        display: document.display,
        layout,
        columnCount: document.geometry.columnCount,
        locale: document.locale,
        dateSystem: document.dateSystem,
        fontRevision: 0,
        cache: presentationCache,
      });
      context.save();
      context.translate(x, y);
      context.beginPath();
      context.rect(0, 0, viewportSize.width, viewportSize.height);
      context.clip();
      paintSheetScene(context, scene, layout, {
        palette: { background: "#fff", text: "#202124", gridLine: "#d9d9d9", mutedText: "#666" },
        showGridLines: document.setup.printOptions?.gridLines ?? false,
        screenScale: document.pagination.printScale * previewScale,
        skipBackground: true,
        imageUrls: options.imageAssetUrls,
        imageTheme: options.theme,
        images,
        imagePlaceholder: () => "",
        isImageVisible: (image) => getPictureProperties(image).printObject,
      });
      paintSheetBorders(
        context,
        createBorderPaintPlan(
          document.sheet,
          document.geometry,
          layout,
          document.rows,
          document.display.getCellStyle,
        ),
        layout,
      );
      if (rows === page.row && columns === page.column && options.imageAssetUrls)
        paintFloatingImages(context, {
          state: {
            images: printableRoots,
            revision: document.display.revision ?? 0,
          },
          layout,
          assetUrls: options.imageAssetUrls,
          cache: floatingImages,
          palette: {
            placeholderBackground: "transparent",
            placeholderStripe: "transparent",
            placeholderBorder: "transparent",
            placeholderText: "transparent",
          },
          loadingLabel: "",
          unavailableLabel: "",
          effects: getDrawingThemeEffects(options.theme),
          theme: options.theme,
        });
      paintPrintShapes(context, {
        sheet: document.sheet,
        metrics: document.shapeMetrics,
        viewport: {
          x: document.geometry.getColumnOffset(columns.start),
          y: document.rows.getBoundaryOffset(rows.start) ?? 0,
          ...viewportSize,
        },
        theme: options.theme,
        assetUrls: options.imageAssetUrls,
        images,
      });
      context.restore();
    };
    if (page.titleRows && page.titleColumns) paintFragment(page.titleRows, page.titleColumns, 0, 0);
    if (page.titleRows) paintFragment(page.titleRows, page.column, titleWidth, 0);
    if (page.titleColumns) paintFragment(page.row, page.titleColumns, 0, titleHeight);
    paintFragment(page.row, page.column, titleWidth, titleHeight);
    drawPrintHeadings(context, document, page, titleWidth, titleHeight);
    context.restore();
    drawWatermark(context, document, options.imageAssetUrls, images);
    context.restore();
  }
  function dispose(): void {
    images.dispose();
    floatingImages.dispose();
  }
  async function prepareImages(urls: Iterable<string>): Promise<void> {
    await Promise.all(
      [...new Set(urls)].flatMap((url) => [images.load(url), floatingImages.load(url)]),
    );
  }
  async function prepareShapes(document: PrintPreviewDocument): Promise<void> {
    await preparePrintShapeFonts(document.sheet, document.shapeMetrics);
  }
  return { render, prepareImages, prepareShapes, dispose };
}
