import { normalizeCellImage } from "./cell-picture-frame.js";
import {
  hasPicturePropertiesField,
  normalizePictureProperties,
  type PictureProperties,
} from "./picture-properties.js";
import { readPictureDataArray } from "./picture-data-array.js";
import {
  isPictureGroup,
  traversePictureGroup,
  MAX_PICTURE_GROUP_DEPTH,
  MAX_PICTURE_GROUP_NODES,
} from "./picture-group.js";
import {
  normalizePictureObject,
  isFramedPictureObject,
  type PictureObject,
} from "./picture-object.js";
import { normalizeCellTextFontRuns } from "./text-font-runs.js";
import { normalizePivotTables, type SheetPivotTable } from "./pivot-tables.js";
import { normalizeCellSparkline, type CellSparkline } from "./sparklines.js";
import { normalizeSheetDrawings, type SheetDrawing } from "./sheet-drawings.js";
import {
  normalizeShapeGroupEffects,
  normalizeShapeGroup3d,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupDrawing,
} from "./shape-group.js";
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
import {
  createFormulaError,
  isFormulaErrorCode,
  type CellContent,
  type CellImage,
} from "./formula/types.js";
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
export type WorkbookSnapshotV41 = Omit<WorkbookSnapshotV40, "version"> & { version: 41 };
export type WorkbookSnapshotV42 = Omit<WorkbookSnapshotV41, "version"> & { version: 42 };
export type WorkbookSnapshotV43 = Omit<WorkbookSnapshotV42, "version"> & { version: 43 };
export type WorkbookSnapshotV44 = Omit<WorkbookSnapshotV43, "version"> & { version: 44 };
export type WorkbookSnapshotV45 = Omit<WorkbookSnapshotV44, "version"> & { version: 45 };
export type WorkbookSnapshotV46 = Omit<WorkbookSnapshotV45, "version"> & { version: 46 };
export type WorkbookSnapshotV47 = Omit<WorkbookSnapshotV46, "version"> & { version: 47 };
export type WorkbookSnapshotV48 = Omit<WorkbookSnapshotV47, "version"> & { version: 48 };
export type WorkbookSnapshotV49 = Omit<WorkbookSnapshotV48, "version"> & { version: 49 };
/** Complete typed picture appearance is one protocol feature. */
export type WorkbookSnapshotV50 = Omit<WorkbookSnapshotV49, "version"> & { version: 50 };
export type WorkbookSnapshotV51 = Omit<WorkbookSnapshotV50, "version"> & { version: 51 };
export type WorkbookSnapshotV52 = Omit<WorkbookSnapshotV51, "version"> & { version: 52 };
export type WorkbookSnapshotV53 = Omit<WorkbookSnapshotV52, "version"> & { version: 53 };
export type WorkbookSnapshotV54 = Omit<WorkbookSnapshotV53, "version"> & { version: 54 };
export type WorkbookSnapshotV55 = Omit<WorkbookSnapshotV54, "version"> & { version: 55 };
export type WorkbookSnapshotV56 = Omit<WorkbookSnapshotV55, "version"> & { version: 56 };
export type WorkbookSnapshotV57 = Omit<WorkbookSnapshotV56, "version"> & { version: 57 };
export type WorkbookSnapshotV58 = Omit<WorkbookSnapshotV57, "version"> & { version: 58 };
export type WorkbookSnapshotV59 = Omit<WorkbookSnapshotV58, "version"> & { version: 59 };
export type WorkbookSnapshotV60 = Omit<WorkbookSnapshotV59, "version"> & { version: 60 };
export type WorkbookSnapshotV61 = Omit<WorkbookSnapshotV60, "version"> & { version: 61 };
/** Document-owned shape group body shadows remain an internal snapshot-only feature. */
export type WorkbookSnapshotV62 = Omit<WorkbookSnapshotV61, "version"> & { version: 62 };
/** Exact free-or-attached shape connector endpoints; no resolved route is persisted. */
export type WorkbookSnapshotV63 = Omit<WorkbookSnapshotV62, "version"> & { version: 63 };
/** Shape/text-box legacy flips and sparse shape/group Selection Pane visibility. */
export type WorkbookSnapshotV64 = Omit<WorkbookSnapshotV63, "version"> & { version: 64 };
/** Document-owned shape group reflection and glow remain internal snapshot-only features. */
export type WorkbookSnapshotV65 = Omit<WorkbookSnapshotV64, "version"> & { version: 65 };
/** Sparse attributed shape characters in the authoritative drawing text. */
export type WorkbookSnapshotV66 = Omit<WorkbookSnapshotV65, "version"> & { version: 66 };
/** Shared group body camera source; no runtime projection data is persisted. */
export type WorkbookSnapshotV67 = Omit<WorkbookSnapshotV66, "version"> & { version: 67 };
export type WorkbookSnapshot =
  | WorkbookSnapshotV43
  | WorkbookSnapshotV44
  | WorkbookSnapshotV45
  | WorkbookSnapshotV46
  | WorkbookSnapshotV47
  | WorkbookSnapshotV48
  | WorkbookSnapshotV49
  | WorkbookSnapshotV50
  | WorkbookSnapshotV51
  | WorkbookSnapshotV52
  | WorkbookSnapshotV53
  | WorkbookSnapshotV54
  | WorkbookSnapshotV55
  | WorkbookSnapshotV56
  | WorkbookSnapshotV57
  | WorkbookSnapshotV58
  | WorkbookSnapshotV59
  | WorkbookSnapshotV60
  | WorkbookSnapshotV61
  | WorkbookSnapshotV62
  | WorkbookSnapshotV63
  | WorkbookSnapshotV64
  | WorkbookSnapshotV65
  | WorkbookSnapshotV66
  | WorkbookSnapshotV67;
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
  | 40
  | 41
  | 42
  | 43
  | 44
  | 45
  | 46
  | 47
  | 48
  | 49
  | 50
  | 51
  | 52
  | 53
  | 54
  | 55
  | 56
  | 57
  | 58
  | 59
  | 60
  | 61
  | 62
  | 63
  | 64
  | 65
  | 66
  | 67;

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

