import { readXlsxPivotTables } from "./pivot-tables.js";
import { readXlsxSparklines } from "./sparklines.js";
import { readXlsxProtection } from "./protection.js";
import { NativeWorkbook } from "./native/workbook.js";
import { unzipSync } from "fflate/browser";
import { readExcelBorder, writeExcelBorder } from "./border.js";
import { createFormulaCacheEligibility, formulaCacheValue } from "./formula-cache.js";
import { fromExcelNumberFormat, toExcelNumberFormat } from "./number-format.js";
import { excelColumnWidthToPixels, pixelsToExcelColumnWidth } from "./column-width.js";
import { getAutoFitRowNumbers } from "./auto-fit-rows.js";
import {
  createFormulaError,
  FORMULA_ERROR_TOKENS,
  datePartsToExcelSerial,
  formulaErrorCodeFromToken,
  isFormulaError,
  parseFormula,
  type CellContent,
  type FormulaValue,
} from "@sheetcraft/core/formula";
import {
  createSheetEvaluator,
  getDefaultColumnWidth,
  normalizeCellHyperlink,
  normalizeCellNote,
  replaceSheetSparseState,
  type CellRange,
  type Sheet,
  type SheetFilter,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { createSheetFilterHiddenRowIntervals } from "@sheetcraft/core/commands";
import type { SheetConditionalFormatRule } from "@sheetcraft/core/conditional-formatting";
import type { SheetPageSetup } from "@sheetcraft/core/page-setup";
import {
  CELL_FILL_PATTERNS,
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellFillGradient,
  type CellStyle,
} from "@sheetcraft/core/style";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MAX_COLUMN_WIDTH,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  MIN_COLUMN_WIDTH,
  createSheet,
} from "@sheetcraft/core/workbook";
import { CompatibilityReportBuilder } from "./report.js";
import { finalizeXlsxExport } from "./export-finalizer.js";
import { readXlsxWorkbookTheme } from "./workbook-theme.js";
import { collectDefinedNames, readDefinedNames } from "./defined-names.js";
import {
  collectPrintAreaDefinedNames,
  collectPrintTitleDefinedNames,
  readXlsxPageSetups,
} from "./page-setup.js";
import { readWorkbookCalculationSettings } from "./workbook-calculation.js";
import {
  readRawWorksheetFormulas,
  readRawWorksheetNumericValues,
  readRawWorksheetTextDirections,
} from "./raw-cell-values.js";
import { readXlsxDataMetadata, type XlsxDataMetadata } from "./data-tools-metadata.js";
import { readXlsxConditionalFormatMetadata } from "./conditional-formatting.js";
import { readXlsxTableMetadata, xlsxPivotTableStyleId, xlsxTableStyleId } from "./table-styles.js";
import { readXlsxCellStyles, readXlsxNamedCellStyleBindings } from "./cell-styles.js";
import { readXlsxThemeStyleBindings } from "./theme-style-bindings.js";
import { readXlsxHyperlinks, readXlsxWorksheetStyleIds } from "./hyperlinks.js";
import { readXlsxCellNoteVmlBoxes, readXlsxCellNotes } from "./cell-notes.js";
import type { NativeCellImage } from "./native-cell-images.js";
import {
  createXlsxImageExporter,
  type XlsxImageWorkbook,
  type XlsxImageWorksheet,
} from "./image-export.js";
import {
  XlsxCompatibilityError,
  type XlsxCompatibilityReport,
  type XlsxEncodeOptions,
} from "./types.js";

const MAX_SPARSE_CELLS = 200_000;

type BrowserCell = {
  value: unknown;
  formula?: string;
  result?: unknown;
  style?: Record<string, unknown>;
  note?: string | { texts?: Array<{ text: string }> };
};
type BrowserRow = {
  height?: number;
  eachCell: (
    options: { includeEmpty: boolean },
    callback: (cell: BrowserCell, column: number) => void,
  ) => void;
};
type BrowserWorksheet = XlsxImageWorksheet & {
  name: string;
  properties: {
    defaultRowHeight?: number;
    defaultColWidth?: number;
    tabColor?: { argb: string };
  };
  views?: Array<Record<string, unknown>> | null;
  columns?: Array<{ number?: number; width?: number; hidden?: boolean }>;
  autoFilter?: unknown;
  model?: {
    merges?: string[];
    rows?: Array<{
      number?: number;
      height?: number;
      hidden?: boolean;
      cells?: Array<{ address?: string; style?: number }>;
    }>;
  };
  getColumn: (index: number) => { width?: number; hidden?: boolean };
  getRow: (index: number) => { height?: number; hidden?: boolean };
  eachRow: (
    options: { includeEmpty: boolean },
    callback: (row: BrowserRow, rowNumber: number) => void,
  ) => void;
  mergeCells: (range: string) => void;
  getCell: (address: string) => BrowserCell & {
    value: unknown;
    style: Record<string, unknown>;
    numFmt?: string;
    note?: string | { texts?: Array<{ text: string }> };
  };
};

type BrowserWorkbook = XlsxImageWorkbook & {
  properties: { date1904?: boolean };
  calcProperties: { fullCalcOnLoad: boolean };
  views?: Array<Record<string, unknown>> | null;
  worksheets: BrowserWorksheet[];
  addWorksheet: (name: string, options?: { views?: Record<string, unknown>[] }) => BrowserWorksheet;
  xlsx: {
    load: (bytes: Uint8Array) => Promise<unknown>;
    writeBuffer: () => Promise<ArrayBuffer | Uint8Array>;
  };
};

function advancedHiddenRows(filter: SheetFilter | null): number[] {
  const rows: number[] = [];
  for (const interval of filter?.advanced?.hiddenRows ?? []) {
    const start = Math.max(0, interval.start);
    const end = Math.min(MAX_SHEET_ROWS - 1, interval.end);
    for (let row = start; row <= end; row += 1) {
      rows.push(row);
      if (rows.length > MAX_SPARSE_CELLS)
        throw new RangeError("The workbook exceeds the XLSX v1 hidden-row export limit.");
    }
  }
  return rows;
}

function hasColorSetFilter(filter: SheetFilter | null): boolean {
  return Boolean(filter?.columns.some((column) => column.condition?.kind === "color-set"));
}

/**
 * Excel's AutoFilter can only express one color. Preserve the current visible
 * rows when a product multi-color filter is exported, while its full criterion
 * lives in the product extension for a future Sheetcraft import.
 */
