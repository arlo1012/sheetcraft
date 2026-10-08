import { normalizePivotTables, type SheetPivotTable } from "./pivot-tables.js";
import { normalizeCellSparkline, type CellSparkline } from "./sparklines.js";
import { normalizeSheetDrawings, type SheetDrawing } from "./sheet-drawings.js";
import { normalizeProtectionPassword, type ProtectionPassword } from "./protection-password.js";
import { normalizeSheetProtection, type SheetProtection } from "./protection.js";
import { WorkbookDomainError } from "./errors.js";
import {
  DEFAULT_WORKBOOK_CALCULATION_SETTINGS,
  normalizeWorkbookCalculationSettings,
  type WorkbookCalculationSettings,
} from "./calculation.js";
import { normalizeExcelDateSystem, type ExcelDateSystem } from "./formula/date-system.js";
import { parseA1FormulaReference } from "./formula/reference-model.js";
import { normalizeCellStyle, type CellStyle } from "./style.js";
import { cloneTableStyleDefinition } from "./table-styles.js";
import { clonePivotTableStyleDefinition } from "./pivot-table-styles.js";
import {
  cloneCellStyleDefinition,
  normalizeWorkbookCellStyles,
  type CellStyleDefinition,
} from "./cell-styles.js";
import { normalizeImageTransform, type ImageTransform } from "./image-transform.js";
import {
  createSheet,
  DEFAULT_COLUMN_WIDTH,
  createSheetSparseState,
  getWorkbookSheets,
  normalizeSheetName,
  normalizeTableStyleDefinition,
  normalizePivotTableStyleDefinition,
  replaceSheetSparseState,
  type CellAddress,
  type CellHyperlink,
  type CellNote,
  type CellNamedStyleBinding,
  type CellRange,
  type CellValue,
  type FreezePanes,
  type FloatingImage,
  type Sheet,
  type SheetFilter,
  type SheetFilterValue,
  type SheetProperties,
  type SheetSparseDimension,
  type SheetSparseState,
  type SheetDataValidation,
  type SheetOutlineGroup,
  type SheetSubtotalMetadata,
  type SheetDuplicateRule,
  type SheetConditionalFormatRule,
  type SheetTable,
  type Workbook,
  normalizeCellHyperlink,
  normalizeCellNote,
  normalizeCellNamedStyleBinding,
  type DefinedName,
} from "./workbook.js";
import type { SheetPageSetup } from "./page-setup.js";
import {
  cloneWatermarkPresets,
  normalizeSheetPageDecoration,
  normalizeWatermarkPresets,
  type SheetPageDecoration,
  type WatermarkPreset,
} from "./page-decoration.js";
import { createFormulaError, isFormulaErrorCode, type CellContent } from "./formula/types.js";
import {
  cloneWorkbookTheme,
  DEFAULT_WORKBOOK_THEME,
  normalizeWorkbookTheme,
  type WorkbookTheme,
} from "./workbook-theme.js";

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
export type SheetSnapshotV3 = Omit<SheetSnapshotV2, "cells"> & {
  cells: CellSnapshotV3[];
};
export type WorkbookSnapshotV3 = Omit<WorkbookSnapshotV2, "version" | "sheets"> & {
  version: 3;
  dateSystem: ExcelDateSystem;
  sheets: SheetSnapshotV3[];
};
export type CellSnapshotV4 = Omit<CellSnapshotV3, "content"> & {
  content?: CellContent;
};
export type SheetSnapshotV4 = Omit<SheetSnapshotV3, "cells"> & {
  cells: CellSnapshotV4[];
  floatingImages: FloatingImage[];
};
export type WorkbookSnapshotV4 = Omit<WorkbookSnapshotV3, "version" | "sheets"> & {
  version: 4;
  sheets: SheetSnapshotV4[];
};
export type CellSnapshotV5 = CellSnapshotV4;
export type SheetSnapshotV5 = Omit<SheetSnapshotV4, "cells"> & {
  cells: CellSnapshotV5[];
};
export type WorkbookSnapshotV5 = Omit<WorkbookSnapshotV4, "version" | "sheets"> & {
  version: 5;
  sheets: SheetSnapshotV5[];
};
export type CellSnapshotV6 = CellSnapshotV5 & {
  namedStyle?: CellNamedStyleBinding;
  hyperlink?: CellHyperlink;
  note?: CellNote;
  sparkline?: CellSparkline;
};
export type SheetSnapshotV6 = Omit<SheetSnapshotV5, "cells"> & {
  cells: CellSnapshotV6[];
};
export type SheetSnapshotV7 = Omit<SheetSnapshotV6, "cells"> & {
  cells: CellSnapshotV6[];
  properties: SheetProperties;
};
export type WorkbookSnapshotV6 = Omit<WorkbookSnapshotV5, "version" | "sheets"> & {
  version: 6;
  sheets: SheetSnapshotV6[];
};
export type WorkbookSnapshotV7 = Omit<WorkbookSnapshotV6, "version" | "sheets"> & {
  version: 7;
  sheets: SheetSnapshotV7[];
};
export type DefinedNameSnapshot = DefinedName;
export type WorkbookSnapshotV8 = Omit<WorkbookSnapshotV7, "version"> & {
  version: 8;
  definedNames: DefinedNameSnapshot[];
};
export type WorkbookSnapshotV9 = Omit<WorkbookSnapshotV8, "version"> & {
  version: 9;
  calculation: WorkbookCalculationSettings;
};
export type WorkbookSnapshotV10 = Omit<WorkbookSnapshotV9, "version"> & { version: 10 };
export type WorkbookSnapshotV11 = Omit<WorkbookSnapshotV10, "version"> & { version: 11 };
export type WorkbookSnapshotV12 = Omit<WorkbookSnapshotV11, "version"> & { version: 12 };
export type WorkbookSnapshotV13 = Omit<WorkbookSnapshotV12, "version" | "sheets"> & {
  version: 13;
  sheets: SheetSnapshot[];
  tableStyles?: import("./table-styles.js").TableStyleDefinition[];
  defaultTableStyleId?: string;
  pivotTableStyles?: import("./pivot-table-styles.js").PivotTableStyleDefinition[];
  defaultPivotTableStyleId?: string;
};
export type WorkbookSnapshotV14 = Omit<WorkbookSnapshotV13, "version"> & {
  version: 14;
  cellStyles?: CellStyleDefinition[];
};
export type WorkbookSnapshotV15 = Omit<WorkbookSnapshotV14, "version"> & { version: 15 };
export type WorkbookSnapshotV16 = Omit<WorkbookSnapshotV15, "version"> & { version: 16 };
export type WorkbookSnapshotV17 = Omit<WorkbookSnapshotV16, "version"> & {
  version: 17;
  theme: WorkbookTheme;
};
export type WorkbookSnapshotV18 = Omit<WorkbookSnapshotV17, "version"> & {
  version: 18;
  watermarkPresets: WatermarkPreset[];
};
/** Theme schemes and live cell-style bindings are versioned to preserve them across clients. */
export type WorkbookSnapshotV19 = Omit<WorkbookSnapshotV18, "version"> & { version: 19 };
export type WorkbookSnapshotV20 = Omit<WorkbookSnapshotV19, "version"> & { version: 20 };
export type WorkbookSnapshotV21 = Omit<WorkbookSnapshotV20, "version"> & { version: 21 };
/** Current write format. Earlier versions remain available for migration inputs. */
export type WorkbookSnapshotV22 = Omit<WorkbookSnapshotV21, "version"> & {
  version: 22;
  structureProtected?: boolean;
};
export type WorkbookSnapshotV23 = Omit<WorkbookSnapshotV22, "version"> & {
  version: 23;
  structurePassword?: ProtectionPassword;
};
export type WorkbookSnapshotV24 = Omit<WorkbookSnapshotV23, "version"> & { version: 24 };
export type WorkbookSnapshotV25 = Omit<WorkbookSnapshotV24, "version"> & { version: 25 };
export type WorkbookSnapshotV26 = Omit<WorkbookSnapshotV25, "version"> & { version: 26 };
export type WorkbookSnapshotV27 = Omit<WorkbookSnapshotV26, "version"> & { version: 27 };
export type WorkbookSnapshotV28 = Omit<WorkbookSnapshotV27, "version"> & { version: 28 };
export type WorkbookSnapshotV29 = Omit<WorkbookSnapshotV28, "version"> & { version: 29 };
export type WorkbookSnapshotV30 = Omit<WorkbookSnapshotV29, "version"> & { version: 30 };
export type WorkbookSnapshotV31 = Omit<WorkbookSnapshotV30, "version"> & { version: 31 };
export type WorkbookSnapshotV32 = Omit<WorkbookSnapshotV31, "version"> & { version: 32 };
export type WorkbookSnapshotV33 = Omit<WorkbookSnapshotV32, "version"> & { version: 33 };
export type WorkbookSnapshotV34 = Omit<WorkbookSnapshotV33, "version"> & { version: 34 };
export type WorkbookSnapshotV35 = Omit<WorkbookSnapshotV34, "version"> & { version: 35 };
export type WorkbookSnapshotV36 = Omit<WorkbookSnapshotV35, "version"> & { version: 36 };
export type WorkbookSnapshotV37 = Omit<WorkbookSnapshotV36, "version"> & { version: 37 };
export type WorkbookSnapshotV38 = Omit<WorkbookSnapshotV37, "version"> & { version: 38 };
export type WorkbookSnapshotV39 = Omit<WorkbookSnapshotV38, "version"> & { version: 39 };
export type WorkbookSnapshotV40 = Omit<WorkbookSnapshotV39, "version"> & { version: 40 };
export type WorkbookSnapshot = WorkbookSnapshotV40;
export type SheetSnapshot = SheetSnapshotV7 & {
  hiddenRows?: number[];
  hiddenColumns?: number[];
  defaultColumnWidth?: number;
  dataValidations?: SheetDataValidation[];
  outlineGroups?: SheetOutlineGroup[];
  subtotalMetadata?: SheetSubtotalMetadata[];
  duplicateRules?: SheetDuplicateRule[];
  conditionalFormats?: SheetConditionalFormatRule[];
  tables?: SheetTable[];
  pageSetup?: SheetPageSetup;
  pageDecoration?: SheetPageDecoration;
  drawings?: SheetDrawing[];
  pivotTables?: SheetPivotTable[];
  protection?: SheetProtection;
};
type SnapshotVersion =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 39
  | 40;

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
      value: parseCellValue(record.value, `${path}.value`, version >= 3),
    };
  }
  if (version >= 3 && record.kind === "error") {
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
  if (version >= 4 && record.kind === "image") {
    const image = asRecord(record.image, `${path}.image`);
    if (typeof image.assetId !== "string" || !image.assetId.trim())
      return fail(`${path}.image.assetId`, "Expected a non-empty string.");
    if (typeof image.altText !== "string")
      return fail(`${path}.image.altText`, "Expected a string.");
    if (version < 24 && (image.transform as ImageTransform | undefined)?.appearance !== undefined)
      return fail(path, "Picture styling requires snapshot version 24.");
    if (version < 32 && (image.transform as ImageTransform | undefined)?.annotations !== undefined)
      return fail(path, "Picture annotations require snapshot version 32.");
    let transform: ImageTransform | undefined;
    if (version >= 5 && Object.hasOwn(image, "transform")) {
      try {
        transform = normalizeImageTransform(image.transform as ImageTransform);
      } catch (error) {
        return fail(
          `${path}.image.transform`,
          error instanceof Error ? error.message : "Invalid image transform.",
        );
      }
    }
    return {
      kind: "image",
      image: {
        assetId: image.assetId,
        altText: image.altText,
        ...(transform ? { transform } : {}),
      },
    };
  }
  return fail(`${path}.kind`, "Invalid cell content kind for this snapshot version.");
}

