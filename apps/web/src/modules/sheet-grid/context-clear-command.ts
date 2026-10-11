import {
  createBatchSetCellContentsCommand,
  createClearCellRangeCommand,
  createRestoreCellStylesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import type { CellRange, Sheet } from "@sheetcraft/core/workbook";

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
    const text =
      cell.content?.kind === "literal" && typeof cell.content.value === "string"
        ? cell.content.value
        : undefined;
    const richText =
      text !== undefined &&
      Boolean(cell.content?.kind === "literal" && cell.content.fontRuns?.length);
    if (mode === "formats" && !cell.style && !richText) return [];
    return [{ address: { row, column }, cell, text, richText }];
  });
  if (mode === "formats")
    return createRestoreCellStylesCommand(
      sheet.id,
      changes.map(({ address, cell, text, richText }) => ({
        address,
        // Clearing appearance must not change edit permissions on a protected sheet.
        style: sheet.protection && cell.style?.unlocked ? { unlocked: true } : null,
        namedStyle: null,
        ...(richText ? { content: { kind: "literal" as const, value: text! } } : {}),
      })),
      { reconcileBorders: true },
    );
  return createBatchSetCellContentsCommand(
    changes.map(({ address }) => ({
      sheetId: sheet.id,
      address,
      content: null,
      style: null,
      note: null,
    })),
    { reconcileBorders: true },
  );
}
