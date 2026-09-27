import { evaluateFormulaRuntime, evaluateFormulaRuntimeAst } from "./formula/evaluate.js";
import { calculateIterativeComponents } from "./formula/iterative-calculation.js";
import { isSheetRowFiltered } from "./filter-values.js";
import { isFormulaArray, scalarize } from "./formula/runtime.js";
import {
  DEFAULT_WORKBOOK_CALCULATION_SETTINGS,
  type WorkbookCalculationSettings,
} from "./calculation.js";
export {
  DEFAULT_WORKBOOK_CALCULATION_SETTINGS,
  normalizeWorkbookCalculationSettings,
  type WorkbookCalculationSettings,
} from "./calculation.js";
import {
  normalizeExcelDateSystem,
  type ExcelDateParts,
  type ExcelDateSystem,
} from "./formula/date-system.js";
import {
  DEFAULT_FORMULA_FUNCTION_REGISTRY,
  normalizeFormulaFunctionName,
  type FormulaFunctionArgument,
} from "./formula/functions.js";
import { getFormulaAst } from "./formula/parser.js";
import { isSimulationTableRoot, parseSimulationTableFormula } from "./data-table-formula.js";
import {
  createFormulaError,
  isFormulaError,
  isFormulaErrorCode,
  type CellContent,
  type FormulaErrorCode,
  type FormulaExpression,
  type FormulaValue,
  type FormulaRuntimeValue,
} from "./formula/types.js";
import { doMergedCellRangesIntersect, validateMergedCellRanges } from "./merged-cells.js";
import type { IdFactory } from "./runtime.js";
import { isSheetAddressInBounds, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import { areCellStylesEqual, cloneCellStyle, normalizeCellStyle, type CellStyle } from "./style.js";
import {
  areImageTransformsEqual,
  cloneImageTransform,
  normalizeImageTransform,
  type ImageTransform,
} from "./image-transform.js";
import { normalizeOutlineGroups } from "./data-outline.js";

export {
  areImageTransformsEqual,
  cloneImageTransform,
  normalizeImageTransform,
  type ImageCrop,
  type ImageTransform,
} from "./image-transform.js";

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
  condition?: SheetFilterCondition;
};
export type SheetFilterCondition =
  | {
      kind: "text";
      operator: "contains" | "doesNotContain" | "beginsWith" | "endsWith" | "equals" | "notEquals";
      value: string;
    }
  | {
      kind: "number" | "date";
      operator:
        | "equals"
        | "notEquals"
        | "greaterThan"
        | "greaterThanOrEqual"
        | "lessThan"
        | "lessThanOrEqual"
        | "between"
        | "notBetween";
      value: number;
      value2?: number;
    };

/** Persisted filter criteria. Visibility is derived by the sheet-engine layer. */
export type SheetFilter = {
  range: CellRange;
  columns: SheetFilterColumn[];
  advanced?: {
    criteria?: { sheetId: string; range: CellRange };
    uniqueOnly: boolean;
    hiddenRows: Array<{ start: number; end: number }>;
  };
};

export type SheetMetadata = {
  freezePanes: FreezePanes;
  filter: SheetFilter | null;
  mergedCells: CellRange[];
  dataValidations?: SheetDataValidation[];
  outlineGroups?: SheetOutlineGroup[];
  subtotalMetadata?: SheetSubtotalMetadata[];
  duplicateRules?: SheetDuplicateRule[];
};

export type DataValidationType =
  | "whole"
  | "decimal"
  | "list"
  | "date"
  | "time"
  | "textLength"
  | "custom";
export type DataValidationOperator =
  | "between"
  | "notBetween"
  | "equal"
  | "notEqual"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEqual"
  | "lessThanOrEqual";
export type SheetDataValidation = {
  id: string;
  range: CellRange;
  type: DataValidationType;
  operator?: DataValidationOperator;
  formula1?: string;
  formula2?: string;
  list?: string[];
  allowBlank: boolean;
  showInput?: boolean;
  showError?: boolean;
  showDropdown?: boolean;
  promptTitle?: string;
  prompt?: string;
  errorTitle?: string;
  error?: string;
  errorStyle?: "stop" | "warning" | "information";
};
export type SheetOutlineGroup = {
  id: string;
  axis: SheetDimensionAxis;
  start: number;
  end: number;
  collapsed: boolean;
};
export type SheetSubtotalMetadata = {
  id: string;
  range: CellRange;
  generatedRows: number[];
  /** Zero-based columns inserted to hold subtotal labels or values. */
  generatedColumns?: number[];
  /** Omitted is the legacy below-details layout. */
  summaryBelow?: boolean;
  /** Zero-based rows which begin a printed page after a group boundary. */
  pageBreakRows?: number[];
};
export type SheetDuplicateRule = {
  id: string;
  kind: "highlight" | "reject";
  range: CellRange;
  fillColor?: string;
  textColor?: string;
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
  transform?: ImageTransform;
};

export type Cell = {
  content?: CellContent;
  style?: CellStyle;
};

export type SheetProperties = {
  tabColor?: string;
  pinned: boolean;
  hidden: boolean;
  protected: boolean;
};

export type Sheet = {
  id: string;
  name: string;
  properties: SheetProperties;
  cells: Map<string, Cell>;
  rowHeights: Map<number, number>;
  columnWidths: Map<number, number>;
  /** Hidden axes retain their manual dimensions so unhiding is lossless. */
  hiddenRows?: Set<number>;
  hiddenColumns?: Set<number>;
  /** Sparse column widths fall back to this value. */
  defaultColumnWidth?: number;
  freezePanes: FreezePanes;
  filter: SheetFilter | null;
  mergedCells: CellRange[];
  dataValidations?: SheetDataValidation[];
  outlineGroups?: SheetOutlineGroup[];
  subtotalMetadata?: SheetSubtotalMetadata[];
  duplicateRules?: SheetDuplicateRule[];
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
  hiddenRows?: number[];
  hiddenColumns?: number[];
  defaultColumnWidth?: number;
  freezePanes: FreezePanes;
  filter: SheetFilter | null;
  mergedCells: CellRange[];
  dataValidations?: SheetDataValidation[];
  outlineGroups?: SheetOutlineGroup[];
  subtotalMetadata?: SheetSubtotalMetadata[];
  duplicateRules?: SheetDuplicateRule[];
  floatingImages: FloatingImage[];
};

export type Workbook = {
  id: string;
  /** Interpretation of date serials; cell numbers are not converted when this changes. */
  dateSystem: ExcelDateSystem;
  calculation: WorkbookCalculationSettings;
  sheets: Map<string, Sheet>;
  activeSheetId: string;
  definedNames: Map<string, DefinedName>;
};

/** A workbook- or sheet-scoped name that points at one rectangular range. */
export type DefinedName = {
  id: string;
  name: string;
  scopeSheetId?: string;
  /** Optional user-facing description for the defined name. */
  comment?: string;
  reference: CellRange & { sheetId: string };
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
    properties: { pinned: false, hidden: false, protected: false },
    cells: new Map(),
    rowHeights: new Map(),
    columnWidths: new Map(),
    hiddenRows: new Set(),
    hiddenColumns: new Set(),
    defaultColumnWidth: DEFAULT_COLUMN_WIDTH,
    freezePanes: { rows: 0, columns: 0 },
    filter: null,
    mergedCells: [],
    dataValidations: [],
    outlineGroups: [],
    subtotalMetadata: [],
    duplicateRules: [],
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
  dateSystem?: ExcelDateSystem;
}): Workbook {
  const idFactory = options?.idFactory;
  if (!options?.id && !idFactory) {
    throw new Error("A workbook ID or IdFactory is required.");
  }
  const sheet = createSheet(options?.sheetName, options?.sheetId, idFactory);

  return {
    id: options?.id ?? createRequiredId("workbook", idFactory),
    dateSystem: normalizeExcelDateSystem(options?.dateSystem ?? "1900"),
    calculation: { ...DEFAULT_WORKBOOK_CALCULATION_SETTINGS },
    sheets: new Map([[sheet.id, sheet]]),
    activeSheetId: sheet.id,
    definedNames: new Map(),
  };
}