function parseCell(value: unknown, path: string, version: SnapshotVersion): CellSnapshotV6 {
  const record = asRecord(value, path);
  const hasContent = Object.hasOwn(record, "content");
  const hasValue = Object.hasOwn(record, "value");
  const hasStyle = Object.hasOwn(record, "style");
  if (
    version < 22 &&
    hasStyle &&
    Object.hasOwn(asRecord(record.style, `${path}.style`), "unlocked")
  )
    return fail(`${path}.style.unlocked`, "Cell protection requires snapshot version 22 or newer.");
  if ((version !== 1 && hasValue) || (version === 1 && hasContent)) {
    return fail(
      path,
      version !== 1
        ? `V${version} cells use content, not value.`
        : "V1 cells use value, not content.",
    );
  }
  const hasNamedStyle = version >= 15 && Object.hasOwn(record, "namedStyle");
  const hasHyperlink = version >= 15 && Object.hasOwn(record, "hyperlink");
  if (version < 27 && Object.hasOwn(record, "sparkline"))
    return fail(path, "Sparklines require snapshot version 27.");
  const hasSparkline = version >= 27 && Object.hasOwn(record, "sparkline");
  const hasNote = version >= 20 && Object.hasOwn(record, "note");
  if (
    hasNote &&
    version < 21 &&
    record.note !== null &&
    typeof record.note === "object" &&
    Object.hasOwn(record.note, "box")
  ) {
    return fail(`${path}.note.box`, "Cell note geometry requires snapshot version 21 or newer.");
  }
  if (
    (version === 1 && !hasValue && !hasStyle) ||
    (version !== 1 &&
      !hasContent &&
      !hasStyle &&
      !hasNamedStyle &&
      !hasHyperlink &&
      !hasNote &&
      !hasSparkline)
  ) {
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
        ? {
            content: parseCellContent(record.content, `${path}.content`, version),
          }
        : {}),
    ...(hasStyle ? { style: parseStyle(record.style, `${path}.style`) } : {}),
    ...(hasNamedStyle
      ? { namedStyle: normalizeCellNamedStyleBinding(record.namedStyle as CellNamedStyleBinding) }
      : {}),
    ...(hasHyperlink
      ? { hyperlink: normalizeCellHyperlink(record.hyperlink as CellHyperlink) }
      : {}),
    ...(hasSparkline
      ? { sparkline: normalizeCellSparkline(record.sparkline as CellSparkline) }
      : {}),
    ...(hasNote ? { note: normalizeCellNote(record.note as CellNote) } : {}),
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
      version >= 4 ||
      ["PARSE", "REF", "CYCLE", "VALUE", "DIV0", "NAME"].includes(record.code))
  )
    return { kind: "error", code: record.code };
  return fail(path, "Invalid filter value.");
}

