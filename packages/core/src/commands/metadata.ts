import {
  doMergedCellRangesIntersect,
  MergedCellRangeResolver,
  normalizeMergedCellRange,
  validateMergedCellRanges,
} from "../merged-cells.js";
import {
  createSheetSparseState,
  createSheetEvaluator,
  createWorkbookEvaluator,
  getCellContent,
  getCellStyle,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  replaceSheetSparseState,
  type CellAddress,
  type CellRange,
  type FreezePanes,
  type Sheet,
  type SheetEvaluator,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";
import { MAX_CELL_STYLE_PATCH_CELLS, type CellStyle } from "../style.js";
import { formatCellNumberValue } from "../number-format.js";
import { isFormulaError } from "../formula/types.js";
import type {
  CellMergeMode,
  MergeCellsCommand,
  RestoreFullSheetStateCommand,
  SetSheetFreezePanesCommand,
  UnmergeCellsCommand,
} from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  validateCommandPayload,
} from "./helpers.js";

function cloneAddress(address: CellAddress): CellAddress {
  return { row: address.row, column: address.column };
}

function cloneRange(range: CellRange): CellRange {
  return { start: cloneAddress(range.start), end: cloneAddress(range.end) };
}

function cloneFreezePanes(freezePanes: FreezePanes): FreezePanes {
  return { rows: freezePanes.rows, columns: freezePanes.columns };
}

function validateFreezePanes(value: unknown): FreezePanes {
  if (!value || typeof value !== "object") throw new TypeError("Expected frozen pane boundaries.");
  const freezePanes = value as FreezePanes;
  if (
    !Number.isInteger(freezePanes.rows) ||
    freezePanes.rows < 0 ||
    freezePanes.rows > MAX_SHEET_ROWS ||
    !Number.isInteger(freezePanes.columns) ||
    freezePanes.columns < 0 ||
    freezePanes.columns > MAX_SHEET_COLUMNS
  ) {
    throw new RangeError("Frozen pane boundaries are outside the sheet.");
  }
  return cloneFreezePanes(freezePanes);
}

function createRestore(
  sheetId: string,
  state: ReturnType<typeof createSheetSparseState>,
): RestoreFullSheetStateCommand {
  return { type: "restoreSheetState", sheetId, state };
}

type MergePerimeter = Pick<CellStyle, "borderTop" | "borderRight" | "borderBottom" | "borderLeft">;
type MergeCandidate = {
  range: CellRange;
  anchorCell?: SheetSparseState["cells"][number];
  perimeter: MergePerimeter;
  topColumn: number;
  rightRow: number;
  bottomColumn: number;
  leftRow: number;
};

function mergeRangeKey(range: CellRange): string {
  return `${range.start.row}:${range.start.column}:${range.end.row}:${range.end.column}`;
}

function createMergeCandidate(range: CellRange): MergeCandidate {
  return {
    range,
    perimeter: {},
    topColumn: Number.POSITIVE_INFINITY,
    rightRow: Number.POSITIVE_INFINITY,
    bottomColumn: Number.POSITIVE_INFINITY,
    leftRow: Number.POSITIVE_INFINITY,
  };
}

function collectMergedPerimeter(
  candidate: MergeCandidate,
  cell: SheetSparseState["cells"][number],
): void {
  const { row, column } = cell.address;
  const { range, perimeter } = candidate;
  if (row === range.start.row && column === range.start.column) candidate.anchorCell = cell;
  const style = cell.style;
  if (row === range.start.row && column < candidate.topColumn && style?.borderTop) {
    perimeter.borderTop = { ...style.borderTop };
    candidate.topColumn = column;
  }
  if (column === range.end.column && row < candidate.rightRow && style?.borderRight) {
    perimeter.borderRight = { ...style.borderRight };
    candidate.rightRow = row;
  }
  if (row === range.end.row && column < candidate.bottomColumn && style?.borderBottom) {
    perimeter.borderBottom = { ...style.borderBottom };
    candidate.bottomColumn = column;
  }
  if (column === range.start.column && row < candidate.leftRow && style?.borderLeft) {
    perimeter.borderLeft = { ...style.borderLeft };
    candidate.leftRow = row;
  }
}

