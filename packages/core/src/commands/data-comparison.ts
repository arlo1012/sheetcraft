import { getDuplicateValueKey } from "../duplicate-values.js";
import { isFormulaError, type FormulaValue } from "../formula/types.js";
import { serializeSheet } from "../serialization.js";
import { cloneCellStyle } from "../style.js";
import {
  createCellKey,
  createSheet,
  createWorkbookEvaluator,
  getCellStyle,
  setCellContent,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { IdFactory } from "../runtime.js";
import type { AddSheetCommand, SetCellContentsCommand } from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type DataComparisonSource = { sheetId: string; range: CellRange };
export type DataComparisonOptions = {
  source: DataComparisonSource;
  comparison?: DataComparisonSource;
  mode: "cells" | "rows";
  /** Zero-based offsets from the source range's first column. */
  columns?: number[];
  hasHeader: boolean;
  match: "duplicate" | "unique";
  side: "first" | "second" | "both";
};

export type DataComparisonMatch = {
  side: "first" | "second";
  sheetId: string;
  /** A cell match has one address; a row match contains every cell in the selected source row. */
  addresses: CellAddress[];
  values: FormulaValue[];
};

export type DataComparisonResult = {
  mode: DataComparisonOptions["mode"];
  matches: DataComparisonMatch[];
};

type NormalizedOptions = Omit<DataComparisonOptions, "source" | "comparison" | "columns"> & {
  source: { sheetId: string; range: CellRange };
  comparison?: { sheetId: string; range: CellRange };
  columns: number[];
};
type Scan = { values: Map<string, FormulaValue> };

const MAX_COMPARISON_CELLS = 100_000;

function key(address: CellAddress): string {
  return createCellKey(address);
}
function contains(range: CellRange, address: CellAddress): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}
function width(range: CellRange): number {
  return range.end.column - range.start.column + 1;
}
function cellCount(range: CellRange): number {
  return (range.end.row - range.start.row + 1) * width(range);
}

function normalizeSource(
  workbook: Workbook,
  value: unknown,
  field: string,
): { sheetId: string; range: CellRange } {
  if (!value || typeof value !== "object") throw invalidCommandPayload(field, value);
  const source = value as DataComparisonSource;
  if (typeof source.sheetId !== "string" || !source.sheetId)
    throw invalidCommandPayload(`${field}.sheetId`, source.sheetId);
  const range = normalizeRange(source.range);
  assertCellRange(range);
  getSheetOrThrow(workbook, source.sheetId);
  if (cellCount(range) > MAX_COMPARISON_CELLS)
    throw invalidCommandPayload("size", source.range, "Data comparison range is too large.");
  return { sheetId: source.sheetId, range };
}

function normalizeOptions(workbook: Workbook, options: DataComparisonOptions): NormalizedOptions {
  if (!options || typeof options !== "object") throw invalidCommandPayload("options", options);
  const source = normalizeSource(workbook, options.source, "sourceRange");
  const comparison =
    options.comparison === undefined
      ? undefined
      : normalizeSource(workbook, options.comparison, "comparisonRange");
  if (options.mode !== "cells" && options.mode !== "rows")
    throw invalidCommandPayload("mode", options.mode);
  if (typeof options.hasHeader !== "boolean")
    throw invalidCommandPayload("hasHeader", options.hasHeader);
  if (options.match !== "duplicate" && options.match !== "unique")
    throw invalidCommandPayload("match", options.match);
  if (options.side !== "first" && options.side !== "second" && options.side !== "both")
    throw invalidCommandPayload("side", options.side);
  if (!comparison && options.side !== "first" && options.side !== "both")
    throw invalidCommandPayload("side", options.side);
  if (comparison && options.mode === "rows" && width(source.range) !== width(comparison.range))
    throw invalidCommandPayload(
      "columns",
      options.comparison?.range,
      "Row comparison ranges must have the same width.",
    );
  const defaultColumns = Array.from({ length: width(source.range) }, (_, index) => index);
  const columns =
    options.mode === "cells"
      ? defaultColumns
      : options.columns === undefined
        ? defaultColumns
        : options.columns;
  if (
    options.mode === "rows" &&
    (!Array.isArray(columns) ||
      !columns.length ||
      columns.some(
        (column) => !Number.isInteger(column) || column < 0 || column >= width(source.range),
      ) ||
      new Set(columns).size !== columns.length)
  )
    throw invalidCommandPayload("columns", options.columns);
  return {
    source,
    comparison,
    mode: options.mode,
    columns: [...columns],
    hasHeader: options.hasHeader,
    match: options.match,
    side: options.side,
  };
}

