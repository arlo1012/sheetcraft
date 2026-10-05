import {
  createBatchSetCellContentsCommand,
  createMoveCellRangeCommand,
  createPasteCellContentsCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import {
  clearConditionalFormatRanges,
  copyConditionalFormatRules,
  getCellMatrixSize,
  translateCellContentForCopy,
} from "@idea10/core/clipboard";
import type { CellContent } from "@idea10/core/formula";
import { parseCellContent } from "@idea10/core/input";
import { isTextCellNumberFormat } from "@idea10/core/number-format";
import {
  getCellContent,
  getCellStyle,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "@idea10/core/workbook";
import {
  createGridClipboardRowVisibility,
  MAX_GRID_CLIPBOARD_CELLS,
  rangeTouchesHiddenClipboardRows,
  rangeIntersectsMergedCells,
} from "./gridClipboardRows";
import type { GridClipboardFeedback, GridPastePayload, GridPastePlan } from "./useGridClipboard";

export class GridPasteError extends Error {
  readonly reason: GridClipboardFeedback;

  constructor(reason: GridClipboardFeedback) {
    super(`Grid paste: ${reason}`);
    this.name = "GridPasteError";
    this.reason = reason;
  }
}

type ValidatedPlan = {
  rows: number[];
  rowCount: number;
  columnCount: number;
};

function isCellAddress(value: CellAddress): boolean {
  return (
    Number.isSafeInteger(value.row) &&
    Number.isSafeInteger(value.column) &&
    value.row >= 0 &&
    value.row < MAX_SHEET_ROWS &&
    value.column >= 0 &&
    value.column < MAX_SHEET_COLUMNS
  );
}

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function isStrictlyIncreasingRows(rows: readonly number[]): boolean {
  return rows.every(
    (row, index) =>
      Number.isSafeInteger(row) &&
      row >= 0 &&
      row < MAX_SHEET_ROWS &&
      (index === 0 || row > rows[index - 1]!),
  );
}

function validatePlan(plan: GridPastePlan): ValidatedPlan {
  let size: { rowCount: number; columnCount: number };
  try {
    size = getCellMatrixSize(plan.values);
  } catch {
    throw new GridPasteError("rangeMismatch");
  }
  if (size.rowCount * size.columnCount > MAX_GRID_CLIPBOARD_CELLS) {
    throw new GridPasteError("rangeTooLarge");
  }
  if (
    !isCellAddress(plan.anchor) ||
    !isCellAddress(plan.range.start) ||
    !isCellAddress(plan.range.end)
  ) {
    throw new GridPasteError("rangeMismatch");
  }
  const range = normalizeRange(plan.range);
  if (
    range.start.row !== plan.range.start.row ||
    range.start.column !== plan.range.start.column ||
    range.end.row !== plan.range.end.row ||
    range.end.column !== plan.range.end.column ||
    plan.anchor.column !== range.start.column ||
    range.end.column !== plan.anchor.column + size.columnCount - 1
  ) {
    throw new GridPasteError("rangeMismatch");
  }

  const rows = plan.rows
    ? [...plan.rows]
    : Array.from({ length: size.rowCount }, (_, row) => plan.anchor.row + row);
  if (
    rows.length !== size.rowCount ||
    !isStrictlyIncreasingRows(rows) ||
    plan.anchor.row !== rows[0] ||
    range.start.row !== rows[0] ||
    range.end.row !== rows.at(-1)
  ) {
    throw new GridPasteError("rangeMismatch");
  }
  if (!plan.rows && range.end.row !== plan.anchor.row + size.rowCount - 1) {
    throw new GridPasteError("rangeMismatch");
  }
  return { rows, ...size };
}

function assertMatrixShape(
  matrix: readonly (readonly unknown[])[] | undefined,
  size: { rowCount: number; columnCount: number },
): void {
  if (
    !matrix ||
    matrix.length !== size.rowCount ||
    matrix.some((row) => row.length !== size.columnCount)
  ) {
    throw new GridPasteError("rangeMismatch");
  }
}

function ensureVisibleTargets(
  visibility: ReturnType<typeof createGridClipboardRowVisibility>,
  rows: readonly number[],
): void {
  if (rows.some((row) => !visibility.isRowVisible(row))) {
    throw new GridPasteError("rangeMismatch");
  }
}

function ensureNoMergedRange(sheet: Sheet, range: CellRange): void {
  if (rangeIntersectsMergedCells(sheet, range)) {
    throw new GridPasteError("mergedRangeUnsupported");
  }
}

function toLiteralContent(value: string | number | boolean | null): CellContent | null {
  return value === null ? null : { kind: "literal", value };
}

function toPastedContent(
  sheet: Sheet,
  address: CellAddress,
  value: string | number | boolean | null,
  rawText: string | undefined,
): CellContent | null {
  if (rawText !== undefined && isTextCellNumberFormat(getCellStyle(sheet, address)?.numberFormat)) {
    return parseCellContent(rawText, { asText: true });
  }
  return toLiteralContent(value);
}

function targetAddress(
  plan: GridPastePlan,
  rows: readonly number[],
  row: number,
  column: number,
): CellAddress {
  return { row: rows[row]!, column: plan.anchor.column + column };
}

function getTranslatedContents(
  sheet: Sheet,
  payload: Extract<GridPastePayload, { kind: "all" }>,
  plan: ValidatedPlan,
): Array<Array<CellContent | null>> {
  if (!payload.contents || !payload.sourceRange) {
    return payload.plan.values.map((row, rowIndex) =>
      row.map((value, columnIndex) =>
        toPastedContent(
          sheet,
          targetAddress(payload.plan, plan.rows, rowIndex, columnIndex),
          value,
          payload.rawTextValues?.[rowIndex]?.[columnIndex],
        ),
      ),
    );
  }
  let sourceSize: { rowCount: number; columnCount: number };
  try {
    sourceSize = getCellMatrixSize(payload.contents);
  } catch {
    throw new GridPasteError("rangeMismatch");
  }
  if (sourceSize.rowCount * sourceSize.columnCount > MAX_GRID_CLIPBOARD_CELLS) {
    throw new GridPasteError("rangeTooLarge");
  }
  const sourceRange = normalizeRange(payload.sourceRange);
  const sourceRows = payload.sourceRows ? [...payload.sourceRows] : undefined;
  if (
    !isCellAddress(sourceRange.start) ||
    !isCellAddress(sourceRange.end) ||
    sourceRange.start.row !== payload.sourceRange.start.row ||
    sourceRange.end.row !== payload.sourceRange.end.row ||
    sourceRange.start.column !== payload.sourceRange.start.column ||
    sourceRange.end.column !== payload.sourceRange.end.column ||
    sourceRange.end.column - sourceRange.start.column + 1 !== sourceSize.columnCount ||
    (sourceRows
      ? sourceRows.length !== sourceSize.rowCount ||
        !isStrictlyIncreasingRows(sourceRows) ||
        sourceRows.some((row) => row < sourceRange.start.row || row > sourceRange.end.row)
      : sourceRange.end.row - sourceRange.start.row + 1 !== sourceSize.rowCount)
  ) {
    throw new GridPasteError("rangeMismatch");
  }

  return Array.from({ length: plan.rowCount }, (_, row) =>
    Array.from({ length: plan.columnCount }, (_, column) => {
      const sourceRowOffset = row % sourceSize.rowCount;
      const sourceColumnOffset = column % sourceSize.columnCount;
      const content = payload.contents?.[sourceRowOffset]?.[sourceColumnOffset] ?? null;
      return translateCellContentForCopy(
        content,
        {
          row: sourceRows?.[sourceRowOffset] ?? sourceRange.start.row + sourceRowOffset,
          column: sourceRange.start.column + sourceColumnOffset,
        },
        targetAddress(payload.plan, plan.rows, row, column),
      );
    }),
  );
}

function isPhysicalRectangle(plan: GridPastePlan, rows: readonly number[]): boolean {
  return rows.every((row, index) => row === plan.anchor.row + index);
}

function createCellPasteCommand(
  sheet: Sheet,
  payload: GridPastePayload,
  evaluator?: SheetEvaluator,
): WorkbookCommand {
  const plan = validatePlan(payload.plan);
  const visibility = createGridClipboardRowVisibility(sheet, evaluator);
  ensureVisibleTargets(visibility, plan.rows);
  ensureNoMergedRange(sheet, payload.plan.range);
  if (payload.kind !== "formats" && payload.rawTextValues) {
    assertMatrixShape(payload.rawTextValues, plan);
  }
  if (!payload.plan.preserveHiddenRows && !isPhysicalRectangle(payload.plan, plan.rows)) {
    throw new GridPasteError("rangeMismatch");
  }

  if (payload.kind === "all" && payload.moveSource) {
    ensureNoMergedRange(sheet, payload.moveSource);
    const source = normalizeRange(payload.moveSource);
    if (
      !isPhysicalRectangle(payload.plan, plan.rows) ||
      rangeTouchesHiddenClipboardRows(visibility, payload.moveSource) ||
      rangeTouchesHiddenClipboardRows(visibility, payload.plan.range)
    ) {
      throw new GridPasteError("filteredCutUnsupported");
    }
    if (
      source.start.row !== payload.moveSource.start.row ||
      source.start.column !== payload.moveSource.start.column ||
      source.end.row !== payload.moveSource.end.row ||
      source.end.column !== payload.moveSource.end.column ||
      source.end.row - source.start.row + 1 !== plan.rowCount ||
      source.end.column - source.start.column + 1 !== plan.columnCount
    ) {
      throw new GridPasteError("rangeMismatch");
    }
    return createMoveCellRangeCommand(sheet.id, payload.moveSource, payload.plan.anchor);
  }

  if (payload.kind === "all") {
    const contents = getTranslatedContents(sheet, payload, plan);
    if (payload.styles) assertMatrixShape(payload.styles, plan);
    if (payload.namedStyles) assertMatrixShape(payload.namedStyles, plan);
    if (payload.hyperlinks) assertMatrixShape(payload.hyperlinks, plan);
    if (payload.notes) assertMatrixShape(payload.notes, plan);
    if (!payload.plan.preserveHiddenRows) {
      return createPasteCellContentsCommand(
        sheet.id,
        payload.plan.anchor,
        contents,
        payload.styles || payload.namedStyles || payload.hyperlinks || payload.notes
          ? {
              ...(payload.styles ? { styles: payload.styles } : {}),
              ...(payload.namedStyles ? { namedStyles: payload.namedStyles } : {}),
              ...(payload.hyperlinks ? { hyperlinks: payload.hyperlinks } : {}),
              ...(payload.notes ? { notes: payload.notes } : {}),
            }
          : undefined,
      );
    }
    return createBatchSetCellContentsCommand(
      contents.flatMap((row, rowIndex) =>
        row.map((content, columnIndex) => ({
          sheetId: sheet.id,
          address: targetAddress(payload.plan, plan.rows, rowIndex, columnIndex),
          content,
          ...(payload.styles ? { style: payload.styles[rowIndex]?.[columnIndex] ?? null } : {}),
          ...(payload.namedStyles
            ? { namedStyle: payload.namedStyles[rowIndex]?.[columnIndex] ?? null }
            : {}),
          ...(payload.hyperlinks
            ? { hyperlink: payload.hyperlinks[rowIndex]?.[columnIndex] ?? null }
            : {}),
          ...(payload.notes ? { note: payload.notes[rowIndex]?.[columnIndex] ?? null } : {}),
        })),
      ),
    );
  }

  if (payload.kind === "values") {
    if (!payload.plan.preserveHiddenRows) {
      return createPasteCellContentsCommand(
        sheet.id,
        payload.plan.anchor,
        payload.plan.values.map((row, rowIndex) =>
          row.map((value, columnIndex) =>
            toPastedContent(
              sheet,
              targetAddress(payload.plan, plan.rows, rowIndex, columnIndex),
              value,
              payload.rawTextValues?.[rowIndex]?.[columnIndex],
            ),
          ),
        ),
      );
    }
    return createBatchSetCellContentsCommand(
      payload.plan.values.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => ({
          sheetId: sheet.id,
          address: targetAddress(payload.plan, plan.rows, rowIndex, columnIndex),
          content: toPastedContent(
            sheet,
            targetAddress(payload.plan, plan.rows, rowIndex, columnIndex),
            value,
            payload.rawTextValues?.[rowIndex]?.[columnIndex],
          ),
        })),
      ),
    );
  }

  assertMatrixShape(payload.styles, plan);
  if (payload.namedStyles) assertMatrixShape(payload.namedStyles, plan);
  if (!payload.plan.preserveHiddenRows) {
    return createPasteCellContentsCommand(
      sheet.id,
      payload.plan.anchor,
      Array.from({ length: plan.rowCount }, (_, row) =>
        Array.from({ length: plan.columnCount }, (_, column) =>
          getCellContent(sheet, targetAddress(payload.plan, plan.rows, row, column)),
        ),
      ),
      {
        styles: payload.styles,
        ...(payload.namedStyles ? { namedStyles: payload.namedStyles } : {}),
      },
    );
  }
  return createBatchSetCellContentsCommand(
    payload.styles.flatMap((row, rowIndex) =>
      row.map((style, columnIndex) => {
        const address = targetAddress(payload.plan, plan.rows, rowIndex, columnIndex);
        return {
          sheetId: sheet.id,
          address,
          content: getCellContent(sheet, address),
          style,
          ...(payload.namedStyles
            ? { namedStyle: payload.namedStyles[rowIndex]?.[columnIndex] ?? null }
            : {}),
        };
      }),
    ),
  );
}