function preserveMergedPerimeterBorders(
  state: SheetSparseState,
  candidates: Iterable<MergeCandidate>,
): void {
  for (const candidate of candidates) {
    const anchorStyle = candidate.anchorCell?.style;
    const {
      borderTop: _top,
      borderRight: _right,
      borderBottom: _bottom,
      borderLeft: _left,
      ...rest
    } = anchorStyle ?? {};
    const nextStyle: CellStyle = { ...rest, ...candidate.perimeter };
    if (candidate.anchorCell) {
      candidate.anchorCell.style = Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
    } else if (Object.keys(nextStyle).length > 0) {
      state.cells.push({ address: cloneAddress(candidate.range.start), style: nextStyle });
    }
  }
}

export function createSetSheetFreezePanesCommand(
  sheetId: string,
  freezePanes: FreezePanes,
): SetSheetFreezePanesCommand {
  return { type: "setSheetFreezePanes", sheetId, freezePanes: cloneFreezePanes(freezePanes) };
}

export function createMergeCellsCommand(
  sheetId: string,
  range: CellRange,
  mode: CellMergeMode = "all",
  locale?: string,
): MergeCellsCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  const normalizedMode = normalizeCellMergeMode(mode);
  const normalizedLocale = normalizeContentLocale(locale);
  return {
    type: "mergeCells",
    sheetId,
    range: cloneRange(normalized),
    ...(normalizedMode === "all" ? {} : { mode: normalizedMode }),
    ...(normalizedMode === "content" && normalizedLocale ? { locale: normalizedLocale } : {}),
  };
}

export function createUnmergeCellsCommand(sheetId: string, range: CellRange): UnmergeCellsCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  return { type: "unmergeCells", sheetId, range: cloneRange(normalized) };
}

export function applySetSheetFreezePanesCommand(
  workbook: Workbook,
  command: SetSheetFreezePanesCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const freezePanes = validateCommandPayload("freezePanes", command.freezePanes, () =>
    validateFreezePanes(command.freezePanes),
  );
  const previous = createSheetSparseState(sheet);
  const state = {
    ...previous,
    freezePanes,
  };
  return validateCommandPayload("freezePanes", command.freezePanes, () =>
    replaceSheetSparseState(sheet, state),
  )
    ? createRestore(command.sheetId, previous)
    : null;
}

export function applyMergeCellsCommand(
  workbook: Workbook,
  command: MergeCellsCommand,
): RestoreFullSheetStateCommand | null {
  const normalized = validateCommandPayload("range", command.range, () => {
    const range = normalizeRange(command.range);
    assertCellRange(range);
    return normalizeMergedCellRange(range);
  });
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const mode = validateCommandPayload("mode", command.mode, () =>
    normalizeCellMergeMode(command.mode),
  );
  const locale = validateCommandPayload("locale", command.locale, () =>
    normalizeContentLocale(command.locale),
  );
  assertSupportedMergeModeRange(normalized, mode);
  const ranges = getCellMergeModeRanges(
    sheet,
    normalized,
    mode,
    createWorkbookEvaluator(workbook, sheet.id),
  );
  if (!ranges.length) return null;
  const previous = createSheetSparseState(sheet);
  validateMergePlan(sheet, ranges, command.range);
  const state = createSheetSparseState(sheet);
  const content =
    mode === "content" ? getMergedContentText(workbook, sheet, normalized, locale) : undefined;
  applyMergeRangesToState(state, ranges);
  if (mode === "center") centerMergeAnchor(state, normalized.start);
  if (mode === "content") setMergeAnchorContent(state, normalized.start, content ?? "");
  state.mergedCells = validateMergedCellRanges([...state.mergedCells, ...ranges]);
  return validateCommandPayload("range", command.range, () => replaceSheetSparseState(sheet, state))
    ? createRestore(command.sheetId, previous)
    : null;
}

function normalizeCellMergeMode(value: unknown): CellMergeMode {
  if (value === undefined) return "all";
  if (
    value === "all" ||
    value === "center" ||
    value === "same-columns" ||
    value === "same-rows" ||
    value === "content" ||
    value === "across"
  ) {
    return value;
  }
  throw new TypeError("Cell merge mode is invalid.");
}

