import { getChartSourceRangeLength, mapChartSourceReferences } from "./chart-source.js";
import { normalizeSheetDrawings, type SheetDrawing } from "./sheet-drawings.js";
import type { CellAddress, CellRange } from "./workbook.js";

/** Exact-cell fallback for movements. Split vectors become durable tombstones. */
export function mapChartSourceVectorCells(
  range: CellRange,
  mapCell: (cell: CellAddress) => CellAddress | null,
): CellRange | null {
  const vertical = range.start.column === range.end.column;
  const mapped: CellAddress[] = [];
  for (let index = 0; index < getChartSourceRangeLength(range); index++) {
    const cell = mapCell({
      row: range.start.row + (vertical ? index : 0),
      column: range.start.column + (vertical ? 0 : index),
    });
    if (cell) mapped.push(cell);
  }
  if (!mapped.length) return null;
  const rows = mapped.map((cell) => cell.row),
    columns = mapped.map((cell) => cell.column);
  const start = { row: Math.min(...rows), column: Math.min(...columns) };
  const end = { row: Math.max(...rows), column: Math.max(...columns) };
  return (start.row === end.row || start.column === end.column) &&
    (end.row - start.row + 1) * (end.column - start.column + 1) === mapped.length
    ? { start, end }
    : null;
}
/** Whole chart forest, including hidden roots. Other drawing data is unchanged. */
export function mapSheetDrawingChartReferences(
  drawings: readonly SheetDrawing[] | undefined,
  mapCell: (reference: { sheetId: string; cell: CellAddress | null }) => {
    sheetId: string;
    cell: CellAddress | null;
  },
  mapRange: (reference: { sheetId: string; range: CellRange | null }) => {
    sheetId: string;
    range: CellRange | null;
  },
): SheetDrawing[] {
  return normalizeSheetDrawings(drawings).map((drawing) => {
    if (drawing.kind !== "chart" || drawing.chart.source === undefined) return drawing;
    return {
      ...drawing,
      chart: {
        ...drawing.chart,
        source: mapChartSourceReferences(
          drawing.chart.source,
          (reference) => ({
            kind: "cell",
            ...mapCell({ sheetId: reference.sheetId, cell: reference.cell }),
          }),
          (reference) => ({
            kind: "range",
            ...mapRange({ sheetId: reference.sheetId, range: reference.range }),
          }),
        ),
      },
    };
  });
}