function colorSetHiddenRows(sheet: Sheet): number[] {
  if (
    !hasColorSetFilter(sheet.filter) &&
    !sheet.tables?.some((table) => hasColorSetFilter(table.filter))
  )
    return [];
  const rows: number[] = [];
  for (const interval of createSheetFilterHiddenRowIntervals(sheet)) {
    const start = Math.max(0, interval.start);
    const end = Math.min(MAX_SHEET_ROWS - 1, interval.end);
    for (let row = start; row <= end; row += 1) {
      rows.push(row);
      if (rows.length > MAX_SPARSE_CELLS)
        throw new RangeError("The workbook exceeds the XLSX v1 hidden-row export limit.");
    }
  }
  return rows;
}
const EXCEL_FILL_PATTERNS = new Set<string>(CELL_FILL_PATTERNS);

function columnLabel(column: number): string {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
function address(row: number, column: number): string {
  return `${columnLabel(column)}${row + 1}`;
}

/**
 * SIMTABLE is an internal, dynamic What-If Data Table formula. Excel and WPS
 * do not implement it, so its results must be exported as values rather than
 * a formula which recalculates to #NAME?.
 */
function isSimulationTableFormula(source: string): boolean {
  const parsed = parseFormula(source);
  return (
    parsed.ok &&
    parsed.ast.expression.kind === "function" &&
    parsed.ast.expression.name.toUpperCase() === "SIMTABLE"
  );
}

function formulaSnapshotValue(value: FormulaValue): unknown {
  if (!isFormulaError(value)) return value;
  return { error: FORMULA_ERROR_TOKENS[value.code] };
}

function workbookId(): string {
  const runtimeCrypto = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
    .crypto;
  return `xlsx-${runtimeCrypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function add(
  report: CompatibilityReportBuilder,
  code: Parameters<CompatibilityReportBuilder["add"]>[0],
  issueLocation: string,
): void {
  report.add(code, "warning", issueLocation);
}

function parseRange(value: string): CellRange | null {
  const match = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/i.exec(value);
  if (!match) return null;
  const toColumn = (label: string) =>
    [...label.toUpperCase()].reduce(
      (result, character) => result * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1;
  const start = { row: Number(match[2]) - 1, column: toColumn(match[1] ?? "") };
  const end = { row: Number(match[4]) - 1, column: toColumn(match[3] ?? "") };
  return start.row >= 0 &&
    end.row < MAX_SHEET_ROWS &&
    start.column >= 0 &&
    end.column < MAX_SHEET_COLUMNS
    ? { start, end }
    : null;
}

function parseAddress(value: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(value);
  if (!match) return null;
  const column =
    [...(match[1] ?? "").toUpperCase()].reduce(
      (result, character) => result * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1;
  const row = Number(match[2]) - 1;
  return row >= 0 && row < MAX_SHEET_ROWS && column >= 0 && column < MAX_SHEET_COLUMNS
    ? { row, column }
    : null;
}

function rangesEqual(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row === right.start.row &&
    left.start.column === right.start.column &&
    left.end.row === right.end.row &&
    left.end.column === right.end.column
  );
}

function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row <= right.end.row &&
    left.end.row >= right.start.row &&
    left.start.column <= right.end.column &&
    left.end.column >= right.start.column
  );
}

function sheetFilterOutsideTables(
  filter: SheetFilter | null,
  tables: readonly { filter: SheetFilter | null }[],
  report: CompatibilityReportBuilder,
  diagnosticLocation: string,
): SheetFilter | null {
  if (!filter) return null;
  for (const table of tables) {
    if (!table.filter) continue;
    if (rangesEqual(filter.range, table.filter.range)) return null;
    if (rangesIntersect(filter.range, table.filter.range)) {
      add(report, "filter-omitted", diagnosticLocation);
      return null;
    }
  }
  return filter;
}

/**
 * XLSX has no flag corresponding to Core's merged-cell filter opt-in. A
 * worksheet AutoFilter that intersects a valid imported merge is therefore
 * necessarily using that opt-in when reconstructed at the Core boundary.
 */
function restoreMergedCellFilterSupport(
  filter: SheetFilter | null,
  mergedCells: readonly CellRange[],
): SheetFilter | null {
  if (!filter || !mergedCells.some((range) => rangesIntersect(range, filter.range))) return filter;
  return { ...filter, allowMergedCells: true };
}

function readStyle(
  style: Record<string, unknown> | undefined,
  rawNumberFormat: unknown,
  issueLocation: string,
  report: CompatibilityReportBuilder,
  rawTextDirection?: "context" | "ltr" | "rtl",
): CellStyle | undefined {
  if (!style) return undefined;
  const font = style.font as Record<string, unknown> | undefined;
  const alignment = style.alignment as Record<string, unknown> | undefined;
  const fill = style.fill as Record<string, unknown> | undefined;
  const border = style.border as Record<string, unknown> | undefined;
  const color = (value: unknown): string | undefined => {
    const argb = (value as Record<string, unknown> | undefined)?.argb;
    return typeof argb === "string" && /^ff[0-9a-f]{6}$/i.test(argb)
      ? `#${argb.slice(2).toLowerCase()}`
      : undefined;
  };
  const patternFill = fill?.type === "pattern" ? fill : undefined;
  const fillPattern =
    typeof patternFill?.pattern === "string" && EXCEL_FILL_PATTERNS.has(patternFill.pattern)
      ? (patternFill.pattern as NonNullable<CellStyle["fillPattern"]>)
      : undefined;
  const gradientStops = (value: unknown): CellFillGradient["stops"] | undefined => {
    if (!Array.isArray(value) || value.length < 2) return undefined;
    const stops = value.map((stop) => {
      const source = stop as Record<string, unknown>;
      const stopColor = color(source.color);
      return typeof source.position === "number" &&
        Number.isFinite(source.position) &&
        source.position >= 0 &&
        source.position <= 1 &&
        stopColor
        ? { position: source.position, color: stopColor }
        : undefined;
    });
    if (stops.some((stop) => !stop)) return undefined;
    const sorted = stops as CellFillGradient["stops"];
    sorted.sort((left, right) => left.position - right.position);
    return sorted[0]?.position === 0 &&
      sorted.at(-1)?.position === 1 &&
      sorted.every((stop, index) => index === 0 || sorted[index - 1]!.position < stop.position)
      ? sorted
      : undefined;
  };
  const fillGradient = (): CellFillGradient | undefined => {
    if (fill?.type !== "gradient") return undefined;
    const stops = gradientStops(fill.stops);
    if (!stops) return undefined;
    if (
      fill.gradient === "angle" &&
      typeof fill.degree === "number" &&
      Number.isFinite(fill.degree)
    )
      return { type: "linear", angle: fill.degree, stops };
    if (fill.gradient !== "path") return undefined;
    const center = fill.center as Record<string, unknown> | undefined;
    const coordinate = (key: "left" | "right" | "top" | "bottom", fallback: number) => {
      const value = center?.[key];
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
        ? value
        : fallback;
    };
    const left = coordinate("left", 0);
    const top = coordinate("top", 0);
    const right = coordinate("right", left);
    const bottom = coordinate("bottom", top);
    return { type: "path", left, right, top, bottom, stops };
  };
  const result: CellStyle = {};
  const fontName =
    typeof font?.name === "string" && font.name.length >= 1 && font.name.length <= 80
      ? font.name
      : undefined;
  const fontSize =
    typeof font?.size === "number" &&
    Number.isInteger(font.size) &&
    font.size >= MIN_CELL_FONT_SIZE &&
    font.size <= MAX_CELL_FONT_SIZE
      ? font.size
      : undefined;
  if (fontName) result.fontFamily = fontName;
  if (fontSize) result.fontSize = fontSize;
  if (font?.bold === true) result.bold = true;
  if (font?.italic === true) result.italic = true;
  if (font?.underline === true || font?.underline === "single") result.underline = true;
  else if (
    font?.underline === "double" ||
    font?.underline === "singleAccounting" ||
    font?.underline === "doubleAccounting"
  )
    result.underline = font.underline;
  if (font?.strike === true) result.strikethrough = true;
  if (font?.vertAlign === "superscript" || font?.vertAlign === "subscript")
    result.fontScript = font.vertAlign;
  const textColor = color(font?.color);
  if (textColor) result.textColor = textColor;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const fillColor = color(fill.fgColor);
    if (fillColor) result.fillColor = fillColor;
  } else if (fillPattern) {
    result.fillPattern = fillPattern;
    const fillColor = color(patternFill?.bgColor);
    const patternColor = color(patternFill?.fgColor);
    if (fillColor) result.fillColor = fillColor;
    if (patternColor) result.fillPatternColor = patternColor;
  } else {
    const gradient = fillGradient();
    if (gradient) result.fillGradient = gradient;
  }
  if (
    alignment?.horizontal === "left" ||
    alignment?.horizontal === "center" ||
    alignment?.horizontal === "right" ||
    alignment?.horizontal === "fill" ||
    alignment?.horizontal === "justify" ||
    alignment?.horizontal === "centerContinuous" ||
    alignment?.horizontal === "distributed"
  )
    result.horizontalAlign = alignment.horizontal;
  if (
    alignment?.vertical === "top" ||
    alignment?.vertical === "middle" ||
    alignment?.vertical === "bottom" ||
    alignment?.vertical === "justify" ||
    alignment?.vertical === "distributed"
  )
    result.verticalAlign = alignment.vertical;
  if ((style.protection as { locked?: boolean } | undefined)?.locked === false)
    result.unlocked = true;
  if (alignment?.wrapText === true) result.wrapText = true;
  if (
    typeof alignment?.indent === "number" &&
    Number.isInteger(alignment.indent) &&
    alignment.indent > 0
  )
    result.indent = alignment.indent;
  if (alignment?.shrinkToFit === true) result.shrinkToFit = true;
  if (
    alignment?.textRotation === "vertical" ||
    (typeof alignment?.textRotation === "number" &&
      Number.isInteger(alignment.textRotation) &&
      alignment.textRotation !== 0)
  )
    result.textRotation = alignment.textRotation;
  const textDirection =
    rawTextDirection ??
    (alignment?.readingOrder === "ltr" || alignment?.readingOrder === "rtl"
      ? alignment.readingOrder
      : undefined);
  if (textDirection === "ltr" || textDirection === "rtl") result.textDirection = textDirection;
  const numberFormat = fromExcelNumberFormat(rawNumberFormat ?? style.numFmt);
  if (numberFormat) result.numberFormat = numberFormat;
  const borderEntries: Array<
    [keyof Pick<CellStyle, "borderTop" | "borderRight" | "borderBottom" | "borderLeft">, string]
  > = [
    ["borderTop", "top"],
    ["borderRight", "right"],
    ["borderBottom", "bottom"],
    ["borderLeft", "left"],
  ];
  let hasUnsupportedBorder = false;
  if (
    Object.entries(border ?? {}).some(
      ([key, value]) =>
        !["top", "right", "bottom", "left", "diagonal"].includes(key) &&
        (typeof value !== "object" || value === null || Object.keys(value).length > 0),
    )
  )
    hasUnsupportedBorder = true;
  for (const [styleKey, excelKey] of borderEntries) {
    const source = border?.[excelKey];
    if (source === undefined) continue;
    const mapped = readExcelBorder(source);
    if (mapped) result[styleKey] = mapped;
    else if (Object.keys((source as Record<string, unknown>) ?? {}).length)
      hasUnsupportedBorder = true;
  }
  const diagonal = readExcelBorder(border?.diagonal);
  const diagonalUp = (border?.diagonal as Record<string, unknown> | undefined)?.up === true;
  const diagonalDown = (border?.diagonal as Record<string, unknown> | undefined)?.down === true;
  if (diagonal && diagonalUp) result.borderDiagonalUp = diagonal;
  if (diagonal && diagonalDown) result.borderDiagonalDown = diagonal;
  if ((diagonalUp || diagonalDown) && !diagonal) hasUnsupportedBorder = true;
  const hasSupportedNoopFill = fill?.type === "pattern" && fill.pattern === "none";
  const hasUnmappablePatternColor =
    fillPattern !== undefined &&
    [patternFill?.fgColor, patternFill?.bgColor].some(
      (patternColor) => patternColor !== undefined && color(patternColor) === undefined,
    );
  const hasSupportedFill =
    hasSupportedNoopFill ||
    (fill?.type === "pattern" && fill.pattern === "solid" && color(fill.fgColor) !== undefined) ||
    fillPattern !== undefined ||
    fillGradient() !== undefined;
  const hasUnsupportedFill = fill !== undefined && (!hasSupportedFill || hasUnmappablePatternColor);
  const hasUnsupportedFont =
    (font !== undefined &&
      ["outline", "shadow", "condense", "extend"].some((key) => font[key] !== undefined)) ||
    (typeof font?.name === "string" && fontName === undefined) ||
    (typeof font?.size === "number" && fontSize === undefined);
  const hasUnsupportedAlignment =
    alignment !== undefined && ["justifyLastLine"].some((key) => alignment[key] !== undefined);
  const hasUnsupportedStyle =
    hasUnsupportedBorder || hasUnsupportedFill || hasUnsupportedFont || hasUnsupportedAlignment;
  if (hasUnsupportedStyle) add(report, "style-omitted", issueLocation);
  if (typeof (rawNumberFormat ?? style.numFmt) === "string" && numberFormat === undefined)
    add(report, "number-format-omitted", issueLocation);
  if (
    Object.keys(style).length &&
    Object.keys(result).length === 0 &&
    !hasUnsupportedStyle &&
    !hasSupportedNoopFill &&
    border === undefined
  )
    add(report, "style-omitted", issueLocation);
  return Object.keys(result).length ? result : undefined;
}