function normalizeContentLocale(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new TypeError("Merge content locale must be a non-empty string.");
  return value;
}

/** Returns false when the mode has no mergeable ranges or violates sheet metadata constraints. */
export function getCellMergeModeAvailability(
  sheet: Sheet,
  range: CellRange,
  mode: CellMergeMode,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
): boolean {
  try {
    const normalized = normalizeMergedCellRange(normalizeRange(range));
    const normalizedMode = normalizeCellMergeMode(mode);
    assertSupportedMergeModeRange(normalized, normalizedMode);
    const ranges = getCellMergeModeRanges(sheet, normalized, normalizedMode, evaluator);
    if (!ranges.length) return false;
    validateMergePlan(sheet, ranges, range);
    return true;
  } catch {
    return false;
  }
}

function getCellMergeModeRanges(
  sheet: Sheet,
  range: CellRange,
  mode: CellMergeMode,
  evaluator: SheetEvaluator,
): CellRange[] {
  if (mode === "all" || mode === "center" || mode === "content") {
    if (mode === "content") assertNoCellImages(sheet, range);
    return [range];
  }
  if (mode === "across") {
    if (range.start.column === range.end.column) return [];
    assertNoCellImages(sheet, range);
    return Array.from({ length: range.end.row - range.start.row + 1 }, (_, offset) => ({
      start: { row: range.start.row + offset, column: range.start.column },
      end: { row: range.start.row + offset, column: range.end.column },
    }));
  }
  const vertical = mode === "same-columns";
  if (vertical ? range.start.row === range.end.row : range.start.column === range.end.column)
    return [];
  assertNoCellImages(sheet, range);
  const ranges: CellRange[] = [];
  const outerStart = vertical ? range.start.column : range.start.row;
  const outerEnd = vertical ? range.end.column : range.end.row;
  const innerStart = vertical ? range.start.row : range.start.column;
  const innerEnd = vertical ? range.end.row : range.end.column;
  for (let outer = outerStart; outer <= outerEnd; outer += 1) {
    let runStart: number | undefined;
    let previousKey: string | undefined;
    for (let inner = innerStart; inner <= innerEnd; inner += 1) {
      const address = vertical ? { row: inner, column: outer } : { row: outer, column: inner };
      const key = getComparableComputedValueKey(evaluator.getComputedValue(address));
      if (key !== undefined && key === previousKey) continue;
      if (runStart !== undefined && inner - runStart > 1) {
        ranges.push(
          vertical
            ? { start: { row: runStart, column: outer }, end: { row: inner - 1, column: outer } }
            : { start: { row: outer, column: runStart }, end: { row: outer, column: inner - 1 } },
        );
      }
      runStart = key === undefined ? undefined : inner;
      previousKey = key;
    }
    if (runStart !== undefined && innerEnd - runStart > 0) {
      ranges.push(
        vertical
          ? { start: { row: runStart, column: outer }, end: { row: innerEnd, column: outer } }
          : { start: { row: outer, column: runStart }, end: { row: outer, column: innerEnd } },
      );
    }
  }
  return ranges;
}

function assertSupportedMergeModeRange(range: CellRange, mode: CellMergeMode): void {
  if (mode === "all" || mode === "center") return;
  const cellCount =
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
  if (cellCount > MAX_CELL_STYLE_PATCH_CELLS) {
    throw invalidCommandPayload(
      "range",
      range,
      `Cell merge modes are limited to ${MAX_CELL_STYLE_PATCH_CELLS} cells per command.`,
    );
  }
}

function getComparableComputedValueKey(
  value: ReturnType<ReturnType<typeof createSheetEvaluator>["getComputedValue"]>,
): string | undefined {
  if (value === null || value === "") return undefined;
  if (isFormulaError(value)) return `error:${value.code}`;
  return `${typeof value}:${String(value)}`;
}

function assertNoCellImages(sheet: Sheet, range: CellRange): void {
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      if (getCellContent(sheet, { row, column })?.kind === "image") {
        throw new TypeError("Merge content cannot include cell images.");
      }
    }
  }
}

