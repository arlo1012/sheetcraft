import ExcelJSImport from "exceljs/dist/exceljs.min.js";
import { readExcelBorder, writeExcelBorder } from "./border.js";
import { createFormulaCacheEligibility, formulaCacheValue } from "./formula-cache.js";
import { fromExcelNumberFormat, toExcelNumberFormat } from "./number-format.js";
import {
  createFormulaError,
  datePartsToExcelSerial,
  formulaErrorCodeFromToken,
  type CellContent,
} from "@idea10/core/formula";
import {
  createSheetEvaluator,
  replaceSheetSparseState,
  type CellRange,
  type Workbook,
} from "@idea10/core/workbook";
import type { CellStyle } from "@idea10/core/style";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, createSheet } from "@idea10/core/workbook";
import { CompatibilityReportBuilder } from "./report.js";
import { XlsxCompatibilityError, type XlsxCompatibilityReport } from "./types.js";

const MAX_SPARSE_CELLS = 200_000;

type BrowserCell = {
  value: unknown;
  formula?: string;
  result?: unknown;
  style?: Record<string, unknown>;
};
type BrowserRow = {
  height?: number;
  eachCell: (
    options: { includeEmpty: boolean },
    callback: (cell: BrowserCell, column: number) => void,
  ) => void;
};
type BrowserWorksheet = {
  name: string;
  views?: Array<Record<string, unknown>> | null;
  columns?: Array<{ number?: number; width?: number }>;
  autoFilter?: unknown;
  model?: {
    merges?: string[];
    rows?: Array<{ number?: number; height?: number; cells?: Array<{ address?: string }> }>;
  };
  getColumn: (index: number) => { width?: number };
  getRow: (index: number) => { height?: number };
  eachRow: (
    options: { includeEmpty: boolean },
    callback: (row: BrowserRow, rowNumber: number) => void,
  ) => void;
  mergeCells: (range: string) => void;
  getCell: (
    address: string,
  ) => BrowserCell & { value: unknown; style: Record<string, unknown>; numFmt?: string };
};
type BrowserWorkbook = {
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
type BrowserExcelJs = { Workbook: new () => BrowserWorkbook };
const ExcelJS = ExcelJSImport as BrowserExcelJs;

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

function readStyle(
  style: Record<string, unknown> | undefined,
  rawNumberFormat: unknown,
  issueLocation: string,
  report: CompatibilityReportBuilder,
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
  const result: CellStyle = {};
  const fontName =
    typeof font?.name === "string" && font.name.length >= 1 && font.name.length <= 80
      ? font.name
      : undefined;
  const fontSize =
    typeof font?.size === "number" &&
    Number.isInteger(font.size) &&
    font.size >= 8 &&
    font.size <= 72
      ? font.size
      : undefined;
  if (fontName) result.fontFamily = fontName;
  if (fontSize) result.fontSize = fontSize;
  if (font?.bold === true) result.bold = true;
  if (font?.italic === true) result.italic = true;
  if (font?.underline === true || font?.underline === "single") result.underline = true;
  const textColor = color(font?.color);
  if (textColor) result.textColor = textColor;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const fillColor = color(fill.fgColor);
    if (fillColor) result.fillColor = fillColor;
  }
  if (
    alignment?.horizontal === "left" ||
    alignment?.horizontal === "center" ||
    alignment?.horizontal === "right"
  )
    result.horizontalAlign = alignment.horizontal;
  if (
    alignment?.vertical === "top" ||
    alignment?.vertical === "middle" ||
    alignment?.vertical === "bottom"
  )
    result.verticalAlign = alignment.vertical;
  if (alignment?.wrapText === true) result.wrapText = true;
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
  const hasUnsupportedFill =
    fill !== undefined &&
    !(
      hasSupportedNoopFill ||
      (fill.type === "pattern" && fill.pattern === "solid" && color(fill.fgColor))
    );
  const hasUnsupportedFont =
    (font !== undefined &&
      ["strike", "vertAlign", "outline", "shadow", "condense", "extend"].some(
        (key) => font[key] !== undefined,
      )) ||
    (typeof font?.name === "string" && fontName === undefined) ||
    (typeof font?.size === "number" && fontSize === undefined);
  const hasUnsupportedAlignment =
    alignment !== undefined &&
    ["indent", "readingOrder", "shrinkToFit", "textRotation", "justifyLastLine"].some(
      (key) => alignment[key] !== undefined,
    );
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
  if (typeof record.formula === "string") {
    if (record.result !== undefined && record.result !== null)
      add(report, "formula-cache-discarded", issueLocation);
    return {
      kind: "formula",
      formula: { source: record.formula.startsWith("=") ? record.formula : `=${record.formula}` },
    };
  }
  if (typeof record.error === "string") {
    const code = formulaErrorCodeFromToken(record.error);
    return code ? { kind: "error", error: createFormulaError(code) } : undefined;
  }
  add(report, "cell-value-omitted", issueLocation);
  return undefined;
}

