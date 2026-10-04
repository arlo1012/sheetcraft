import {
  createBatchSetCellContentsCommand,
  createClearCellRangeCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import type { CellRange, Sheet } from "@idea10/core/workbook";

/** Clears sparse content/style records without materializing a whole selected axis. */
export function createContextClearCommand(
  sheet: Sheet,
  range: CellRange,
  mode: "contents" | "formats" | "all",
): WorkbookCommand {
  if (mode === "contents") return createClearCellRangeCommand(sheet.id, range);
  const changes = [...sheet.cells].flatMap(([key, cell]) => {
    const [row, column] = key.split(":").map(Number);
    if (
      row === undefined ||
      column === undefined ||
      row < range.start.row ||
      row > range.end.row ||
      column < range.start.column ||
      column > range.end.column
    )
      return [];
    if (mode === "formats" && !cell.style) return [];
    return [
      {
        sheetId: sheet.id,
        address: { row, column },
        content: mode === "all" ? null : (cell.content ?? null),
        style: null,
        ...(mode === "all" ? { note: null } : {}),
      },
    ];
  });
  return createBatchSetCellContentsCommand(changes, { reconcileBorders: true });
}