export function getDefinedName(
  workbook: Workbook,
  name: string,
  sheetId: string,
): DefinedName | null {
  const normalized = name.toUpperCase();
  const local = [...workbook.definedNames.values()].find(
    (item) => item.scopeSheetId === sheetId && item.name.toUpperCase() === normalized,
  );
  return (
    local ??
    [...workbook.definedNames.values()].find(
      (item) => item.scopeSheetId === undefined && item.name.toUpperCase() === normalized,
    ) ??
    null
  );
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
  // Replacing the map publishes the reordered collection in one assignment. In
  // particular, reactive consumers never observe a transient empty map while an
  // insertion or move is rebuilding its order.
  workbook.sheets = new Map(sheets.map((sheet) => [sheet.id, sheet]));
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
  // Publish a surviving active sheet before the removed sheet disappears so a
  // synchronous observer can resolve the active sheet at each publication.
  workbook.activeSheetId = nextActiveSheetId;
  replaceWorkbookSheets(workbook, sheets);
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
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }
  if (sheet.properties.hidden) {
    throw new Error(`Sheet ${sheetId} is hidden.`);
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
  getSpillProjections?: () => Iterable<{
    address: CellAddress;
    root: CellAddress;
    value: FormulaValue;
  }>;
  getRuntimeValue?: (address: CellAddress) => FormulaRuntimeValue;
  /** Gets another sheet's view over this workbook calculation cycle. */
  forSheet?: (sheetId: string) => SheetEvaluator;
};
export type WorkbookEvaluatorOptions = Readonly<{
  getCachedFormulaValue?: (
    sheetId: string,
    address: CellAddress,
    source: string,
  ) => FormulaRuntimeValue | undefined;
  /** Supplies one deterministic clock for volatile date functions in this calculation cycle. */
  now?: () => ExcelDateParts;
  /** Internal shared guard for shadow-evaluated What-If Data Table formulas. */
  simulationTableComputing?: Set<string>;
}>;
type SparseRangeIndex = { rows: number[]; byRow: Map<number, CellAddress[]> };

/**
 * Creates a reusable derived-value evaluator for one current sheet state.
 * It shares DFS memoization across all requested cells and resolves ranges from
 * the sparse address index, never by walking a rectangular area.
 */
export function createSheetEvaluator(sheet: Sheet): SheetEvaluator {
  return createWorkbookEvaluator(
    {
      id: "isolated-sheet-evaluator",
      dateSystem: "1900",
      calculation: { ...DEFAULT_WORKBOOK_CALCULATION_SETTINGS },
      sheets: new Map([[sheet.id, sheet]]),
      activeSheetId: sheet.id,
      definedNames: new Map(),
    },
    sheet.id,
  );
}

/**
 * Evaluates formulas in a workbook, resolving qualified A1 references and
 * workbook/sheet scoped names. The existing sheet evaluator remains available
 * for consumers that own an isolated sheet (such as the canvas adapter).
 */