/** Formula roots and spill projections are evaluated from the sparse sheet model. */
function scan(workbook: Workbook, source: { sheetId: string; range: CellRange }): Scan {
  const sheet = getSheetOrThrow(workbook, source.sheetId);
  const evaluator = createWorkbookEvaluator(workbook, source.sheetId);
  const values = new Map<string, FormulaValue>();
  for (const [cellKey, cell] of sheet.cells) {
    if (!cell.content) continue;
    const [row, column] = cellKey.split(":").map(Number) as [number, number];
    const address = { row, column };
    // Evaluate all formula roots so a root outside the range can project into it.
    if (cell.content.kind === "formula") evaluator.getComputedValue(address);
    if (contains(source.range, address)) values.set(cellKey, evaluator.getComputedValue(address));
  }
  for (const projection of evaluator.getSpillProjections?.() ?? []) {
    if (!contains(source.range, projection.address)) continue;
    const cellKey = key(projection.address);
    values.set(cellKey, projection.value);
  }
  return { values };
}

function getValue(scanResult: Scan, address: CellAddress): FormulaValue | null {
  return scanResult.values.get(key(address)) ?? null;
}
function recordKey(values: readonly FormulaValue[]): string | null {
  // In a multi-column key, blank fields are meaningful; only an entirely blank key row is omitted.
  const keys = values.map((value) => getDuplicateValueKey(value) ?? "blank");
  return JSON.stringify(keys);
}

function selectedSides(options: NormalizedOptions): Array<"first" | "second"> {
  if (!options.comparison) return ["first"];
  return options.side === "both" ? ["first", "second"] : [options.side];
}

/**
 * Returns all matching records in source order. Empty cells and rows whose selected
 * comparison key is entirely empty are omitted. For a single source, duplicate is
 * count > 1 and unique is count = 1; for two sources, it means present/absent in
 * the other source respectively.
 */