function requiresTextFilterV37(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const condition = value as UnknownRecord;
  if (condition.kind === "compound")
    return Array.isArray(condition.conditions) && condition.conditions.some(requiresTextFilterV37);
  return (
    condition.kind === "text" &&
    !["contains", "doesNotContain", "beginsWith", "endsWith", "equals", "notEquals"].includes(
      String(condition.operator),
    )
  );
}

function parseFilter(value: unknown, path: string, version: SnapshotVersion): SheetFilter {
  const record = asRecord(value, path);
  const advancedRecord =
    record.advanced === undefined ? undefined : asRecord(record.advanced, `${path}.advanced`);
  const advanced =
    advancedRecord === undefined
      ? undefined
      : (() => {
          if (typeof advancedRecord.uniqueOnly !== "boolean")
            return fail(`${path}.advanced.uniqueOnly`, "Expected a boolean.");
          const criteriaRecord =
            advancedRecord.criteria === undefined
              ? undefined
              : asRecord(advancedRecord.criteria, `${path}.advanced.criteria`);
          return {
            ...(criteriaRecord === undefined
              ? {}
              : {
                  criteria: {
                    sheetId: asIdentifier(
                      criteriaRecord.sheetId,
                      `${path}.advanced.criteria.sheetId`,
                    ),
                    range: parseRange(criteriaRecord.range, `${path}.advanced.criteria.range`),
                  },
                }),
            uniqueOnly: advancedRecord.uniqueOnly,
            hiddenRows: asArray(advancedRecord.hiddenRows, `${path}.advanced.hiddenRows`).map(
              (interval, index) => {
                const item = asRecord(interval, `${path}.advanced.hiddenRows[${index}]`);
                return {
                  start: asInteger(item.start, `${path}.advanced.hiddenRows[${index}].start`),
                  end: asInteger(item.end, `${path}.advanced.hiddenRows[${index}].end`),
                };
              },
            ),
          };
        })();
  return {
    range: parseRange(record.range, `${path}.range`),
    columns: asArray(record.columns, `${path}.columns`).map((column, index) => {
      const columnRecord = asRecord(column, `${path}.columns[${index}]`);
      const condition = columnRecord.condition;
      if (version < 37 && requiresTextFilterV37(condition))
        return fail(path, "Text comparison filters require snapshot version 37.");
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
        ...(condition === undefined
          ? {}
          : { condition: condition as SheetFilter["columns"][number]["condition"] }),
      };
    }),
    ...(record.allowMergedCells === undefined
      ? {}
      : typeof record.allowMergedCells === "boolean"
        ? { allowMergedCells: record.allowMergedCells }
        : fail(`${path}.allowMergedCells`, "Expected a boolean.")),
    ...(advanced ? { advanced } : {}),
  };
}

