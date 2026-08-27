export const MAX_SHEET_ROWS = 1_048_576;
export const MAX_SHEET_COLUMNS = 16_384;
export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COLUMN_WIDTH = 96;
export const MIN_ROW_HEIGHT = 16;
export const MAX_ROW_HEIGHT = 512;
export const MIN_COLUMN_WIDTH = 32;
export const MAX_COLUMN_WIDTH = 640;

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

export type Cell = {
  value: Exclude<CellValue, null>;
};

export type Sheet = {
  id: string;
  name: string;
  cells: Map<string, Cell>;
  rowHeights: Map<number, number>;
  columnWidths: Map<number, number>;
};

export type Workbook = {
  id: string;
  sheets: Map<string, Sheet>;
  activeSheetId: string;
};

let fallbackId = 0;

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  fallbackId += 1;
  return `${prefix}-${fallbackId}`;
}

export function createCellKey(address: CellAddress): string {
  return `${address.row}:${address.column}`;
}

export function createSheet(name = "Sheet1", id = createId("sheet")): Sheet {
  return {
    id,
    name,
    cells: new Map(),
    rowHeights: new Map(),
    columnWidths: new Map(),
  };
}

export function createWorkbook(options?: {
  id?: string;
  sheetId?: string;
  sheetName?: string;
}): Workbook {
  const sheet = createSheet(options?.sheetName, options?.sheetId);

  return {
    id: options?.id ?? createId("workbook"),
    sheets: new Map([[sheet.id, sheet]]),
    activeSheetId: sheet.id,
  };
}

export function getActiveSheet(workbook: Workbook): Sheet {
  const sheet = workbook.sheets.get(workbook.activeSheetId);
  if (!sheet) {
    throw new Error(`Active sheet ${workbook.activeSheetId} does not exist.`);
  }

  return sheet;
}

export function getCell(sheet: Sheet, address: CellAddress): Cell | undefined {
  return sheet.cells.get(createCellKey(address));
}

export function getCellValue(sheet: Sheet, address: CellAddress): CellValue {
  return getCell(sheet, address)?.value ?? null;
}

export function setCellValue(sheet: Sheet, address: CellAddress, value: CellValue): boolean {
  const normalizedValue = value === "" ? null : value;
  const previousValue = getCellValue(sheet, address);

  if (Object.is(previousValue, normalizedValue)) {
    return false;
  }

  const key = createCellKey(address);
  if (normalizedValue === null) {
    sheet.cells.delete(key);
  } else {
    sheet.cells.set(key, { value: normalizedValue });
  }

  return true;
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

export function isCellAddressInBounds(address: CellAddress): boolean {
  return (
    Number.isInteger(address.row) &&
    Number.isInteger(address.column) &&
    address.row >= 0 &&
    address.row < MAX_SHEET_ROWS &&
    address.column >= 0 &&
    address.column < MAX_SHEET_COLUMNS
  );
}