export function createWorkbookEvaluator(
  workbook: Workbook,
  sheetId: string,
  options?: WorkbookEvaluatorOptions,
): SheetEvaluator {
  if (!workbook.sheets.has(sheetId)) throw new Error(`Sheet ${sheetId} does not exist.`);

  const cycleNow = options?.now?.() ?? localDateParts(new Date());

  type Dependency = { sheetId: string; address: CellAddress };
  type Frame = Dependency & { stage: "prepare" | "select" | "evaluate" };
  const memo = new Map<string, FormulaValue>();
  const runtimeMemo = new Map<string, FormulaRuntimeValue>();
  const spills = new Map<string, { root: CellAddress; value: FormulaValue }>();
  const discovering = new Set<string>();
  const state = new Map<string, "visiting" | "done">();
  const indexes = new Map<string, SparseRangeIndex>();
  const spillIndexes = new Map<string, SparseRangeIndex>();
  const formulaDependencies = new Map<string, Set<string>>();
  const formulaAddresses = new Map<string, Dependency>();
  const possibleSpillRoots = new Map<string, CellAddress[]>();
  const simulationTableComputing = options?.simulationTableComputing ?? new Set<string>();
  const keyFor = (targetSheetId: string, address: CellAddress) =>
    `${targetSheetId}|${createCellKey(address)}`;
  const sheetForName = (name: string | undefined, fallback: string): string | null => {
    if (!name) return fallback;
    return (
      getWorkbookSheets(workbook).find(
        (sheet) => sheet.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"),
      )?.id ?? null
    );
  };
  const indexFor = (targetSheetId: string): SparseRangeIndex => {
    const cached = indexes.get(targetSheetId);
    if (cached) return cached;
    const sheet = workbook.sheets.get(targetSheetId);
    if (!sheet) return { rows: [], byRow: new Map() };
    const byRow = new Map<number, CellAddress[]>();
    for (const address of [...sheet.cells.keys()].map(parseCellKey)) {
      const row = byRow.get(address.row) ?? [];
      row.push(address);
      byRow.set(address.row, row);
    }
    for (const row of byRow.values()) row.sort((left, right) => left.column - right.column);
    const index = { rows: [...byRow.keys()].sort((left, right) => left - right), byRow };
    indexes.set(targetSheetId, index);
    return index;
  };
  const contentFor = (targetSheetId: string, address: CellAddress): CellContent | undefined =>
    workbook.sheets.get(targetSheetId)?.cells.get(createCellKey(address))?.content;
  const canSpill = (expression: FormulaExpression): boolean => {
    const pending = [expression];
    while (pending.length) {
      const next = pending.pop()!;
      if (
        next.kind === "array" ||
        next.kind === "range" ||
        next.kind === "axis-range" ||
        next.kind === "spill" ||
        next.kind === "identifier"
      )
        return true;
      if (next.kind === "function") {
        const name = normalizeFormulaFunctionName(next.name);
        if (["IF", "IFERROR", "IFNA", "IFS", "SWITCH", "CHOOSE", "INDEX"].includes(name))
          pending.push(...next.args);
        else if (DEFAULT_FORMULA_FUNCTION_REGISTRY.get(name)?.metadata.arrayResult) return true;
      } else if (next.kind === "unary") pending.push(next.operand);
      else if (next.kind === "binary") pending.push(next.left, next.right);
    }
    return false;
  };
  const spillRootsFor = (targetSheetId: string): CellAddress[] => {
    const existing = possibleSpillRoots.get(targetSheetId);
    if (existing) return existing;
    const roots: CellAddress[] = [];
    for (const [key, cell] of workbook.sheets.get(targetSheetId)?.cells ?? []) {
      if (cell.content?.kind !== "formula") continue;
      const ast = getFormulaAst(cell.content.formula.source);
      if (ast && canSpill(ast.expression)) roots.push(parseCellKey(key));
    }
    roots.sort((a, b) => a.row - b.row || a.column - b.column);
    possibleSpillRoots.set(targetSheetId, roots);
    return roots;
  };
  const addressesForRange = (
    targetSheetId: string,
    start: CellAddress,
    end: CellAddress,
  ): CellAddress[] => {
    const addresses = getSparseRangeAddresses(indexFor(targetSheetId), start, end);
    const projected = spillIndexes.get(targetSheetId);
    if (!projected) return addresses;
    const keys = new Set(addresses.map(createCellKey));
    for (const address of getSparseRangeAddresses(projected, start, end)) {
      if (!keys.has(createCellKey(address))) addresses.push(address);
    }
    return addresses.sort((a, b) => a.row - b.row || a.column - b.column);
  };
  const valueFor = (targetSheetId: string, address: CellAddress): FormulaValue => {
    if (!isCellAddressInBounds(address) || !workbook.sheets.has(targetSheetId))
      return createFormulaError("REF");
    const content = contentFor(targetSheetId, address);
    const spill = spills.get(keyFor(targetSheetId, address));
    if (!content && spill) return spill.value;
    if (!content) discoverSpillAt(targetSheetId, address);
    const discovered = spills.get(keyFor(targetSheetId, address));
    if (!content && discovered) return discovered.value;
    if (!content) return null;
    if (content.kind === "literal") return content.value;
    if (content.kind === "error") return createFormulaError(content.error.code);
    if (content.kind === "image") return createFormulaError("VALUE");
    return memo.get(keyFor(targetSheetId, address)) ?? createFormulaError("CYCLE");
  };
  const registerSpill = (
    targetSheetId: string,
    root: CellAddress,
    value: FormulaRuntimeValue,
  ): FormulaValue => {
    if (!isFormulaArray(value)) return scalarize(value);
    const rows = value.rows.length,
      columns = value.rows[0]?.length ?? 0;
    if (
      !rows ||
      !columns ||
      root.row + rows > MAX_SHEET_ROWS ||
      root.column + columns > MAX_SHEET_COLUMNS
    )
      return createFormulaError("SPILL");
    const sheet = workbook.sheets.get(targetSheetId)!;
    const range = {
      start: root,
      end: { row: root.row + rows - 1, column: root.column + columns - 1 },
    };
    if (sheet.mergedCells.some((merge) => doMergedCellRangesIntersect(merge, range)))
      return createFormulaError("SPILL");
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < columns; column += 1) {
        if (row === 0 && column === 0) continue;
        const address = { row: root.row + row, column: root.column + column };
        if (contentFor(targetSheetId, address) || spills.has(keyFor(targetSheetId, address)))
          return createFormulaError("SPILL");
        if (
          formulaDependencies.get(keyFor(targetSheetId, root))?.has(keyFor(targetSheetId, address))
        )
          return createFormulaError("CYCLE");
      }
    let projected = spillIndexes.get(targetSheetId);
    if (!projected) {
      projected = { rows: [], byRow: new Map() };
      spillIndexes.set(targetSheetId, projected);
    }
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < columns; column += 1) {
        if (row === 0 && column === 0) continue;
        const address = { row: root.row + row, column: root.column + column };
        spills.set(keyFor(targetSheetId, address), { root, value: value.rows[row]![column]! });
        let projectedRow = projected.byRow.get(address.row);
        if (!projectedRow) {
          projectedRow = [];
          projected.byRow.set(address.row, projectedRow);
          projected.rows.push(address.row);
        }
        projectedRow.push(address);
      }
    projected.rows.sort((a, b) => a - b);
    for (let row = root.row; row < root.row + rows; row++)
      projected.byRow.get(row)?.sort((a, b) => a.column - b.column);
    return scalarize(value);
  };
  const discoverSpillAt = (targetSheetId: string, address: CellAddress): void => {
    const marker = keyFor(targetSheetId, address);
    if (discovering.has(marker)) return;
    discovering.add(marker);
    for (const root of spillRootsFor(targetSheetId)) {
      const rootKey = keyFor(targetSheetId, root);
      if (
        root.row <= address.row &&
        root.column <= address.column &&
        !memo.has(rootKey) &&
        state.get(rootKey) !== "visiting"
      )
        resolve(targetSheetId, root);
    }
    discovering.delete(marker);
  };
  const nameReference = (name: string, fromSheetId: string) => {
    const defined = getDefinedName(workbook, name, fromSheetId);
    if (!defined) return null;
    const targetSheet = workbook.sheets.get(defined.reference.sheetId);
    return targetSheet
      ? { start: defined.reference.start, end: defined.reference.end, sheetId: targetSheet.id }
      : null;
  };
  const resolveRange = (
    fromSheetId: string,
    start: CellAddress & { sheetName?: string },
    end: CellAddress,
    read = valueFor,
  ) => {
    const targetSheetId = sheetForName(start.sheetName, fromSheetId);
    if (!targetSheetId) return [createFormulaError("REF")];
    discoverSpillAt(targetSheetId, {
      row: Math.max(start.row, end.row),
      column: Math.max(start.column, end.column),
    });
    return addressesForRange(targetSheetId, start, end).map((address) =>
      read(targetSheetId, address),
    );
  };
  const resolveRangeEntries = (
    fromSheetId: string,
    start: CellAddress & { sheetName?: string },
    end: CellAddress,
    read = valueFor,
  ) => {
    const targetSheetId = sheetForName(start.sheetName, fromSheetId);
    if (!targetSheetId) return [];
    const targetSheet = workbook.sheets.get(targetSheetId);
    if (!targetSheet) return [];
    discoverSpillAt(targetSheetId, {
      row: Math.max(start.row, end.row),
      column: Math.max(start.column, end.column),
    });
    return addressesForRange(targetSheetId, start, end).map((address) => {
      const content = contentFor(targetSheetId, address);
      return {
        address,
        value: read(targetSheetId, address),
        hidden: targetSheet.hiddenRows?.has(address.row) ?? false,
        filtered: isSheetRowFiltered(targetSheet, address.row, (target) =>
          read(targetSheetId, target),
        ),
        nestedSubtotal:
          content?.kind === "formula" &&
          /^\s*=\s*(?:_xlfn\.)?(?:SUBTOTAL|AGGREGATE)\s*\(/i.test(content.formula.source),
      };
    });
  };
  const resolverFor = (fromSheetId: string, read = valueFor) => ({
    resolveSpill: (target: CellAddress & { sheetName?: string }): FormulaRuntimeValue => {
      const targetSheetId = sheetForName(target.sheetName, fromSheetId);
      if (!targetSheetId) return createFormulaError("REF");
      const value = resolve(targetSheetId, target);
      if (isFormulaError(value)) return value;
      const runtime = runtimeMemo.get(keyFor(targetSheetId, target));
      return runtime && isFormulaArray(runtime) ? runtime : createFormulaError("REF");
    },
    resolveCell: (target: CellAddress & { sheetName?: string }) => {
      const targetSheetId = sheetForName(target.sheetName, fromSheetId);
      return targetSheetId ? read(targetSheetId, target) : createFormulaError("REF");
    },
    resolveRange: (bounds: { start: CellAddress; end: CellAddress; sheetName?: string }) =>
      resolveRange(
        fromSheetId,
        { ...bounds.start, ...(bounds.sheetName ? { sheetName: bounds.sheetName } : {}) },
        bounds.end,
        read,
      ),
    resolveRangeEntries: (bounds: { start: CellAddress; end: CellAddress; sheetName?: string }) =>
      resolveRangeEntries(
        fromSheetId,
        { ...bounds.start, ...(bounds.sheetName ? { sheetName: bounds.sheetName } : {}) },
        bounds.end,
        read,
      ),
    resolveName: (name: string) => {
      const named = nameReference(name, fromSheetId);
      return named
        ? {
            start: named.start,
            end: named.end,
            sheetName: workbook.sheets.get(named.sheetId)?.name,
          }
        : undefined;
    },
  });
  const dependenciesFor = (
    fromSheetId: string,
    address: CellAddress,
    stage: "prepare" | "select",
  ): Dependency[] => {
    const content = contentFor(fromSheetId, address);
    if (content?.kind !== "formula") return [];
    const ast = getFormulaAst(content.formula.source);
    if (!ast) return [];
    const unresolvedFormula = (dependency: Dependency): boolean =>
      contentFor(dependency.sheetId, dependency.address)?.kind === "formula" &&
      !memo.has(keyFor(dependency.sheetId, dependency.address));
    const collect = (expression: FormulaExpression, mode: "prepare" | "select"): Dependency[] => {
      const dependencies: Dependency[] = [];
      type Exclusions = { hidden: boolean; nested: boolean };
      const addRange = (
        targetSheetId: string,
        start: CellAddress,
        end: CellAddress,
        exclusions?: Exclusions,
      ) => {
        const sheet = workbook.sheets.get(targetSheetId)!;
        for (const target of getSparseRangeAddresses(indexFor(targetSheetId), start, end)) {
          if (exclusions) {
            const targetContent = contentFor(targetSheetId, target);
            if (exclusions.hidden && (sheet.hiddenRows?.has(target.row) ?? false)) continue;
            if (
              exclusions.nested &&
              targetContent?.kind === "formula" &&
              /^\s*=\s*(?:_xlfn\.)?(?:SUBTOTAL|AGGREGATE)\s*\(/i.test(targetContent.formula.source)
            )
              continue;
            const filter = sheet.filter;
            if (
              filter &&
              target.row > filter.range.start.row &&
              target.row <= filter.range.end.row
            ) {
              const filterDependencies = filter.columns.map((column) => ({
                sheetId: targetSheetId,
                address: { row: target.row, column: column.column },
              }));
              dependencies.push(...filterDependencies);
              if (filterDependencies.some(unresolvedFormula)) continue;
              if (
                isSheetRowFiltered(sheet, target.row, (filterAddress) =>
                  valueFor(targetSheetId, filterAddress),
                )
              )
                continue;
            }
          }
          dependencies.push({ sheetId: targetSheetId, address: target });
        }
      };
      const visit = (current: FormulaExpression, exclusions?: Exclusions): void => {
        if (current.kind === "reference" || current.kind === "spill") {
          const targetSheetId = sheetForName(current.reference.sheetName, fromSheetId);
          if (targetSheetId) {
            if (exclusions && current.kind === "reference")
              addRange(targetSheetId, current.reference, current.reference, exclusions);
            else dependencies.push({ sheetId: targetSheetId, address: current.reference });
          }
          return;
        }
        if (current.kind === "range") {
          const targetSheetId = sheetForName(current.range.start.sheetName, fromSheetId);
          if (targetSheetId)
            addRange(targetSheetId, current.range.start, current.range.end, exclusions);
          return;
        }
        if (current.kind === "axis-range") {
          const targetSheetId = sheetForName(current.range.sheetName, fromSheetId);
          const start =
            current.range.axis === "column"
              ? { row: 0, column: Math.min(current.range.start, current.range.end) }
              : { row: Math.min(current.range.start, current.range.end), column: 0 };
          const end =
            current.range.axis === "column"
              ? {
                  row: MAX_SHEET_ROWS - 1,
                  column: Math.max(current.range.start, current.range.end),
                }
              : {
                  row: Math.max(current.range.start, current.range.end),
                  column: MAX_SHEET_COLUMNS - 1,
                };
          if (targetSheetId) addRange(targetSheetId, start, end, exclusions);
          return;
        }
        if (current.kind === "array") {
          for (const row of current.rows) for (const item of row) visit(item);
          return;
        }
        if (current.kind === "identifier") {
          const named = nameReference(current.name, fromSheetId);
          if (named) addRange(named.sheetId, named.start, named.end, exclusions);
          return;
        }
        if (current.kind === "unary") {
          visit(current.operand);
          return;
        }
        if (current.kind === "binary") {
          visit(current.left);
          visit(current.right);
          return;
        }
        if (current.kind !== "function") return;
        const name = normalizeFormulaFunctionName(current.name);
        if (name === "SUBTOTAL" || name === "AGGREGATE") {
          const firstData = name === "SUBTOTAL" ? 1 : 2;
          for (const argument of current.args.slice(0, firstData)) visit(argument);
          if (mode === "prepare" || dependencies.some(unresolvedFormula)) return;
          const numbers = current.args
            .slice(0, firstData)
            .map((argument) =>
              scalarize(
                evaluateFormulaRuntimeAst(
                  { source: content.formula.source, expression: argument },
                  resolverFor(fromSheetId),
                  { dateSystem: workbook.dateSystem, now: () => cycleNow },
                ),
              ),
            );
          const code = numbers[0],
            option = numbers[1];
          const excludes = {
            hidden:
              name === "SUBTOTAL"
                ? typeof code === "number" && code >= 101
                : typeof option === "number" && [1, 3, 5, 7].includes(option),
            nested: name === "SUBTOTAL" || (typeof option === "number" && option < 4),
          };
          for (const argument of current.args.slice(firstData)) visit(argument, excludes);
          return;
        }
        const definition = DEFAULT_FORMULA_FUNCTION_REGISTRY.get(current.name);
        if (!definition?.selectDependencyArguments) {
          for (const argument of current.args) visit(argument);
          return;
        }
        const selector = current.args[0];
        if (!selector) return;
        if (mode === "prepare") {
          dependencies.push(...collect(selector, "prepare"));
          return;
        }
        const selectorDependencies = collect(selector, "select");
        if (selectorDependencies.some(unresolvedFormula)) {
          dependencies.push(...selectorDependencies);
          return;
        }
        const cache: FormulaFunctionArgument[] = [];
        const selected = definition.selectDependencyArguments({
          argumentCount: current.args.length,
          evaluateArgument(index) {
            const cached = cache[index];
            if (cached) return cached;
            const argument = current.args[index];
            const next: FormulaFunctionArgument =
              argument?.kind === "range"
                ? {
                    kind: "range",
                    values: resolveRange(fromSheetId, argument.range.start, argument.range.end),
                  }
                : {
                    kind: "scalar",
                    value: argument
                      ? evaluateFormulaRuntimeAst(
                          { source: content.formula.source, expression: argument },
                          resolverFor(fromSheetId),
                          { dateSystem: workbook.dateSystem, now: () => cycleNow },
                        )
                      : createFormulaError("VALUE"),
                    source: "expression",
                  };
            cache[index] = next;
            return next;
          },
        });
        for (const index of selected) {
          const argument = current.args[index];
          if (argument) visit(argument);
        }
      };
      visit(expression);
      const unique = new Map<string, Dependency>();
      for (const dependency of dependencies)
        unique.set(keyFor(dependency.sheetId, dependency.address), dependency);
      return [...unique.values()];
    };
    // The output formula depends on its target and on the input/header cells.
    // Its target's graph is evaluated in a shadow below; scheduling these roots
    // here keeps cycle diagnostics and manual calculation caching conservative.
    const dependencies = collect(ast.expression, stage);
    const key = keyFor(fromSheetId, address);
    formulaAddresses.set(key, { sheetId: fromSheetId, address });
    const keys =
      stage === "prepare" ? new Set<string>() : (formulaDependencies.get(key) ?? new Set<string>());
    for (const dependency of dependencies) keys.add(keyFor(dependency.sheetId, dependency.address));
    formulaDependencies.set(key, keys);
    return dependencies;
  };
  const evaluateSimulationTable = (
    currentSheetId: string,
    address: CellAddress,
    expression: FormulaExpression,
  ): FormulaValue | undefined => {
    const table = parseSimulationTableFormula(expression);
    if (!table) {
      if (!isSimulationTableRoot(expression)) return undefined;
      return expression.args.some(
        (argument) => argument.kind === "error" && argument.code === "REF",
      )
        ? createFormulaError("REF")
        : createFormulaError("VALUE");
    }
    const tableKey = keyFor(currentSheetId, address);
    if (simulationTableComputing.has(tableKey)) return createFormulaError("CYCLE");
    simulationTableComputing.add(tableKey);
    try {
      const resolveReferenceSheet = (sheetName: string | undefined): string | null =>
        sheetForName(sheetName, currentSheetId);
      const scalarReference = (reference: typeof table.formula): FormulaValue => {
        const referenceSheetId = resolveReferenceSheet(reference.sheetName);
        return referenceSheetId ? resolve(referenceSheetId, reference) : createFormulaError("REF");
      };
      const formulaSheetId = resolveReferenceSheet(table.formula.sheetName);
      const firstInputSheetId = resolveReferenceSheet(table.rowInput?.sheetName);
      const firstValue = table.rowValue
        ? scalarReference(table.rowValue)
        : createFormulaError("VALUE");
      const secondInputSheetId = table.columnInput
        ? resolveReferenceSheet(table.columnInput.sheetName)
        : undefined;
      const secondValue = table.columnValue ? scalarReference(table.columnValue) : undefined;
      if (
        !formulaSheetId ||
        !firstInputSheetId ||
        (table.columnInput && !secondInputSheetId) ||
        (isFormulaError(firstValue) && firstValue.code === "REF") ||
        (isFormulaError(secondValue) && secondValue.code === "REF")
      )
        return createFormulaError("REF");
      if (typeof firstValue !== "number" || (table.columnInput && typeof secondValue !== "number"))
        return createFormulaError("VALUE");
      const formulaContent = contentFor(formulaSheetId, table.formula);
      if (formulaContent?.kind !== "formula") return createFormulaError("VALUE");
      const sheets = new Map(workbook.sheets);
      const cloneInputSheet = (inputSheetId: string) => {
        const source = sheets.get(inputSheetId)!;
        if (source === workbook.sheets.get(inputSheetId))
          sheets.set(inputSheetId, { ...source, cells: new Map(source.cells) });
        return sheets.get(inputSheetId)!;
      };
      setCellContent(cloneInputSheet(firstInputSheetId), table.rowInput!, {
        kind: "literal",
        value: firstValue,
      });
      if (table.columnInput && secondInputSheetId && typeof secondValue === "number")
        setCellContent(cloneInputSheet(secondInputSheetId), table.columnInput, {
          kind: "literal",
          value: secondValue,
        });
      const shadow = { ...workbook, sheets };
      return createWorkbookEvaluator(shadow, formulaSheetId, {
        now: () => cycleNow,
        simulationTableComputing,
      }).getComputedValue(table.formula);
    } finally {
      simulationTableComputing.delete(tableKey);
    }
  };
  const resolve = (targetSheetId: string, target: CellAddress): FormulaValue => {
    if (!isCellAddressInBounds(target)) return createFormulaError("REF");
    const targetKey = keyFor(targetSheetId, target);
    if (memo.has(targetKey)) return memo.get(targetKey) ?? null;
    const source = contentFor(targetSheetId, target);
    if (source?.kind !== "formula") return valueFor(targetSheetId, target);
    const hydrateCachedFormula = (
      currentSheetId: string,
      address: CellAddress,
      content: Extract<CellContent, { kind: "formula" }>,
    ): boolean => {
      const cached = options?.getCachedFormulaValue?.(
        currentSheetId,
        address,
        content.formula.source,
      );
      if (cached === undefined) return false;
      const cachedKey = keyFor(currentSheetId, address);
      runtimeMemo.set(cachedKey, cached);
      memo.set(cachedKey, registerSpill(currentSheetId, address, cached));
      state.set(cachedKey, "done");
      return true;
    };
    if (hydrateCachedFormula(targetSheetId, target, source)) {
      return valueFor(targetSheetId, target);
    }
    const simulation = getFormulaAst(source.formula.source);
    if (simulation) {
      const tableValue = evaluateSimulationTable(targetSheetId, target, simulation.expression);
      if (tableValue !== undefined) {
        memo.set(targetKey, tableValue);
        runtimeMemo.set(targetKey, tableValue);
        state.set(targetKey, "done");
        return tableValue;
      }
    }
    const stack: Frame[] = [{ sheetId: targetSheetId, address: target, stage: "prepare" }];
    while (stack.length) {
      const frame = stack.pop();
      if (!frame) break;
      const frameKey = keyFor(frame.sheetId, frame.address);
      if (memo.has(frameKey)) continue;
      const content = contentFor(frame.sheetId, frame.address);
      if (content?.kind !== "formula") continue;
      if (frame.stage === "prepare") {
        if (hydrateCachedFormula(frame.sheetId, frame.address, content)) continue;
        if (state.get(frameKey) === "visiting") {
          memo.set(frameKey, createFormulaError("CYCLE"));
          continue;
        }
        state.set(frameKey, "visiting");
        stack.push({ ...frame, stage: "select" });
        for (const dependency of dependenciesFor(
          frame.sheetId,
          frame.address,
          "prepare",
        ).reverse()) {
          const dependencyKey = keyFor(dependency.sheetId, dependency.address);
          if (
            contentFor(dependency.sheetId, dependency.address)?.kind !== "formula" ||
            memo.has(dependencyKey)
          )
            continue;
          if (state.get(dependencyKey) === "visiting")
            memo.set(dependencyKey, createFormulaError("CYCLE"));
          else stack.push({ ...dependency, stage: "prepare" });
        }
        continue;
      }
      if (frame.stage === "select") {
        const dependencies = dependenciesFor(frame.sheetId, frame.address, "select");
        const pending = dependencies.some(
          (dependency) =>
            contentFor(dependency.sheetId, dependency.address)?.kind === "formula" &&
            !memo.has(keyFor(dependency.sheetId, dependency.address)),
        );
        stack.push({ ...frame, stage: pending ? "select" : "evaluate" });
        for (const dependency of dependencies.reverse()) {
          const dependencyKey = keyFor(dependency.sheetId, dependency.address);
          if (
            contentFor(dependency.sheetId, dependency.address)?.kind !== "formula" ||
            memo.has(dependencyKey)
          )
            continue;
          if (state.get(dependencyKey) === "visiting")
            memo.set(dependencyKey, createFormulaError("CYCLE"));
          else stack.push({ ...dependency, stage: "prepare" });
        }
        continue;
      }
      const simulation = getFormulaAst(content.formula.source);
      if (simulation) {
        const tableValue = evaluateSimulationTable(
          frame.sheetId,
          frame.address,
          simulation.expression,
        );
        if (tableValue !== undefined) {
          runtimeMemo.set(frameKey, tableValue);
          memo.set(frameKey, tableValue);
          state.set(frameKey, "done");
          continue;
        }
      }
      const runtime = evaluateFormulaRuntime(content.formula.source, resolverFor(frame.sheetId), {
        dateSystem: workbook.dateSystem,
        address: frame.address,
        now: () => cycleNow,
      });
      runtimeMemo.set(frameKey, runtime);
      memo.set(frameKey, registerSpill(frame.sheetId, frame.address, runtime));
      state.set(frameKey, "done");
    }
    return valueFor(targetSheetId, target);
  };
  const compute = (targetSheetId: string, address: CellAddress): FormulaValue => {
    const value = resolve(targetSheetId, address);
    if (!workbook.calculation.iterative || !isFormulaError(value) || value.code !== "CYCLE")
      return value;
    const solved = calculateIterativeComponents({
      dependencies: formulaDependencies,
      maxIterations: workbook.calculation.maxIterations,
      maxChange: workbook.calculation.maxChange,
      initialValue: (key) => memo.get(key) ?? null,
      evaluate: (key, read) => {
        const target = formulaAddresses.get(key);
        if (!target) return memo.get(key) ?? null;
        const content = contentFor(target.sheetId, target.address);
        if (content?.kind !== "formula") return valueFor(target.sheetId, target.address);
        const runtime = evaluateFormulaRuntime(
          content.formula.source,
          resolverFor(target.sheetId, (readSheetId, readAddress) => {
            const readKey = keyFor(readSheetId, readAddress);
            return contentFor(readSheetId, readAddress)?.kind === "formula"
              ? read(readKey)
              : valueFor(readSheetId, readAddress);
          }),
          { dateSystem: workbook.dateSystem, address: target.address, now: () => cycleNow },
        );
        return scalarize(runtime);
      },
    });
    if (!solved.size) return value;
    for (const [key, cached] of memo) {
      if (isFormulaError(cached) && cached.code === "CYCLE") {
        memo.delete(key);
        runtimeMemo.delete(key);
        state.delete(key);
      }
    }
    for (const [key, result] of solved) {
      memo.set(key, result);
      runtimeMemo.set(key, result);
      state.set(key, "done");
    }
    return resolve(targetSheetId, address);
  };
  const forSheet = (targetSheetId: string): SheetEvaluator => {
    if (!workbook.sheets.has(targetSheetId))
      throw new Error(`Sheet ${targetSheetId} does not exist.`);
    return {
      getComputedValue: (address) => compute(targetSheetId, address),
      getRuntimeValue: (address) => {
        const value = compute(targetSheetId, address);
        if (isFormulaError(value) && (value.code === "SPILL" || value.code === "CYCLE"))
          return value;
        return runtimeMemo.get(keyFor(targetSheetId, address)) ?? value;
      },
      getSpillProjections: function* () {
        for (const [key, projection] of spills) {
          const divider = key.indexOf("|");
          if (key.slice(0, divider) === targetSheetId)
            yield { address: parseCellKey(key.slice(divider + 1)), ...projection };
        }
      },
      forSheet,
    };
  };
  return forSheet(sheetId);
}

function localDateParts(date: Date): ExcelDateParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
  };
}