/** Keeps copied document rules and cell contents in one undoable transaction. */
export function createGridPasteCommand(
  sheet: Sheet,
  payload: GridPastePayload,
  evaluator?: SheetEvaluator,
): WorkbookCommand {
  const command = createCellPasteCommand(sheet, payload, evaluator);
  if (sheet.properties.protected && command.type === "setCellContents") {
    // Content paste on a protected form retains destination formatting and lock state.
    return {
      type: "setCellContents",
      changes: command.changes.map(({ sheetId, address, content }) => ({
        sheetId,
        address,
        content,
      })),
    };
  }
  if (
    payload.kind === "values" ||
    command.type !== "setCellContents" ||
    payload.conditionalFormats === undefined ||
    !payload.sourceRange
  )
    return command;
  const plan = validatePlan(payload.plan);
  const cuts = payload.plan.rows
    ? plan.rows.map((row) => ({
        start: { row, column: payload.plan.range.start.column },
        end: { row, column: payload.plan.range.end.column },
      }))
    : [payload.plan.range];
  const remaining = clearConditionalFormatRanges(sheet.conditionalFormats ?? [], cuts);
  const copied = copyConditionalFormatRules(
    payload.conditionalFormats,
    payload.sourceRange,
    payload.plan.range,
    {
      sourceRows: payload.sourceRows,
      destinationRows: plan.rows,
      existingIds: (sheet.conditionalFormats ?? []).map((rule) => rule.id),
    },
  );
  return {
    ...command,
    conditionalFormats: [{ sheetId: sheet.id, rules: [...copied, ...remaining] }],
  };
}
