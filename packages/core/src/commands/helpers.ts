import { WorkbookDomainError, toWorkbookErrorDetail } from "../errors.js";
import { cloneCellStyle, type CellStyle } from "../style.js";
import {
  cloneCellContent,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type SheetSparseState,
  type Workbook,
} from "../workbook.js";

export function invalidCommandPayload(
  field: string,
  value: unknown,
  message = `Invalid workbook command payload for ${field}.`,
): WorkbookDomainError {
  return new WorkbookDomainError(
    {
      code: "invalid_command_payload",
      details: { field, value: toWorkbookErrorDetail(value) },
    },
    message,
  );
}

export function validateCommandPayload<Value>(
  field: string,
  value: unknown,
  validate: () => Value,
): Value {
  try {
    return validate();
  } catch (error) {
    if (error instanceof WorkbookDomainError) throw error;
    if (error instanceof Error) {
      throw invalidCommandPayload(field, value, error.message);
    }
    throw error;
  }
}

export function assertCellAddress(address: CellAddress): void {
  if (!address || typeof address !== "object" || !isCellAddressInBounds(address)) {
    throw new WorkbookDomainError(
      {
        code: "invalid_command_payload",
        details: {
          field: "address",
          row: toWorkbookErrorDetail(address?.row),
          column: toWorkbookErrorDetail(address?.column),
        },
      },
      `Cell address ${address?.row}:${address?.column} is outside the sheet.`,
    );
  }
}

export function normalizeRange(range: CellRange): CellRange {
  if (
    !range ||
    typeof range !== "object" ||
    !range.start ||
    typeof range.start !== "object" ||
    !range.end ||
    typeof range.end !== "object"
  ) {
    throw invalidCommandPayload("range", range);
  }
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

export function assertCellRange(range: CellRange): void {
  assertCellAddress(range.start);
  assertCellAddress(range.end);
}

export function getSheetOrThrow(workbook: Workbook, sheetId: string) {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) {
    throw new WorkbookDomainError(
      { code: "sheet_not_found", details: { sheetId: toWorkbookErrorDetail(sheetId) } },
      `Sheet ${sheetId} does not exist.`,
    );
  }
  return sheet;
}

export function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

export function cloneSparseState(state: SheetSparseState): SheetSparseState {
  return {
    cells: state.cells.map((cell) => ({
      address: { ...cell.address },
      ...(cell.content === undefined ? {} : { content: cloneCellContent(cell.content) }),
      ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
    })),
    rowHeights: state.rowHeights.map((dimension) => ({ ...dimension })),
    columnWidths: state.columnWidths.map((dimension) => ({ ...dimension })),
    freezePanes: { ...state.freezePanes },
    filter: state.filter
      ? {
          range: {
            start: { ...state.filter.range.start },
            end: { ...state.filter.range.end },
          },
          columns: state.filter.columns.map((column) => ({
            column: column.column,
            allowedValues: column.allowedValues.map((value) => ({ ...value })),
          })),
        }
      : null,
    mergedCells: state.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
  };
}

export function cloneStyle(style: CellStyle | null | undefined): CellStyle | null {
  return cloneCellStyle(style ?? undefined) ?? null;
}