function parseFloatingImage(value: unknown, path: string, version: SnapshotVersion): FloatingImage {
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
  if (
    version < 24 &&
    (record.hidden !== undefined ||
      record.groupId !== undefined ||
      record.lockAspectRatio !== undefined ||
      (record.transform as ImageTransform | undefined)?.appearance !== undefined)
  )
    return fail(path, "Picture styling requires snapshot version 24.");
  if (version < 32 && (record.transform as ImageTransform | undefined)?.annotations !== undefined)
    return fail(path, "Picture annotations require snapshot version 32.");
  let transform: ImageTransform | undefined;
  if (version >= 5 && Object.hasOwn(record, "transform")) {
    try {
      transform = normalizeImageTransform(record.transform as ImageTransform);
    } catch (error) {
      return fail(
        `${path}.transform`,
        error instanceof Error ? error.message : "Invalid image transform.",
      );
    }
  }
  return {
    id: record.id,
    assetId: record.assetId,
    altText: record.altText,
    anchor: parseAddress(record.anchor, `${path}.anchor`),
    offsetX: finite(record.offsetX, "offsetX"),
    offsetY: finite(record.offsetY, "offsetY"),
    width: finite(record.width, "width"),
    height: finite(record.height, "height"),
    ...(transform ? { transform } : {}),
    ...(version >= 24 && record.hidden !== undefined ? { hidden: record.hidden as boolean } : {}),
    ...(version >= 24 && record.groupId !== undefined ? { groupId: record.groupId as string } : {}),
    ...(version >= 24 && record.lockAspectRatio !== undefined
      ? { lockAspectRatio: record.lockAspectRatio as boolean }
      : {}),
  };
}

function parseSheetProperties(value: unknown, path: string): SheetProperties {
  const record = asRecord(value, path);
  const tabColor = record.tabColor;
  if (
    tabColor !== undefined &&
    (typeof tabColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(tabColor))
  )
    return fail(`${path}.tabColor`, "Expected #RRGGBB.");
  for (const key of ["pinned", "hidden", "protected"] as const) {
    if (typeof record[key] !== "boolean") return fail(`${path}.${key}`, "Expected a boolean.");
  }
  return {
    ...(tabColor === undefined ? {} : { tabColor: tabColor.toUpperCase() }),
    pinned: record.pinned as boolean,
    hidden: record.hidden as boolean,
    protected: record.protected as boolean,
  };
}