export function getCellComputedValue(sheet: Sheet, address: CellAddress): FormulaValue {
  return createSheetEvaluator(sheet).getComputedValue(address);
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
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
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
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new TypeError("Literal cell content must be a string, finite number, or boolean.");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Literal cell content numbers must be finite.");
    }
    return { kind: "literal", value };
  }
  if (content.kind === "error" && isFormulaError(content.error)) {
    return { kind: "error", error: createFormulaError(content.error.code) };
  }
  if (
    content.kind === "image" &&
    typeof content.image?.assetId === "string" &&
    content.image.assetId.trim() &&
    typeof content.image.altText === "string"
  ) {
    return {
      kind: "image",
      image: {
        assetId: content.image.assetId,
        altText: content.image.altText,
        ...(normalizeImageTransform(content.image.transform)
          ? { transform: normalizeImageTransform(content.image.transform) }
          : {}),
      },
    };
  }
  if (
    content.kind === "formula" &&
    typeof content.formula?.source === "string" &&
    content.formula.source.startsWith("=")
  ) {
    return { kind: "formula", formula: { source: content.formula.source } };
  }
  throw new TypeError("Invalid cell content or formula source.");
}

export function cloneCellContent(content: CellContent): CellContent {
  if (content.kind === "error") {
    return { kind: "error", error: createFormulaError(content.error.code) };
  }
  if (content.kind === "literal") return { kind: "literal", value: content.value };
  if (content.kind === "formula")
    return { kind: "formula", formula: { source: content.formula.source } };
  return {
    kind: "image",
    image: {
      assetId: content.image.assetId,
      altText: content.image.altText,
      ...(cloneImageTransform(content.image.transform)
        ? { transform: cloneImageTransform(content.image.transform) }
        : {}),
    },
  };
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
      : left.kind === "error" && right.kind === "error"
        ? left.error.code === right.error.code
        : left.kind === "formula" &&
            right.kind === "formula" &&
            left.formula.source === right.formula.source
          ? true
          : left.kind === "image" &&
            right.kind === "image" &&
            left.image.assetId === right.image.assetId &&
            left.image.altText === right.image.altText &&
            areImageTransformsEqual(left.image.transform, right.image.transform))
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
  if (sheet.hiddenRows?.has(row)) return 0;
  return sheet.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT;
}

