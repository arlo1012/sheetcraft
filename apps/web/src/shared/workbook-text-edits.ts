import { canEditCell } from "@sheetcraft/core";
import type { CellAddress, CellRange, Workbook } from "@sheetcraft/core/workbook";
import { createBatchSetCellContentsCommand } from "@sheetcraft/core/commands";

export type ReviewTextCell = {
  sheetId: string;
  sheetName: string;
  address: CellAddress;
  text: string;
};
type TextReviewScope = "selection" | "sheet" | "workbook";
type TextConversion = { cell: number; text: string };
export function collectReviewText(
  workbook: Workbook,
  sheetId: string,
  range: CellRange,
  scope: TextReviewScope,
) {
  const cells: ReviewTextCell[] = [];
  let skipped = 0;
  for (const sheet of workbook.sheets.values()) {
    if (scope !== "workbook" && sheet.id !== sheetId) continue;
    for (const [key, cell] of sheet.cells) {
      if (
        cell.content?.kind !== "literal" ||
        typeof cell.content.value !== "string" ||
        !cell.content.value
      )
        continue;
      const [row, column] = key.split(":").map(Number) as [number, number];
      const address = { row, column };
      if (
        scope === "selection" &&
        (row < Math.min(range.start.row, range.end.row) ||
          row > Math.max(range.start.row, range.end.row) ||
          column < Math.min(range.start.column, range.end.column) ||
          column > Math.max(range.start.column, range.end.column))
      )
        continue;
      if (!canEditCell(sheet, address)) {
        skipped++;
        continue;
      }
      cells.push({ sheetId: sheet.id, sheetName: sheet.name, address, text: cell.content.value });
    }
  }
  cells.sort(
    (a, b) =>
      a.sheetId.localeCompare(b.sheetId) ||
      a.address.row - b.address.row ||
      a.address.column - b.address.column,
  );
  return { cells, skipped };
}

/** Build only after checking every captured value, so stale previews never partially apply. */
export function createReviewTextCommand(
  workbook: Workbook,
  cells: readonly ReviewTextCell[],
  changes: readonly TextConversion[],
) {
  for (const change of changes) {
    const cell = cells[change.cell];
    const sheet = cell && workbook.sheets.get(cell.sheetId);
    const content = cell && sheet?.cells.get(`${cell.address.row}:${cell.address.column}`)?.content;
    if (
      !cell ||
      !sheet ||
      !canEditCell(sheet, cell.address) ||
      content?.kind !== "literal" ||
      content.value !== cell.text
    )
      throw new Error("stale-text-review");
  }
  return createBatchSetCellContentsCommand(
    changes.map((change) => ({
      sheetId: cells[change.cell]!.sheetId,
      address: cells[change.cell]!.address,
      content: { kind: "literal", value: change.text },
    })),
  );
}
