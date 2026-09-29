import {
  cloneConditionalFormatRule,
  mapConditionalFormatFormulas,
  type SheetConditionalFormatRule,
} from "./conditional-formatting.js";
import { translateFormulaForCopy } from "./formula/references.js";
import type { CellRange } from "./workbook.js";

function intersection(a: CellRange, b: CellRange): CellRange | undefined {
  const start = {
    row: Math.max(a.start.row, b.start.row),
    column: Math.max(a.start.column, b.start.column),
  };
  const end = { row: Math.min(a.end.row, b.end.row), column: Math.min(a.end.column, b.end.column) };
  return start.row <= end.row && start.column <= end.column ? { start, end } : undefined;
}

/** Subtracts a rectangle without changing rule origins or cells outside it. */
export function subtractConditionalFormatRange(range: CellRange, cut: CellRange): CellRange[] {
  const overlap = intersection(range, cut);
  if (!overlap) return [{ start: { ...range.start }, end: { ...range.end } }];
  const parts: CellRange[] = [];
  if (range.start.row < overlap.start.row)
    parts.push({
      start: { ...range.start },
      end: { row: overlap.start.row - 1, column: range.end.column },
    });
  if (overlap.end.row < range.end.row)
    parts.push({
      start: { row: overlap.end.row + 1, column: range.start.column },
      end: { ...range.end },
    });
  if (range.start.column < overlap.start.column)
    parts.push({
      start: { row: overlap.start.row, column: range.start.column },
      end: { row: overlap.end.row, column: overlap.start.column - 1 },
    });
  if (overlap.end.column < range.end.column)
    parts.push({
      start: { row: overlap.start.row, column: overlap.end.column + 1 },
      end: { row: overlap.end.row, column: range.end.column },
    });
  return parts;
}

export function clearConditionalFormatRanges(
  rules: readonly SheetConditionalFormatRule[],
  cuts: readonly CellRange[],
): SheetConditionalFormatRule[] {
  return rules.flatMap((rule) => {
    let ranges = rule.ranges;
    for (const cut of cuts)
      ranges = ranges.flatMap((range) => subtractConditionalFormatRange(range, cut));
    return ranges.length ? [{ ...cloneConditionalFormatRule(rule), ranges }] : [];
  });
}

/** Copies the rule templates captured with a clipboard, including tiled and filtered rows. */
export function copyConditionalFormatRules(
  rules: readonly SheetConditionalFormatRule[],
  source: CellRange,
  destination: CellRange,
  options: {
    sourceRows?: readonly number[];
    destinationRows?: readonly number[];
    existingIds?: readonly string[];
  } = {},
): SheetConditionalFormatRule[] {
  const sourceRows =
    options.sourceRows ??
    Array.from(
      { length: source.end.row - source.start.row + 1 },
      (_, index) => source.start.row + index,
    );
  const destinationRows =
    options.destinationRows ??
    Array.from(
      { length: destination.end.row - destination.start.row + 1 },
      (_, index) => destination.start.row + index,
    );
  const width = source.end.column - source.start.column + 1;
  const ids = new Set(options.existingIds ?? []);
  if (!sourceRows.length || !destinationRows.length || width < 1) return [];
  return rules.flatMap((rule) => {
    const ranges: CellRange[] = [];
    for (let rowIndex = 0; rowIndex < destinationRows.length; rowIndex++) {
      const sourceRow = sourceRows[rowIndex % sourceRows.length]!;
      const targetRow = destinationRows[rowIndex]!;
      for (
        let column = destination.start.column;
        column <= destination.end.column;
        column += width
      ) {
        for (const range of rule.ranges) {
          const part = intersection(range, {
            start: { row: sourceRow, column: source.start.column },
            end: { row: sourceRow, column: source.end.column },
          });
          if (!part) continue;
          const startColumn = column + part.start.column - source.start.column;
          const endColumn = Math.min(
            destination.end.column,
            column + part.end.column - source.start.column,
          );
          if (startColumn > endColumn) continue;
          const previous = ranges.at(-1);
          if (
            previous &&
            previous.end.row + 1 === targetRow &&
            previous.start.column === startColumn &&
            previous.end.column === endColumn
          )
            previous.end.row = targetRow;
          else
            ranges.push({
              start: { row: targetRow, column: startColumn },
              end: { row: targetRow, column: endColumn },
            });
        }
      }
    }
    if (!ranges.length) return [];
    let index = 1;
    let id = `${rule.id}-copy-${index}`;
    while (ids.has(id)) id = `${rule.id}-copy-${++index}`;
    ids.add(id);
    const anchor = { ...ranges[0]!.start };
    const copy = cloneConditionalFormatRule(rule);
    const translated = mapConditionalFormatFormulas(copy, (formula) =>
      translateFormulaForCopy(formula, {
        row: anchor.row - rule.anchor.row,
        column: anchor.column - rule.anchor.column,
      }),
    );
    return [{ ...translated, id, ranges, anchor }];
  });
}