function readContent(
  value: unknown,
  formula: string | undefined,
  formulaResult: unknown,
  dateSystem: "1900" | "1904",
  issueLocation: string,
  report: CompatibilityReportBuilder,
  rawNumericValue?: number,
): CellContent | undefined {
  if (formula !== undefined) {
    const formulaValue = value as Record<string, unknown> | null;
    if (
      (formulaResult !== undefined && formulaResult !== null) ||
      (formulaValue?.result !== undefined && formulaValue.result !== null)
    )
      add(report, "formula-cache-discarded", issueLocation);
    return {
      kind: "formula",
      formula: { source: formula.startsWith("=") ? formula : `=${formula}` },
    };
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return { kind: "literal", value };
  if (value instanceof Date) {
    if (rawNumericValue !== undefined) {
      return { kind: "literal", value: rawNumericValue };
    }
    add(report, "date-normalized", issueLocation);
    return {
      kind: "literal",
      value: datePartsToExcelSerial(
        {
          year: value.getUTCFullYear(),
          month: value.getUTCMonth() + 1,
          day: value.getUTCDate(),
          hour: value.getUTCHours(),
          minute: value.getUTCMinutes(),
          second: value.getUTCSeconds(),
          millisecond: value.getUTCMilliseconds(),
        },
        dateSystem,
      ),
    };
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return { kind: "literal", value: record.text };
  if (typeof record.formula === "string") {
    if (record.result !== undefined && record.result !== null)
      add(report, "formula-cache-discarded", issueLocation);
    return {
      kind: "formula",
      formula: {
        source: record.formula.startsWith("=") ? record.formula : `=${record.formula}`,
      },
    };
  }
  if (typeof record.error === "string") {
    const code = formulaErrorCodeFromToken(record.error);
    return code ? { kind: "error", error: createFormulaError(code) } : undefined;
  }
  add(report, "cell-value-omitted", issueLocation);
  return undefined;
}

export async function decodeWithNativeXlsx(
  bytes: Uint8Array,
): Promise<{ workbook: Workbook; report: XlsxCompatibilityReport }> {
  const report = new CompatibilityReportBuilder();
  const rawNumericValues = readRawWorksheetNumericValues(bytes);
  const rawFormulas = readRawWorksheetFormulas(bytes);
  const rawTextDirections = readRawWorksheetTextDirections(bytes);
  const rawDataMetadata = readXlsxDataMetadata(bytes);
  const rawConditionalFormats = readXlsxConditionalFormatMetadata(bytes, report);
  const rawTables = readXlsxTableMetadata(bytes);
  const archive = unzipSync(bytes);
  const cellStyles = readXlsxCellStyles(archive["xl/styles.xml"], archive["xl/theme/theme1.xml"]);
  const namedStyleBindings = readXlsxNamedCellStyleBindings(archive["xl/styles.xml"]);
  const themeStyleBindings = readXlsxThemeStyleBindings(archive["xl/styles.xml"]);
  const rawHyperlinks = readXlsxHyperlinks(archive, (sheetIndex, reference) =>
    add(report, "feature-omitted", `worksheet${sheetIndex + 1}.hyperlink:${reference}`),
  );
  const rawStyleIds = readXlsxWorksheetStyleIds(archive);
  const rawNotes = readXlsxCellNotes(archive, (sheetIndex, reference) =>
    add(report, "feature-omitted", `worksheet${sheetIndex + 1}.note:${reference}`),
  );
  const rawNoteBoxes = readXlsxCellNoteVmlBoxes(archive);
  const protection = readXlsxProtection(archive, report);
  const source: BrowserWorkbook = new NativeWorkbook();
  await source.xlsx.load(bytes);
  if (source.worksheets.length === 0) throw new Error("The workbook contains no worksheets.");
  const rawSparklines = readXlsxSparklines(
    archive,
    source.worksheets.map((sheet) => sheet.name),
    (index, reference) =>
      add(report, "feature-omitted", `worksheet${index + 1}.sparkline:${reference}`),
  );
  const pageSetups = readXlsxPageSetups(bytes, source.worksheets, report);
  const dateSystem = source.properties.date1904 ? "1904" : "1900";
  const calculation = readWorkbookCalculationSettings(bytes);
  const theme = readXlsxWorkbookTheme(archive["xl/theme/theme1.xml"]);
  let importedCells = 0;
  const sheets = source.worksheets.map((sourceSheet, sheetIndex) => {
    const sheet = createSheet(
      sourceSheet.name || `Sheet${sheetIndex + 1}`,
      `xlsx-sheet-${sheetIndex + 1}`,
    );
    const cells: Array<{
      address: { row: number; column: number };
      content?: CellContent;
      style?: CellStyle;
      hyperlink?: import("@sheetcraft/core/workbook").CellHyperlink;
      namedStyle?: import("@sheetcraft/core/workbook").CellNamedStyleBinding;
      note?: import("@sheetcraft/core/workbook").CellNote;
      sparkline?: import("@sheetcraft/core/sparklines").CellSparkline;
    }> = [];
    const rowHeights: Array<{ index: number; size: number }> = [];
    const columnWidths: Array<{ index: number; size: number }> = [];
    const hiddenRows: number[] = [];
    const hiddenColumns: number[] = [];
    const importedCellAddresses = new Set<string>();
    const metadata = rawDataMetadata[sheetIndex];
    const derivedColorSetRows = new Set(metadata?.colorSetHiddenRows ?? []);
    const conditionalFormats = rawConditionalFormats[sheetIndex]?.rules ?? [];
    const tables = rawTables.sheets[sheetIndex] ?? [];
    const sourceDefaultColumnWidth = sourceSheet.properties.defaultColWidth;
    const defaultColumnWidth =
      typeof sourceDefaultColumnWidth === "number" && Number.isFinite(sourceDefaultColumnWidth)
        ? Math.max(
            MIN_COLUMN_WIDTH,
            Math.min(MAX_COLUMN_WIDTH, excelColumnWidthToPixels(sourceDefaultColumnWidth)),
          )
        : DEFAULT_COLUMN_WIDTH;
    for (const row of sourceSheet.model?.rows ?? []) {
      const rowNumber = row.number;
      if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 1) continue;
      const rowIndex = rowNumber - 1;
      if (
        row.hidden === true &&
        !derivedColorSetRows.has(rowIndex) &&
        !metadata?.outlineGroups.some(
          (group) =>
            group.axis === "row" &&
            group.collapsed &&
            group.start <= rowIndex &&
            group.end >= rowIndex,
        )
      )
        hiddenRows.push(rowIndex);
      if (typeof row.height === "number") {
        const coreHeight = (row.height * 4) / 3;
        const roundedHeight = Math.round(coreHeight);
        const size = Math.max(16, Math.min(512, roundedHeight));
        if (size !== DEFAULT_ROW_HEIGHT) rowHeights.push({ index: rowIndex, size });
        if (!Number.isInteger(coreHeight) || size !== roundedHeight)
          add(report, "dimension-approximated", `${sourceSheet.name}!${rowNumber}`);
      }
      for (const modelCell of row.cells ?? []) {
        if (!modelCell.address) continue;
        const cellAddress = parseAddress(modelCell.address);
        if (!cellAddress) {
          add(report, "feature-omitted", `${sourceSheet.name}!${modelCell.address}`);
          continue;
        }
        const cell = sourceSheet.getCell(modelCell.address);
        const issueLocation = `${sourceSheet.name}!${address(cellAddress.row, cellAddress.column)}`;
        const content = readContent(
          cell.value,
          cell.formula ?? rawFormulas[sheetIndex]?.get(modelCell.address.toUpperCase()),
          cell.result,
          dateSystem,
          issueLocation,
          report,
          rawNumericValues[sheetIndex]?.get(modelCell.address.toUpperCase()),
        );
        let style = readStyle(
          cell.style,
          cell.numFmt,
          issueLocation,
          report,
          rawTextDirections[sheetIndex]?.get(modelCell.address.toUpperCase()),
        );
        const themeStyle = themeStyleBindings.get(
          rawStyleIds[sheetIndex]?.get(modelCell.address.toUpperCase()) ?? -1,
        );
        if (themeStyle) style = { ...style, ...themeStyle };
        const rawHyperlink = rawHyperlinks[sheetIndex]?.get(modelCell.address.toUpperCase());
        let hyperlink: import("@sheetcraft/core/workbook").CellHyperlink | undefined;
        if (rawHyperlink) {
          try {
            hyperlink = normalizeCellHyperlink(rawHyperlink);
          } catch {
            add(report, "feature-omitted", `${issueLocation}.hyperlink`);
          }
        }
        const namedStyle = namedStyleBindings.get(
          rawStyleIds[sheetIndex]?.get(modelCell.address.toUpperCase()) ?? -1,
        );
        const note = rawNotes[sheetIndex]?.get(modelCell.address.toUpperCase());
        if (content || style || hyperlink || note) {
          importedCells += 1;
          if (importedCells > MAX_SPARSE_CELLS) {
            report.add("archive-limit", "block", issueLocation);
            throw new XlsxCompatibilityError(
              "The workbook exceeds the XLSX v1 cell limit.",
              report.build(),
            );
          }
          cells.push({
            address: cellAddress,
            ...(content ? { content } : {}),
            ...(style ? { style } : {}),
            ...(hyperlink ? { hyperlink } : {}),
            ...(namedStyle ? { namedStyle } : {}),
            ...(note ? { note } : {}),
          });
          importedCellAddresses.add(modelCell.address.toUpperCase());
        }
      }
    }
    for (const [reference, note] of rawNotes[sheetIndex] ?? []) {
      if (importedCellAddresses.has(reference)) continue;
      const cellAddress = parseAddress(reference);
      if (!cellAddress) {
        add(report, "feature-omitted", `${sourceSheet.name}!${reference}`);
        continue;
      }
      importedCells += 1;
      if (importedCells > MAX_SPARSE_CELLS) {
        report.add("archive-limit", "block", `${sourceSheet.name}!${reference}`);
        throw new XlsxCompatibilityError(
          "The workbook exceeds the XLSX v1 cell limit.",
          report.build(),
        );
      }
      cells.push({ address: cellAddress, note });
    }
    const cellsByKey = new Map(
      cells.map((cell) => [`${cell.address.row}:${cell.address.column}`, cell]),
    );
    for (const [reference, sparkline] of rawSparklines[sheetIndex] ?? []) {
      const address = parseAddress(reference);
      if (!address) continue;
      const existing = cellsByKey.get(`${address.row}:${address.column}`);
      if (existing) existing.sparkline = sparkline;
      else {
        importedCells++;
        if (importedCells > MAX_SPARSE_CELLS)
          throw new XlsxCompatibilityError(
            "The workbook exceeds the XLSX cell limit.",
            report.build(),
          );
        cells.push({ address, sparkline });
      }
    }
    for (const column of sourceSheet.columns ?? []) {
      const index = column.number;
      const width = column.width;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 1) continue;
      const columnIndex = index;
      if (
        column.hidden === true &&
        !metadata?.outlineGroups.some(
          (group) =>
            group.axis === "column" &&
            group.collapsed &&
            group.start <= columnIndex - 1 &&
            group.end >= columnIndex - 1,
        )
      )
        hiddenColumns.push(columnIndex - 1);
      if (width === undefined) continue;
      const pixels = excelColumnWidthToPixels(width);
      const size = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, pixels));
      if (size !== defaultColumnWidth) columnWidths.push({ index: columnIndex - 1, size });
      add(report, "dimension-approximated", `${sourceSheet.name}!${columnLabel(columnIndex - 1)}`);
    }
    const columnSizes = new Map(columnWidths.map(({ index, size }) => [index, size]));
    const rowSizes = new Map(rowHeights.map(({ index, size }) => [index, size]));
    const sourceDefaultRowHeight = sourceSheet.properties.defaultRowHeight;
    const defaultRowHeight =
      typeof sourceDefaultRowHeight === "number" && Number.isFinite(sourceDefaultRowHeight)
        ? (sourceDefaultRowHeight * 4) / 3
        : DEFAULT_ROW_HEIGHT;
    const offsetBefore = (index: number, sizes: ReadonlyMap<number, number>, fallback: number) => {
      let offset = 0;
      for (let current = 0; current < index; current += 1) offset += sizes.get(current) ?? fallback;
      return offset;
    };
    for (const cell of cells) {
      if (!cell.note) continue;
      const reference = address(cell.address.row, cell.address.column);
      const geometry = rawNoteBoxes[sheetIndex]?.get(reference);
      // ExcelJS synthesizes this fixed VML rectangle for notes without an
      // explicit product box. Keep `box` absent so ordinary notes roundtrip
      // without acquiring a misleading geometry contract.
      if (
        !geometry ||
        (Math.abs(geometry.left - 140.4) < 0.01 &&
          Math.abs(geometry.top - 14) < 0.01 &&
          Math.abs(geometry.width - 130.4) < 0.01 &&
          Math.abs(geometry.height - 78.8) < 0.01)
      )
        continue;
      try {
        cell.note = normalizeCellNote({
          ...cell.note,
          box: {
            offsetX:
              geometry.left -
              offsetBefore(cell.address.column + 1, columnSizes, defaultColumnWidth),
            offsetY: geometry.top - offsetBefore(cell.address.row, rowSizes, defaultRowHeight),
            width: geometry.width,
            height: geometry.height,
          },
        });
      } catch {
        add(report, "feature-omitted", `${sourceSheet.name}!${reference}.note.box`);
      }
    }
    const view = (sourceSheet.views ?? []).find((candidate) => candidate.state === "frozen");
    const freezePanes = {
      rows: Number.isInteger(view?.ySplit) ? Number(view?.ySplit) : 0,
      columns: Number.isInteger(view?.xSplit) ? Number(view?.xSplit) : 0,
    };
    const mergedCells = (sourceSheet.model?.merges ?? []).flatMap((value) => {
      const range = parseRange(value);
      if (!range) {
        add(report, "feature-omitted", `${sourceSheet.name}!${value}`);
        return [];
      }
      if (
        (range.start.row < freezePanes.rows && range.end.row >= freezePanes.rows) ||
        (range.start.column < freezePanes.columns && range.end.column >= freezePanes.columns)
      ) {
        add(report, "feature-omitted", `${sourceSheet.name}!${value}`);
        return [];
      }
      return [range];
    });
    if (metadata?.unsupportedFilters) add(report, "filter-omitted", sourceSheet.name);
    if (metadata?.unsupportedValidations)
      add(report, "feature-omitted", `${sourceSheet.name}.dataValidations`);
    replaceSheetSparseState(sheet, {
      cells,
      rowHeights,
      columnWidths,
      hiddenRows,
      hiddenColumns,
      defaultColumnWidth,
      freezePanes,
      filter: restoreMergedCellFilterSupport(
        sheetFilterOutsideTables(
          (metadata?.filter ?? null) as typeof sheet.filter,
          tables,
          report,
          sourceSheet.name,
        ),
        mergedCells,
      ),
      mergedCells,
      dataValidations: (metadata?.dataValidations ?? []).map((validation, index) => ({
        id: `xlsx-validation-${sheetIndex + 1}-${index + 1}`,
        ...validation,
      })),
      outlineGroups: (metadata?.outlineGroups ?? []).map((group, index) => ({
        id: `xlsx-outline-${sheetIndex + 1}-${index + 1}`,
        ...group,
      })),
      conditionalFormats,
      tables,
      protection: protection.sheets[sheetIndex]?.protection,
      ...(pageSetups[sheetIndex] ? { pageSetup: pageSetups[sheetIndex] } : {}),
      floatingImages: [],
    });
    sheet.properties.protected = protection.sheets[sheetIndex]?.protected ?? false;
    return sheet;
  });
  const activeTab = source.views?.[0]?.activeTab;
  const activeSheetIndex =
    typeof activeTab === "number" &&
    Number.isInteger(activeTab) &&
    activeTab >= 0 &&
    activeTab < sheets.length
      ? activeTab
      : 0;
  if (activeTab !== undefined && activeSheetIndex === 0 && activeTab !== 0)
    add(report, "feature-omitted", "workbook.activeTab");
  const workbook: Workbook = {
    id: workbookId(),
    structureProtected: protection.structureProtected,
    ...(protection.structurePassword ? { structurePassword: protection.structurePassword } : {}),
    dateSystem,
    calculation,
    theme,
    activeSheetId: sheets[activeSheetIndex]?.id ?? sheets[0]?.id ?? "",
    sheets: new Map(sheets.map((sheet) => [sheet.id, sheet])),
    definedNames: readDefinedNames(bytes, sheets, report),
    tableStyles: rawTables.tableStyles,
    pivotTableStyles: rawTables.pivotTableStyles,
    ...(cellStyles.length ? { cellStyles } : {}),
    ...(xlsxTableStyleId(rawTables.defaultTableStyleName)
      ? {
          defaultTableStyleId: xlsxTableStyleId(rawTables.defaultTableStyleName),
        }
      : {}),
    ...(xlsxPivotTableStyleId(rawTables.defaultPivotTableStyleName)
      ? {
          defaultPivotTableStyleId: xlsxPivotTableStyleId(rawTables.defaultPivotTableStyleName),
        }
      : {}),
  };
  readXlsxPivotTables(bytes, workbook, report);
  return { workbook, report: report.build() };
}

