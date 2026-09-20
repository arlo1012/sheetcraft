import { doMergedCellRangesIntersect } from "../merged-cells.js";
import {
  createWorkbookEvaluator,
  getCellContent,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellContentsCommand } from "./contracts.js";
import { DataFillError, MAX_FILL_CELLS, prepareFillTarget } from "./fill-common.js";
import { getSheetOrThrow, normalizeRange } from "./helpers.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type FillNumberSequenceOptions = {
  axis: "rows" | "columns";
  start: number;
  step: number;
};

export type FillRankOptions = {
  source: { sheetId: string; range: CellRange };
  target: { sheetId: string; start: CellAddress };
  order: "ascending" | "descending";
  ties: "competition" | "dense" | "ordinal";
  overwrite: boolean;
};

const count = (range: CellRange) =>
  (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);

function validateNumberSequenceOptions(options: FillNumberSequenceOptions): void {
  if (
    !options ||
    (options.axis !== "rows" && options.axis !== "columns") ||
    !Number.isFinite(options.start) ||
    !Number.isFinite(options.step)
  )
    throw new DataFillError("invalidOptions", "The number sequence options are invalid.");
}

/** Fills every selected cell as one sequential numeric series, retaining its existing style. */
export function createFillNumberSequenceCommand(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
  options: FillNumberSequenceOptions,
): SetCellContentsCommand {
  validateNumberSequenceOptions(options);
  const { range } = prepareFillTarget(workbook, sheetId, input);
  const changes: SetCellContentsCommand["changes"] = [];
  let index = 0;
  const rows = Array.from(
    { length: range.end.row - range.start.row + 1 },
    (_, offset) => range.start.row + offset,
  );
  const columns = Array.from(
    { length: range.end.column - range.start.column + 1 },
    (_, offset) => range.start.column + offset,
  );
  const outer = options.axis === "rows" ? rows : columns;
  const inner = options.axis === "rows" ? columns : rows;
  for (const first of outer)
    for (const second of inner) {
      const value = options.start + options.step * index++;
      if (!Number.isFinite(value))
        throw new DataFillError("invalidSeed", "The number sequence produced an invalid value.");
      changes.push({
        sheetId,
        address:
          options.axis === "rows" ? { row: first, column: second } : { row: second, column: first },
        content: { kind: "literal", value },
      });
    }
  return createBatchSetCellContentsCommand(changes);
}

function prepareRankSource(workbook: Workbook, input: FillRankOptions["source"]) {
  let range: CellRange;
  try {
    range = normalizeRange(input?.range);
  } catch {
    throw new DataFillError("invalidRange", "The ranking source range is invalid.");
  }
  if (
    !input ||
    typeof input.sheetId !== "string" ||
    !isCellAddressInBounds(range.start) ||
    !isCellAddressInBounds(range.end)
  )
    throw new DataFillError("invalidRange", "The ranking source range is outside the sheet.");
  if (count(range) > MAX_FILL_CELLS)
    throw new DataFillError("tooLarge", `A fill can change at most ${MAX_FILL_CELLS} cells.`);
  if (range.start.row !== range.end.row && range.start.column !== range.end.column)
    throw new DataFillError("invalidRange", "The ranking source must be one row or one column.");
  const sheet = getSheetOrThrow(workbook, input.sheetId);
  if (sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, range)))
    throw new DataFillError("mergedCells", "Cannot rank cells across merged cells.");
  const evaluator = createWorkbookEvaluator(workbook, input.sheetId);
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "formula") continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    evaluator.getComputedValue({ row, column });
  }
  if (
    [...(evaluator.getSpillProjections?.() ?? [])].some(
      ({ address }) =>
        address.row >= range.start.row &&
        address.row <= range.end.row &&
        address.column >= range.start.column &&
        address.column <= range.end.column,
    )
  )
    throw new DataFillError("spillCells", "Cannot rank dynamic-array spill cells.");
  return { sheet, range, evaluator };
}

function rankValues(
  values: readonly (number | null)[],
  order: FillRankOptions["order"],
  ties: FillRankOptions["ties"],
): Array<number | null> {
  const samples = values
    .map((value, index) => ({ value, index }))
    .filter((sample): sample is { value: number; index: number } => sample.value !== null)
    .sort((left, right) => {
      const difference =
        order === "ascending" ? left.value - right.value : right.value - left.value;
      return difference || left.index - right.index;
    });
  if (!samples.length)
    throw new DataFillError("invalidSeed", "Ranking requires at least one numeric value.");
  const ranks = Array<number | null>(values.length).fill(null);
  let previous: number | undefined;
  let rank = 0;
  let denseRank = 0;
  for (let sortedIndex = 0; sortedIndex < samples.length; sortedIndex++) {
    const sample = samples[sortedIndex]!;
    if (ties === "ordinal") rank = sortedIndex + 1;
    else if (sample.value !== previous) {
      rank = ties === "competition" ? sortedIndex + 1 : ++denseRank;
      previous = sample.value;
    }
    ranks[sample.index] = rank;
  }
  return ranks;
}

/** Ranks a one-dimensional snapshot into an equally sized horizontal or vertical target. */
export function createFillRankCommand(
  workbook: Workbook,
  options: FillRankOptions,
): SetCellContentsCommand {
  if (
    !options ||
    !["ascending", "descending"].includes(options.order) ||
    !["competition", "dense", "ordinal"].includes(options.ties) ||
    typeof options.overwrite !== "boolean" ||
    !options.target ||
    typeof options.target.sheetId !== "string" ||
    !isCellAddressInBounds(options.target.start)
  )
    throw new DataFillError("invalidOptions", "The ranking options are invalid.");
  const source = prepareRankSource(workbook, options.source);
  // A one-cell source uses the vertical orientation.
  const horizontal = source.range.start.column !== source.range.end.column;
  const length = count(source.range);
  const targetRange: CellRange = {
    start: { ...options.target.start },
    end: horizontal
      ? { row: options.target.start.row, column: options.target.start.column + length - 1 }
      : { row: options.target.start.row + length - 1, column: options.target.start.column },
  };
  if (!isCellAddressInBounds(targetRange.end))
    throw new DataFillError("invalidRange", "The ranking target is outside the sheet.");
  const target = prepareFillTarget(workbook, options.target.sheetId, targetRange);
  const values: Array<number | null> = [];
  for (let index = 0; index < length; index++) {
    const address = horizontal
      ? { row: source.range.start.row, column: source.range.start.column + index }
      : { row: source.range.start.row + index, column: source.range.start.column };
    const value = source.evaluator.getComputedValue(address);
    values.push(typeof value === "number" && Number.isFinite(value) ? value : null);
  }
  const ranks = rankValues(values, options.order, options.ties);
  if (!options.overwrite)
    for (let index = 0; index < length; index++) {
      const address = horizontal
        ? { row: target.range.start.row, column: target.range.start.column + index }
        : { row: target.range.start.row + index, column: target.range.start.column };
      if (getCellContent(target.sheet, address) !== null)
        throw new DataFillError("targetOccupied", "Ranking target cells already contain data.");
    }
  return createBatchSetCellContentsCommand(
    ranks.map((rank, index) => ({
      sheetId: options.target.sheetId,
      address: horizontal
        ? { row: target.range.start.row, column: target.range.start.column + index }
        : { row: target.range.start.row + index, column: target.range.start.column },
      content: rank === null ? null : { kind: "literal" as const, value: rank },
    })),
  );
}