export function getColumnWidth(sheet: Sheet, column: number): number {
  assertDimensionIndex(column, MAX_SHEET_COLUMNS, "Column");
  if (sheet.hiddenColumns?.has(column)) return 0;
  return sheet.columnWidths.get(column) ?? getDefaultColumnWidth(sheet);
}

export function getDefaultColumnWidth(sheet: Sheet): number {
  return sheet.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH;
}

export function setRowHeight(sheet: Sheet, row: number, height: number): boolean {
  assertDimensionIndex(row, MAX_SHEET_ROWS, "Row");
  assertDimensionSize(height, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT, "Row height");
  return setDimension(sheet.rowHeights, row, height, DEFAULT_ROW_HEIGHT);
}

export function setColumnWidth(sheet: Sheet, column: number, width: number): boolean {
  assertDimensionIndex(column, MAX_SHEET_COLUMNS, "Column");
  assertDimensionSize(width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, "Column width");
  return setDimension(sheet.columnWidths, column, width, getDefaultColumnWidth(sheet));
}

export function setDefaultColumnWidth(sheet: Sheet, width: number): boolean {
  assertDimensionSize(width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, "Default column width");
  const previous = getDefaultColumnWidth(sheet);
  if (previous === width) return false;
  sheet.defaultColumnWidth = width;
  for (const [index, current] of sheet.columnWidths) {
    if (current === width) sheet.columnWidths.delete(index);
  }
  return true;
}

