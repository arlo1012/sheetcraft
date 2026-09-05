import { evaluateFormula } from "./formula/evaluate.js";
import { collectFormulaRanges, collectFormulaReferences } from "./formula/references.js";
import {
  createFormulaError,
  type CellContent,
  type FormulaErrorCode,
  type FormulaValue,
} from "./formula/types.js";
import { doMergedCellRangesIntersect, validateMergedCellRanges } from "./merged-cells.js";
import type { IdFactory } from "./runtime.js";
import { isSheetAddressInBounds, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import { areCellStylesEqual, cloneCellStyle, normalizeCellStyle, type CellStyle } from "./style.js";

export { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COLUMN_WIDTH = 96;
export const MIN_ROW_HEIGHT = 16;
export const MAX_ROW_HEIGHT = 512;
export const MIN_COLUMN_WIDTH = 32;
export const MAX_COLUMN_WIDTH = 640;
export const MIN_FLOATING_IMAGE_SIZE = 1;
export const MAX_FLOATING_IMAGE_SIZE = 10_000;

export type CellValue = string | number | boolean | null;

export type CellAddress = {
  row: number;
  column: number;
};

export type CellRange = {
  start: CellAddress;
  end: CellAddress;
};

export type SheetDimensionAxis = "row" | "column";

export type FreezePanes = {
  rows: number;
  columns: number;
};

export type SheetFilterValue =
  | { kind: "blank" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "error"; code: FormulaErrorCode };

export type SheetFilterColumn = {
  column: number;
  allowedValues: SheetFilterValue[];
};

/** Persisted filter criteria. Visibility is derived by the sheet-engine layer. */
export type SheetFilter = {
  range: CellRange;
  columns: SheetFilterColumn[];
};

export type SheetMetadata = {
  freezePanes: FreezePanes;
  filter: SheetFilter | null;
  mergedCells: CellRange[];
};

/** A positioned image that is anchored to a sheet cell without owning its binary data. */
export type FloatingImage = {
  id: string;
  assetId: string;
  altText: string;
  anchor: CellAddress;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export type Cell = {
  content?: CellContent;
  style?: CellStyle;
};

export type Sheet = {
  id: string;
  name: string;
  cells: Map<string, Cell>;
  rowHeights: Map<number, number>;
  columnWidths: Map<number, number>;
  freezePanes: FreezePanes;
  filter: SheetFilter | null;
  mergedCells: CellRange[];
  floatingImages: FloatingImage[];
};

export type SheetSparseCell = {
  address: CellAddress;
  content?: CellContent;
  style?: CellStyle;
};

export type SheetSparseDimension = {
  index: number;
  size: number;
};

export type SheetSparseState = {
  cells: SheetSparseCell[];
  rowHeights: SheetSparseDimension[];
  columnWidths: SheetSparseDimension[];
  freezePanes: FreezePanes;
  filter: SheetFilter | null;
  mergedCells: CellRange[];
  floatingImages: FloatingImage[];
};

export type Workbook = {
  id: string;
  sheets: Map<string, Sheet>;
  activeSheetId: string;
};

export type RemovedSheet = {
  sheet: Sheet;
  index: number;
};

export function createCellKey(address: CellAddress): string {
  return `${address.row}:${address.column}`;
}

export function createSheet(name = "Sheet1", id?: string, idFactory?: IdFactory): Sheet {
  return {
    id: id ?? createRequiredId("sheet", idFactory),
    name: normalizeSheetName(name),
    cells: new Map(),
    rowHeights: new Map(),
    columnWidths: new Map(),
    freezePanes: { rows: 0, columns: 0 },
    filter: null,
    mergedCells: [],
    floatingImages: [],
  };
}

export function normalizeSheetName(name: string): string {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("Sheet name cannot be empty.");
  }
  return normalizedName;
}

export function createWorkbook(options?: {
  id?: string;
  sheetId?: string;
  sheetName?: string;
  idFactory?: IdFactory;
}): Workbook {
  const idFactory = options?.idFactory;
  if (!options?.id && !idFactory) {
    throw new Error("A workbook ID or IdFactory is required.");
  }
  const sheet = createSheet(options?.sheetName, options?.sheetId, idFactory);

  return {
    id: options?.id ?? createRequiredId("workbook", idFactory),
    sheets: new Map([[sheet.id, sheet]]),
    activeSheetId: sheet.id,
  };
}

function createRequiredId(prefix: string, idFactory: IdFactory | undefined): string {
  if (!idFactory) {
    throw new Error(`A ${prefix} ID or IdFactory is required.`);
  }
  const id = idFactory(prefix);
  if (!id || !id.trim()) {
    throw new Error(`IdFactory returned an empty ${prefix} ID.`);
  }
  return id;
}

export function getActiveSheet(workbook: Workbook): Sheet {
  const sheet = workbook.sheets.get(workbook.activeSheetId);
  if (!sheet) {
    throw new Error(`Active sheet ${workbook.activeSheetId} does not exist.`);
  }

  return sheet;
}

export function getWorkbookSheets(workbook: Workbook): Sheet[] {
  return [...workbook.sheets.values()];
}

export function getSheetIndex(workbook: Workbook, sheetId: string): number {
  return getWorkbookSheets(workbook).findIndex((sheet) => sheet.id === sheetId);
}

export function getNextSheetName(workbook: Workbook): string {
  const names = new Set(getWorkbookSheets(workbook).map((sheet) => sheet.name.toLowerCase()));
  let index = 1;
  while (names.has(`sheet${index}`)) {
    index += 1;
  }
  return `Sheet${index}`;
}

export function getNextDuplicateSheetName(workbook: Workbook, sourceName: string): string {
  const name = normalizeSheetName(sourceName);
  const names = new Set(getWorkbookSheets(workbook).map((sheet) => sheet.name.toLowerCase()));
  let index = 2;
  let candidate = `${name} (${index})`;
  while (names.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${name} (${index})`;
  }
  return candidate;
}

function assertSheetNameAvailable(
  workbook: Workbook,
  name: string,
  excludedSheetId?: string,
): void {
  const normalizedName = normalizeSheetName(name).toLowerCase();
  const duplicate = getWorkbookSheets(workbook).some(
    (sheet) => sheet.id !== excludedSheetId && sheet.name.toLowerCase() === normalizedName,
  );
  if (duplicate) {
    throw new Error(`A sheet named ${name.trim()} already exists.`);
  }
}

function replaceWorkbookSheets(workbook: Workbook, sheets: readonly Sheet[]): void {
  workbook.sheets.clear();
  for (const sheet of sheets) {
    workbook.sheets.set(sheet.id, sheet);
  }
}

export function insertSheet(workbook: Workbook, sheet: Sheet, index = workbook.sheets.size): void {
  if (workbook.sheets.has(sheet.id)) {
    throw new Error(`Sheet ${sheet.id} already exists.`);
  }
  if (!Number.isInteger(index) || index < 0 || index > workbook.sheets.size) {
    throw new RangeError(`Sheet index ${index} is outside the workbook.`);
  }
  assertSheetNameAvailable(workbook, sheet.name);

  const sheets = getWorkbookSheets(workbook);
  sheets.splice(index, 0, sheet);
  replaceWorkbookSheets(workbook, sheets);
}

export function removeSheet(workbook: Workbook, sheetId: string): RemovedSheet {
  if (workbook.sheets.size <= 1) {
    throw new Error("A workbook must contain at least one sheet.");
  }
  const index = getSheetIndex(workbook, sheetId);
  if (index < 0) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }

  const sheets = getWorkbookSheets(workbook);
  const nextActiveSheetId =
    workbook.activeSheetId === sheetId
      ? (sheets[index + 1] ?? sheets[index - 1])?.id
      : workbook.activeSheetId;
  if (!nextActiveSheetId) {
    throw new Error("Unable to select a sheet after deletion.");
  }
  const [sheet] = sheets.splice(index, 1);
  if (!sheet) {
    throw new Error(`Sheet ${sheetId} disappeared while removing it.`);
  }
  replaceWorkbookSheets(workbook, sheets);
  workbook.activeSheetId = nextActiveSheetId;
  return { sheet, index };
}

/** Moves a sheet to its final zero-based position without changing the active sheet. */
export function moveSheet(workbook: Workbook, sheetId: string, toIndex: number): boolean {
  const fromIndex = getSheetIndex(workbook, sheetId);
  if (fromIndex < 0) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= workbook.sheets.size) {
    throw new RangeError(`Sheet index ${toIndex} is outside the workbook.`);
  }
  if (fromIndex === toIndex) {
    return false;
  }

  const sheets = getWorkbookSheets(workbook);
  const [sheet] = sheets.splice(fromIndex, 1);
  if (!sheet) {
    throw new Error(`Sheet ${sheetId} disappeared while moving it.`);
  }
  sheets.splice(toIndex, 0, sheet);
  replaceWorkbookSheets(workbook, sheets);
  return true;
}

export function renameSheet(workbook: Workbook, sheetId: string, name: string): boolean {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }
  const normalizedName = normalizeSheetName(name);
  if (sheet.name === normalizedName) {
    return false;
  }
  assertSheetNameAvailable(workbook, normalizedName, sheetId);
  sheet.name = normalizedName;
  return true;
}

export function setActiveSheet(workbook: Workbook, sheetId: string): boolean {
  if (!workbook.sheets.has(sheetId)) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }
  if (workbook.activeSheetId === sheetId) {
    return false;
  }
  workbook.activeSheetId = sheetId;
  return true;
}

export function getCell(sheet: Sheet, address: CellAddress): Cell | undefined {
  return sheet.cells.get(createCellKey(address));
}

export function getCellValue(sheet: Sheet, address: CellAddress): CellValue {
  const value = getCellComputedValue(sheet, address);
  return typeof value === "object" ? null : value;
}

/** Returns the raw, persisted content. Formula results are never stored in a cell. */
export function getCellContent(sheet: Sheet, address: CellAddress): CellContent | null {
  const content = getCell(sheet, address)?.content;
  return content ? cloneCellContent(content) : null;
}

/** Evaluates a cell against the current sparse sheet state. */
export type SheetEvaluator = {
  getComputedValue: (address: CellAddress) => FormulaValue;
};
type SparseRangeIndex = { rows: number[]; byRow: Map<number, CellAddress[]> };

/**
 * Creates a reusable derived-value evaluator for one current sheet state.
 * It shares DFS memoization across all requested cells and resolves ranges from
 * the sparse address index, never by walking a rectangular area.
 */
export function createSheetEvaluator(sheet: Sheet): SheetEvaluator {
  const memo = new Map<string, FormulaValue>();
  const state = new Map<string, "visiting" | "done">();
  const byRow = new Map<number, CellAddress[]>();
  for (const address of [...sheet.cells.keys()].map(parseCellKey)) {
    const row = byRow.get(address.row) ?? [];
    row.push(address);
    byRow.set(address.row, row);
  }
  for (const row of byRow.values()) row.sort((left, right) => left.column - right.column);
  const sparseIndex: SparseRangeIndex = { rows: [...byRow.keys()].sort((a, b) => a - b), byRow };
  const valueFor = (target: CellAddress): FormulaValue => {
    if (!isCellAddressInBounds(target)) return createFormulaError("REF");
    const key = createCellKey(target);
    const content = sheet.cells.get(key)?.content;
    if (!content) return null;
    if (content.kind === "literal") return content.value;
    if (content.kind === "image") return createFormulaError("VALUE");
    return memo.get(key) ?? createFormulaError("CYCLE");
  };
  const dependenciesFor = (address: CellAddress): CellAddress[] => {
    const source = sheet.cells.get(createCellKey(address))?.content;
    if (source?.kind !== "formula") return [];
    const dependencies = collectFormulaReferences(source.formula.source).map((reference) => ({
      row: reference.row,
      column: reference.column,
    }));
    for (const range of collectFormulaRanges(source.formula.source)) {
      dependencies.push(...getSparseRangeAddresses(sparseIndex, range.start, range.end));
    }
    return dependencies;
  };
  const resolve = (target: CellAddress): FormulaValue => {
    if (!isCellAddressInBounds(target)) return createFormulaError("REF");
    const key = createCellKey(target);
    if (memo.has(key)) return memo.get(key) ?? null;
    const content = sheet.cells.get(key)?.content;
    if (!content || content.kind !== "formula") return valueFor(target);
    const stack: Array<{ address: CellAddress; entered: boolean }> = [
      { address: target, entered: false },
    ];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;
      const frameKey = createCellKey(frame.address);
      if (memo.has(frameKey)) continue;
      const frameContent = sheet.cells.get(frameKey)?.content;
      if (!frameContent || frameContent.kind !== "formula") continue;
      if (!frame.entered) {
        const current = state.get(frameKey);
        if (current === "visiting") {
          memo.set(frameKey, createFormulaError("CYCLE"));
          continue;
        }
        state.set(frameKey, "visiting");
        stack.push({ address: frame.address, entered: true });
        for (const dependency of dependenciesFor(frame.address).reverse()) {
          const dependencyKey = createCellKey(dependency);
          const dependencyContent = sheet.cells.get(dependencyKey)?.content;
          if (dependencyContent?.kind !== "formula" || memo.has(dependencyKey)) continue;
          if (state.get(dependencyKey) === "visiting")
            memo.set(dependencyKey, createFormulaError("CYCLE"));
          else stack.push({ address: dependency, entered: false });
        }
        continue;
      }
      const value = evaluateFormula(frameContent.formula.source, {
        resolveCell: valueFor,
        resolveRange: (bounds) =>
          resolveSparseRange(sparseIndex, bounds.start, bounds.end, valueFor),
      });
      memo.set(frameKey, value);
      state.set(frameKey, "done");
    }
    return valueFor(target);
  };
  return { getComputedValue: resolve };
}

export function getCellComputedValue(sheet: Sheet, address: CellAddress): FormulaValue {
  return createSheetEvaluator(sheet).getComputedValue(address);
}

function* resolveSparseRange(
  sparseIndex: SparseRangeIndex,
  start: CellAddress,
  end: CellAddress,
  resolve: (address: CellAddress) => FormulaValue,
): Iterable<FormulaValue> {
  const addresses = getSparseRangeAddresses(sparseIndex, start, end);
  for (const address of addresses) yield resolve(address);
}

function getSparseRangeAddresses(
  sparseIndex: SparseRangeIndex,
  start: CellAddress,
  end: CellAddress,
): CellAddress[] {
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  let low = 0;
  let high = sparseIndex.rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((sparseIndex.rows[middle] ?? 0) < minRow) low = middle + 1;
    else high = middle;
  }
  const first = low;
  high = sparseIndex.rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((sparseIndex.rows[middle] ?? 0) <= maxRow) low = middle + 1;
    else high = middle;
  }
  const addresses: CellAddress[] = [];
  for (const rowIndex of sparseIndex.rows.slice(first, low)) {
    const row = sparseIndex.byRow.get(rowIndex) ?? [];
    let startIndex = 0;
    let endIndex = row.length;
    while (startIndex < endIndex) {
      const middle = Math.floor((startIndex + endIndex) / 2);
      if ((row[middle]?.column ?? 0) < minColumn) startIndex = middle + 1;
      else endIndex = middle;
    }
    const firstColumn = startIndex;
    endIndex = row.length;
    while (startIndex < endIndex) {
      const middle = Math.floor((startIndex + endIndex) / 2);
      if ((row[middle]?.column ?? 0) <= maxColumn) startIndex = middle + 1;
      else endIndex = middle;
    }
    addresses.push(...row.slice(firstColumn, startIndex));
  }
  return addresses;
}

function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return { row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) };
}

export function getCellStyle(sheet: Sheet, address: CellAddress): Readonly<CellStyle> | undefined {
  return getCell(sheet, address)?.style;
}

export function setCellValue(sheet: Sheet, address: CellAddress, value: CellValue): boolean {
  return setCellContent(
    sheet,
    address,
    value === null || value === "" ? null : { kind: "literal", value },
  );
}

export function setCellContent(
  sheet: Sheet,
  address: CellAddress,
  content: CellContent | null | undefined,
): boolean {
  if (!isCellAddressInBounds(address)) throw new RangeError("Cell address is outside the sheet.");
  const normalizedContent = normalizeCellContent(content);
  const key = createCellKey(address);
  const cell = sheet.cells.get(key);
  if (areCellContentsEqual(cell?.content, normalizedContent)) return false;
  if (!normalizedContent) {
    if (cell?.style) sheet.cells.set(key, { style: cell.style });
    else sheet.cells.delete(key);
  } else {
    sheet.cells.set(key, { content: normalizedContent, style: cell?.style });
  }
  return true;
}

export function setCellStyle(
  sheet: Sheet,
  address: CellAddress,
  style: CellStyle | null | undefined,
): boolean {
  const normalizedStyle = normalizeCellStyle(style);
  const key = createCellKey(address);
  const cell = sheet.cells.get(key);
  if (areCellStylesEqual(cell?.style, normalizedStyle)) {
    return false;
  }

  if (cell?.content !== undefined) {
    sheet.cells.set(key, { content: cell.content, style: normalizedStyle });
  } else if (normalizedStyle) {
    sheet.cells.set(key, { style: normalizedStyle });
  } else {
    sheet.cells.delete(key);
  }
  return true;
}

function normalizeCellContent(content: CellContent | null | undefined): CellContent | undefined {
  if (content === null || content === undefined) return undefined;
  if (content.kind === "literal") {
    const value = content.value;
    if (
      value === "" ||
      (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    ) {
      throw new TypeError(
        "Literal cell content must be a non-empty string, finite number, or boolean.",
      );
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Literal cell content numbers must be finite.");
    }
    return { kind: "literal", value };
  }
  if (
    content.kind === "formula" &&
    typeof content.formula?.source === "string" &&
    content.formula.source.startsWith("=")
  ) {
    return { kind: "formula", formula: { source: content.formula.source } };
  }
  if (
    content.kind === "image" &&
    typeof content.image?.assetId === "string" &&
    content.image.assetId.trim() &&
    typeof content.image.altText === "string"
  ) {
    return {
      kind: "image",
      image: { assetId: content.image.assetId, altText: content.image.altText },
    };
  }
  throw new TypeError("Cell content must be a valid literal, formula, or image.");
}

export function cloneCellContent(content: CellContent): CellContent {
  if (content.kind === "literal") return { kind: "literal", value: content.value };
  if (content.kind === "formula")
    return { kind: "formula", formula: { source: content.formula.source } };
  return { kind: "image", image: { ...content.image } };
}

function areCellContentsEqual(
  left: CellContent | undefined,
  right: CellContent | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.kind === right.kind &&
    (left.kind === "literal" && right.kind === "literal"
      ? Object.is(left.value, right.value)
      : left.kind === "formula" &&
          right.kind === "formula" &&
          left.formula.source === right.formula.source
        ? true
        : left.kind === "image" &&
          right.kind === "image" &&
          left.image.assetId === right.image.assetId &&
          left.image.altText === right.image.altText)
  );
}

function assertDimensionIndex(index: number, maximum: number, axis: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= maximum) {
    throw new RangeError(`${axis} index ${index} is outside the sheet.`);
  }
}

function assertDimensionSize(size: number, minimum: number, maximum: number, axis: string): void {
  if (!Number.isInteger(size) || size < minimum || size > maximum) {
    throw new RangeError(`${axis} size must be an integer between ${minimum} and ${maximum}.`);
  }
}

function setDimension(
  dimensions: Map<number, number>,
  index: number,
  size: number,
  defaultSize: number,
): boolean {
  const previousSize = dimensions.get(index) ?? defaultSize;
  if (previousSize === size) {
    return false;
  }

  if (size === defaultSize) {
    dimensions.delete(index);
  } else {
    dimensions.set(index, size);
  }
  return true;
}

export function getRowHeight(sheet: Sheet, row: number): number {
  assertDimensionIndex(row, MAX_SHEET_ROWS, "Row");
  return sheet.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT;
}

export function getColumnWidth(sheet: Sheet, column: number): number {
  assertDimensionIndex(column, MAX_SHEET_COLUMNS, "Column");
  return sheet.columnWidths.get(column) ?? DEFAULT_COLUMN_WIDTH;
}

export function setRowHeight(sheet: Sheet, row: number, height: number): boolean {
  assertDimensionIndex(row, MAX_SHEET_ROWS, "Row");
  assertDimensionSize(height, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT, "Row height");
  return setDimension(sheet.rowHeights, row, height, DEFAULT_ROW_HEIGHT);
}

export function setColumnWidth(sheet: Sheet, column: number, width: number): boolean {
  assertDimensionIndex(column, MAX_SHEET_COLUMNS, "Column");
  assertDimensionSize(width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, "Column width");
  return setDimension(sheet.columnWidths, column, width, DEFAULT_COLUMN_WIDTH);
}

function compareCellAddresses(left: CellAddress, right: CellAddress): number {
  return left.row - right.row || left.column - right.column;
}

function cloneFreezePanes(freezePanes: FreezePanes): FreezePanes {
  return { rows: freezePanes.rows, columns: freezePanes.columns };
}

function cloneFilterValue(value: SheetFilterValue): SheetFilterValue {
  if (value.kind === "blank") return { kind: "blank" };
  if (value.kind === "error") return { kind: "error", code: value.code };
  if (value.kind === "boolean") return { kind: "boolean", value: value.value };
  if (value.kind === "number") return { kind: "number", value: value.value };
  return { kind: "string", value: value.value };
}

function cloneSheetFilter(filter: SheetFilter): SheetFilter {
  return {
    range: { start: { ...filter.range.start }, end: { ...filter.range.end } },
    columns: filter.columns.map((column) => ({
      column: column.column,
      allowedValues: column.allowedValues.map(cloneFilterValue),
    })),
  };
}

function normalizeFreezePanes(value: FreezePanes): FreezePanes {
  const rows = value?.rows;
  const columns = value?.columns;
  if (!Number.isInteger(rows) || rows < 0 || rows > MAX_SHEET_ROWS) {
    throw new RangeError("Frozen row count is outside the sheet.");
  }
  if (!Number.isInteger(columns) || columns < 0 || columns > MAX_SHEET_COLUMNS) {
    throw new RangeError("Frozen column count is outside the sheet.");
  }
  return { rows, columns };
}

function normalizeFilterValue(value: SheetFilterValue): SheetFilterValue {
  if (!value || typeof value !== "object") throw new TypeError("Invalid filter value.");
  if (value.kind === "blank") return { kind: "blank" };
  if (value.kind === "boolean" && typeof value.value === "boolean") return { ...value };
  if (value.kind === "number" && typeof value.value === "number" && Number.isFinite(value.value))
    return { ...value };
  if (value.kind === "string" && typeof value.value === "string") return { ...value };
  if (
    value.kind === "error" &&
    ["PARSE", "REF", "CYCLE", "VALUE", "DIV0", "NAME"].includes(value.code)
  )
    return { ...value };
  throw new TypeError("Invalid filter value.");
}

function filterValueKey(value: SheetFilterValue): string {
  return value.kind === "blank"
    ? "blank"
    : value.kind === "error"
      ? `error:${value.code}`
      : `${value.kind}:${String(value.value)}`;
}

function normalizeSheetFilter(filter: SheetFilter | null): SheetFilter | null {
  if (filter === null) return null;
  if (!filter || typeof filter !== "object") throw new TypeError("Invalid sheet filter.");
  const range = {
    start: { ...filter.range?.start },
    end: { ...filter.range?.end },
  };
  if (!isCellAddressInBounds(range.start) || !isCellAddressInBounds(range.end)) {
    throw new RangeError("Filter range is outside the sheet.");
  }
  const normalizedRange = {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
  if (normalizedRange.end.row <= normalizedRange.start.row) {
    throw new RangeError("A filter range must include a header and at least one data row.");
  }
  if (!Array.isArray(filter.columns)) {
    throw new TypeError("Invalid sheet filter.");
  }
  const columns = filter.columns.map((column) => {
    if (!column || typeof column !== "object" || !Number.isInteger(column.column)) {
      throw new TypeError("Invalid filter column.");
    }
    if (
      column.column < normalizedRange.start.column ||
      column.column > normalizedRange.end.column
    ) {
      throw new RangeError("Filter column is outside the filter range.");
    }
    if (!Array.isArray(column.allowedValues)) throw new TypeError("Invalid filter values.");
    const valuesByKey = new Map<string, SheetFilterValue>();
    for (const value of column.allowedValues) {
      const normalized = normalizeFilterValue(value);
      const key = filterValueKey(normalized);
      valuesByKey.set(key, normalized);
    }
    const allowedValues = [...valuesByKey.values()];
    allowedValues.sort((left, right) => {
      const leftKey = filterValueKey(left);
      const rightKey = filterValueKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    return { column: column.column, allowedValues };
  });
  columns.sort((left, right) => left.column - right.column);
  if (columns.some((column, index) => column.column === columns[index - 1]?.column)) {
    throw new Error("Filter columns must be unique.");
  }
  return { range: normalizedRange, columns };
}

function normalizeSheetMetadata(
  state: Pick<SheetSparseState, "freezePanes" | "filter" | "mergedCells">,
): SheetMetadata {
  const freezePanes = normalizeFreezePanes(state.freezePanes);
  const mergedCells = validateMergedCellRanges(state.mergedCells);
  if (
    mergedCells.some(
      (range) =>
        (range.start.row < freezePanes.rows && range.end.row >= freezePanes.rows) ||
        (range.start.column < freezePanes.columns && range.end.column >= freezePanes.columns),
    )
  ) {
    throw new RangeError("A frozen pane boundary cannot cut through a merged cell range.");
  }
  const filter = normalizeSheetFilter(state.filter);
  if (filter && mergedCells.some((range) => doMergedCellRangesIntersect(range, filter.range))) {
    throw new RangeError("A filter range cannot intersect merged cells.");
  }
  return { freezePanes, filter, mergedCells };
}

export function getSheetMetadata(sheet: Sheet): SheetMetadata {
  return normalizeSheetMetadata(sheet);
}

export function setSheetMetadata(sheet: Sheet, metadata: SheetMetadata): boolean {
  const normalized = normalizeSheetMetadata(metadata);
  const current = getSheetMetadata(sheet);
  if (areSheetMetadataEqual(current, normalized)) return false;
  sheet.freezePanes = cloneFreezePanes(normalized.freezePanes);
  sheet.filter = normalized.filter ? cloneSheetFilter(normalized.filter) : null;
  sheet.mergedCells = normalized.mergedCells.map((range) => ({
    start: { ...range.start },
    end: { ...range.end },
  }));
  return true;
}

function areSheetMetadataEqual(left: SheetMetadata, right: SheetMetadata): boolean {
  return (
    JSON.stringify(normalizeSheetMetadata(left)) === JSON.stringify(normalizeSheetMetadata(right))
  );
}

function normalizeSheetSparseState(state: SheetSparseState): SheetSparseState {
  const cellKeys = new Set<string>();
  const rowIndexes = new Set<number>();
  const columnIndexes = new Set<number>();
  const floatingImageIds = new Set<string>();

  const cells = state.cells.map((cell) => {
    if (!isCellAddressInBounds(cell.address)) {
      throw new RangeError(
        `Cell address ${cell.address.row}:${cell.address.column} is outside the sheet.`,
      );
    }
    const content = normalizeCellContent(cell.content);
    const style = normalizeCellStyle(cell.style);
    if (content === undefined && !style) {
      throw new Error("Sparse state cells must contain content or style.");
    }
    const address = { ...cell.address };
    const key = createCellKey(address);
    if (cellKeys.has(key)) {
      throw new Error(`Sparse state contains duplicate cell ${key}.`);
    }
    cellKeys.add(key);
    return {
      address,
      ...(content === undefined ? {} : { content }),
      ...(style ? { style } : {}),
    };
  });

  const rowHeights = state.rowHeights.map((dimension) => {
    assertDimensionIndex(dimension.index, MAX_SHEET_ROWS, "Row");
    assertDimensionSize(dimension.size, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT, "Row height");
    if (dimension.size === DEFAULT_ROW_HEIGHT) {
      throw new Error("Sparse state cannot store a default row height.");
    }
    if (rowIndexes.has(dimension.index)) {
      throw new Error(`Sparse state contains duplicate row dimension ${dimension.index}.`);
    }
    rowIndexes.add(dimension.index);
    return { ...dimension };
  });

  const columnWidths = state.columnWidths.map((dimension) => {
    assertDimensionIndex(dimension.index, MAX_SHEET_COLUMNS, "Column");
    assertDimensionSize(dimension.size, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, "Column width");
    if (dimension.size === DEFAULT_COLUMN_WIDTH) {
      throw new Error("Sparse state cannot store a default column width.");
    }
    if (columnIndexes.has(dimension.index)) {
      throw new Error(`Sparse state contains duplicate column dimension ${dimension.index}.`);
    }
    columnIndexes.add(dimension.index);
    return { ...dimension };
  });

  cells.sort((left, right) => compareCellAddresses(left.address, right.address));
  rowHeights.sort((left, right) => left.index - right.index);
  columnWidths.sort((left, right) => left.index - right.index);
  const metadata = normalizeSheetMetadata(state);
  const floatingImages = state.floatingImages.map((image) =>
    normalizeFloatingImage(image, floatingImageIds),
  );
  return {
    cells,
    rowHeights,
    columnWidths,
    freezePanes: cloneFreezePanes(metadata.freezePanes),
    filter: metadata.filter ? cloneSheetFilter(metadata.filter) : null,
    mergedCells: metadata.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
    floatingImages,
  };
}

function areSheetSparseStatesEqual(left: SheetSparseState, right: SheetSparseState): boolean {
  if (
    left.cells.length !== right.cells.length ||
    left.rowHeights.length !== right.rowHeights.length ||
    left.columnWidths.length !== right.columnWidths.length ||
    !areSheetMetadataEqual(left, right) ||
    left.floatingImages.length !== right.floatingImages.length
  ) {
    return false;
  }
  return (
    left.cells.every(
      (cell, index) =>
        cell.address.row === right.cells[index]?.address.row &&
        cell.address.column === right.cells[index]?.address.column &&
        areCellContentsEqual(cell.content, right.cells[index]?.content) &&
        areCellStylesEqual(cell.style, right.cells[index]?.style),
    ) &&
    left.rowHeights.every(
      (dimension, index) =>
        dimension.index === right.rowHeights[index]?.index &&
        dimension.size === right.rowHeights[index]?.size,
    ) &&
    left.columnWidths.every(
      (dimension, index) =>
        dimension.index === right.columnWidths[index]?.index &&
        dimension.size === right.columnWidths[index]?.size,
    ) &&
    left.floatingImages.every((image, index) =>
      areFloatingImagesEqual(image, right.floatingImages[index]),
    )
  );
}

export function createSheetSparseState(sheet: Sheet): SheetSparseState {
  return normalizeSheetSparseState({
    cells: [...sheet.cells].map(([key, cell]) => {
      const separator = key.indexOf(":");
      return {
        address: {
          row: Number(key.slice(0, separator)),
          column: Number(key.slice(separator + 1)),
        },
        ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
        ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      };
    }),
    rowHeights: [...sheet.rowHeights].map(([index, size]) => ({ index, size })),
    columnWidths: [...sheet.columnWidths].map(([index, size]) => ({ index, size })),
    freezePanes: cloneFreezePanes(sheet.freezePanes),
    filter: sheet.filter ? cloneSheetFilter(sheet.filter) : null,
    mergedCells: sheet.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
    floatingImages: sheet.floatingImages.map(cloneFloatingImage),
  });
}

export function replaceSheetSparseState(sheet: Sheet, state: SheetSparseState): boolean {
  const nextState = normalizeSheetSparseState(state);
  const currentState = createSheetSparseState(sheet);
  if (areSheetSparseStatesEqual(currentState, nextState)) {
    return false;
  }

  sheet.cells.clear();
  sheet.rowHeights.clear();
  sheet.columnWidths.clear();
  for (const cell of nextState.cells) {
    sheet.cells.set(createCellKey(cell.address), {
      ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    });
  }
  for (const dimension of nextState.rowHeights) {
    sheet.rowHeights.set(dimension.index, dimension.size);
  }
  for (const dimension of nextState.columnWidths) {
    sheet.columnWidths.set(dimension.index, dimension.size);
  }
  sheet.freezePanes = cloneFreezePanes(nextState.freezePanes);
  sheet.filter = nextState.filter ? cloneSheetFilter(nextState.filter) : null;
  sheet.mergedCells = nextState.mergedCells.map((range) => ({
    start: { ...range.start },
    end: { ...range.end },
  }));
  sheet.floatingImages = nextState.floatingImages.map(cloneFloatingImage);
  return true;
}

export function cloneFloatingImage(image: FloatingImage): FloatingImage {
  return { ...image, anchor: { ...image.anchor } };
}

function normalizeFloatingImage(image: FloatingImage, ids?: Set<string>): FloatingImage {
  if (!image || typeof image !== "object") throw new TypeError("Invalid floating image.");
  if (typeof image.id !== "string" || !image.id.trim())
    throw new TypeError("Floating image ID must be non-empty.");
  if (ids?.has(image.id)) throw new Error(`Duplicate floating image ${image.id}.`);
  ids?.add(image.id);
  if (typeof image.assetId !== "string" || !image.assetId.trim())
    throw new TypeError("Floating image asset ID must be non-empty.");
  if (typeof image.altText !== "string")
    throw new TypeError("Floating image alt text must be a string.");
  if (!isCellAddressInBounds(image.anchor))
    throw new RangeError("Floating image anchor is outside the sheet.");
  if (
    !Number.isFinite(image.offsetX) ||
    image.offsetX < 0 ||
    !Number.isFinite(image.offsetY) ||
    image.offsetY < 0
  )
    throw new RangeError("Floating image offsets must be finite and non-negative.");
  if (
    !Number.isFinite(image.width) ||
    image.width < MIN_FLOATING_IMAGE_SIZE ||
    image.width > MAX_FLOATING_IMAGE_SIZE ||
    !Number.isFinite(image.height) ||
    image.height < MIN_FLOATING_IMAGE_SIZE ||
    image.height > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError(
      `Floating image dimensions must be between ${MIN_FLOATING_IMAGE_SIZE} and ${MAX_FLOATING_IMAGE_SIZE}.`,
    );
  return cloneFloatingImage(image);
}

export function normalizeFloatingImageForSheet(image: FloatingImage): FloatingImage {
  return normalizeFloatingImage(image);
}

function areFloatingImagesEqual(
  left: FloatingImage | undefined,
  right: FloatingImage | undefined,
): boolean {
  return (
    !!left &&
    !!right &&
    left.id === right.id &&
    left.assetId === right.assetId &&
    left.altText === right.altText &&
    left.anchor.row === right.anchor.row &&
    left.anchor.column === right.anchor.column &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function isCellAddressInBounds(address: CellAddress): boolean {
  return isSheetAddressInBounds(address);
}
