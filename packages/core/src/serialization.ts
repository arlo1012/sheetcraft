import { WorkbookDomainError } from "./errors.js";
import { normalizeCellStyle, type CellStyle } from "./style.js";
import {
  createSheet,
  createSheetSparseState,
  getWorkbookSheets,
  normalizeSheetName,
  replaceSheetSparseState,
  type CellAddress,
  type CellValue,
  type Sheet,
  type SheetSparseDimension,
  type SheetSparseState,
  type Workbook,
} from "./workbook.js";

export type CellSnapshotV1 = {
  address: CellAddress;
  value?: Exclude<CellValue, null>;
  style?: CellStyle;
};

export type SheetSnapshotV1 = {
  id: string;
  name: string;
  cells: CellSnapshotV1[];
  rowHeights: SheetSparseDimension[];
  columnWidths: SheetSparseDimension[];
};

export type WorkbookSnapshotV1 = {
  version: 1;
  id: string;
  activeSheetId: string;
  sheets: SheetSnapshotV1[];
};

type UnknownRecord = Record<string, unknown>;

function fail(path: string, reason: string): never {
  throw new WorkbookDomainError(
    { code: "invalid_snapshot", details: { path, reason } },
    `Invalid workbook snapshot at ${path}: ${reason}`,
  );
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "Expected an object.");
  }
  return value as UnknownRecord;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, "Expected an array.");
  }
  return value;
}

function asIdentifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fail(path, "Expected a non-empty string.");
  }
  return value;
}

function asInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return fail(path, "Expected a safe integer.");
  }
  return value;
}

function parseAddress(value: unknown, path: string): CellAddress {
  const record = asRecord(value, path);
  return {
    row: asInteger(record.row, `${path}.row`),
    column: asInteger(record.column, `${path}.column`),
  };
}

function parseCellValue(value: unknown, path: string): Exclude<CellValue, null> {
  if (
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.length > 0)
  ) {
    return value;
  }
  return fail(path, "Expected a non-empty string, finite number, or boolean.");
}

function parseStyle(value: unknown, path: string): CellStyle {
  const record = asRecord(value, path);
  try {
    const style = normalizeCellStyle(record as CellStyle);
    if (!style) {
      return fail(path, "Expected at least one supported style property.");
    }
    return style;
  } catch (error) {
    return fail(path, error instanceof Error ? error.message : "Invalid cell style.");
  }
}

function parseCell(value: unknown, path: string): CellSnapshotV1 {
  const record = asRecord(value, path);
  const hasValue = Object.hasOwn(record, "value");
  const hasStyle = Object.hasOwn(record, "style");
  if (!hasValue && !hasStyle) {
    return fail(path, "Expected a value or style.");
  }

  return {
    address: parseAddress(record.address, `${path}.address`),
    ...(hasValue ? { value: parseCellValue(record.value, `${path}.value`) } : {}),
    ...(hasStyle ? { style: parseStyle(record.style, `${path}.style`) } : {}),
  };
}

function parseDimension(value: unknown, path: string): SheetSparseDimension {
  const record = asRecord(value, path);
  return {
    index: asInteger(record.index, `${path}.index`),
    size: asInteger(record.size, `${path}.size`),
  };
}

function parseSparseState(record: UnknownRecord, path: string): SheetSparseState {
  return {
    cells: asArray(record.cells, `${path}.cells`).map((cell, index) =>
      parseCell(cell, `${path}.cells[${index}]`),
    ),
    rowHeights: asArray(record.rowHeights, `${path}.rowHeights`).map((dimension, index) =>
      parseDimension(dimension, `${path}.rowHeights[${index}]`),
    ),
    columnWidths: asArray(record.columnWidths, `${path}.columnWidths`).map((dimension, index) =>
      parseDimension(dimension, `${path}.columnWidths[${index}]`),
    ),
  };
}

function parseSheet(value: unknown, path: string): Sheet {
  const record = asRecord(value, path);
  const id = asIdentifier(record.id, `${path}.id`);
  let name: string;
  try {
    name = normalizeSheetName(asIdentifier(record.name, `${path}.name`));
  } catch (error) {
    return fail(`${path}.name`, error instanceof Error ? error.message : "Invalid sheet name.");
  }

  const sheet = createSheet(name, id);
  try {
    replaceSheetSparseState(sheet, parseSparseState(record, path));
  } catch (error) {
    if (error instanceof WorkbookDomainError) {
      throw error;
    }
    return fail(path, error instanceof Error ? error.message : "Invalid sparse sheet state.");
  }
  return sheet;
}

export function serializeSheet(sheet: Sheet): SheetSnapshotV1 {
  return {
    id: sheet.id,
    name: sheet.name,
    ...createSheetSparseState(sheet),
  };
}

export function deserializeSheet(value: unknown): Sheet {
  return parseSheet(value, "$");
}

export function serializeWorkbook(workbook: Workbook): WorkbookSnapshotV1 {
  return {
    version: 1,
    id: workbook.id,
    activeSheetId: workbook.activeSheetId,
    sheets: getWorkbookSheets(workbook).map(serializeSheet),
  };
}

export function deserializeWorkbook(value: unknown): Workbook {
  const record = asRecord(value, "$.");
  if (record.version !== 1) {
    throw new WorkbookDomainError(
      {
        code: "unsupported_snapshot_version",
        details: {
          version:
            typeof record.version === "string" || typeof record.version === "number"
              ? record.version
              : null,
        },
      },
      `Unsupported workbook snapshot version ${String(record.version)}.`,
    );
  }

  const id = asIdentifier(record.id, "$.id");
  const activeSheetId = asIdentifier(record.activeSheetId, "$.activeSheetId");
  const sheetValues = asArray(record.sheets, "$.sheets");
  if (sheetValues.length === 0) {
    return fail("$.sheets", "A workbook must contain at least one sheet.");
  }

  const sheets = sheetValues.map((sheet, index) => parseSheet(sheet, `$.sheets[${index}]`));
  const sheetIds = new Set<string>();
  const sheetNames = new Set<string>();
  for (const sheet of sheets) {
    if (sheetIds.has(sheet.id)) {
      return fail("$.sheets", `Duplicate sheet ID ${sheet.id}.`);
    }
    sheetIds.add(sheet.id);
    const normalizedName = sheet.name.toLowerCase();
    if (sheetNames.has(normalizedName)) {
      return fail("$.sheets", `Duplicate sheet name ${sheet.name}.`);
    }
    sheetNames.add(normalizedName);
  }
  if (!sheetIds.has(activeSheetId)) {
    return fail("$.activeSheetId", `Sheet ${activeSheetId} does not exist.`);
  }

  return {
    id,
    activeSheetId,
    sheets: new Map(sheets.map((sheet) => [sheet.id, sheet])),
  };
}
