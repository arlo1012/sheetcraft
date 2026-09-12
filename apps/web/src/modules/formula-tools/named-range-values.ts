import { isFormulaError, type FormulaValue } from "@idea10/core/formula";
import { formatComputedValueForDisplay } from "@idea10/core/input";
import type { CellAddress, CellRange, Sheet, SheetEvaluator } from "@idea10/core/workbook";

const MAX_PREVIEW_CELLS = 24;
const MAX_PREVIEW_TEXT = 200;

function formatValue(value: FormulaValue): string {
  if (typeof value === "string") return `"${value.replaceAll('"', '""')}"`;
  return value === null ? "0" : formatComputedValueForDisplay(value);
}

/** Names hold ranges; the value column is a computed preview, never persisted metadata. */
export function getNamedRangeValue(
  sheet: Sheet | undefined,
  range: CellRange,
  evaluator: SheetEvaluator | undefined,
): { value: string; hasError: boolean } {
  if (!sheet) return { value: "#REF!", hasError: true };
  if (!evaluator) return { value: "{...}", hasError: false };
  const rowCount = range.end.row - range.start.row + 1;
  const columnCount = range.end.column - range.start.column + 1;
  const inside = (address: CellAddress) =>
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column;
  let hasError = false;
  if (rowCount * columnCount <= MAX_PREVIEW_CELLS) {
    const rows: string[] = [];
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      const cells: string[] = [];
      for (let column = range.start.column; column <= range.end.column; column += 1) {
        const value = evaluator.getComputedValue({ row, column });
        hasError ||= isFormulaError(value);
        cells.push(formatValue(value));
      }
      rows.push(cells.join(","));
    }
    const value = rowCount * columnCount === 1 ? rows[0]! : `{${rows.join(";")}}`;
    return {
      value: value.length > MAX_PREVIEW_TEXT ? `${value.slice(0, MAX_PREVIEW_TEXT)}…` : value,
      hasError,
    };
  }
  // Scan stored cells and spill results instead of iterating potentially entire columns.
  for (const [key, cell] of sheet.cells) {
    const [row, column] = key.split(":").map(Number) as [number, number];
    const address = { row, column };
    if (inside(address)) {
      if (isFormulaError(evaluator.getComputedValue(address))) {
        hasError = true;
        break;
      }
    } else if (
      cell.content?.kind === "formula" &&
      row <= range.end.row &&
      column <= range.end.column
    ) {
      // A spill root outside the range can project errors into it.
      evaluator.getComputedValue(address);
    }
  }
  if (!hasError) {
    for (const projection of evaluator.getSpillProjections?.() ?? []) {
      if (inside(projection.address) && isFormulaError(projection.value)) {
        hasError = true;
        break;
      }
    }
  }
  return { value: "{...}", hasError };
}