/** Feature admission never evaluates a drawing discriminator accessor. */
function hasShapeGroupSnapshotTag(value: UnknownRecord, path: string): boolean {
  const field = Object.getOwnPropertyDescriptor(value, "kind");
  if (field && !("value" in field))
    return fail(`${path}.kind`, "Drawing kind must be an own data field, not an accessor.");
  return field?.value === "shapeGroup";
}

/** Presence is checked before normalizing malformed choices or visiting any accessor. */
function inspectShapeGroupSnapshot3d(
  value: SheetDrawing,
  path: string,
  version?: SnapshotVersion,
): boolean {
  let hasScene = false;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let count = 0;
  try {
    while (pending.length) {
      const entry = pending.pop()!;
      if (entry.depth > MAX_SHAPE_GROUP_DEPTH || ++count > MAX_SHAPE_GROUP_NODES)
        throw new RangeError("Shape group 3D ownership budget exceeded.");
      const node = asRecord(entry.value, path);
      if (seen.has(node)) throw new TypeError("Cyclic or shared shape group ownership.");
      seen.add(node);
      const field = Object.getOwnPropertyDescriptor(node, "group3d");
      if (field || "group3d" in node) {
        if (version !== undefined && version < 67)
          return fail(path, "Shared shape group body cameras require snapshot version 67.");
        if (!field || !("value" in field))
          return fail(path, "Shape group 3D must be an own data field, not an accessor.");
        if (!hasShapeGroupSnapshotTag(node, path))
          return fail(path, "Shape group 3D requires a genuine group owner.");
        const scene = normalizeShapeGroup3d(field.value);
        hasScene ||= scene !== undefined;
      }
      if (!hasShapeGroupSnapshotTag(node, path)) continue;
      const members = Object.getOwnPropertyDescriptor(node, "members");
      if (!members || !("value" in members))
        return fail(path, "Shape group members must be own data fields, not accessors.");
      const children = readPictureDataArray(
        members.value as readonly unknown[],
        "snapshot shape group members",
        MAX_SHAPE_GROUP_NODES,
      );
      if (seen.has(members.value as object))
        throw new TypeError("Cyclic or shared shape group ownership.");
      seen.add(members.value as object);
      if (count + pending.length + children.length > MAX_SHAPE_GROUP_NODES)
        throw new RangeError("Shape group 3D ownership budget exceeded.");
      for (const child of children) pending.push({ value: child, depth: entry.depth + 1 });
    }
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    return fail(path, error instanceof Error ? error.message : "Invalid shape group 3D.");
  }
  return hasScene;
}

/** Raw admission is bounded and descriptor-safe, including nested malformed owner graphs. */
function inspectShapeGroupSnapshotEffects(
  value: ShapeGroupDrawing,
  path: string,
  version?: SnapshotVersion,
): { hasField: boolean; hasEffects: boolean; hasExtendedEffects: boolean } {
  let hasField = false;
  let hasEffects = false;
  let hasExtendedEffects = false;
  try {
    for (const { node } of traverseShapeGroup(value)) {
      if (node.kind !== "shapeGroup") continue;
      const field = Object.getOwnPropertyDescriptor(node, "groupEffects");
      if (!field) continue;
      hasField = true;
      const raw: unknown = field.value;
      if (
        raw &&
        typeof raw === "object" &&
        (Object.hasOwn(raw, "reflection") || Object.hasOwn(raw, "glow")) &&
        version !== undefined &&
        version < 65
      )
        return fail(path, "Owned shape group reflection and glow require snapshot version 65.");
      const effects = normalizeShapeGroupEffects(raw);
      if (effects) hasEffects = true;
      if (effects?.reflection || effects?.glow) hasExtendedEffects = true;
    }
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    return fail(path, error instanceof Error ? error.message : "Invalid shape group effects.");
  }
  return { hasField, hasEffects, hasExtendedEffects };
}

/** Presence is inspected without reading endpoint payloads, including owned descendants. */
function hasShapeConnectorSnapshotField(value: SheetDrawing, path: string): boolean {
  try {
    if (hasShapeGroupSnapshotTag(value as UnknownRecord, path))
      return traverseShapeGroup(value as ShapeGroupDrawing).some(
        ({ node }) => "shapeConnector" in node,
      );
    return "shapeConnector" in value;
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    return fail(path, error instanceof Error ? error.message : "Invalid shape connector owner.");
  }
}