function parseSparseState(
  record: UnknownRecord,
  path: string,
  version: SnapshotVersion,
): SheetSparseState {
  if (
    version < 28 &&
    Array.isArray(record.drawings) &&
    record.drawings.some((drawing) => asRecord(drawing, path).kind === "camera")
  )
    return fail(path, "Camera requires snapshot version 28.");
  if (
    version < 29 &&
    Array.isArray(record.drawings) &&
    record.drawings.some((drawing) => asRecord(drawing, path).kind === "attachment")
  )
    return fail(path, "Attachments require snapshot version 29.");
  if (
    version < 30 &&
    Array.isArray(record.drawings) &&
    record.drawings.some((drawing) => asRecord(drawing, path).kind === "control")
  )
    return fail(path, "Form controls require snapshot version 30.");
  if (
    version < 31 &&
    Array.isArray(record.drawings) &&
    record.drawings.some((drawing) => {
      const item = asRecord(drawing, path);
      return item.kind === "chart" && Object.hasOwn(asRecord(item.chart, path), "pivotTableId");
    })
  )
    return fail(path, "Pivot charts require snapshot version 31.");
  if (
    version < 33 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const pivot = asRecord(item, path);
      return (
        pivot.presentation !== undefined ||
        pivot.resultLayout !== undefined ||
        (Array.isArray(pivot.filters) &&
          pivot.filters.some((filter) => asRecord(filter, path).all !== undefined)) ||
        (Array.isArray(pivot.values) && pivot.values.length === 0)
      );
    })
  )
    return fail(path, "Empty pivot reports and report layouts require snapshot version 33.");
  if (
    version < 34 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => asRecord(item, path).consolidation !== undefined)
  )
    return fail(path, "Pivot consolidation requires snapshot version 34.");
  if (
    version < 35 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const table = asRecord(item, path);
      const consolidation =
        table.consolidation === undefined ? undefined : asRecord(table.consolidation, path);
      const layout =
        table.resultLayout === undefined ? undefined : asRecord(table.resultLayout, path);
      return (
        table.reportLayout !== undefined ||
        consolidation?.pageFields !== undefined ||
        (Array.isArray(consolidation?.ranges) &&
          consolidation.ranges.some((area) => asRecord(area, path).pageItems !== undefined)) ||
        layout?.headerRows !== undefined ||
        layout?.seriesLabels !== undefined
      );
    })
  )
    return fail(path, "Pivot page fields and standard report layouts require snapshot version 35.");
  if (
    version < 36 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const table = asRecord(item, path);
      const report =
        table.reportLayout === undefined ? undefined : asRecord(table.reportLayout, path);
      return (
        table.axisFilters !== undefined ||
        report?.fillColor !== undefined ||
        report?.borderColor !== undefined
      );
    })
  )
    return fail(path, "Pivot field filters and report colors require snapshot version 36.");
  if (
    version < 40 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => asRecord(item, path).groups !== undefined)
  )
    return fail(path, "Pivot grouping requires snapshot version 40.");
  if (
    version < 39 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const table = asRecord(item, path);
      return (
        table.dataCache !== undefined ||
        (table.resultLayout !== undefined &&
          asRecord(table.resultLayout, path).valueRows !== undefined)
      );
    })
  )
    return fail(path, "Pivot data caches require snapshot version 39.");
  if (
    version < 38 &&
    record.pivotTables !== undefined &&
    asArray(record.pivotTables, path).some((pivot) => {
      const table = asRecord(pivot, path);
      return (
        table.sortFields !== undefined ||
        (table.resultLayout !== undefined &&
          asRecord(table.resultLayout, path).rowFieldIndices !== undefined) ||
        (Array.isArray(table.axisFilters) &&
          table.axisFilters.some((filter) => {
            const entry = asRecord(filter, path);
            if (!entry.valueCondition) return false;
            const rule = asRecord(asRecord(entry.valueCondition, path).condition, path);
            return rule.kind === "rank" && rule.mode !== undefined;
          }))
      );
    })
  )
    return fail(path, "Pivot field sorting and rank units require snapshot version 38.");
  if (
    version < 37 &&
    Array.isArray(record.tables) &&
    record.tables.some((item) => {
      const table = asRecord(item, path);
      if (!table.filter || typeof table.filter !== "object") return false;
      const filter = table.filter as UnknownRecord;
      return (
        Array.isArray(filter.columns) &&
        filter.columns.some((column) => requiresTextFilterV37(asRecord(column, path).condition))
      );
    })
  )
    return fail(path, "Text comparison filters require snapshot version 37.");
  if (
    version < 37 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const table = asRecord(item, path);
      return (
        Array.isArray(table.axisFilters) &&
        table.axisFilters.some((filter) =>
          requiresTextFilterV37(asRecord(filter, path).labelCondition),
        )
      );
    })
  )
    return fail(path, "Text comparison filters require snapshot version 37.");
  if (version < 31 && Object.hasOwn(record, "pivotTables"))
    return fail(path, "Pivot tables require snapshot version 31.");
  if (version < 25 && Object.hasOwn(record, "drawings"))
    return fail(path, "Drawings require snapshot version 25.");
  if (
    version < 26 &&
    Array.isArray(record.drawings) &&
    record.drawings.some((drawing) => asRecord(drawing, path).kind === "chart")
  )
    return fail(path, "Charts require snapshot version 26.");
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
    ...(Object.hasOwn(record, "hiddenRows")
      ? {
          hiddenRows: asArray(record.hiddenRows, `${path}.hiddenRows`).map((index, position) =>
            asInteger(index, `${path}.hiddenRows[${position}]`),
          ),
        }
      : {}),
    ...(Object.hasOwn(record, "hiddenColumns")
      ? {
          hiddenColumns: asArray(record.hiddenColumns, `${path}.hiddenColumns`).map(
            (index, position) => asInteger(index, `${path}.hiddenColumns[${position}]`),
          ),
        }
      : {}),
    ...(Object.hasOwn(record, "defaultColumnWidth")
      ? { defaultColumnWidth: asInteger(record.defaultColumnWidth, `${path}.defaultColumnWidth`) }
      : {}),
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
    dataValidations:
      version >= 10 && Object.hasOwn(record, "dataValidations")
        ? (asArray(record.dataValidations, `${path}.dataValidations`) as SheetDataValidation[])
        : [],
    outlineGroups:
      version >= 10 && Object.hasOwn(record, "outlineGroups")
        ? (asArray(record.outlineGroups, `${path}.outlineGroups`) as SheetOutlineGroup[])
        : [],
    subtotalMetadata:
      version >= 10 && Object.hasOwn(record, "subtotalMetadata")
        ? (asArray(record.subtotalMetadata, `${path}.subtotalMetadata`) as SheetSubtotalMetadata[])
        : [],
    duplicateRules:
      version >= 11 && Object.hasOwn(record, "duplicateRules")
        ? (asArray(record.duplicateRules, `${path}.duplicateRules`) as SheetDuplicateRule[])
        : [],
    conditionalFormats:
      version >= 12 && Object.hasOwn(record, "conditionalFormats")
        ? (asArray(
            record.conditionalFormats,
            `${path}.conditionalFormats`,
          ) as SheetConditionalFormatRule[])
        : [],
    tables:
      version >= 13 && Object.hasOwn(record, "tables")
        ? (asArray(record.tables, `${path}.tables`) as SheetTable[])
        : [],
    pageSetup:
      version >= 13 && Object.hasOwn(record, "pageSetup")
        ? (record.pageSetup as SheetPageSetup)
        : undefined,
    protection:
      version >= 22
        ? normalizeSheetProtection(record.protection as SheetProtection | undefined)
        : undefined,
    pageDecoration:
      version >= 17 && Object.hasOwn(record, "pageDecoration")
        ? normalizeSheetPageDecoration(record.pageDecoration)
        : undefined,
    pivotTables:
      version >= 31
        ? normalizePivotTables(record.pivotTables as SheetPivotTable[] | undefined)
        : [],
    drawings:
      version >= 25 ? normalizeSheetDrawings(record.drawings as SheetDrawing[] | undefined) : [],
    floatingImages:
      version >= 4
        ? asArray(record.floatingImages, `${path}.floatingImages`).map((image, index) =>
            parseFloatingImage(image, `${path}.floatingImages[${index}]`, version),
          )
        : [],
  };
}

