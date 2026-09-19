import { isFormulaError, type CellContent, type FormulaValue } from "../formula/types.js";
import {
  createCellKey,
  createWorkbookEvaluator,
  getCellContent,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellContentsCommand } from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type ConsolidateSource = { sheetId: string; range: CellRange };
export type ConsolidateFunction = "sum" | "count" | "average" | "min" | "max";
export type ConsolidateOptions = {
  sources: readonly ConsolidateSource[];
  destination: { sheetId: string; address: CellAddress };
  function: ConsolidateFunction;
  topRow: boolean;
  leftColumn: boolean;
  overwrite: boolean;
};
export type ConsolidatePreview = {
  rows: number;
  columns: number;
  sourceCells: number;
  outputCells: number;
  numericValues: number;
  sample: Array<Array<string | number | boolean>>;
};

type Source = { sheetId: string; range: CellRange };
type Normalized = Omit<ConsolidateOptions, "sources" | "destination"> & {
  sources: Source[];
  destination: { sheetId: string; address: CellAddress };
};
type Aggregate = { count: number; sum: number; min: number; max: number; seen: boolean };
type Plan = {
  options: Normalized;
  changes: SetCellContentsCommand["changes"];
  preview: ConsolidatePreview;
};

const MAX_CONSOLIDATE_CELLS = 100_000;