/** Admission uses field presence, writing uses actual sparse state after normalization. */
function inspectShapeControlsSnapshotFields(
  value: SheetDrawing,
  path: string,
): { hasField: boolean; hasState: boolean } {
  let hasField = false;
  let hasState = false;
  try {
    const nodes = hasShapeGroupSnapshotTag(value as UnknownRecord, path)
      ? traverseShapeGroup(value as ShapeGroupDrawing).map(({ node }) => node)
      : [value];
    for (const node of nodes) {
      if ("hidden" in node) {
        hasField = true;
        hasState ||= Object.getOwnPropertyDescriptor(node, "hidden")?.value === true;
      }
      const kind = Object.getOwnPropertyDescriptor(node, "kind")?.value;
      const legacyFlip =
        kind === "textBox" ||
        (kind === "shape" &&
          Object.getOwnPropertyDescriptor(node, "shapeGeometry")?.value === undefined &&
          Object.getOwnPropertyDescriptor(node, "shapePath")?.value === undefined);
      if (!legacyFlip) continue;
      for (const key of ["shapeFlipX", "shapeFlipY"] as const) {
        if (!(key in node)) continue;
        hasField = true;
        hasState ||= Object.getOwnPropertyDescriptor(node, key)?.value === true;
      }
    }
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    return fail(path, error instanceof Error ? error.message : "Invalid shape controls owner.");
  }
  return { hasField, hasState };
}

/** Descriptor-safe raw feature admission, including nested owned leaves and empty markers. */
function inspectShapeCharacterRunsSnapshotFields(
  value: SheetDrawing,
  path: string,
): { hasField: boolean; hasState: boolean } {
  let hasField = false;
  let hasState = false;
  try {
    const nodes = hasShapeGroupSnapshotTag(value as UnknownRecord, path)
      ? traverseShapeGroup(value as ShapeGroupDrawing).map(({ node }) => node)
      : [value];
    for (const node of nodes) {
      const textField = Object.getOwnPropertyDescriptor(node, "shapeText");
      if (!textField) {
        if ("shapeText" in node) throw new TypeError("Shape text must be an own data field.");
        continue;
      }
      if (!("value" in textField)) throw new TypeError("Shape text cannot be an accessor.");
      const model: unknown = textField.value;
      if (!model || typeof model !== "object" || !("characterRuns" in model)) continue;
      hasField = true;
      const runs = Object.getOwnPropertyDescriptor(model, "characterRuns");
      // Only normalized snapshots are written. Raw payloads are validated by their owner later.
      if (runs && "value" in runs && Array.isArray(runs.value) && runs.value.length > 0)
        hasState = true;
    }
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    return fail(path, error instanceof Error ? error.message : "Invalid shape character owner.");
  }
  return { hasField, hasState };
}

/** Detect the field without reading its value, including malformed/accessor payloads. */
function hasThemeEffectSuppressionField(transform: unknown): boolean {
  if (!transform || typeof transform !== "object") return false;
  const appearance = (transform as ImageTransform).appearance;
  return !!appearance && typeof appearance === "object" && "suppressThemeEffects" in appearance;
}

function hasPictureThemeEffectSuppressionField(image: unknown): boolean {
  if (isPictureGroup(image)) {
    return traversePictureGroup(image).some(
      ({ node }) =>
        node.kind === "grouped-picture-v1" && hasThemeEffectSuppressionField(node.transform),
    );
  }
  return (
    !!image &&
    typeof image === "object" &&
    hasThemeEffectSuppressionField((image as { transform?: ImageTransform }).transform)
  );
}

function hasCellThemeEffectSuppressionField(cell: unknown): boolean {
  if (!cell || typeof cell !== "object") return false;
  const content = (cell as CellSnapshotV6).content;
  return content?.kind === "image" && hasThemeEffectSuppressionField(content.image?.transform);
}