export function compareData(
  workbook: Workbook,
  input: DataComparisonOptions,
): DataComparisonResult {
  const options = normalizeOptions(workbook, input);
  const first = scan(workbook, options.source);
  const second = options.comparison ? scan(workbook, options.comparison) : undefined;
  const recordsFor = (
    source: { sheetId: string; range: CellRange },
    scanned: Scan,
    side: "first" | "second",
  ) => {
    const records: DataComparisonMatch[] = [];
    const startRow = source.range.start.row + (options.hasHeader ? 1 : 0);
    if (options.mode === "cells") {
      for (let row = startRow; row <= source.range.end.row; row += 1)
        for (
          let column = source.range.start.column;
          column <= source.range.end.column;
          column += 1
        ) {
          const address = { row, column };
          const value = getValue(scanned, address);
          const valueKey = getDuplicateValueKey(value);
          if (valueKey !== null)
            records.push({ side, sheetId: source.sheetId, addresses: [address], values: [value!] });
        }
    } else {
      for (let row = startRow; row <= source.range.end.row; row += 1) {
        const keyValues = options.columns.map((offset) =>
          getValue(scanned, { row, column: source.range.start.column + offset }),
        );
        if (keyValues.every((value) => getDuplicateValueKey(value) === null)) continue;
        const addresses = Array.from({ length: width(source.range) }, (_, offset) => ({
          row,
          column: source.range.start.column + offset,
        }));
        records.push({
          side,
          sheetId: source.sheetId,
          addresses,
          values: addresses.map((address) => getValue(scanned, address) ?? ""),
        });
      }
    }
    return records;
  };
  const firstRecords = recordsFor(options.source, first, "first");
  const secondRecords =
    options.comparison && second ? recordsFor(options.comparison, second, "second") : [];
  const recordsByKey = (records: readonly DataComparisonMatch[]) => {
    const result = new Map<string, number>();
    for (const record of records) {
      const recordKey = recordKeyFor(record, options);
      if (recordKey !== null) result.set(recordKey, (result.get(recordKey) ?? 0) + 1);
    }
    return result;
  };
  const recordKeyFor = (record: DataComparisonMatch, normalized: NormalizedOptions) =>
    normalized.mode === "cells"
      ? getDuplicateValueKey(record.values[0])
      : recordKey(normalized.columns.map((offset) => record.values[offset]!));
  const firstCounts = recordsByKey(firstRecords),
    secondCounts = recordsByKey(secondRecords);
  const matched = (
    record: DataComparisonMatch,
    own: Map<string, number>,
    other?: Map<string, number>,
  ) => {
    const recordKey = recordKeyFor(record, options);
    if (recordKey === null) return false;
    return other
      ? options.match === "duplicate"
        ? other.has(recordKey)
        : !other.has(recordKey)
      : options.match === "duplicate"
        ? (own.get(recordKey) ?? 0) > 1
        : (own.get(recordKey) ?? 0) === 1;
  };
  const matches: DataComparisonMatch[] = [];
  for (const side of selectedSides(options)) {
    const records = side === "first" ? firstRecords : secondRecords;
    const own = side === "first" ? firstCounts : secondCounts;
    const other = options.comparison ? (side === "first" ? secondCounts : firstCounts) : undefined;
    matches.push(...records.filter((record) => matched(record, own, other)));
  }
  return { mode: options.mode, matches };
}

function assertMarkable(workbook: Workbook, matches: readonly DataComparisonMatch[]): void {
  const spillKeysBySheet = new Map<string, Set<string>>();
  for (const match of matches) {
    const sheet = getSheetOrThrow(workbook, match.sheetId);
    if (sheet.properties.protected)
      throw invalidCommandPayload(
        "protected",
        match.sheetId,
        "Cannot mark cells on a protected sheet.",
      );
    let spillKeys = spillKeysBySheet.get(match.sheetId);
    if (!spillKeys) {
      const evaluator = createWorkbookEvaluator(workbook, match.sheetId);
      // Materialize possible spills before enumerating their projected coordinates.
      for (const [cellKey, cell] of sheet.cells)
        if (cell.content?.kind === "formula") {
          const [row, column] = cellKey.split(":").map(Number) as [number, number];
          evaluator.getComputedValue({ row, column });
        }
      spillKeys = new Set(
        [...(evaluator.getSpillProjections?.() ?? [])].map((projection) => key(projection.address)),
      );
      spillKeysBySheet.set(match.sheetId, spillKeys);
    }
    for (const address of match.addresses) {
      if (sheet.mergedCells.some((range) => contains(range, address)))
        throw invalidCommandPayload("merged", address, "Cannot mark a merged cell.");
      if (spillKeys.has(key(address)))
        throw invalidCommandPayload("spill", address, "Cannot mark a dynamic-array spill cell.");
    }
  }
}

/** Creates one atomic style command; cell contents and every non-fill style field are retained. */
export function createMarkDataComparisonCommand(
  workbook: Workbook,
  options: DataComparisonOptions,
  fillColor: string,
): SetCellContentsCommand {
  if (typeof fillColor !== "string") throw invalidCommandPayload("fillColor", fillColor);
  const result = compareData(workbook, options);
  if (!result.matches.length)
    throw invalidCommandPayload("empty", options, "Data comparison found no matching data.");
  assertMarkable(workbook, result.matches);
  const changes = new Map<string, SetCellContentsCommand["changes"][number]>();
  for (const match of result.matches) {
    const sheet = getSheetOrThrow(workbook, match.sheetId);
    for (const address of match.addresses) {
      const changeKey = `${match.sheetId}:${key(address)}`;
      if (!changes.has(changeKey)) {
        changes.set(changeKey, {
          sheetId: match.sheetId,
          address,
          content: sheet.cells.get(key(address))?.content ?? null,
          style: { ...cloneCellStyle(getCellStyle(sheet, address)), fillColor },
        });
      }
    }
  }
  return createBatchSetCellContentsCommand([...changes.values()]);
}

