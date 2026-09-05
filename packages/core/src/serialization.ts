import { WorkbookDomainError } from "./errors.js";
import { normalizeExcelDateSystem, type ExcelDateSystem } from "./formula/date-system.js";
import { normalizeCellStyle, type CellStyle } from "./style.js";
import {
  createSheet,
  createSheetSparseState,
  getWorkbookSheets,
  normalizeSheetName,
  replaceSheetSparseState,
  type CellAddress,
  type CellRange,
  type CellValue,
  type FreezePanes,
  type FloatingImage,
  type Sheet,
  type SheetFilter,
  type SheetFilterValue,
  type SheetSparseDimension,
  type SheetSparseState,
  type Workbook,
} from "./workbook.js";
import { createFormulaError, isFormulaErrorCode, type CellContent } from "./formula/types.js";

export type CellSnapshotV1 = {
  address: CellAddress;
  value?: Exclude<CellValue, null>;
  style?: CellStyle;
};

export type CellSnapshotV2 = {
  address: CellAddress;
  content?: Exclude<CellContent, { kind: "error" } | { kind: "image" }>;
  style?: CellStyle;
};

export type SheetSnapshotV1 = {
  id: string;
  name: string;
  cells: CellSnapshotV1[];
  rowHeights: SheetSparseDimension[];
  columnWidths: SheetSparseDimension[];
};

export type SheetSnapshotV2 = Omit<SheetSnapshotV1, "cells"> & {
  cells: CellSnapshotV2[];
  freezePanes?: FreezePanes;
  filter?: SheetFilter | null;
  mergedCells?: CellRange[];
};

export type WorkbookSnapshotV1 = {
  version: 1;
  id: string;
  activeSheetId: string;
  sheets: SheetSnapshotV1[];
};

export type WorkbookSnapshotV2 = {
  version: 2;
  id: string;
  activeSheetId: string;
  sheets: SheetSnapshotV2[];
};

export type CellSnapshotV3 = Omit<CellSnapshotV2, "content"> & {
  content?: Exclude<CellContent, { kind: "image" }>;
};
export type SheetSnapshotV3 = Omit<SheetSnapshotV2, "cells"> & { cells: CellSnapshotV3[] };
export type WorkbookSnapshotV3 = Omit<WorkbookSnapshotV2, "version" | "sheets"> & {
  version: 3;
  dateSystem: ExcelDateSystem;
  sheets: SheetSnapshotV3[];
};
export type CellSnapshotV4 = Omit<CellSnapshotV3, "content"> & { content?: CellContent };
export type SheetSnapshotV4 = Omit<SheetSnapshotV3, "cells"> & {
  cells: CellSnapshotV4[];
  floatingImages: FloatingImage[];
};
export type WorkbookSnapshotV4 = Omit<WorkbookSnapshotV3, "version" | "sheets"> & {
  version: 4;
  sheets: SheetSnapshotV4[];
};
/** Current write format. V1 through V3 types remain available for migration inputs. */
export type WorkbookSnapshot = WorkbookSnapshotV4;
export type SheetSnapshot = SheetSnapshotV4;
type SnapshotVersion = 1 | 2 | 3 | 4;

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

