import { formatCellNumberValue } from "../number-format.js";
import { FlashFillPatternError, inferFlashFill } from "../flash-fill.js";
import {
  getCellContent,
  getCellStyle,
  isCellAddressInBounds,
  MAX_SHEET_COLUMNS,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellContentsCommand } from "./contracts.js";
import { DataFillError, MAX_FILL_CELLS, prepareFillTarget } from "./fill-common.js";
import { getSheetOrThrow, normalizeRange, parseCellKey } from "./helpers.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type FlashFillOptions = { locale?: string; anchor?: CellAddress };

/** Infers text transformations from literal examples in one destination column. */
export function createFlashFillCommand(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
  options: FlashFillOptions = {},
): SetCellContentsCommand {
  const selection = normalizeRange(input);
  if (
    !isCellAddressInBounds(selection.start) ||
    !isCellAddressInBounds(selection.end) ||
    selection.start.column !== selection.end.column
  )
    throw new DataFillError("flashFillRange", "Flash Fill requires one destination column.");
  const sheet = getSheetOrThrow(workbook, sheetId);
  const column = selection.start.column;
  const single = selection.start.row === selection.end.row;
  const anchor = options.anchor ?? selection.start;
  if (
    !isCellAddressInBounds(anchor) ||
    anchor.column !== column ||
    anchor.row < selection.start.row ||
    anchor.row > selection.end.row
  )
    throw new DataFillError("flashFillRange", "The active cell must be inside the target.");
  if (!single && selection.end.row - selection.start.row + 1 > MAX_FILL_CELLS)
    throw new DataFillError("tooLarge", "Select a bounded data range for Flash Fill.");

  const nearby = new Map<number, Set<number>>();
  const examples = new Set<number>();
  for (const [key, cell] of sheet.cells) {
    const content = cell.content;
    if (!content || (content.kind === "literal" && content.value === "")) continue;
    const address = parseCellKey(key);
    if (address.column === column) {
      if (content.kind === "literal") examples.add(address.row);
    } else if (Math.abs(address.column - column) <= 8) {
      const rows = nearby.get(address.column) ?? new Set<number>();
      rows.add(address.row);
      nearby.set(address.column, rows);
    }
  }

  // Explicit selections use only their own examples; one cell starts at its
  // example, or the nearest example above it, leaving earlier header rows alone.
  const seedRow = single
    ? anchor.row
    : ([...examples]
        .filter((row) => row >= selection.start.row && row <= selection.end.row)
        .sort((left, right) => left - right)[0] ?? selection.start.row);
  const hasNearbyRow = (source: number) => {
    const rows = nearby.get(source);
    return Boolean(rows?.has(seedRow) || (single && rows?.has(seedRow - 1)));
  };
  const columns: number[] = [];
  for (const direction of [-1, 1]) {
    for (let distance = 1; distance <= 8 && columns.length < 8; distance++) {
      const source = column + direction * distance;
      if (source < 0 || source >= MAX_SHEET_COLUMNS || !hasNearbyRow(source)) break;
      columns.push(source);
    }
  }
  if (!columns.length)
    throw new DataFillError("flashFillSource", "Flash Fill needs adjacent source data.");
  columns.sort((left, right) => left - right);
  const hasSourceRow = (row: number) => columns.some((source) => nearby.get(source)!.has(row));
  let range = selection;
  if (single) {
    const seed = hasSourceRow(seedRow) ? seedRow : seedRow - 1;
    if (seed < 0 || !hasSourceRow(seed))
      throw new DataFillError("flashFillSource", "No source data beside the active cell.");
    let top = seed;
    let bottom = seed;
    while (top > 0 && hasSourceRow(top - 1)) {
      if (bottom - top + 2 > MAX_FILL_CELLS)
        throw new DataFillError("tooLarge", "The source region exceeds the fill limit.");
      top--;
    }
    while (hasSourceRow(bottom + 1)) {
      if (bottom - top + 2 > MAX_FILL_CELLS)
        throw new DataFillError("tooLarge", "The source region exceeds the fill limit.");
      bottom++;
    }
    const regionExamples = [...examples]
      .filter((row) => row >= top && row <= bottom)
      .sort((left, right) => left - right);
    const first = regionExamples.filter((row) => row <= anchor.row).at(-1) ?? regionExamples[0];
    if (first === undefined)
      throw new DataFillError("flashFillExamples", "Enter an example in the destination column.");
    range = { start: { row: first, column }, end: { row: bottom, column } };
  }
  const prepared = prepareFillTarget(workbook, sheetId, range);
  const evaluator = prepared.evaluator;
  const textAt = (row: number, source: number): string => {
    const address = { row, column: source };
    const value = evaluator.getComputedValue(address);
    if (typeof value === "object" && value !== null)
      throw new DataFillError(
        "flashFillPattern",
        "Source cells must contain text or simple values.",
      );
    return formatCellNumberValue(value, getCellStyle(sheet, address)?.numberFormat, {
      dateSystem: workbook.dateSystem,
      ...(options.locale ? { locale: options.locale } : {}),
    }).text;
  };
  const samples: Array<{ inputs: string[]; output: string }> = [];
  const pending: Array<{ row: number; inputs: string[] }> = [];
  for (let row = prepared.range.start.row; row <= prepared.range.end.row; row++) {
    if (!hasSourceRow(row)) continue;
    const content = getCellContent(sheet, { row, column });
    const blank = content === null || (content.kind === "literal" && content.value === "");
    if (!blank && content?.kind !== "literal") continue;
    const inputs = columns.map((source) => textAt(row, source));
    if (blank) pending.push({ row, inputs });
    else samples.push({ inputs, output: textAt(row, column) });
  }
  if (!samples.length)
    throw new DataFillError("flashFillExamples", "Enter at least one literal example.");
  if (!pending.length) return createBatchSetCellContentsCommand([]);
  let values: string[];
  try {
    values = inferFlashFill(
      samples,
      pending.map((item) => item.inputs),
    );
  } catch (error) {
    if (!(error instanceof FlashFillPatternError)) throw error;
    throw new DataFillError(
      error.reason === "ambiguous"
        ? "flashFillAmbiguous"
        : error.reason === "tooComplex"
          ? "flashFillTooComplex"
          : "flashFillPattern",
      error.message,
    );
  }
  return createBatchSetCellContentsCommand(
    pending.flatMap(({ row }, index) => {
      const value = values[index];
      return value === undefined || value === ""
        ? []
        : [
            {
              sheetId,
              address: { row, column },
              content: { kind: "literal" as const, value },
            },
          ];
    }),
  );
}