function parseSheet(value: unknown, path: string, version?: SnapshotVersion): Sheet {
  const record = asRecord(value, path);
  if (version !== undefined && version < 25 && Object.hasOwn(record, "drawings"))
    return fail(path, "Drawings require snapshot version 25.");
  if (version === undefined) {
    const cells = asArray(record.cells, `${path}.cells`);
    const hasValue = cells.some((cell) => Object.hasOwn(asRecord(cell, `${path}.cells`), "value"));
    const hasContent = cells.some((cell) =>
      Object.hasOwn(asRecord(cell, `${path}.cells`), "content"),
    );
    if (hasValue && hasContent)
      return fail(`${path}.cells`, "Cannot mix V1 value and V2 content cells.");
    const hasAnnotations =
      (Array.isArray(record.floatingImages) &&
        record.floatingImages.some(
          (item) =>
            (asRecord(item, path).transform as ImageTransform | undefined)?.annotations !==
            undefined,
        )) ||
      cells.some(
        (cell) =>
          (asRecord(cell, path).content as { image?: { transform?: ImageTransform } } | undefined)
            ?.image?.transform?.annotations !== undefined,
      );
    version = hasAnnotations
      ? 40
      : Object.hasOwn(record, "pivotTables") || Object.hasOwn(record, "filter")
        ? 40
        : Object.hasOwn(record, "drawings")
          ? 31
          : cells.some((cell) => Object.hasOwn(asRecord(cell, path), "sparkline"))
            ? 27
            : (Array.isArray(record.floatingImages) &&
                  record.floatingImages.some((image) => {
                    const item = asRecord(image, `${path}.floatingImages`);
                    return (
                      "hidden" in item ||
                      "groupId" in item ||
                      "lockAspectRatio" in item ||
                      Boolean((item.transform as ImageTransform | undefined)?.appearance)
                    );
                  })) ||
                cells.some((cell) =>
                  Boolean(
                    (
                      asRecord(cell, path).content as
                        | { image?: { transform?: ImageTransform } }
                        | undefined
                    )?.image?.transform?.appearance,
                  ),
                )
              ? 24
              : Object.hasOwn(record, "protection") ||
                  cells.some((cell) =>
                    Boolean((cell as { style?: { unlocked?: boolean } }).style?.unlocked),
                  )
                ? 23
                : hasValue
                  ? 1
                  : cells.some((cell) => {
                        const item = asRecord(cell, `${path}.cells`);
                        return (
                          Object.hasOwn(item, "note") &&
                          typeof item.note === "object" &&
                          item.note !== null &&
                          Object.hasOwn(item.note, "box")
                        );
                      })
                    ? 21
                    : cells.some((cell) => Object.hasOwn(asRecord(cell, `${path}.cells`), "note"))
                      ? 20
                      : cells.some((cell) => {
                            const item = asRecord(cell, `${path}.cells`);
                            return (
                              Object.hasOwn(item, "namedStyle") || Object.hasOwn(item, "hyperlink")
                            );
                          })
                        ? 15
                        : Object.hasOwn(record, "pageDecoration")
                          ? 17
                          : Object.hasOwn(record, "tables") || Object.hasOwn(record, "pageSetup")
                            ? 13
                            : Object.hasOwn(record, "conditionalFormats")
                              ? 12
                              : Object.hasOwn(record, "properties")
                                ? 7
                                : Object.hasOwn(record, "floatingImages")
                                  ? 6
                                  : 3;
  }
  if (version < 23 && record.protection !== undefined) {
    const protection = asRecord(record.protection, `${path}.protection`);
    const newer = [
      "password",
      "selectLockedCells",
      "selectUnlockedCells",
      "insertColumns",
      "insertRows",
      "insertHyperlinks",
      "deleteColumns",
      "deleteRows",
      "sort",
      "autoFilter",
      "pivotTables",
      "editObjects",
    ];
    if (
      newer.some((key) => protection[key] !== undefined) ||
      (Array.isArray(protection.editableRanges) &&
        protection.editableRanges.some(
          (entry) => asRecord(entry, `${path}.protection.editableRanges`).password !== undefined,
        ))
    )
      return fail(
        `${path}.protection`,
        "Extended protection settings require snapshot version 23.",
      );
  }
  if (version < 22 && record.protection !== undefined)
    return fail(
      `${path}.protection`,
      "Sheet protection configuration requires snapshot version 22 or newer.",
    );
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
    if (version >= 7)
      sheet.properties = parseSheetProperties(record.properties, `${path}.properties`);
  } catch (error) {
    if (error instanceof WorkbookDomainError) {
      throw error;
    }
    return fail(path, error instanceof Error ? error.message : "Invalid sparse sheet state.");
  }
  return sheet;
}