function parseCellValue(
  value: unknown,
  path: string,
  allowEmptyString = false,
): Exclude<CellValue, null> {
  if (
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean" ||
    (typeof value === "string" && (allowEmptyString || value.length > 0))
  ) {
    return value;
  }
  return fail(path, "Invalid literal value for this snapshot version.");
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

function parseCellContent(value: unknown, path: string, version: SnapshotVersion): CellContent {
  const record = asRecord(value, path);
  if (record.kind === "literal") {
    return {
      kind: "literal",
      value: parseCellValue(record.value, `${path}.value`, version === 3 || version === 4),
    };
  }
  if ((version === 3 || version === 4) && record.kind === "error") {
    const error = asRecord(record.error, `${path}.error`);
    if (error.kind !== "formula-error" || !isFormulaErrorCode(error.code)) {
      return fail(`${path}.error`, "Expected a typed formula error with a supported code.");
    }
    return { kind: "error", error: createFormulaError(error.code) };
  }
  if (record.kind === "formula") {
    const formula = asRecord(record.formula, `${path}.formula`);
    if (typeof formula.source !== "string" || !formula.source.startsWith("=")) {
      return fail(`${path}.formula.source`, "Expected a formula source beginning with '='.");
    }
    return { kind: "formula", formula: { source: formula.source } };
  }
  if (version === 4 && record.kind === "image") {
    const image = asRecord(record.image, `${path}.image`);
    if (typeof image.assetId !== "string" || !image.assetId.trim())
      return fail(`${path}.image.assetId`, "Expected a non-empty string.");
    if (typeof image.altText !== "string")
      return fail(`${path}.image.altText`, "Expected a string.");
    return { kind: "image", image: { assetId: image.assetId, altText: image.altText } };
  }
  return fail(`${path}.kind`, "Invalid cell content kind for this snapshot version.");
}

function parseCell(value: unknown, path: string, version: SnapshotVersion): CellSnapshotV4 {
  const record = asRecord(value, path);
  const hasContent = Object.hasOwn(record, "content");
  const hasValue = Object.hasOwn(record, "value");
  const hasStyle = Object.hasOwn(record, "style");
  if ((version !== 1 && hasValue) || (version === 1 && hasContent)) {
    return fail(
      path,
      version !== 1
        ? `V${version} cells use content, not value.`
        : "V1 cells use value, not content.",
    );
  }
  if ((version === 1 && !hasValue && !hasStyle) || (version !== 1 && !hasContent && !hasStyle)) {
    return fail(path, "Expected content or style.");
  }

  return {
    address: parseAddress(record.address, `${path}.address`),
    ...(version === 1 && hasValue
      ? {
          content: {
            kind: "literal" as const,
            value: parseCellValue(record.value, `${path}.value`),
          },
        }
      : hasContent
        ? { content: parseCellContent(record.content, `${path}.content`, version) }
        : {}),
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

function parseRange(value: unknown, path: string): CellRange {
  const record = asRecord(value, path);
  return {
    start: parseAddress(record.start, `${path}.start`),
    end: parseAddress(record.end, `${path}.end`),
  };
}

function parseFreezePanes(value: unknown, path: string): FreezePanes {
  const record = asRecord(value, path);
  return {
    rows: asInteger(record.rows, `${path}.rows`),
    columns: asInteger(record.columns, `${path}.columns`),
  };
}

function parseFilterValue(
  value: unknown,
  path: string,
  version: SnapshotVersion,
): SheetFilterValue {
  const record = asRecord(value, path);
  if (record.kind === "blank") return { kind: "blank" };
  if (record.kind === "boolean" && typeof record.value === "boolean")
    return { kind: "boolean", value: record.value };
  if (record.kind === "number" && typeof record.value === "number" && Number.isFinite(record.value))
    return { kind: "number", value: record.value };
  if (record.kind === "string" && typeof record.value === "string")
    return { kind: "string", value: record.value };
  if (
    record.kind === "error" &&
    isFormulaErrorCode(record.code) &&
    (version === 3 ||
      version === 4 ||
      ["PARSE", "REF", "CYCLE", "VALUE", "DIV0", "NAME"].includes(record.code))
  )
    return { kind: "error", code: record.code };
  return fail(path, "Invalid filter value.");
}

function parseFilter(value: unknown, path: string, version: SnapshotVersion): SheetFilter {
  const record = asRecord(value, path);
  return {
    range: parseRange(record.range, `${path}.range`),
    columns: asArray(record.columns, `${path}.columns`).map((column, index) => {
      const columnRecord = asRecord(column, `${path}.columns[${index}]`);
      return {
        column: asInteger(columnRecord.column, `${path}.columns[${index}].column`),
        allowedValues: asArray(
          columnRecord.allowedValues,
          `${path}.columns[${index}].allowedValues`,
        ).map((filterValue, valueIndex) =>
          parseFilterValue(
            filterValue,
            `${path}.columns[${index}].allowedValues[${valueIndex}]`,
            version,
          ),
        ),
      };
    }),
  };
}

function parseFloatingImage(value: unknown, path: string): FloatingImage {
  const record = asRecord(value, path);
  if (typeof record.id !== "string" || !record.id.trim())
    return fail(`${path}.id`, "Expected a non-empty string.");
  if (typeof record.assetId !== "string" || !record.assetId.trim())
    return fail(`${path}.assetId`, "Expected a non-empty string.");
  if (typeof record.altText !== "string") return fail(`${path}.altText`, "Expected a string.");
  const finite = (value: unknown, field: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value))
      return fail(`${path}.${field}`, "Expected a finite number.");
    return value;
  };
  return {
    id: record.id,
    assetId: record.assetId,
    altText: record.altText,
    anchor: parseAddress(record.anchor, `${path}.anchor`),
    offsetX: finite(record.offsetX, "offsetX"),
    offsetY: finite(record.offsetY, "offsetY"),
    width: finite(record.width, "width"),
    height: finite(record.height, "height"),
  };
}

function parseSparseState(
  record: UnknownRecord,
  path: string,
  version: SnapshotVersion,
): SheetSparseState {
  return {
    cells: asArray(record.cells, `${path}.cells`).map((cell, index) =>
      parseCell(cell, `${path}.cells[${index}]`, version),
    ),
    rowHeights: asArray(record.rowHeights, `${path}.rowHeights`).map((dimension, index) =>
      parseDimension(dimension, `${path}.rowHeights[${index}]`),
    ),
    columnWidths: asArray(record.columnWidths, `${path}.columnWidths`).map((dimension, index) =>
      parseDimension(dimension, `${path}.columnWidths[${index}]`),
    ),
    freezePanes:
      version !== 1 && Object.hasOwn(record, "freezePanes")
        ? parseFreezePanes(record.freezePanes, `${path}.freezePanes`)
        : { rows: 0, columns: 0 },
    filter:
      version !== 1 && Object.hasOwn(record, "filter")
        ? record.filter === null
          ? null
          : parseFilter(record.filter, `${path}.filter`, version)
        : null,
    mergedCells:
      version !== 1 && Object.hasOwn(record, "mergedCells")
        ? asArray(record.mergedCells, `${path}.mergedCells`).map((range, index) =>
            parseRange(range, `${path}.mergedCells[${index}]`),
          )
        : [],
    floatingImages:
      version === 4
        ? asArray(record.floatingImages, `${path}.floatingImages`).map((image, index) =>
            parseFloatingImage(image, `${path}.floatingImages[${index}]`),
          )
        : [],
  };
}

function parseSheet(value: unknown, path: string, version?: SnapshotVersion): Sheet {
  const record = asRecord(value, path);
  if (version === undefined) {
    const cells = asArray(record.cells, `${path}.cells`);
    const hasValue = cells.some((cell) => Object.hasOwn(asRecord(cell, `${path}.cells`), "value"));
    const hasContent = cells.some((cell) =>
      Object.hasOwn(asRecord(cell, `${path}.cells`), "content"),
    );
    if (hasValue && hasContent)
      return fail(`${path}.cells`, "Cannot mix V1 value and V2 content cells.");
    version = hasValue ? 1 : Object.hasOwn(record, "floatingImages") ? 4 : 3;
  }
  const id = asIdentifier(record.id, `${path}.id`);
  let name: string;
  try {
    name = normalizeSheetName(asIdentifier(record.name, `${path}.name`));
  } catch (error) {
    return fail(`${path}.name`, error instanceof Error ? error.message : "Invalid sheet name.");
  }

  const sheet = createSheet(name, id);
  try {
    replaceSheetSparseState(sheet, parseSparseState(record, path, version));
  } catch (error) {
    if (error instanceof WorkbookDomainError) {
      throw error;
    }
    return fail(path, error instanceof Error ? error.message : "Invalid sparse sheet state.");
  }
  return sheet;
}

export function serializeSheet(sheet: Sheet): SheetSnapshot {
  return {
    id: sheet.id,
    name: sheet.name,
    ...createSheetSparseState(sheet),
  };
}

export function deserializeSheet(value: unknown): Sheet {
  return parseSheet(value, "$");
}

export function serializeWorkbook(workbook: Workbook): WorkbookSnapshot {
  return {
    version: 4,
    dateSystem: normalizeExcelDateSystem(workbook.dateSystem),
    id: workbook.id,
    activeSheetId: workbook.activeSheetId,
    sheets: getWorkbookSheets(workbook).map(serializeSheet),
  };
}

export function deserializeWorkbook(value: unknown): Workbook {
  const record = asRecord(value, "$.");
  if (
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== 4
  ) {
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

  if (record.version !== 3 && record.version !== 4 && Object.hasOwn(record, "dateSystem")) {
    return fail("$.dateSystem", "An explicit date system requires snapshot version 3 or 4.");
  }
  const id = asIdentifier(record.id, "$.id");
  const activeSheetId = asIdentifier(record.activeSheetId, "$.activeSheetId");
  const sheetValues = asArray(record.sheets, "$.sheets");
  if (sheetValues.length === 0) {
    return fail("$.sheets", "A workbook must contain at least one sheet.");
  }

  const version = record.version;
  let dateSystem: ExcelDateSystem = "1900";
  if (version === 3 || version === 4) {
    try {
      dateSystem = normalizeExcelDateSystem(record.dateSystem);
    } catch {
      return fail("$.dateSystem", "Expected '1900' or '1904'.");
    }
  }
  const sheets = sheetValues.map((sheet, index) =>
    parseSheet(sheet, `$.sheets[${index}]`, version),
  );
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
    dateSystem,
    activeSheetId,
    sheets: new Map(sheets.map((sheet) => [sheet.id, sheet])),
  };
}
