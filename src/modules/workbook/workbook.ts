export const MAX_SHEET_ROWS = 1_048_576;
export const MAX_SHEET_COLUMNS = 16_384;

export type CellValue = string | number | boolean | null;

export type CellAddress = {
  row: number;
  column: number;
};

export type CellRange = {
  start: CellAddress;
  end: CellAddress;
};

export type Cell = {
  value: Exclude<CellValue, null>;
};

export type Sheet = {
  id: string;
  name: string;
  cells: Map<string, Cell>;
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