export function setSheetDimensionHidden(
  sheet: Sheet,
  axis: SheetDimensionAxis,
  index: number,
  hidden: boolean,
): boolean {
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  assertDimensionIndex(index, maximum, axis === "row" ? "Row" : "Column");
  const property = axis === "row" ? "hiddenRows" : "hiddenColumns";
  const dimensions = sheet[property];
  if ((dimensions?.has(index) ?? false) === hidden) return false;
  if (hidden) (dimensions ?? (sheet[property] = new Set<number>())).add(index);
  else dimensions?.delete(index);
  return true;
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
      ...(column.condition ? { condition: { ...column.condition } } : {}),
    })),
    ...(filter.advanced
      ? {
          advanced: {
            ...(filter.advanced.criteria
              ? {
                  criteria: {
                    sheetId: filter.advanced.criteria.sheetId,
                    range: {
                      start: { ...filter.advanced.criteria.range.start },
                      end: { ...filter.advanced.criteria.range.end },
                    },
                  },
                }
              : {}),
            uniqueOnly: filter.advanced.uniqueOnly,
            hiddenRows: filter.advanced.hiddenRows.map((interval) => ({ ...interval })),
          },
        }
      : {}),
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
  if (value.kind === "error" && isFormulaErrorCode(value.code)) return { ...value };
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
    const condition = column.condition;
    if (condition !== undefined) {
      const text =
        condition.kind === "text" &&
        typeof condition.value === "string" &&
        ["contains", "doesNotContain", "beginsWith", "endsWith", "equals", "notEquals"].includes(
          condition.operator,
        );
      const numeric =
        (condition.kind === "number" || condition.kind === "date") &&
        typeof condition.value === "number" &&
        Number.isFinite(condition.value) &&
        [
          "equals",
          "notEquals",
          "greaterThan",
          "greaterThanOrEqual",
          "lessThan",
          "lessThanOrEqual",
          "between",
          "notBetween",
        ].includes(condition.operator) &&
        (condition.value2 === undefined ||
          (typeof condition.value2 === "number" && Number.isFinite(condition.value2))) &&
        (!["between", "notBetween"].includes(condition.operator) || condition.value2 !== undefined);
      if (!text && !numeric) throw new TypeError("Invalid filter condition.");
    }
    return {
      column: column.column,
      allowedValues,
      ...(condition ? { condition: { ...condition } } : {}),
    };
  });
  columns.sort((left, right) => left.column - right.column);
  if (columns.some((column, index) => column.column === columns[index - 1]?.column)) {
    throw new Error("Filter columns must be unique.");
  }
  let advanced: SheetFilter["advanced"];
  if (filter.advanced !== undefined) {
    const source = filter.advanced;
    if (
      !source ||
      typeof source !== "object" ||
      typeof source.uniqueOnly !== "boolean" ||
      !Array.isArray(source.hiddenRows)
    )
      throw new TypeError("Invalid advanced filter.");
    const hiddenRows = source.hiddenRows.map((interval) => {
      if (
        !interval ||
        !Number.isInteger(interval.start) ||
        !Number.isInteger(interval.end) ||
        interval.start < normalizedRange.start.row + 1 ||
        interval.end < interval.start ||
        interval.end > normalizedRange.end.row
      )
        throw new RangeError("Invalid advanced filter hidden rows.");
      return { start: interval.start, end: interval.end };
    });
    if (
      hiddenRows.some(
        (interval, index) => index > 0 && interval.start <= hiddenRows[index - 1]!.end,
      )
    )
      throw new RangeError("Advanced filter hidden rows must not overlap.");
    if (source.criteria !== undefined) {
      const criteria = source.criteria;
      if (
        !criteria ||
        typeof criteria.sheetId !== "string" ||
        !criteria.sheetId ||
        !isCellAddressInBounds(criteria.range?.start) ||
        !isCellAddressInBounds(criteria.range?.end)
      )
        throw new TypeError("Invalid advanced filter criteria.");
      advanced = {
        criteria: {
          sheetId: criteria.sheetId,
          range: {
            start: {
              row: Math.min(criteria.range.start.row, criteria.range.end.row),
              column: Math.min(criteria.range.start.column, criteria.range.end.column),
            },
            end: {
              row: Math.max(criteria.range.start.row, criteria.range.end.row),
              column: Math.max(criteria.range.start.column, criteria.range.end.column),
            },
          },
        },
        uniqueOnly: source.uniqueOnly,
        hiddenRows,
      };
    } else advanced = { uniqueOnly: source.uniqueOnly, hiddenRows };
  }
  return { range: normalizedRange, columns, ...(advanced ? { advanced } : {}) };
}