export async function decodeWithExcelJs(
  bytes: Uint8Array,
): Promise<{ workbook: Workbook; report: XlsxCompatibilityReport }> {
  const report = new CompatibilityReportBuilder();
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(bytes);
  if (source.worksheets.length === 0) throw new Error("The workbook contains no worksheets.");
  const dateSystem = source.properties.date1904 ? "1904" : "1900";
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
    }> = [];
    const rowHeights: Array<{ index: number; size: number }> = [];
    const columnWidths: Array<{ index: number; size: number }> = [];
    for (const row of sourceSheet.model?.rows ?? []) {
      const rowNumber = row.number;
      if (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 1) continue;
      const rowIndex = rowNumber - 1;
      if (typeof row.height === "number") {
        const coreHeight = (row.height * 4) / 3;
        const roundedHeight = Math.round(coreHeight);
        const size = Math.max(16, Math.min(512, roundedHeight));
        rowHeights.push({
          index: rowIndex,
          size,
        });
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
          cell.formula,
          cell.result,
          dateSystem,
          issueLocation,
          report,
        );
        const style = readStyle(cell.style, cell.numFmt, issueLocation, report);
        if (content || style) {
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
          });
        }
      }
    }
    for (const column of sourceSheet.columns ?? []) {
      const index = column.number;
      const width = column.width;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || width === undefined)
        continue;
      const columnIndex = index;
      columnWidths.push({
        index: columnIndex - 1,
        size: Math.max(32, Math.min(640, Math.round(width * 7 + 5))),
      });
      add(report, "dimension-approximated", `${sourceSheet.name}!${columnLabel(columnIndex - 1)}`);
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
    if (sourceSheet.autoFilter) add(report, "filter-omitted", sourceSheet.name);
    replaceSheetSparseState(sheet, {
      cells,
      rowHeights,
      columnWidths,
      freezePanes,
      filter: null,
      mergedCells,
      floatingImages: [],
    });
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
  return {
    workbook: {
      id: workbookId(),
      dateSystem,
      activeSheetId: sheets[activeSheetIndex]?.id ?? sheets[0]?.id ?? "",
      sheets: new Map(sheets.map((sheet) => [sheet.id, sheet])),
    },
    report: report.build(),
  };
}

function writeStyle(
  cell: BrowserCell & { style: Record<string, unknown>; numFmt?: string },
  style: CellStyle | undefined,
  issueLocation: string,
  report: CompatibilityReportBuilder,
): void {
  if (!style) return;
  const font: Record<string, unknown> = {};
  if (style.fontFamily) font.name = style.fontFamily;
  if (style.fontSize) font.size = style.fontSize;
  if (style.bold) font.bold = true;
  if (style.italic) font.italic = true;
  if (style.underline) font.underline = true;
  if (style.textColor) font.color = { argb: `FF${style.textColor.slice(1).toUpperCase()}` };
  const next: Record<string, unknown> = {};
  if (Object.keys(font).length) next.font = font;
  if (style.fillColor)
    next.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${style.fillColor.slice(1).toUpperCase()}` },
    };
  if (style.horizontalAlign || style.verticalAlign || style.wrapText)
    next.alignment = {
      ...(style.horizontalAlign ? { horizontal: style.horizontalAlign } : {}),
      ...(style.verticalAlign ? { vertical: style.verticalAlign } : {}),
      ...(style.wrapText ? { wrapText: true } : {}),
    };
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
  cell.style = next;
  if (style.numberFormat) cell.numFmt = toExcelNumberFormat(style.numberFormat);
  if (diagonalConflict) add(report, "style-omitted", issueLocation);
}

export async function encodeWithExcelJs(
  workbook: Workbook,
): Promise<{ bytes: Uint8Array; report: XlsxCompatibilityReport }> {
  const report = new CompatibilityReportBuilder();
  const target = new ExcelJS.Workbook();
  target.properties.date1904 = workbook.dateSystem === "1904";
  target.calcProperties.fullCalcOnLoad = true;
  let encodedCells = 0;
  for (const sheet of workbook.sheets.values()) {
    const evaluator = createSheetEvaluator(sheet);
    const isFormulaCacheEligible = createFormulaCacheEligibility(sheet);
    const output = target.addWorksheet(sheet.name, {
      views:
        sheet.freezePanes.rows || sheet.freezePanes.columns
          ? [{ state: "frozen", ySplit: sheet.freezePanes.rows, xSplit: sheet.freezePanes.columns }]
          : undefined,
    });
    for (const [index, size] of sheet.rowHeights) {
      output.getRow(index + 1).height = (size * 3) / 4;
    }
    for (const [index, size] of sheet.columnWidths) {
      output.getColumn(index + 1).width = Math.max(0, (size - 5) / 7);
      add(report, "dimension-approximated", `${sheet.name}!${columnLabel(index)}`);
    }
    for (const range of sheet.mergedCells)
      output.mergeCells(
        `${address(range.start.row, range.start.column)}:${address(range.end.row, range.end.column)}`,
      );
    if (sheet.filter) add(report, "filter-omitted", sheet.name);
    for (const image of sheet.floatingImages)
      add(
        report,
        "image-omitted",
        `${sheet.name}!${address(image.anchor.row, image.anchor.column)}`,
      );
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
        const result = isFormulaCacheEligible(row, column)
          ? formulaCacheValue(evaluator.getComputedValue({ row, column }))
          : undefined;
        outputCell.value = {
          formula: cell.content.formula.source.slice(1),
          ...(result !== undefined ? { result } : {}),
        };
        if (result === undefined) add(report, "formula-not-calculated", issueLocation);
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
      else if (cell.content?.kind === "image") add(report, "image-omitted", issueLocation);
      writeStyle(outputCell, cell.style, issueLocation, report);
    }
  }
  const bytes = await target.xlsx.writeBuffer();
  return {
    bytes: bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes),
    report: report.build(),
  };
}