function writeStyle(
  cell: BrowserCell & { style: Record<string, unknown>; numFmt?: string },
  style: CellStyle | undefined,
  issueLocation: string,
  report: CompatibilityReportBuilder,
): void {
  style ??= {};
  // Preserve the font-size control's number across applications. Excel stores
  // points, but the product contract is numeric parity, not CSS-pixel conversion.
  // A partial font replaces the font rather than inheriting fields from Normal.
  const font: Record<string, unknown> = {
    name: style.fontFamily ?? "Calibri",
    size: style.fontSize ?? DEFAULT_CELL_FONT_SIZE,
  };
  if (style.bold) font.bold = true;
  if (style.italic) font.italic = true;
  if (style.underline) font.underline = style.underline;
  if (style.strikethrough) font.strike = true;
  if (style.fontScript) font.vertAlign = style.fontScript;
  if (style.textColor) font.color = { argb: `FF${style.textColor.slice(1).toUpperCase()}` };
  const next: Record<string, unknown> = {};
  if (Object.keys(font).length) next.font = font;
  if (style.fillGradient) {
    next.fill =
      style.fillGradient.type === "linear"
        ? {
            type: "gradient",
            gradient: "angle",
            degree: style.fillGradient.angle,
            stops: style.fillGradient.stops.map((stop) => ({
              position: stop.position,
              color: { argb: `FF${stop.color.slice(1).toUpperCase()}` },
            })),
          }
        : {
            type: "gradient",
            gradient: "path",
            center: {
              left: style.fillGradient.left,
              right: style.fillGradient.right,
              top: style.fillGradient.top,
              bottom: style.fillGradient.bottom,
            },
            stops: style.fillGradient.stops.map((stop) => ({
              position: stop.position,
              color: { argb: `FF${stop.color.slice(1).toUpperCase()}` },
            })),
          };
  } else if (style.fillPattern) {
    next.fill = {
      type: "pattern",
      pattern: style.fillPattern,
      ...(style.fillPatternColor
        ? {
            fgColor: {
              argb: `FF${style.fillPatternColor.slice(1).toUpperCase()}`,
            },
          }
        : {}),
      ...(style.fillColor
        ? { bgColor: { argb: `FF${style.fillColor.slice(1).toUpperCase()}` } }
        : {}),
    };
  } else if (style.fillColor)
    next.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${style.fillColor.slice(1).toUpperCase()}` },
    };
  const alignment: Record<string, unknown> = {
    ...(style.horizontalAlign && style.horizontalAlign !== "general"
      ? { horizontal: style.horizontalAlign }
      : {}),
    ...(style.verticalAlign ? { vertical: style.verticalAlign } : {}),
    ...(style.wrapText ? { wrapText: true } : {}),
    ...(style.indent ? { indent: style.indent } : {}),
    ...(style.shrinkToFit ? { shrinkToFit: true } : {}),
    ...(style.textRotation ? { textRotation: style.textRotation } : {}),
    ...(style.textDirection === "ltr" || style.textDirection === "rtl"
      ? { readingOrder: style.textDirection }
      : {}),
  };
  if (Object.keys(alignment).length) next.alignment = alignment;
  const diagonalConflict =
    style.borderDiagonalUp &&
    style.borderDiagonalDown &&
    (style.borderDiagonalUp.style !== style.borderDiagonalDown.style ||
      style.borderDiagonalUp.color !== style.borderDiagonalDown.color);
  if (
    style.borderTop ||
    style.borderRight ||
    style.borderBottom ||
    style.borderLeft ||
    !diagonalConflict
  ) {
    const border: Record<string, unknown> = {};
    if (style.borderTop) border.top = writeExcelBorder(style.borderTop);
    if (style.borderRight) border.right = writeExcelBorder(style.borderRight);
    if (style.borderBottom) border.bottom = writeExcelBorder(style.borderBottom);
    if (style.borderLeft) border.left = writeExcelBorder(style.borderLeft);
    if (!diagonalConflict && (style.borderDiagonalUp || style.borderDiagonalDown)) {
      border.diagonal = {
        ...writeExcelBorder(style.borderDiagonalUp ?? style.borderDiagonalDown!),
        up: style.borderDiagonalUp !== undefined,
        down: style.borderDiagonalDown !== undefined,
      };
    }
    if (Object.keys(border).length) next.border = border;
  }
  if (style.unlocked) next.protection = { locked: false };
  cell.style = next;
  if (style.numberFormat) cell.numFmt = toExcelNumberFormat(style.numberFormat);
  // XLSX number-format codes cannot distinguish WPS's compact Chinese upper
  // preset from ordinary DBNum2. Export its portable DBNum2 code and record
  // that the compact presentation was intentionally downgraded.
  if (style.numberFormat?.kind === "special" && style.numberFormat.chineseUpperStyle === "compact")
    add(report, "number-format-degraded", issueLocation);
  if (diagonalConflict) add(report, "style-omitted", issueLocation);
}

export async function encodeWithNativeXlsx(
  workbook: Workbook,
  options?: XlsxEncodeOptions,
): Promise<{ bytes: Uint8Array; report: XlsxCompatibilityReport }> {
  const report = new CompatibilityReportBuilder();
  const target: BrowserWorkbook = new NativeWorkbook();
  const imageExporter = createXlsxImageExporter(target, options);
  const cellImages: NativeCellImage[] = [];
  const dataMetadata: Array<
    Omit<XlsxDataMetadata, "unsupportedFilters" | "unsupportedValidations">
  > = [];
  const conditionalFormats: SheetConditionalFormatRule[][] = [];
  const pageSetups: Array<SheetPageSetup | undefined> = [];
  const sheetBackgrounds: Array<string | undefined> = [];
  target.properties.date1904 = workbook.dateSystem === "1904";
  target.calcProperties.fullCalcOnLoad = true;
  let encodedCells = 0;
  if (workbook.watermarkPresets?.length)
    add(report, "feature-omitted", "workbook.watermarkPresets");
  for (const [sheetIndex, sheet] of [...workbook.sheets.values()].entries()) {
    pageSetups.push(sheet.pageSetup);
    // Tiled watermarks have no native worksheet field; do not silently claim XLSX fidelity.
    if (sheet.drawings?.length) add(report, "feature-omitted", `${sheet.name}.drawings`);
    if (sheet.pageDecoration?.watermark) add(report, "feature-omitted", `${sheet.name}.watermark`);
    sheetBackgrounds.push(
      sheet.pageDecoration?.backgroundAssetId
        ? imageExporter.registerSheetBackground(
            sheet.pageDecoration.backgroundAssetId,
            `${sheet.name}.background`,
          )
        : undefined,
    );
    const evaluator = createSheetEvaluator(sheet);
    const isFormulaCacheEligible = createFormulaCacheEligibility(sheet);
    const output = target.addWorksheet(sheet.name, {
      views:
        sheet.freezePanes.rows || sheet.freezePanes.columns
          ? [
              {
                state: "frozen",
                ySplit: sheet.freezePanes.rows,
                xSplit: sheet.freezePanes.columns,
              },
            ]
          : undefined,
    });
    output.properties.defaultRowHeight = (DEFAULT_ROW_HEIGHT * 3) / 4;
    output.properties.defaultColWidth = pixelsToExcelColumnWidth(getDefaultColumnWidth(sheet));
    if (sheet.properties.tabColor) {
      output.properties.tabColor = {
        argb: `FF${sheet.properties.tabColor.slice(1).toUpperCase()}`,
      };
    }
    for (const [index, size] of sheet.rowHeights) {
      output.getRow(index + 1).height = (size * 3) / 4;
    }
    const advancedRows = advancedHiddenRows(sheet.filter);
    const multiColorRows = colorSetHiddenRows(sheet);
    const derivedMultiColorRows = multiColorRows.filter((row) => !sheet.hiddenRows?.has(row));
    for (const index of new Set([
      ...(sheet.hiddenRows ?? []),
      ...advancedRows,
      ...multiColorRows,
    ])) {
      output.getRow(index + 1).hidden = true;
    }
    for (const [index, size] of sheet.columnWidths) {
      output.getColumn(index + 1).width = pixelsToExcelColumnWidth(size);
    }
    for (const index of sheet.hiddenColumns ?? []) {
      output.getColumn(index + 1).hidden = true;
    }
    const subtotalMetadata = sheet.subtotalMetadata ?? [];
    const pageBreakRows = subtotalMetadata.some((entry) => entry.pageBreakRows !== undefined)
      ? subtotalMetadata.flatMap((entry) => entry.pageBreakRows ?? [])
      : undefined;
    let summaryBelow: boolean | undefined;
    for (const entry of subtotalMetadata)
      if (entry.summaryBelow !== undefined) summaryBelow = entry.summaryBelow;
    const exportFilter = sheetFilterOutsideTables(
      sheet.filter,
      sheet.tables ?? [],
      report,
      sheet.name,
    );
    dataMetadata.push({
      // Advanced Filter has different criteria semantics. Do not serialize its
      // list range as an ordinary AutoFilter and imply that it is equivalent.
      filter: exportFilter?.advanced
        ? null
        : (exportFilter as unknown as XlsxDataMetadata["filter"]),
      hiddenRows: [...new Set([...(sheet.hiddenRows ?? []), ...advancedRows, ...multiColorRows])],
      colorSetHiddenRows: derivedMultiColorRows,
      dataValidations: (sheet.dataValidations ?? []).map((validation) => {
        const { id: _id, ...value } = validation as { id?: unknown } & Record<string, unknown>;
        return value as XlsxDataMetadata["dataValidations"][number];
      }),
      outlineGroups: (sheet.outlineGroups ?? []).map((group) => {
        const { id: _id, ...value } = group as { id?: unknown } & Record<string, unknown>;
        return value as XlsxDataMetadata["outlineGroups"][number];
      }),
      ...(pageBreakRows === undefined ? {} : { pageBreakRows }),
      ...(summaryBelow === undefined ? {} : { summaryBelow }),
    });
    conditionalFormats.push(sheet.conditionalFormats ?? []);
    if (exportFilter?.advanced)
      add(report, "advanced-filter-criteria-omitted", `${sheet.name}.advancedFilter`);
    // Duplicate highlighting and duplicate-entry rejection are product-owned
    // rules. Do not serialize them as ordinary XLSX conditional formatting or
    // validation, because that would imply equivalent behavior after import.
    if (sheet.duplicateRules?.length)
      add(report, "feature-omitted", `${sheet.name}.duplicateRules`);
    for (const [key, cell] of sheet.cells) {
      encodedCells += 1;
      if (encodedCells > MAX_SPARSE_CELLS)
        throw new RangeError("The workbook exceeds the XLSX v1 cell limit.");
      const [row, column] = key.split(":").map(Number);
      if (row === undefined || column === undefined) continue;
      const issueLocation = `${sheet.name}!${address(row, column)}`;
      const outputCell = output.getCell(address(row, column));
      if (cell.content?.kind === "literal") outputCell.value = cell.content.value;
      else if (cell.content?.kind === "formula") {
        if (isSimulationTableFormula(cell.content.formula.source)) {
          outputCell.value = formulaSnapshotValue(evaluator.getComputedValue({ row, column }));
          add(report, "feature-omitted", issueLocation);
        } else {
          const result = isFormulaCacheEligible(row, column)
            ? formulaCacheValue(evaluator.getComputedValue({ row, column }))
            : undefined;
          outputCell.value = {
            formula: cell.content.formula.source.slice(1),
            ...(result !== undefined ? { result } : {}),
          };
          if (result === undefined) add(report, "formula-not-calculated", issueLocation);
        }
      } else if (cell.content?.kind === "error")
        outputCell.value = {
          error: {
            NULL: "#NULL!",
            DIV0: "#DIV/0!",
            VALUE: "#VALUE!",
            REF: "#REF!",
            NAME: "#NAME?",
            NUM: "#NUM!",
            NA: "#N/A",
            SPILL: "#SPILL!",
            CALC: "#CALC!",
            GETTING_DATA: "#GETTING_DATA",
            PARSE: "#PARSE!",
            CYCLE: "#CYCLE!",
          }[cell.content.error.code],
        };
      else if (cell.content?.kind === "image") {
        // Keep a real cell in sheetData. The finalizer attaches its rich value.
        outputCell.value = { error: "#VALUE!" };
        cellImages.push({
          sheetIndex,
          address: address(row, column),
          ...imageExporter.registerCellImage(cell.content.image, issueLocation),
        });
      }
      writeStyle(outputCell, cell.style, issueLocation, report);
      if (cell.note) outputCell.note = { texts: [{ text: cell.note.text }] };
    }
    // The exchange model shares the anchor style across the merge. Apply styles first
    // so every physical cell in the merged area receives its perimeter borders.
    for (const range of sheet.mergedCells) {
      output.mergeCells(
        `${address(range.start.row, range.start.column)}:${address(range.end.row, range.end.column)}`,
      );
    }
    for (const image of sheet.floatingImages) {
      if (image.hidden) continue;
      const issueLocation = `${sheet.name}!${address(image.anchor.row, image.anchor.column)}`;
      imageExporter.addFloatingImage(output, sheet, image, issueLocation);
    }
    // Leave wrapped content rows without a fixed height for Excel to fit on load.
    // Pin other materialized rows, including merged/styled blanks; keep gaps sparse.
    const autoFitRows = getAutoFitRowNumbers(sheet);
    for (const row of output.model?.rows ?? []) {
      if (row.number !== undefined && row.height === undefined && !autoFitRows.has(row.number))
        output.getRow(row.number).height = (DEFAULT_ROW_HEIGHT * 3) / 4;
    }
  }
  const bytes = await target.xlsx.writeBuffer();
  return {
    bytes: finalizeXlsxExport(
      new Uint8Array(bytes),
      cellImages,
      [
        ...collectDefinedNames(workbook, report),
        ...collectPrintAreaDefinedNames(workbook),
        ...collectPrintTitleDefinedNames(workbook),
      ],
      workbook.calculation,
      dataMetadata,
      conditionalFormats,
      [...workbook.sheets.values()],
      workbook.tableStyles ?? [],
      workbook.defaultTableStyleId,
      workbook.pivotTableStyles ?? [],
      workbook.defaultPivotTableStyleId,
      workbook.cellStyles,
      pageSetups,
      workbook.theme,
      report,
      sheetBackgrounds,
      Boolean(workbook.structureProtected),
      workbook.structurePassword,
      workbook,
    ),
    report: report.build(),
  };
}