function normalizeSheetMetadata(
  state: Pick<
    SheetSparseState,
    | "freezePanes"
    | "filter"
    | "mergedCells"
    | "dataValidations"
    | "outlineGroups"
    | "subtotalMetadata"
    | "duplicateRules"
  >,
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
  const dataValidations = (state.dataValidations ?? []).map((rule) => {
    if (
      !rule ||
      typeof rule.id !== "string" ||
      !rule.id.trim() ||
      !isCellAddressInBounds(rule.range.start) ||
      !isCellAddressInBounds(rule.range.end) ||
      !["whole", "decimal", "list", "date", "time", "textLength", "custom"].includes(rule.type) ||
      typeof rule.allowBlank !== "boolean" ||
      (rule.list !== undefined &&
        (!Array.isArray(rule.list) || rule.list.some((value) => typeof value !== "string"))) ||
      (rule.formula1 !== undefined && typeof rule.formula1 !== "string") ||
      (rule.formula2 !== undefined && typeof rule.formula2 !== "string") ||
      (rule.operator !== undefined &&
        ![
          "between",
          "notBetween",
          "equal",
          "notEqual",
          "greaterThan",
          "lessThan",
          "greaterThanOrEqual",
          "lessThanOrEqual",
        ].includes(rule.operator)) ||
      (rule.errorStyle !== undefined &&
        !["stop", "warning", "information"].includes(rule.errorStyle)) ||
      [rule.showInput, rule.showError, rule.showDropdown].some(
        (value) => value !== undefined && typeof value !== "boolean",
      )
    )
      throw new TypeError("Invalid data validation rule.");
    return {
      ...rule,
      range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
      ...(rule.list ? { list: [...rule.list] } : {}),
    };
  });
  const duplicateRuleIds = new Set<string>();
  const duplicateRules = (state.duplicateRules ?? []).map((rule) => {
    if (
      !rule ||
      typeof rule.id !== "string" ||
      !rule.id.trim() ||
      (rule.kind !== "highlight" && rule.kind !== "reject") ||
      !isCellAddressInBounds(rule.range.start) ||
      !isCellAddressInBounds(rule.range.end)
    )
      throw new TypeError("Invalid duplicate rule.");
    if (duplicateRuleIds.has(rule.id)) throw new TypeError("Duplicate rule IDs must be unique.");
    duplicateRuleIds.add(rule.id);
    if (
      (rule.fillColor !== undefined && typeof rule.fillColor !== "string") ||
      (rule.textColor !== undefined && typeof rule.textColor !== "string")
    )
      throw new TypeError("Duplicate highlight colors must be strings.");
    normalizeCellStyle({
      ...(rule.fillColor === undefined ? {} : { fillColor: rule.fillColor }),
      ...(rule.textColor === undefined ? {} : { textColor: rule.textColor }),
    });
    return {
      ...rule,
      range: {
        start: {
          row: Math.min(rule.range.start.row, rule.range.end.row),
          column: Math.min(rule.range.start.column, rule.range.end.column),
        },
        end: {
          row: Math.max(rule.range.start.row, rule.range.end.row),
          column: Math.max(rule.range.start.column, rule.range.end.column),
        },
      },
    };
  });
  if (new Set(dataValidations.map((rule) => rule.id)).size !== dataValidations.length)
    throw new Error("Duplicate data validation ID.");
  const outlineGroups = normalizeOutlineGroups(state.outlineGroups ?? []);
  const subtotalMetadata = (state.subtotalMetadata ?? []).map((entry) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id ||
      !isCellAddressInBounds(entry.range.start) ||
      !isCellAddressInBounds(entry.range.end) ||
      !Array.isArray(entry.generatedRows) ||
      entry.generatedRows.some(
        (row) => !Number.isInteger(row) || row < 0 || row >= MAX_SHEET_ROWS,
      ) ||
      (entry.generatedColumns !== undefined &&
        (!Array.isArray(entry.generatedColumns) ||
          entry.generatedColumns.some(
            (column) => !Number.isInteger(column) || column < 0 || column >= MAX_SHEET_COLUMNS,
          ))) ||
      (entry.summaryBelow !== undefined && typeof entry.summaryBelow !== "boolean") ||
      (entry.pageBreakRows !== undefined &&
        (!Array.isArray(entry.pageBreakRows) ||
          entry.pageBreakRows.some(
            (row) => !Number.isInteger(row) || row < 0 || row >= MAX_SHEET_ROWS,
          )))
    )
      throw new TypeError("Invalid subtotal metadata.");
    return {
      ...entry,
      range: { start: { ...entry.range.start }, end: { ...entry.range.end } },
      generatedRows: [...entry.generatedRows],
      ...(entry.generatedColumns ? { generatedColumns: [...entry.generatedColumns] } : {}),
      ...(entry.summaryBelow === undefined ? {} : { summaryBelow: entry.summaryBelow }),
      ...(entry.pageBreakRows ? { pageBreakRows: [...entry.pageBreakRows] } : {}),
    };
  });
  return {
    freezePanes,
    filter,
    mergedCells,
    dataValidations,
    outlineGroups,
    subtotalMetadata,
    duplicateRules,
  };
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
  sheet.dataValidations = (normalized.dataValidations ?? []).map((rule) => ({
    ...rule,
    range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
    ...(rule.list ? { list: [...rule.list] } : {}),
  }));
  sheet.outlineGroups = (normalized.outlineGroups ?? []).map((group) => ({ ...group }));
  sheet.subtotalMetadata = (normalized.subtotalMetadata ?? []).map((entry) => ({
    ...entry,
    range: { start: { ...entry.range.start }, end: { ...entry.range.end } },
    generatedRows: [...entry.generatedRows],
    ...(entry.generatedColumns ? { generatedColumns: [...entry.generatedColumns] } : {}),
    ...(entry.summaryBelow === undefined ? {} : { summaryBelow: entry.summaryBelow }),
    ...(entry.pageBreakRows ? { pageBreakRows: [...entry.pageBreakRows] } : {}),
  }));
  sheet.duplicateRules = (normalized.duplicateRules ?? []).map((rule) => ({
    ...rule,
    range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
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
    if (dimension.size === (state.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH)) {
      throw new Error("Sparse state cannot store a default column width.");
    }
    if (columnIndexes.has(dimension.index)) {
      throw new Error(`Sparse state contains duplicate column dimension ${dimension.index}.`);
    }
    columnIndexes.add(dimension.index);
    return { ...dimension };
  });

  const normalizeHiddenIndexes = (
    indexes: readonly number[] | undefined,
    maximum: number,
    axis: string,
  ) => {
    const seen = new Set<number>();
    for (const index of indexes ?? []) {
      assertDimensionIndex(index, maximum, axis);
      if (seen.has(index))
        throw new Error(`Sparse state contains duplicate hidden ${axis.toLowerCase()} ${index}.`);
      seen.add(index);
    }
    return [...seen].sort((left, right) => left - right);
  };
  const defaultColumnWidth = state.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH;
  assertDimensionSize(
    defaultColumnWidth,
    MIN_COLUMN_WIDTH,
    MAX_COLUMN_WIDTH,
    "Default column width",
  );
  const hiddenRows = normalizeHiddenIndexes(state.hiddenRows, MAX_SHEET_ROWS, "Row");
  const hiddenColumns = normalizeHiddenIndexes(state.hiddenColumns, MAX_SHEET_COLUMNS, "Column");

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
    hiddenRows,
    hiddenColumns,
    defaultColumnWidth,
    freezePanes: cloneFreezePanes(metadata.freezePanes),
    filter: metadata.filter ? cloneSheetFilter(metadata.filter) : null,
    mergedCells: metadata.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
    dataValidations: metadata.dataValidations ?? [],
    outlineGroups: metadata.outlineGroups ?? [],
    subtotalMetadata: metadata.subtotalMetadata ?? [],
    duplicateRules: metadata.duplicateRules ?? [],
    floatingImages,
  };
}