function rangeSize(range: CellRange): number {
  return (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
}
function intersects(left: CellRange, right: CellRange): boolean {
  return !(
    left.end.row < right.start.row ||
    left.start.row > right.end.row ||
    left.end.column < right.start.column ||
    left.start.column > right.end.column
  );
}
function text(value: FormulaValue): string {
  if (value === null) return "";
  if (isFormulaError(value)) return `#${value.code}!`;
  return String(value);
}
function literal(value: FormulaValue): CellContent {
  if (isFormulaError(value)) return { kind: "error", error: value };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return { kind: "literal", value };
  return { kind: "literal", value: "" };
}
function labelKey(value: FormulaValue): string {
  if (value === null) return "null";
  if (isFormulaError(value)) return `error:${value.code}`;
  return `${typeof value}:${String(value)}`;
}
function normalize(workbook: Workbook, input: ConsolidateOptions): Normalized {
  if (!input || typeof input !== "object") throw invalidCommandPayload("options", input);
  if (!Array.isArray(input.sources) || !input.sources.length)
    throw invalidCommandPayload("sources", input.sources);
  if (input.sources.length > 256)
    throw invalidCommandPayload("sources", input.sources, "Too many consolidation sources.");
  let sourceCells = 0;
  const sources = input.sources.map((source, index) => {
    if (!source || typeof source !== "object" || typeof source.sheetId !== "string")
      throw invalidCommandPayload(`sources.${index}`, source);
    const range = normalizeRange(source.range);
    assertCellRange(range);
    const sheet = getSheetOrThrow(workbook, source.sheetId);
    if (sheet.mergedCells.some((merged) => intersects(merged, range)))
      throw invalidCommandPayload("merged", source.range);
    sourceCells += rangeSize(range);
    return { sheetId: source.sheetId, range };
  });
  if (sourceCells > MAX_CONSOLIDATE_CELLS)
    throw invalidCommandPayload("size", input.sources, "Consolidation sources are too large.");
  if (
    !input.destination ||
    typeof input.destination !== "object" ||
    typeof input.destination.sheetId !== "string"
  )
    throw invalidCommandPayload("destination", input.destination);
  assertCellAddress(input.destination.address);
  getSheetOrThrow(workbook, input.destination.sheetId);
  if (!["sum", "count", "average", "min", "max"].includes(input.function))
    throw invalidCommandPayload("function", input.function);
  if (
    typeof input.topRow !== "boolean" ||
    typeof input.leftColumn !== "boolean" ||
    typeof input.overwrite !== "boolean"
  )
    throw invalidCommandPayload("options", input);
  return {
    sources,
    destination: { sheetId: input.destination.sheetId, address: { ...input.destination.address } },
    function: input.function,
    topRow: input.topRow,
    leftColumn: input.leftColumn,
    overwrite: input.overwrite,
  };
}

function plan(workbook: Workbook, input: ConsolidateOptions): Plan {
  const options = normalize(workbook, input);
  const columnLabels: Array<{ key: string; value: FormulaValue }> = [];
  const rowLabels: Array<{ key: string; value: FormulaValue }> = [];
  const columnIndex = new Map<string, number>();
  const rowIndex = new Map<string, number>();
  const values = new Map<string, FormulaValue[][]>();
  let maxRows = 0;
  let maxColumns = 0;
  for (const source of options.sources) {
    const sourceSheet = getSheetOrThrow(workbook, source.sheetId);
    const evaluator = createWorkbookEvaluator(workbook, source.sheetId);
    // Register projections whose formula root lies outside the selected range.
    for (const [cellKey, cell] of sourceSheet.cells)
      if (cell.content?.kind === "formula") {
        const [row, column] = cellKey.split(":").map(Number) as [number, number];
        evaluator.getComputedValue({ row, column });
      }
    const rows = source.range.end.row - source.range.start.row + 1;
    const columns = source.range.end.column - source.range.start.column + 1;
    const grid = Array.from({ length: rows }, (_, rowOffset) =>
      Array.from({ length: columns }, (_, columnOffset) =>
        evaluator.getComputedValue({
          row: source.range.start.row + rowOffset,
          column: source.range.start.column + columnOffset,
        }),
      ),
    );
    values.set(
      `${source.sheetId}:${createCellKey(source.range.start)}:${createCellKey(source.range.end)}`,
      grid,
    );
    const dataRows = Math.max(0, rows - Number(options.topRow));
    const dataColumns = Math.max(0, columns - Number(options.leftColumn));
    maxRows = Math.max(maxRows, dataRows);
    maxColumns = Math.max(maxColumns, dataColumns);
    if (options.topRow)
      for (let column = Number(options.leftColumn); column < columns; column += 1) {
        const value = grid[0]?.[column] ?? null;
        const label = labelKey(value);
        if (!columnIndex.has(label)) {
          columnIndex.set(label, columnLabels.length);
          columnLabels.push({ key: label, value });
        }
      }
    if (options.leftColumn)
      for (let row = Number(options.topRow); row < rows; row += 1) {
        const value = grid[row]?.[0] ?? null;
        const label = labelKey(value);
        if (!rowIndex.has(label)) {
          rowIndex.set(label, rowLabels.length);
          rowLabels.push({ key: label, value });
        }
      }
  }
  const dataRows = options.leftColumn ? rowLabels.length : maxRows;
  const dataColumns = options.topRow ? columnLabels.length : maxColumns;
  const outputRows = dataRows + Number(options.topRow);
  const outputColumns = dataColumns + Number(options.leftColumn);
  if (!outputRows || !outputColumns)
    throw invalidCommandPayload("empty", input, "Consolidation has no output cells.");
  if (outputRows * outputColumns > MAX_CONSOLIDATE_CELLS)
    throw invalidCommandPayload("size", input, "Consolidation output is too large.");
  const end = {
    row: options.destination.address.row + outputRows - 1,
    column: options.destination.address.column + outputColumns - 1,
  };
  if (end.row >= MAX_SHEET_ROWS || end.column >= MAX_SHEET_COLUMNS)
    throw invalidCommandPayload("bounds", end);
  const target = getSheetOrThrow(workbook, options.destination.sheetId);
  if (target.properties.protected) throw invalidCommandPayload("protected", target.id);
  const outputRange = { start: options.destination.address, end };
  if (target.mergedCells.some((merged) => intersects(merged, outputRange)))
    throw invalidCommandPayload("merged", outputRange);
  const targetEvaluator = createWorkbookEvaluator(workbook, target.id);
  for (const [cellKey, cell] of target.cells)
    if (cell.content?.kind === "formula") {
      const [row, column] = cellKey.split(":").map(Number) as [number, number];
      targetEvaluator.getComputedValue({ row, column });
    }
  const spills = new Set(
    [...(targetEvaluator.getSpillProjections?.() ?? [])].map((projection) =>
      createCellKey(projection.address),
    ),
  );
  const aggregates = new Map<string, Aggregate>();
  let numericValues = 0;
  for (const source of options.sources) {
    const grid = values.get(
      `${source.sheetId}:${createCellKey(source.range.start)}:${createCellKey(source.range.end)}`,
    )!;
    for (let sourceRow = Number(options.topRow); sourceRow < grid.length; sourceRow += 1)
      for (
        let sourceColumn = Number(options.leftColumn);
        sourceColumn < (grid[sourceRow]?.length ?? 0);
        sourceColumn += 1
      ) {
        const value = grid[sourceRow]![sourceColumn]!;
        const outRow = options.leftColumn
          ? rowIndex.get(labelKey(grid[sourceRow]![0]!))!
          : sourceRow - Number(options.topRow);
        const outColumn = options.topRow
          ? columnIndex.get(labelKey(grid[0]?.[sourceColumn] ?? null))!
          : sourceColumn - Number(options.leftColumn);
        const key = `${outRow}:${outColumn}`;
        const aggregate = aggregates.get(key) ?? {
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
          seen: false,
        };
        if (value !== null) aggregate.seen = true;
        if (typeof value === "number" && Number.isFinite(value)) {
          aggregate.count += 1;
          aggregate.sum += value;
          aggregate.min = Math.min(aggregate.min, value);
          aggregate.max = Math.max(aggregate.max, value);
          numericValues += 1;
        }
        aggregates.set(key, aggregate);
      }
  }
  const changes: SetCellContentsCommand["changes"] = [];
  const matrix: Array<Array<string | number | boolean>> = Array.from({ length: outputRows }, () =>
    Array.from({ length: outputColumns }, () => ""),
  );
  const written = new Set<string>();
  const add = (row: number, column: number, value: FormulaValue | undefined) => {
    const address = {
      row: options.destination.address.row + row,
      column: options.destination.address.column + column,
    };
    if (spills.has(createCellKey(address))) throw invalidCommandPayload("spill", address);
    if (!options.overwrite && getCellContent(target, address))
      throw invalidCommandPayload("overwrite", address);
    changes.push({
      sheetId: target.id,
      address,
      content: value === undefined ? null : literal(value),
    });
    written.add(`${row}:${column}`);
    matrix[row]![column] =
      value === undefined
        ? ""
        : isFormulaError(value)
          ? text(value)
          : ((value ?? "") as string | number | boolean);
  };
  if (options.topRow)
    for (let column = 0; column < columnLabels.length; column += 1)
      add(0, column + Number(options.leftColumn), columnLabels[column]!.value);
  if (options.leftColumn)
    for (let row = 0; row < rowLabels.length; row += 1)
      add(row + Number(options.topRow), 0, rowLabels[row]!.value);
  for (const [key, aggregate] of aggregates) {
    if (!aggregate.seen) continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    const value =
      options.function === "count"
        ? aggregate.count
        : aggregate.count === 0
          ? null
          : options.function === "sum"
            ? aggregate.sum
            : options.function === "average"
              ? aggregate.sum / aggregate.count
              : options.function === "min"
                ? aggregate.min
                : aggregate.max;
    if (value !== null)
      add(row + Number(options.topRow), column + Number(options.leftColumn), value);
  }
  // A consolidation owns its whole result rectangle. Clearing empty positions avoids stale output
  // from an earlier result while retaining any destination formatting.
  for (let row = 0; row < outputRows; row += 1)
    for (let column = 0; column < outputColumns; column += 1)
      if (!written.has(`${row}:${column}`)) add(row, column, undefined);
  return {
    options,
    changes,
    preview: {
      rows: outputRows,
      columns: outputColumns,
      sourceCells: options.sources.reduce((total, source) => total + rangeSize(source.range), 0),
      outputCells: changes.length,
      numericValues,
      sample: matrix.slice(0, 5).map((row) => row.slice(0, 5)),
    },
  };
}

/** Calculates a multi-range consolidation before any workbook state is changed. */
export function analyzeConsolidate(
  workbook: Workbook,
  options: ConsolidateOptions,
): ConsolidatePreview {
  return plan(workbook, options).preview;
}

/** Returns one atomic batch write; all source values are read before destination cells change. */
export function createConsolidateCommand(
  workbook: Workbook,
  options: ConsolidateOptions,
): SetCellContentsCommand {
  const result = plan(workbook, options);
  if (!result.changes.length)
    throw invalidCommandPayload("empty", options, "Consolidation produced no values.");
  return createBatchSetCellContentsCommand(result.changes);
}
