import type { Sheet } from "@idea10/core/workbook";

type RowInterval = { start: number; end: number };

function mergedRowIntervals(sheet: Sheet): RowInterval[] {
  const intervals = sheet.mergedCells
    .map(({ start, end }) => ({ start: start.row, end: end.row }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: RowInterval[] = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end + 1) {
      merged.push(interval);
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
  }

  return merged;
}

/**
 * Returns Excel's one-based rows that can use its native wrapped-text AutoFit.
 * Explicit Core dimensions and every row touched by a merge remain fixed.
 */
export function getAutoFitRowNumbers(sheet: Sheet): ReadonlySet<number> {
  const candidates = new Set<number>();

  for (const [key, cell] of sheet.cells) {
    if (!cell.content || cell.content.kind === "image" || cell.style?.wrapText !== true) continue;
    const separator = key.indexOf(":");
    const row = Number(key.slice(0, separator));
    if (!Number.isInteger(row) || sheet.rowHeights.has(row) || sheet.hiddenRows?.has(row)) continue;
    candidates.add(row);
  }

  const rows = [...candidates].sort((left, right) => left - right);
  const merged = mergedRowIntervals(sheet);
  const autoFitRows = new Set<number>();
  let intervalIndex = 0;

  for (const row of rows) {
    let interval = merged[intervalIndex];
    while (interval && interval.end < row) {
      interval = merged[++intervalIndex];
    }
    if (interval && interval.start <= row) continue;
    autoFitRows.add(row + 1);
  }

  return autoFitRows;
}