function outputContent(value: FormulaValue) {
  if (isFormulaError(value)) return { kind: "error" as const, error: value };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return { kind: "literal" as const, value };
  return { kind: "literal" as const, value: "" };
}
function uniqueSheetName(workbook: Workbook, requested: string): string {
  const base = requested.trim();
  if (!base) throw invalidCommandPayload("sheetName", requested);
  const names = new Set([...workbook.sheets.values()].map((sheet) => sheet.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} (${suffix})`.toLowerCase())) suffix += 1;
  return `${base} (${suffix})`;
}

export function createExtractDataComparisonCommand(
  workbook: Workbook,
  options: DataComparisonOptions,
  output: { idFactory: IdFactory; sheetName: string; valueLabel: string; sourceLabel?: string },
): AddSheetCommand {
  if (!output || typeof output.idFactory !== "function")
    throw invalidCommandPayload("idFactory", output?.idFactory);
  if (typeof output.valueLabel !== "string")
    throw invalidCommandPayload("valueLabel", output.valueLabel);
  const normalized = normalizeOptions(workbook, options);
  const result = compareData(workbook, normalized);
  if (!result.matches.length)
    throw invalidCommandPayload("empty", options, "Data comparison found no matching data.");
  const id = output.idFactory("sheet");
  if (typeof id !== "string" || !id.trim() || workbook.sheets.has(id))
    throw invalidCommandPayload("idFactory", id);
  const outputRows =
    result.matches.length + 1 + (normalized.mode === "rows" && normalized.hasHeader ? 1 : 0);
  if (outputRows > 1_048_576)
    throw invalidCommandPayload("empty", options, "Data comparison output is too large.");
  const sheet = createSheet(uniqueSheetName(workbook, output.sheetName), id);
  const includeSource = typeof output.sourceLabel === "string";
  let targetRow = 0;
  if (normalized.mode === "cells") {
    if (includeSource)
      setCellContent(
        sheet,
        { row: targetRow, column: 0 },
        { kind: "literal", value: output.sourceLabel! },
      );
    setCellContent(
      sheet,
      { row: targetRow++, column: includeSource ? 1 : 0 },
      { kind: "literal", value: output.valueLabel },
    );
  } else if (normalized.hasHeader) {
    const source =
      normalized.side === "second" && normalized.comparison
        ? normalized.comparison
        : normalized.source;
    const headerScan = scan(workbook, source);
    if (includeSource)
      setCellContent(
        sheet,
        { row: targetRow, column: 0 },
        { kind: "literal", value: output.sourceLabel! },
      );
    for (let offset = 0; offset < width(source.range); offset += 1) {
      const header = getValue(headerScan, {
        row: source.range.start.row,
        column: source.range.start.column + offset,
      });
      setCellContent(
        sheet,
        { row: targetRow, column: offset + (includeSource ? 1 : 0) },
        outputContent(header ?? ""),
      );
    }
    targetRow += 1;
  }
  for (const match of result.matches) {
    if (includeSource) {
      const name = getSheetOrThrow(workbook, match.sheetId).name;
      setCellContent(sheet, { row: targetRow, column: 0 }, { kind: "literal", value: name });
    }
    match.values.forEach((value, column) =>
      setCellContent(
        sheet,
        { row: targetRow, column: column + (includeSource ? 1 : 0) },
        outputContent(value),
      ),
    );
    targetRow += 1;
  }
  return {
    type: "addSheet",
    sheet: serializeSheet(sheet),
    index: workbook.sheets.size,
    activeSheetId: id,
  };
}