/** Detection must not execute accessors, including an invalid outer appearance field. */
function pictureDataField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) {
    if (key in value) throw new TypeError(`Picture ${key} must be an own data field.`);
    return undefined;
  }
  if (!("value" in descriptor))
    throw new TypeError(`Picture ${key} must be a data field, not an accessor.`);
  return descriptor.value;
}
/** Raw bounded traversal preserves field presence, including default-valued fields of old payloads. */
function hasPicturePropertyFields(image: unknown): boolean {
  const pending = [{ node: image, depth: 0 }];
  const seen = new WeakSet<object>();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (!node || typeof node !== "object") continue;
    if (depth > MAX_PICTURE_GROUP_DEPTH || ++count > MAX_PICTURE_GROUP_NODES)
      throw new RangeError("Picture property traversal exceeds ownership budget.");
    if (seen.has(node)) throw new TypeError("Cyclic or shared picture ownership.");
    seen.add(node);
    if (hasPicturePropertiesField(node)) return true;
    const kind = pictureDataField(node, "kind");
    if (kind === "picture-group-v1" || kind === "grouped-group-v1") {
      const members = readPictureDataArray<unknown>(
        pictureDataField(node, "members") as readonly unknown[],
        "picture property members",
        MAX_PICTURE_GROUP_NODES,
      );
      for (const member of members) pending.push({ node: member, depth: depth + 1 });
    }
  }
  return false;
}
/** Preserve field presence on old protocol payloads before canonical normalization. */
function hasPictureCropShapeFields(image: unknown): boolean {
  const pending = [{ node: image, depth: 0 }],
    seen = new WeakSet<object>();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (!node || typeof node !== "object") continue;
    if (depth > MAX_PICTURE_GROUP_DEPTH || ++count > MAX_PICTURE_GROUP_NODES)
      throw new RangeError("Picture mask traversal exceeds ownership budget.");
    if (seen.has(node)) throw new TypeError("Cyclic or shared picture ownership.");
    seen.add(node);
    const frame = pictureDataField(node, "frame");
    if (frame && typeof frame === "object" && Object.hasOwn(frame, "cropShape")) {
      pictureDataField(frame, "cropShape");
      return true;
    }
    const kind = pictureDataField(node, "kind");
    if (kind === "picture-group-v1" || kind === "grouped-group-v1") {
      const members = readPictureDataArray<unknown>(
        pictureDataField(node, "members") as readonly unknown[],
        "picture mask members",
        MAX_PICTURE_GROUP_NODES,
      );
      for (const member of members) pending.push({ node: member, depth: depth + 1 });
    }
  }
  return false;
}
function hasCellPicturePropertyFields(cell: unknown): boolean {
  const content = pictureDataField(cell, "content");
  return (
    pictureDataField(content, "kind") === "image" &&
    hasPicturePropertiesField(pictureDataField(content, "image"))
  );
}
/** New local geometry is detected by field presence without reading a frame getter. */
function hasCellPictureFrameFields(cell: unknown): boolean {
  const content = pictureDataField(cell, "content");
  if (pictureDataField(content, "kind") !== "image") return false;
  const image = pictureDataField(content, "image");
  return !!image && typeof image === "object" && ("frame" in image || "lockAspectRatio" in image);
}
function parsePictureProperties(
  value: unknown,
  path: string,
  version: SnapshotVersion,
): PictureProperties {
  if (version < 51 && hasPicturePropertiesField(value))
    return fail(path, "Picture object properties require snapshot version 51.");
  try {
    return normalizePictureProperties(value);
  } catch (error) {
    return fail(path, error instanceof Error ? error.message : "Invalid picture properties.");
  }
}
function hasDetailedPictureStyleField(transform: unknown): boolean {
  const appearance = pictureDataField(transform, "appearance");
  return !!appearance && typeof appearance === "object" && "detailedStyle" in appearance;
}
function hasPictureDetailedStyleField(image: unknown): boolean {
  if (isPictureGroup(image)) {
    return traversePictureGroup(image).some(
      ({ node }) =>
        node.kind === "grouped-picture-v1" &&
        hasDetailedPictureStyleField(pictureDataField(node, "transform")),
    );
  }
  return hasDetailedPictureStyleField(pictureDataField(image, "transform"));
}
function hasCellDetailedStyleField(cell: unknown): boolean {
  const content = pictureDataField(cell, "content");
  return (
    pictureDataField(content, "kind") === "image" &&
    hasDetailedPictureStyleField(pictureDataField(pictureDataField(content, "image"), "transform"))
  );
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
  if (Object.hasOwn(record, "fontRuns")) {
    if (version < 46) return fail(path, "Cell font runs require snapshot version 46.");
    if (record.kind !== "literal" || typeof record.value !== "string") {
      return fail(path, "Font runs are only supported on string literal cell content.");
    }
  }
  if (record.kind === "literal") {
    const value = parseCellValue(record.value, `${path}.value`, version >= 3);
    if (typeof value !== "string") return { kind: "literal", value };
    try {
      const fontRuns = normalizeCellTextFontRuns(value, record.fontRuns);
      return { kind: "literal", value, ...(fontRuns ? { fontRuns } : {}) };
    } catch (error) {
      return fail(
        `${path}.fontRuns`,
        error instanceof Error ? error.message : "Invalid font runs.",
      );
    }
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
    if ("frame" in image || "lockAspectRatio" in image) {
      if (version < 53)
        return fail(`${path}.image`, "Local cell picture frames require snapshot version 53.");
      try {
        return { kind: "image", image: normalizeCellImage(image as CellImage) };
      } catch (error) {
        return fail(
          `${path}.image`,
          error instanceof Error ? error.message : "Invalid cell picture.",
        );
      }
    }
    if (version < 50 && hasDetailedPictureStyleField(image.transform))
      return fail(path, "Detailed picture styles require snapshot version 50.");
    if (version < 49 && hasThemeEffectSuppressionField(image.transform))
      return fail(path, "Picture theme effect suppression requires snapshot version 49.");
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
        ...parsePictureProperties(image, `${path}.image`, version),
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
  if (version < 52) {
    try {
      if (hasPictureCropShapeFields(record))
        return fail(path, "Picture crop shapes require snapshot version 52.");
    } catch (error) {
      if (error instanceof WorkbookDomainError) throw error;
      return fail(path, error instanceof Error ? error.message : "Invalid picture mask.");
    }
  }
  if (version < 51) {
    try {
      if (hasPicturePropertyFields(record))
        return fail(path, "Picture object properties require snapshot version 51.");
    } catch (error) {
      if (error instanceof WorkbookDomainError) throw error;
      return fail(path, error instanceof Error ? error.message : "Invalid picture properties.");
    }
  }
  if (version < 50) {
    try {
      if (hasPictureDetailedStyleField(record))
        return fail(path, "Detailed picture styles require snapshot version 50.");
    } catch (error) {
      if (error instanceof WorkbookDomainError) throw error;
      return fail(path, error instanceof Error ? error.message : "Invalid picture object.");
    }
  }
  if (version < 49) {
    try {
      if (hasPictureThemeEffectSuppressionField(record))
        return fail(path, "Picture theme effect suppression requires snapshot version 49.");
    } catch (error) {
      if (error instanceof WorkbookDomainError) throw error;
      return fail(path, error instanceof Error ? error.message : "Invalid picture object.");
    }
  }
  if (isPictureGroup(record)) {
    if (version < 48) return fail(path, "Owned picture groups require snapshot version 48.");
    try {
      return normalizePictureObject(record);
    } catch (error) {
      return fail(path, error instanceof Error ? error.message : "Invalid owned picture group.");
    }
  }
  if (Object.hasOwn(record, "frame")) {
    if (version < 47) return fail(`${path}.frame`, "Framed pictures require snapshot version 47.");
    try {
      return normalizePictureObject(record as unknown as PictureObject);
    } catch (error) {
      return fail(path, error instanceof Error ? error.message : "Invalid framed picture.");
    }
  }
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
    ...parsePictureProperties(record, path, version),
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
    version < 44 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const rules = asRecord(item, path).sortFields;
      return (
        Array.isArray(rules) &&
        rules.some((rule) => {
          const value = asRecord(rule, path);
          return value.order === "manual" || Object.hasOwn(value, "members");
        })
      );
    })
  )
    return fail(path, "Manual pivot member order requires snapshot version 44.");
  if (
    version < 43 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => Object.hasOwn(asRecord(item, path), "sourceTableId"))
  )
    return fail(path, "Table-backed pivot sources require snapshot version 43.");
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
    version < 42 &&
    Array.isArray(record.drawings) &&
    record.drawings.some((item) => {
      const drawing = asRecord(item, path);
      return drawing.kind === "chart" && asRecord(drawing.chart, path).dataCache !== undefined;
    })
  )
    return fail(path, "Static chart data requires snapshot version 42.");
  if (
    version < 41 &&
    Array.isArray(record.pivotTables) &&
    record.pivotTables.some((item) => {
      const values = asRecord(item, path).values;
      return (
        Array.isArray(values) &&
        values.some((item) => {
          const value = asRecord(item, path);
          return (
            value.display !== undefined ||
            value.numberFormat !== undefined ||
            !["sum", "count", "average", "min", "max"].includes(String(value.aggregate))
          );
        })
      );
    })
  )
    return fail(path, "Pivot value calculations require snapshot version 41.");
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
  const source = asRecord(value, path);
  const record: UnknownRecord = Object.create(null) as UnknownRecord;
  const drawingDescriptor = Object.getOwnPropertyDescriptor(source, "drawings");
  if (!drawingDescriptor && "drawings" in source)
    return fail(`${path}.drawings`, "Drawings must be own data fields.");
  if (drawingDescriptor && !("value" in drawingDescriptor))
    return fail(`${path}.drawings`, "Drawings must be data fields, not accessors.");
  const pictureDescriptor = Object.getOwnPropertyDescriptor(source, "floatingImages");
  if (pictureDescriptor && !("value" in pictureDescriptor))
    return fail(`${path}.floatingImages`, "Pictures must be data fields.");
  Object.assign(record, source);
  if (drawingDescriptor && drawingDescriptor.value !== undefined) {
    try {
      record.drawings = readPictureDataArray(
        asArray(drawingDescriptor.value, `${path}.drawings`),
        "snapshot drawings",
        Number.MAX_SAFE_INTEGER,
      );
    } catch (error) {
      return fail(`${path}.drawings`, error instanceof Error ? error.message : "Invalid drawings.");
    }
  }
  if (pictureDescriptor) {
    const descriptor = pictureDescriptor;
    if (!("value" in descriptor))
      return fail(`${path}.floatingImages`, "Pictures must be data fields.");
    try {
      record.floatingImages = readPictureDataArray(
        asArray(descriptor.value, `${path}.floatingImages`),
        "snapshot floatingImages",
        10000,
      );
    } catch (error) {
      return fail(
        `${path}.floatingImages`,
        error instanceof Error ? error.message : "Invalid picture collection.",
      );
    }
  }
  let hasShapeGroupEffects = false;
  let hasExtendedShapeGroupEffects = false;
  let hasShapeConnectors = false;
  let hasShapeControlsState = false;
  let hasShapeCharacterRuns = false;
  let hasShapeGroup3d = false;
  // Inspect presence before old protocols can silently drop a shape-only feature.
  if (Array.isArray(record.drawings)) {
    for (const [index, drawing] of record.drawings.entries()) {
      const item = asRecord(drawing, path);
      const scene = inspectShapeGroupSnapshot3d(
        item as SheetDrawing,
        `${path}.drawings[${index}]`,
        version,
      );
      hasShapeGroup3d ||= scene;
      const oldTextField = Object.getOwnPropertyDescriptor(item, "shapeText");
      if (
        "shapeText" in item &&
        version !== undefined &&
        version < 59 &&
        (!oldTextField || !("value" in oldTextField))
      )
        return fail(
          `${path}.drawings[${index}].shapeText`,
          "Explicit shape text requires snapshot version 59.",
        );
      const characters = inspectShapeCharacterRunsSnapshotFields(
        item as SheetDrawing,
        `${path}.drawings[${index}]`,
      );
      if (characters.hasField && version !== undefined && version < 66)
        return fail(
          `${path}.drawings[${index}].shapeText.characterRuns`,
          "Attributed shape characters require snapshot version 66.",
        );
      hasShapeCharacterRuns ||= characters.hasField;
      const controls = inspectShapeControlsSnapshotFields(
        item as SheetDrawing,
        `${path}.drawings[${index}]`,
      );
      if (controls.hasField && version !== undefined && version < 64)
        return fail(
          `${path}.drawings[${index}]`,
          "Shape visibility and legacy or text-box flips require snapshot version 64.",
        );
      hasShapeControlsState ||= controls.hasState;
      const hasConnector = hasShapeConnectorSnapshotField(
        item as SheetDrawing,
        `${path}.drawings[${index}]`,
      );
      if (hasConnector && version !== undefined && version < 63)
        return fail(
          `${path}.drawings[${index}].shapeConnector`,
          "Live shape connectors require snapshot version 63.",
        );
      hasShapeConnectors ||= hasConnector;
      if (
        hasShapeGroupSnapshotTag(item, `${path}.drawings[${index}]`) &&
        version !== undefined &&
        version < 61
      )
        return fail(
          `${path}.drawings[${index}]`,
          "Owned shape groups require snapshot version 61.",
        );
      if (hasShapeGroupSnapshotTag(item, `${path}.drawings[${index}]`)) {
        const effects = inspectShapeGroupSnapshotEffects(
          item as ShapeGroupDrawing,
          `${path}.drawings[${index}]`,
          version,
        );
        if (effects.hasField && version !== undefined && version < 62)
          return fail(
            `${path}.drawings[${index}].groupEffects`,
            "Owned shape group effects require snapshot version 62.",
          );
        hasShapeGroupEffects ||= effects.hasEffects;
        hasExtendedShapeGroupEffects ||= effects.hasExtendedEffects;
      }
      if (
        ("shapeFrame" in item || "shapeProperties" in item) &&
        version !== undefined &&
        version < 60
      )
        return fail(
          `${path}.drawings[${index}].shapeFrame`,
          "Canonical shape placement and properties require snapshot version 60.",
        );
      if ("shapeText" in item && version !== undefined && version < 59)
        return fail(
          `${path}.drawings[${index}].shapeText`,
          "Explicit shape text requires snapshot version 59.",
        );
      if ("shapeStyle" in item && version !== undefined && version < 58)
        return fail(
          `${path}.drawings[${index}].shapeStyle`,
          "Detailed shape styles require snapshot version 58.",
        );
      if ("shapePath" in item && version !== undefined && version < 57)
        return fail(
          `${path}.drawings[${index}].shapePath`,
          "Free shape paths require snapshot version 57.",
        );
      if (("shapeFlipX" in item || "shapeFlipY" in item) && version !== undefined && version < 56)
        return fail(
          `${path}.drawings[${index}].shapeFlipX`,
          "Standard shape flips require snapshot version 56.",
        );
      if (
        (Object.hasOwn(item, "shapeLineEnds") || Object.hasOwn(item, "textDirection")) &&
        version !== undefined &&
        version < 55
      )
        return fail(
          `${path}.drawings[${index}].shapeLineEnds`,
          "Shape line ends and vertical text boxes require snapshot version 55.",
        );
      if (!Object.hasOwn(item, "shapeGeometry")) continue;
      if (version !== undefined && version < 54)
        return fail(
          `${path}.drawings[${index}].shapeGeometry`,
          "Standard shape geometry requires snapshot version 54.",
        );
    }
  }
  // Validate new geometry before older inference paths can read appearance fields.
  try {
    if (Array.isArray(record.cells)) {
      for (const cell of record.cells) {
        if (!hasCellPictureFrameFields(cell)) continue;
        if (version !== undefined && version < 53)
          return fail(`${path}.cells`, "Local cell picture frames require snapshot version 53.");
        const content = pictureDataField(cell, "content");
        normalizeCellImage(pictureDataField(content, "image") as CellImage);
      }
    }
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    return fail(`${path}.cells`, error instanceof Error ? error.message : "Invalid cell picture.");
  }
  if (version !== undefined && version < 50) {
    try {
      if (
        (Array.isArray(record.cells) && record.cells.some(hasCellDetailedStyleField)) ||
        (Array.isArray(record.floatingImages) &&
          record.floatingImages.some(hasPictureDetailedStyleField))
      )
        return fail(path, "Detailed picture styles require snapshot version 50.");
    } catch (error) {
      if (error instanceof WorkbookDomainError) throw error;
      return fail(path, error instanceof Error ? error.message : "Invalid picture object.");
    }
  }
  if (version !== undefined && version < 49) {
    try {
      if (
        (Array.isArray(record.cells) && record.cells.some(hasCellThemeEffectSuppressionField)) ||
        (Array.isArray(record.floatingImages) &&
          record.floatingImages.some(hasPictureThemeEffectSuppressionField))
      )
        return fail(path, "Picture theme effect suppression requires snapshot version 49.");
    } catch (error) {
      if (error instanceof WorkbookDomainError) throw error;
      return fail(path, error instanceof Error ? error.message : "Invalid picture object.");
    }
  }
  if (
    version !== undefined &&
    version < 48 &&
    Array.isArray(record.floatingImages) &&
    record.floatingImages.some(isPictureGroup)
  )
    return fail(`${path}.floatingImages`, "Owned picture groups require snapshot version 48.");
  if (
    version !== undefined &&
    version < 47 &&
    Array.isArray(record.floatingImages) &&
    record.floatingImages.some(
      (image) => image && typeof image === "object" && Object.hasOwn(image, "frame"),
    )
  )
    return fail(`${path}.floatingImages`, "Framed pictures require snapshot version 47.");
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
    const hasTableBinding =
      Array.isArray(record.pivotTables) &&
      record.pivotTables.some((item) => Object.hasOwn(asRecord(item, path), "sourceTableId"));
    version = hasAnnotations
      ? 42
      : Object.hasOwn(record, "pivotTables") || Object.hasOwn(record, "filter")
        ? 42
        : Object.hasOwn(record, "drawings")
          ? 42
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
    if (hasTableBinding) version = 43;
    if (
      Array.isArray(record.pivotTables) &&
      record.pivotTables.some((item) => {
        const rules = asRecord(item, path).sortFields;
        return (
          Array.isArray(rules) && rules.some((rule) => asRecord(rule, path).order === "manual")
        );
      })
    )
      version = 44;
    if (
      Array.isArray(record.tables) &&
      record.tables.some((item) => {
        const columns = asRecord(item, path).columns;
        return (
          Array.isArray(columns) &&
          columns.some((column) => Object.hasOwn(asRecord(column, path), "calculatedColumnFormula"))
        );
      })
    )
      version = 45;
    if (
      cells.some((cell) => {
        const content = asRecord(cell, path).content;
        return (
          typeof content === "object" && content !== null && Object.hasOwn(content, "fontRuns")
        );
      })
    )
      version = 46;
    if (
      Array.isArray(record.floatingImages) &&
      record.floatingImages.some((image) => Object.hasOwn(asRecord(image, path), "frame"))
    )
      version = 47;
    if (Array.isArray(record.floatingImages) && record.floatingImages.some(isPictureGroup))
      version = 48;
    // Infer independently after every older feature so mixed sheets keep the highest version.
    if (
      cells.some(hasCellThemeEffectSuppressionField) ||
      (Array.isArray(record.floatingImages) &&
        record.floatingImages.some(hasPictureThemeEffectSuppressionField))
    )
      version = 49;
    if (
      cells.some(hasCellDetailedStyleField) ||
      (Array.isArray(record.floatingImages) &&
        record.floatingImages.some(hasPictureDetailedStyleField))
    )
      version = 50;
    if (
      cells.some(hasCellPicturePropertyFields) ||
      (Array.isArray(record.floatingImages) && record.floatingImages.some(hasPicturePropertyFields))
    )
      version = 51;
    if (
      Array.isArray(record.floatingImages) &&
      record.floatingImages.some(hasPictureCropShapeFields)
    )
      version = 52;
    // Infer last so unrelated older features cannot lower the cell-frame protocol.
    if (cells.some(hasCellPictureFrameFields)) version = 53;
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => Object.hasOwn(asRecord(drawing, path), "shapeGeometry"))
    )
      version = 54;
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some(
        (drawing) =>
          Object.hasOwn(asRecord(drawing, path), "shapeLineEnds") ||
          Object.hasOwn(asRecord(drawing, path), "textDirection"),
      )
    )
      version = 55;
    // Infer last so mixed earlier features cannot lower the shape-flip protocol.
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => {
        const item = asRecord(drawing, path);
        return "shapeFlipX" in item || "shapeFlipY" in item;
      })
    )
      version = 56;
    // Infer independently and last so every older mixed feature retains free-path geometry.
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => "shapePath" in asRecord(drawing, path))
    )
      version = 57;
    // Infer last so free paths and every older mixed feature keep detailed shape appearance.
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => "shapeStyle" in asRecord(drawing, path))
    )
      version = 58;
    // Infer last so every older mixed feature retains explicit shape text.
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => "shapeText" in asRecord(drawing, path))
    )
      version = 59;
    // The source-free canonical frame is inferred after all prior independent features.
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => {
        const item = asRecord(drawing, path);
        return "shapeFrame" in item || "shapeProperties" in item;
      })
    )
      version = 60;
    if (
      Array.isArray(record.drawings) &&
      record.drawings.some((drawing) => hasShapeGroupSnapshotTag(asRecord(drawing, path), path))
    )
      version = 61;
    // Infer last so root and nested owner effects cannot be downgraded by older features.
    if (hasShapeGroupEffects) version = 62;
    // Relation endpoints are inferred last; unrelated older features cannot downgrade them.
    if (hasShapeConnectors) version = 63;
    // Controls follow connectors and shadow-only group effects.
    if (hasShapeControlsState) version = 64;
    // Infer last so mixed controls, connectors and older features cannot lower65.
    if (hasExtendedShapeGroupEffects) version = 65;
    // Independent final inference preserves attributed root and nested leaf ranges.
    if (hasShapeCharacterRuns) version = 66;
    if (hasShapeGroup3d) version = 67;
  }
  if (version < 45 && Array.isArray(record.tables)) {
    for (const [index, table] of record.tables.entries()) {
      const columns = asRecord(table, `${path}.tables[${index}]`).columns;
      if (
        Array.isArray(columns) &&
        columns.some((column) => Object.hasOwn(asRecord(column, path), "calculatedColumnFormula"))
      )
        return fail(
          `${path}.tables[${index}].columns`,
          "Calculated column formulas require snapshot version 45.",
        );
    }
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
  const sheets = getWorkbookSheets(workbook).map(serializeSheet);
  const manualOrder = sheets.some((sheet) =>
    sheet.pivotTables?.some((table) => table.sortFields?.some((rule) => rule.order === "manual")),
  );
  const calculatedColumns = sheets.some((sheet) =>
    sheet.tables?.some((table) =>
      table.columns.some((column) => column.calculatedColumnFormula !== undefined),
    ),
  );
  const shapeGroupVersion = sheets.some((sheet) =>
    sheet.drawings?.some(
      (drawing) =>
        drawing.kind === "shapeGroup" &&
        inspectShapeGroupSnapshotEffects(drawing, "$.drawings").hasEffects,
    ),
  )
    ? 62
    : 61;
  const hasExtendedShapeGroupEffects = sheets.some((sheet) =>
    sheet.drawings?.some(
      (drawing) =>
        drawing.kind === "shapeGroup" &&
        inspectShapeGroupSnapshotEffects(drawing, "$.drawings").hasExtendedEffects,
    ),
  );
  return {
    // Preserve the existing protocol for documents that do not use the new feature.
    version: sheets.some((sheet) =>
      sheet.drawings?.some((drawing) => inspectShapeGroupSnapshot3d(drawing, "$.drawings")),
    )
      ? 67
      : sheets.some((sheet) =>
            sheet.drawings?.some(
              (drawing) => inspectShapeCharacterRunsSnapshotFields(drawing, "$.drawings").hasState,
            ),
          )
        ? 66
        : hasExtendedShapeGroupEffects
          ? 65
          : sheets.some((sheet) =>
                sheet.drawings?.some(
                  (drawing) => inspectShapeControlsSnapshotFields(drawing, "$.drawings").hasState,
                ),
              )
            ? 64
            : sheets.some((sheet) =>
                  sheet.drawings?.some((drawing) =>
                    hasShapeConnectorSnapshotField(drawing, "$.drawings"),
                  ),
                )
              ? 63
              : sheets.some((sheet) =>
                    sheet.drawings?.some((drawing) => drawing.kind === "shapeGroup"),
                  )
                ? shapeGroupVersion
                : sheets.some((sheet) =>
                      sheet.drawings?.some((drawing) => Object.hasOwn(drawing, "shapeFrame")),
                    )
                  ? 60
                  : sheets.some((sheet) =>
                        sheet.drawings?.some((drawing) => Object.hasOwn(drawing, "shapeText")),
                      )
                    ? 59
                    : sheets.some((sheet) =>
                          sheet.drawings?.some((drawing) => Object.hasOwn(drawing, "shapeStyle")),
                        )
                      ? 58
                      : sheets.some((sheet) =>
                            sheet.drawings?.some((drawing) => Object.hasOwn(drawing, "shapePath")),
                          )
                        ? 57
                        : sheets.some((sheet) =>
                              sheet.drawings?.some(
                                (drawing) =>
                                  drawing.kind === "shape" &&
                                  (drawing.shapeFlipX === true || drawing.shapeFlipY === true),
                              ),
                            )
                          ? 56
                          : sheets.some((sheet) =>
                                sheet.drawings?.some(
                                  (drawing) =>
                                    Object.hasOwn(drawing, "shapeLineEnds") ||
                                    Object.hasOwn(drawing, "textDirection"),
                                ),
                              )
                            ? 55
                            : sheets.some((sheet) =>
                                  sheet.drawings?.some((drawing) =>
                                    Object.hasOwn(drawing, "shapeGeometry"),
                                  ),
                                )
                              ? 54
                              : sheets.some((sheet) => sheet.cells.some(hasCellPictureFrameFields))
                                ? 53
                                : sheets.some((sheet) =>
                                      sheet.floatingImages.some(hasPictureCropShapeFields),
                                    )
                                  ? 52
                                  : sheets.some(
                                        (sheet) =>
                                          sheet.cells.some(hasCellPicturePropertyFields) ||
                                          sheet.floatingImages.some(hasPicturePropertyFields),
                                      )
                                    ? 51
                                    : sheets.some(
                                          (sheet) =>
                                            sheet.cells.some(hasCellDetailedStyleField) ||
                                            sheet.floatingImages.some(hasPictureDetailedStyleField),
                                        )
                                      ? 50
                                      : sheets.some(
                                            (sheet) =>
                                              sheet.cells.some(
                                                hasCellThemeEffectSuppressionField,
                                              ) ||
                                              sheet.floatingImages.some(
                                                hasPictureThemeEffectSuppressionField,
                                              ),
                                          )
                                        ? 49
                                        : sheets.some((sheet) =>
                                              sheet.floatingImages.some(isPictureGroup),
                                            )
                                          ? 48
                                          : sheets.some((sheet) =>
                                                sheet.floatingImages.some(isFramedPictureObject),
                                              )
                                            ? 47
                                            : sheets.some((sheet) =>
                                                  sheet.cells.some(
                                                    (cell) =>
                                                      cell.content?.kind === "literal" &&
                                                      Boolean(cell.content.fontRuns?.length),
                                                  ),
                                                )
                                              ? 46
                                              : calculatedColumns
                                                ? 45
                                                : manualOrder
                                                  ? 44
                                                  : 43,
    ...(workbook.structureProtected ? { structureProtected: true } : {}),
    ...(workbook.structurePassword
      ? { structurePassword: normalizeProtectionPassword(workbook.structurePassword) }
      : {}),
    calculation: normalizeWorkbookCalculationSettings(workbook.calculation),
    theme: cloneWorkbookTheme(workbook.theme),
    dateSystem: normalizeExcelDateSystem(workbook.dateSystem),
    id: workbook.id,
    activeSheetId: workbook.activeSheetId,
    sheets,
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
    record.version !== 40 &&
    record.version !== 41 &&
    record.version !== 42 &&
    record.version !== 43 &&
    record.version !== 44 &&
    record.version !== 45 &&
    record.version !== 46 &&
    record.version !== 47 &&
    record.version !== 48 &&
    record.version !== 49 &&
    record.version !== 50 &&
    record.version !== 51 &&
    record.version !== 52 &&
    record.version !== 53 &&
    record.version !== 54 &&
    record.version !== 55 &&
    record.version !== 56 &&
    record.version !== 57 &&
    record.version !== 58 &&
    record.version !== 59 &&
    record.version !== 60 &&
    record.version !== 61 &&
    record.version !== 62 &&
    record.version !== 63 &&
    record.version !== 64 &&
    record.version !== 65 &&
    record.version !== 66 &&
    record.version !== 67
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