function areSheetSparseStatesEqual(left: SheetSparseState, right: SheetSparseState): boolean {
  if (
    left.cells.length !== right.cells.length ||
    left.rowHeights.length !== right.rowHeights.length ||
    left.columnWidths.length !== right.columnWidths.length ||
    left.hiddenRows?.length !== right.hiddenRows?.length ||
    left.hiddenColumns?.length !== right.hiddenColumns?.length ||
    left.defaultColumnWidth !== right.defaultColumnWidth ||
    !areSheetMetadataEqual(left, right) ||
    JSON.stringify(left.subtotalMetadata ?? []) !== JSON.stringify(right.subtotalMetadata ?? []) ||
    JSON.stringify(left.duplicateRules ?? []) !== JSON.stringify(right.duplicateRules ?? []) ||
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
    left.hiddenRows!.every((index, position) => index === right.hiddenRows?.[position]) &&
    left.hiddenColumns!.every((index, position) => index === right.hiddenColumns?.[position]) &&
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
    columnWidths: [...sheet.columnWidths].map(([index, size]) => ({
      index,
      size,
    })),
    hiddenRows: [...(sheet.hiddenRows ?? [])],
    hiddenColumns: [...(sheet.hiddenColumns ?? [])],
    defaultColumnWidth: getDefaultColumnWidth(sheet),
    freezePanes: cloneFreezePanes(sheet.freezePanes),
    filter: sheet.filter ? cloneSheetFilter(sheet.filter) : null,
    mergedCells: sheet.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
    dataValidations: (sheet.dataValidations ?? []).map((rule) => ({
      ...rule,
      range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
      ...(rule.list ? { list: [...rule.list] } : {}),
    })),
    outlineGroups: (sheet.outlineGroups ?? []).map((group) => ({ ...group })),
    subtotalMetadata: (sheet.subtotalMetadata ?? []).map((entry) => ({
      ...entry,
      range: { start: { ...entry.range.start }, end: { ...entry.range.end } },
      generatedRows: [...entry.generatedRows],
      ...(entry.generatedColumns ? { generatedColumns: [...entry.generatedColumns] } : {}),
      ...(entry.summaryBelow === undefined ? {} : { summaryBelow: entry.summaryBelow }),
      ...(entry.pageBreakRows ? { pageBreakRows: [...entry.pageBreakRows] } : {}),
    })),
    duplicateRules: (sheet.duplicateRules ?? []).map((rule) => ({
      ...rule,
      range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
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
  sheet.hiddenRows?.clear();
  sheet.hiddenColumns?.clear();
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
  sheet.hiddenRows = new Set(nextState.hiddenRows);
  sheet.hiddenColumns = new Set(nextState.hiddenColumns);
  sheet.defaultColumnWidth = nextState.defaultColumnWidth;
  sheet.freezePanes = cloneFreezePanes(nextState.freezePanes);
  sheet.filter = nextState.filter ? cloneSheetFilter(nextState.filter) : null;
  sheet.mergedCells = nextState.mergedCells.map((range) => ({
    start: { ...range.start },
    end: { ...range.end },
  }));
  sheet.dataValidations = (nextState.dataValidations ?? []).map((rule) => ({
    ...rule,
    range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
    ...(rule.list ? { list: [...rule.list] } : {}),
  }));
  sheet.outlineGroups = (nextState.outlineGroups ?? []).map((group) => ({ ...group }));
  sheet.subtotalMetadata = (nextState.subtotalMetadata ?? []).map((entry) => ({
    ...entry,
    range: { start: { ...entry.range.start }, end: { ...entry.range.end } },
    generatedRows: [...entry.generatedRows],
    ...(entry.generatedColumns ? { generatedColumns: [...entry.generatedColumns] } : {}),
    ...(entry.summaryBelow === undefined ? {} : { summaryBelow: entry.summaryBelow }),
    ...(entry.pageBreakRows ? { pageBreakRows: [...entry.pageBreakRows] } : {}),
  }));
  sheet.duplicateRules = (nextState.duplicateRules ?? []).map((rule) => ({
    ...rule,
    range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
  }));
  sheet.floatingImages = nextState.floatingImages.map(cloneFloatingImage);
  return true;
}

export function cloneFloatingImage(image: FloatingImage): FloatingImage {
  const { transform, ...fields } = image;
  const normalizedTransform = cloneImageTransform(transform);
  return {
    ...fields,
    anchor: { ...image.anchor },
    ...(normalizedTransform ? { transform: normalizedTransform } : {}),
  };
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
  ) {
    throw new RangeError("Floating image offsets must be finite and non-negative.");
  }
  if (
    !Number.isFinite(image.width) ||
    image.width < MIN_FLOATING_IMAGE_SIZE ||
    image.width > MAX_FLOATING_IMAGE_SIZE ||
    !Number.isFinite(image.height) ||
    image.height < MIN_FLOATING_IMAGE_SIZE ||
    image.height > MAX_FLOATING_IMAGE_SIZE
  ) {
    throw new RangeError(
      `Floating image dimensions must be between ${MIN_FLOATING_IMAGE_SIZE} and ${MAX_FLOATING_IMAGE_SIZE}.`,
    );
  }
  const transform = normalizeImageTransform(image.transform);
  return { ...cloneFloatingImage(image), ...(transform ? { transform } : {}) };
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
    left.height === right.height &&
    areImageTransformsEqual(left.transform, right.transform)
  );
}

export function isCellAddressInBounds(address: CellAddress): boolean {
  return isSheetAddressInBounds(address);
}