export function serializeSheet(sheet: Sheet): SheetSnapshot {
  const { drawings, pivotTables, ...state } = createSheetSparseState(sheet);
  return {
    ...(drawings?.length ? { drawings } : {}),
    ...(pivotTables?.length ? { pivotTables } : {}),
    id: sheet.id,
    name: sheet.name,
    properties: { ...sheet.properties },
    ...state,
    hiddenRows: state.hiddenRows ?? [],
    hiddenColumns: state.hiddenColumns ?? [],
    defaultColumnWidth: state.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH,
  };
}

export function deserializeSheet(value: unknown): Sheet {
  return parseSheet(value, "$");
}

export function serializeWorkbook(workbook: Workbook): WorkbookSnapshot {
  return {
    version: 40,
    ...(workbook.structureProtected ? { structureProtected: true } : {}),
    ...(workbook.structurePassword
      ? { structurePassword: normalizeProtectionPassword(workbook.structurePassword) }
      : {}),
    calculation: normalizeWorkbookCalculationSettings(workbook.calculation),
    theme: cloneWorkbookTheme(workbook.theme),
    dateSystem: normalizeExcelDateSystem(workbook.dateSystem),
    id: workbook.id,
    activeSheetId: workbook.activeSheetId,
    sheets: getWorkbookSheets(workbook).map(serializeSheet),
    definedNames: [...workbook.definedNames.values()].map((definition) => ({
      ...definition,
      reference: {
        sheetId: definition.reference.sheetId,
        start: { ...definition.reference.start },
        end: { ...definition.reference.end },
      },
    })),
    tableStyles: (workbook.tableStyles ?? []).map(cloneTableStyleDefinition),
    ...(workbook.defaultTableStyleId ? { defaultTableStyleId: workbook.defaultTableStyleId } : {}),
    pivotTableStyles: (workbook.pivotTableStyles ?? []).map(clonePivotTableStyleDefinition),
    ...(workbook.defaultPivotTableStyleId
      ? { defaultPivotTableStyleId: workbook.defaultPivotTableStyleId }
      : {}),
    cellStyles: (workbook.cellStyles ?? []).map(cloneCellStyleDefinition),
    watermarkPresets: cloneWatermarkPresets(workbook.watermarkPresets),
  };
}

