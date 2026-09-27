import { createSheetFilterHiddenRowIntervals } from "./filter.js";
import { doMergedCellRangesIntersect } from "../merged-cells.js";
import {
  createWorkbookEvaluator,
  isCellAddressInBounds,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import { getSheetOrThrow, normalizeRange } from "./helpers.js";

export const MAX_FILL_CELLS = 100_000;

export type DataFillErrorReason =
  | "flashFillRange"
  | "flashFillExamples"
  | "flashFillSource"
  | "flashFillPattern"
  | "flashFillAmbiguous"
  | "flashFillTooComplex"
  | "validation"
  | "invalidRange"
  | "tooLarge"
  | "protected"
  | "mergedCells"
  | "spillCells"
  | "hiddenCells"
  | "invalidOptions"
  | "invalidSeed"
  | "targetOccupied"
  | "emptyResult";

export class DataFillError extends Error {
  constructor(
    readonly reason: DataFillErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "DataFillError";
  }
}

function inRange(address: { row: number; column: number }, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

/** Performs the shared preflight before commands build their complete change set. */
export function prepareFillTarget(workbook: Workbook, sheetId: string, input: CellRange) {
  let range: CellRange;
  try {
    range = normalizeRange(input);
  } catch {
    throw new DataFillError("invalidRange", "The fill range is invalid.");
  }
  if (!isCellAddressInBounds(range.start) || !isCellAddressInBounds(range.end))
    throw new DataFillError("invalidRange", "The fill range is outside the sheet.");
  const count = (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
  if (count > MAX_FILL_CELLS)
    throw new DataFillError("tooLarge", `A fill can change at most ${MAX_FILL_CELLS} cells.`);

  const sheet = getSheetOrThrow(workbook, sheetId);
  if (sheet.properties.protected)
    throw new DataFillError("protected", "Cannot fill cells on a protected sheet.");
  if (sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, range)))
    throw new DataFillError("mergedCells", "Cannot fill across merged cells.");
  if (
    [...(sheet.hiddenRows ?? [])].some((row) => row >= range.start.row && row <= range.end.row) ||
    [...(sheet.hiddenColumns ?? [])].some(
      (column) => column >= range.start.column && column <= range.end.column,
    ) ||
    createSheetFilterHiddenRowIntervals(sheet).some(
      (hidden) => hidden.start <= range.end.row && hidden.end >= range.start.row,
    )
  )
    throw new DataFillError("hiddenCells", "Cannot fill hidden or filtered cells.");

  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  // Populate dynamic-array projections before checking the target coordinates.
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "formula") continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    evaluator.getComputedValue({ row, column });
  }
  if ([...(evaluator.getSpillProjections?.() ?? [])].some((item) => inRange(item.address, range)))
    throw new DataFillError("spillCells", "Cannot fill a dynamic-array spill cell.");
  return { sheet, range, evaluator };
}
