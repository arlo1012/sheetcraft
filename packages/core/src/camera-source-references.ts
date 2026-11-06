import type { CellAddress, CellRange } from "./workbook.js";
import type { SheetDrawing } from "./sheet-drawings.js";

export function mapSheetCameraReferences(
  drawings: readonly SheetDrawing[] | undefined,
  map: (reference: { sheetId: string; range: CellRange | null }) => {
    sheetId: string;
    range: CellRange | null;
  },
): SheetDrawing[] {
  return (drawings ?? []).map((drawing) => {
    if (drawing.kind !== "camera" || drawing.camera.sheetId === undefined) return drawing;
    const reference = map({ sheetId: drawing.camera.sheetId, range: drawing.camera.range });
    const range = reference.range;
    return {
      ...drawing,
      camera: {
        ...drawing.camera,
        sheetId: reference.sheetId,
        range:
          range &&
          (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) >
            10000
            ? null
            : range,
      },
    };
  });
}

/** A camera owns one rectangle. A move that splits its source cannot widen it to unrelated cells. */
export function mapCameraSourceCells(
  range: CellRange,
  map: (cell: CellAddress) => CellAddress | null,
): CellRange | null {
  const cells = new Set<string>();
  const start = { row: Infinity, column: Infinity };
  const end = { row: -1, column: -1 };
  for (let row = range.start.row; row <= range.end.row; row++)
    for (let column = range.start.column; column <= range.end.column; column++) {
      const cell = map({ row, column });
      if (!cell) continue;
      cells.add(`${cell.row}:${cell.column}`);
      start.row = Math.min(start.row, cell.row);
      start.column = Math.min(start.column, cell.column);
      end.row = Math.max(end.row, cell.row);
      end.column = Math.max(end.column, cell.column);
    }
  return cells.size && (end.row - start.row + 1) * (end.column - start.column + 1) === cells.size
    ? { start, end }
    : null;
}
