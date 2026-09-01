import type { IdFactory } from "./runtime.js";

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
  value?: Exclude<CellValue, null>;
  style?: CellStyle;
};

export type Sheet = {
  id: string;
  name: string;
  cells: Map<string, Cell>;
  rowHeights: Map<number, number>;
  columnWidths: Map<number, number>;
};

export type SheetSparseCell = {
  address: CellAddress;
  value?: Exclude<CellValue, null>;
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
  return getCell(sheet, address)?.value ?? null;
}

export function getCellStyle(sheet: Sheet, address: CellAddress): Readonly<CellStyle> | undefined {
  return getCell(sheet, address)?.style;
}

export function setCellValue(sheet: Sheet, address: CellAddress, value: CellValue): boolean {
  const normalizedValue = value === "" ? null : value;
  const previousValue = getCellValue(sheet, address);

  if (Object.is(previousValue, normalizedValue)) {
    return false;
  }

  const key = createCellKey(address);
  const cell = sheet.cells.get(key);
  if (normalizedValue === null) {
    if (cell?.style) {
      sheet.cells.set(key, { style: cell.style });
    } else {
      sheet.cells.delete(key);
    }
  } else {
    sheet.cells.set(key, { value: normalizedValue, style: cell?.style });
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

  if (cell?.value !== undefined) {
    sheet.cells.set(key, { value: cell.value, style: normalizedStyle });
  } else if (normalizedStyle) {
    sheet.cells.set(key, { style: normalizedStyle });
  } else {
    sheet.cells.delete(key);
  }
  return true;
}

function assertStoredCellValue(value: unknown): asserts value is Exclude<CellValue, null> {
  if (
    value === null ||
    value === "" ||
    (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
  ) {
    throw new TypeError("Sparse cell values must be non-empty strings, numbers, or booleans.");
  }
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

function normalizeSheetSparseState(state: SheetSparseState): SheetSparseState {
  const cellKeys = new Set<string>();
  const rowIndexes = new Set<number>();
  const columnIndexes = new Set<number>();

  const cells = state.cells.map((cell) => {
    if (!isCellAddressInBounds(cell.address)) {
      throw new RangeError(
        `Cell address ${cell.address.row}:${cell.address.column} is outside the sheet.`,
      );
    }
    if (cell.value !== undefined) {
      assertStoredCellValue(cell.value);
    }
    const style = normalizeCellStyle(cell.style);
    if (cell.value === undefined && !style) {
      throw new Error("Sparse state cells must contain a value or style.");
    }
    const address = { ...cell.address };
    const key = createCellKey(address);
    if (cellKeys.has(key)) {
      throw new Error(`Sparse state contains duplicate cell ${key}.`);
    }
    cellKeys.add(key);
    return {
      address,
      ...(cell.value === undefined ? {} : { value: cell.value }),
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
  return { cells, rowHeights, columnWidths };
}

function areSheetSparseStatesEqual(left: SheetSparseState, right: SheetSparseState): boolean {
  if (
    left.cells.length !== right.cells.length ||
    left.rowHeights.length !== right.rowHeights.length ||
    left.columnWidths.length !== right.columnWidths.length
  ) {
    return false;
  }
  return (
    left.cells.every(
      (cell, index) =>
        cell.address.row === right.cells[index]?.address.row &&
        cell.address.column === right.cells[index]?.address.column &&
        Object.is(cell.value, right.cells[index]?.value) &&
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
        ...(cell.value === undefined ? {} : { value: cell.value }),
        ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      };
    }),
    rowHeights: [...sheet.rowHeights].map(([index, size]) => ({ index, size })),
    columnWidths: [...sheet.columnWidths].map(([index, size]) => ({ index, size })),
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
      ...(cell.value === undefined ? {} : { value: cell.value }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    });
  }
  for (const dimension of nextState.rowHeights) {
    sheet.rowHeights.set(dimension.index, dimension.size);
  }
  for (const dimension of nextState.columnWidths) {
    sheet.columnWidths.set(dimension.index, dimension.size);
  }
  return true;
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
import { areCellStylesEqual, cloneCellStyle, normalizeCellStyle, type CellStyle } from "./style.js";
