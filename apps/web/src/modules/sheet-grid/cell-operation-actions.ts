import {
  createBatchDeleteSheetAxesCommand,
  createDeleteCellsCommand,
  createDeleteSheetAxisCommand,
  createInsertCellsCommand,
  createInsertSheetAxisCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { isCellAddressInBounds, type CellRange, type Sheet } from "@sheetcraft/core/workbook";

export type CellOperationPayload = {
  operation: "insert" | "delete";
  range: CellRange;
  direction: "right" | "down" | "left" | "up" | "row" | "column";
};

type RowSpan = { index: number; count: number };

function assertRange(range: CellRange): void {
  if (
    !isCellAddressInBounds(range.start) ||
    !isCellAddressInBounds(range.end) ||
    range.start.row > range.end.row ||
    range.start.column > range.end.column
  ) {
    throw new RangeError("Invalid cell range.");
  }
}

function rowSpans(rows: readonly number[]): RowSpan[] {
  const spans: RowSpan[] = [];
  for (const row of rows) {
    const previous = spans.at(-1);
    if (previous && previous.index + previous.count === row) previous.count += 1;
    else spans.push({ index: row, count: 1 });
  }
  return spans;
}

function hasNonblankContent(sheet: Sheet, rowStart: number, rowEnd: number): Set<number> {
  const nonempty = new Set<number>();
  for (const [key, cell] of sheet.cells) {
    const separator = key.indexOf(":");
    const row = Number(key.slice(0, separator));
    if (row < rowStart || row > rowEnd) continue;
    const content = cell.content;
    if (content && content.kind !== "literal") nonempty.add(row);
    if (content?.kind === "literal" && content.value !== null && content.value !== "") {
      nonempty.add(row);
    }
  }
  for (const image of sheet.floatingImages) {
    if (image.anchor.row >= rowStart && image.anchor.row <= rowEnd) nonempty.add(image.anchor.row);
  }
  // Preserve every row participating in a merge. Coalesce row intervals first so
  // a stack of wide merges does not repeatedly scan the same selected rows.
  const mergedRows = sheet.mergedCells
    .flatMap((merged) => {
      const start = Math.max(rowStart, merged.start.row);
      const end = Math.min(rowEnd, merged.end.row);
      return start <= end ? [{ start, end }] : [];
    })
    .sort((left, right) => left.start - right.start);
  let mergedEnd = rowStart - 1;
  for (const merged of mergedRows) {
    const start = Math.max(merged.start, mergedEnd + 1);
    for (let row = start; row <= merged.end; row++) nonempty.add(row);
    mergedEnd = Math.max(mergedEnd, merged.end);
  }
  return nonempty;
}

export function createCellOperationActions(options: {
  getSheet: () => Sheet;
  flushPendingEdits: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  onError: () => void;
}) {
  function run(create: (sheet: Sheet) => WorkbookCommand | undefined): void {
    const sheet = options.getSheet();
    if (sheet.properties.protected || !options.flushPendingEdits()) return;
    try {
      const command = create(options.getSheet());
      if (command) options.execute(command);
    } catch {
      options.onError();
    }
  }

  function cellOperation(payload: CellOperationPayload): void {
    run((sheet) => {
      assertRange(payload.range);
      if (payload.direction === "row" || payload.direction === "column") {
        const axis = payload.direction === "row" ? "row" : "column";
        const index = axis === "row" ? payload.range.start.row : payload.range.start.column;
        const count =
          (axis === "row" ? payload.range.end.row : payload.range.end.column) - index + 1;
        return payload.operation === "insert"
          ? createInsertSheetAxisCommand(sheet.id, axis, index, count)
          : createDeleteSheetAxisCommand(sheet.id, axis, index, count);
      }
      if (payload.operation === "insert") {
        if (payload.direction !== "right" && payload.direction !== "down") return undefined;
        return createInsertCellsCommand(sheet.id, payload.range, payload.direction);
      }
      if (payload.direction !== "left" && payload.direction !== "up") return undefined;
      return createDeleteCellsCommand(sheet.id, payload.range, payload.direction);
    });
  }

  function deleteEmptyRows(range: CellRange): void {
    run((sheet) => {
      assertRange(range);
      const nonempty = hasNonblankContent(sheet, range.start.row, range.end.row);
      const emptyRows: number[] = [];
      for (let row = range.start.row; row <= range.end.row; row++) {
        if (!nonempty.has(row)) emptyRows.push(row);
      }
      const commands = rowSpans(emptyRows)
        .reverse()
        .map((span) => createDeleteSheetAxisCommand(sheet.id, "row", span.index, span.count));
      if (!commands.length) return undefined;
      return commands.length === 1 ? commands[0] : createBatchDeleteSheetAxesCommand(commands);
    });
  }

  return { cellOperation, deleteEmptyRows };
}