export function deserializeWorkbook(value: unknown): Workbook {
  const record = asRecord(value, "$.");
  if (
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== 4 &&
    record.version !== 5 &&
    record.version !== 6 &&
    record.version !== 7 &&
    record.version !== 8 &&
    record.version !== 9 &&
    record.version !== 10 &&
    record.version !== 11 &&
    record.version !== 12 &&
    record.version !== 13 &&
    record.version !== 14 &&
    record.version !== 15 &&
    record.version !== 16 &&
    record.version !== 17 &&
    record.version !== 18 &&
    record.version !== 19 &&
    record.version !== 20 &&
    record.version !== 21 &&
    record.version !== 22 &&
    record.version !== 23 &&
    record.version !== 24 &&
    record.version !== 25 &&
    record.version !== 26 &&
    record.version !== 27 &&
    record.version !== 28 &&
    record.version !== 29 &&
    record.version !== 30 &&
    record.version !== 31 &&
    record.version !== 32 &&
    record.version !== 33 &&
    record.version !== 34 &&
    record.version !== 35 &&
    record.version !== 36 &&
    record.version !== 37 &&
    record.version !== 38 &&
    record.version !== 39 &&
    record.version !== 40
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

  if (record.version < 3 && Object.hasOwn(record, "dateSystem")) {
    return fail("$.dateSystem", "An explicit date system requires snapshot version 3 or newer.");
  }
  const id = asIdentifier(record.id, "$.id");
  const activeSheetId = asIdentifier(record.activeSheetId, "$.activeSheetId");
  const sheetValues = asArray(record.sheets, "$.sheets");
  if (sheetValues.length === 0) {
    return fail("$.sheets", "A workbook must contain at least one sheet.");
  }

  const version = record.version;
  if (version < 23 && record.structurePassword !== undefined)
    return fail("$.structurePassword", "Protection passwords require snapshot version 23.");
  const structurePassword = normalizeProtectionPassword(
    record.structurePassword as ProtectionPassword | undefined,
  );
  if (
    record.structureProtected !== undefined &&
    (version < 22 || typeof record.structureProtected !== "boolean")
  )
    return fail("$.structureProtected", "Expected a boolean in snapshot version 22 or newer.");
  let dateSystem: ExcelDateSystem = "1900";
  if (version >= 3) {
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
  if (!sheetIds.has(activeSheetId))
    return fail("$.activeSheetId", `Sheet ${activeSheetId} does not exist.`);
  if (sheets.every((sheet) => sheet.properties.hidden))
    return fail("$.sheets", "A workbook must contain a visible sheet.");
  if (sheets.find((sheet) => sheet.id === activeSheetId)?.properties.hidden)
    return fail("$.activeSheetId", "The active sheet cannot be hidden.");

  const definedNames = version >= 8 ? parseDefinedNames(record.definedNames, sheetIds) : new Map();
  let calculation = { ...DEFAULT_WORKBOOK_CALCULATION_SETTINGS };
  if (version >= 9) {
    const settings = asRecord(record.calculation, "$.calculation");
    try {
      calculation = normalizeWorkbookCalculationSettings(settings as WorkbookCalculationSettings);
    } catch (error) {
      return fail(
        "$.calculation",
        error instanceof Error ? error.message : "Invalid calculation settings.",
      );
    }
  }
  let theme = cloneWorkbookTheme(DEFAULT_WORKBOOK_THEME);
  if (version >= 17) {
    try {
      theme = normalizeWorkbookTheme(record.theme as WorkbookTheme);
    } catch (error) {
      return fail("$.theme", error instanceof Error ? error.message : "Invalid workbook theme.");
    }
  }
  const tableStyles =
    version >= 13 && record.tableStyles !== undefined
      ? asArray(record.tableStyles, "$.tableStyles").map((style, index) => {
          try {
            return normalizeTableStyleDefinition(
              style as import("./table-styles.js").TableStyleDefinition,
            );
          } catch (error) {
            return fail(
              `$.tableStyles[${index}]`,
              error instanceof Error ? error.message : "Invalid table style.",
            );
          }
        })
      : [];
  const pivotTableStyles =
    version >= 13 && record.pivotTableStyles !== undefined
      ? asArray(record.pivotTableStyles, "$.pivotTableStyles").map((style, index) => {
          try {
            return normalizePivotTableStyleDefinition(
              style as import("./pivot-table-styles.js").PivotTableStyleDefinition,
            );
          } catch (error) {
            return fail(
              `$.pivotTableStyles[${index}]`,
              error instanceof Error ? error.message : "Invalid pivot table style.",
            );
          }
        })
      : [];
  const cellStyles =
    version >= 14 && record.cellStyles !== undefined
      ? (() => {
          try {
            return normalizeWorkbookCellStyles(
              asArray(record.cellStyles, "$.cellStyles") as CellStyleDefinition[],
            );
          } catch (error) {
            return fail(
              "$.cellStyles",
              error instanceof Error ? error.message : "Invalid cell styles.",
            );
          }
        })()
      : [];
  const watermarkPresets =
    version >= 18
      ? (() => {
          try {
            return normalizeWatermarkPresets(record.watermarkPresets);
          } catch (error) {
            return fail(
              "$.watermarkPresets",
              error instanceof Error ? error.message : "Invalid watermark presets.",
            );
          }
        })()
      : [];
  return {
    id,
    ...(version >= 22 && record.structureProtected ? { structureProtected: true } : {}),
    ...(structurePassword ? { structurePassword } : {}),
    dateSystem,
    calculation,
    theme,
    activeSheetId,
    sheets: new Map(sheets.map((sheet) => [sheet.id, sheet])),
    definedNames,
    tableStyles,
    pivotTableStyles,
    cellStyles,
    watermarkPresets,
    ...(version >= 13 && typeof record.defaultTableStyleId === "string"
      ? { defaultTableStyleId: record.defaultTableStyleId }
      : {}),
    ...(version >= 13 && typeof record.defaultPivotTableStyleId === "string"
      ? { defaultPivotTableStyleId: record.defaultPivotTableStyleId }
      : {}),
  };
}

function isSnapshotDefinedName(name: string): boolean {
  return (
    /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) &&
    !parseA1FormulaReference(name) &&
    !/^R\d+C\d+$/i.test(name) &&
    !/^(TRUE|FALSE)$/i.test(name)
  );
}

function parseDefinedNames(value: unknown, sheetIds: Set<string>): Map<string, DefinedName> {
  const names = new Map<string, DefinedName>();
  const keys = new Set<string>();
  for (const [index, candidate] of asArray(value, "$.definedNames").entries()) {
    const path = `$.definedNames[${index}]`;
    const record = asRecord(candidate, path);
    const id = asIdentifier(record.id, `${path}.id`);
    const name = asIdentifier(record.name, `${path}.name`);
    if (!isSnapshotDefinedName(name)) return fail(`${path}.name`, "Invalid name.");
    const scopeSheetId =
      record.scopeSheetId === undefined
        ? undefined
        : asIdentifier(record.scopeSheetId, `${path}.scopeSheetId`);
    if (scopeSheetId && !sheetIds.has(scopeSheetId))
      return fail(`${path}.scopeSheetId`, "Sheet does not exist.");
    const comment = record.comment;
    if (comment !== undefined && (typeof comment !== "string" || comment.length > 255))
      return fail(`${path}.comment`, "Expected a string no longer than 255 characters.");
    const reference = asRecord(record.reference, `${path}.reference`);
    const referenceSheetId = asIdentifier(reference.sheetId, `${path}.reference.sheetId`);
    if (!sheetIds.has(referenceSheetId))
      return fail(`${path}.reference.sheetId`, "Sheet does not exist.");
    const definition: DefinedName = {
      id,
      name,
      ...(scopeSheetId ? { scopeSheetId } : {}),
      ...(comment !== undefined ? { comment } : {}),
      reference: {
        sheetId: referenceSheetId,
        start: parseAddress(reference.start, `${path}.reference.start`),
        end: parseAddress(reference.end, `${path}.reference.end`),
      },
    };
    const key = `${scopeSheetId ?? "workbook"}:${name.toUpperCase()}`;
    if (names.has(id) || keys.has(key)) return fail(path, "Duplicate defined name.");
    names.set(id, definition);
    keys.add(key);
  }
  return names;
}