function validateMergePlan(sheet: Sheet, ranges: readonly CellRange[], payload: unknown): void {
  try {
    validateMergedCellRanges([...sheet.mergedCells, ...ranges]);
    const filter = sheet.filter;
    for (const range of ranges) {
      if (
        (range.start.row < sheet.freezePanes.rows && range.end.row >= sheet.freezePanes.rows) ||
        (range.start.column < sheet.freezePanes.columns &&
          range.end.column >= sheet.freezePanes.columns)
      ) {
        throw new RangeError("A frozen pane boundary cannot cut through a merged cell range.");
      }
      const filterHasRelevantMergedCell = filter?.columns.some(
        (column) =>
          range.end.row >= filter.range.start.row + 1 &&
          range.start.row <= filter.range.end.row &&
          column.column >= range.start.column &&
          column.column <= range.end.column,
      );
      if (
        filter &&
        (filter.allowMergedCells === undefined
          ? doMergedCellRangesIntersect(range, filter.range)
          : filter.allowMergedCells === false && filterHasRelevantMergedCell)
      ) {
        throw new RangeError("A filter range cannot intersect merged cells.");
      }
    }
  } catch (error) {
    throw invalidCommandPayload(
      "range",
      payload,
      error instanceof Error ? error.message : "Invalid merged cell ranges.",
    );
  }
}

function applyMergeRangesToState(state: SheetSparseState, ranges: readonly CellRange[]): void {
  const resolver = new MergedCellRangeResolver(ranges);
  const candidates = new Map<string, MergeCandidate>(
    ranges.map((range) => [mergeRangeKey(range), createMergeCandidate(range)]),
  );
  const retained: SheetSparseState["cells"] = [];
  for (const cell of state.cells) {
    const range = resolver.getRangeAtAddress(cell.address);
    if (!range) {
      retained.push(cell);
      continue;
    }
    const candidate = candidates.get(mergeRangeKey(range));
    if (!candidate) throw new Error("Missing merge candidate.");
    collectMergedPerimeter(candidate, cell);
    if (cell.address.row === range.start.row && cell.address.column === range.start.column) {
      retained.push(cell);
    }
  }
  state.cells = retained;
  preserveMergedPerimeterBorders(state, candidates.values());
}

function findStateCell(state: SheetSparseState, address: CellAddress) {
  return state.cells.find(
    (cell) => cell.address.row === address.row && cell.address.column === address.column,
  );
}

function centerMergeAnchor(state: SheetSparseState, address: CellAddress): void {
  const cell = findStateCell(state, address);
  if (cell) cell.style = { ...cell.style, horizontalAlign: "center" };
  else state.cells.push({ address: cloneAddress(address), style: { horizontalAlign: "center" } });
}

function setMergeAnchorContent(state: SheetSparseState, address: CellAddress, text: string): void {
  const cell = findStateCell(state, address);
  if (cell) {
    if (text) cell.content = { kind: "literal", value: text };
    else delete cell.content;
  } else if (text) {
    state.cells.push({ address: cloneAddress(address), content: { kind: "literal", value: text } });
  }
}

function getMergedContentText(
  workbook: Workbook,
  sheet: Sheet,
  range: CellRange,
  locale: string | undefined,
): string {
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const values: string[] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = { row, column };
      const text = formatCellNumberValue(
        evaluator.getComputedValue(address),
        getCellStyle(sheet, address)?.numberFormat,
        { locale, dateSystem: workbook.dateSystem },
      ).text;
      if (text) values.push(text);
    }
  }
  return values.join("\n");
}

export function applyUnmergeCellsCommand(
  workbook: Workbook,
  command: UnmergeCellsCommand,
): RestoreFullSheetStateCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previous = createSheetSparseState(sheet);
  const mergedCells = sheet.mergedCells.filter(
    (merged) => !doMergedCellRangesIntersect(merged, range),
  );
  if (mergedCells.length === sheet.mergedCells.length) return null;
  return validateCommandPayload("range", command.range, () =>
    replaceSheetSparseState(sheet, { ...previous, mergedCells }),
  )
    ? createRestore(command.sheetId, previous)
    : null;
}
