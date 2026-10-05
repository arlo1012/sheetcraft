import { cloneCellSparkline } from "../sparklines.js";
import { normalizeSheetDrawings } from "../sheet-drawings.js";
import { normalizeSheetProtection } from "../protection.js";
import { WorkbookDomainError, toWorkbookErrorDetail } from "../errors.js";
import { cloneCellStyle, type CellStyle } from "../style.js";
import { cloneConditionalFormatRule } from "../conditional-formatting.js";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "../page-setup.js";
import { cloneSheetPageDecoration } from "../page-decoration.js";
import {
  cloneCellContent,
  cloneCellHyperlink,
  cloneCellNote,
  cloneCellNamedStyleBinding,
  cloneFloatingImage,
  cloneSheetTable,
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
      ...(cell.namedStyle ? { namedStyle: cloneCellNamedStyleBinding(cell.namedStyle) } : {}),
      ...(cell.hyperlink ? { hyperlink: cloneCellHyperlink(cell.hyperlink) } : {}),
      ...(cell.note ? { note: cloneCellNote(cell.note) } : {}),
      ...(cell.sparkline ? { sparkline: cloneCellSparkline(cell.sparkline) } : {}),
    })),
    rowHeights: state.rowHeights.map((dimension) => ({ ...dimension })),
    columnWidths: state.columnWidths.map((dimension) => ({ ...dimension })),
    ...(state.hiddenRows ? { hiddenRows: [...state.hiddenRows] } : {}),
    ...(state.hiddenColumns ? { hiddenColumns: [...state.hiddenColumns] } : {}),
    ...(state.defaultColumnWidth === undefined
      ? {}
      : { defaultColumnWidth: state.defaultColumnWidth }),
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
            ...(column.condition ? { condition: { ...column.condition } } : {}),
          })),
          ...(state.filter.allowMergedCells === undefined
            ? {}
            : { allowMergedCells: state.filter.allowMergedCells }),
          ...(state.filter.advanced
            ? {
                advanced: {
                  ...(state.filter.advanced.criteria
                    ? {
                        criteria: {
                          sheetId: state.filter.advanced.criteria.sheetId,
                          range: {
                            start: { ...state.filter.advanced.criteria.range.start },
                            end: { ...state.filter.advanced.criteria.range.end },
                          },
                        },
                      }
                    : {}),
                  uniqueOnly: state.filter.advanced.uniqueOnly,
                  hiddenRows: state.filter.advanced.hiddenRows.map((interval) => ({ ...interval })),
                },
              }
            : {}),
        }
      : null,
    mergedCells: state.mergedCells.map((range) => ({
      start: { ...range.start },
      end: { ...range.end },
    })),
    ...(state.dataValidations
      ? {
          dataValidations: state.dataValidations.map((rule) => ({
            ...rule,
            range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
            ...(rule.list ? { list: [...rule.list] } : {}),
          })),
        }
      : {}),
    ...(state.outlineGroups
      ? { outlineGroups: state.outlineGroups.map((group) => ({ ...group })) }
      : {}),
    ...(state.subtotalMetadata
      ? {
          subtotalMetadata: state.subtotalMetadata.map((entry) => ({
            ...entry,
            range: { start: { ...entry.range.start }, end: { ...entry.range.end } },
            generatedRows: [...entry.generatedRows],
            ...(entry.generatedColumns ? { generatedColumns: [...entry.generatedColumns] } : {}),
            ...(entry.summaryBelow === undefined ? {} : { summaryBelow: entry.summaryBelow }),
            ...(entry.pageBreakRows ? { pageBreakRows: [...entry.pageBreakRows] } : {}),
          })),
        }
      : {}),
    ...(state.duplicateRules
      ? {
          duplicateRules: state.duplicateRules.map((rule) => ({
            ...rule,
            range: { start: { ...rule.range.start }, end: { ...rule.range.end } },
          })),
        }
      : {}),
    ...(state.conditionalFormats
      ? { conditionalFormats: state.conditionalFormats.map(cloneConditionalFormatRule) }
      : {}),
    ...(state.tables ? { tables: state.tables.map(cloneSheetTable) } : {}),
    pageSetup: cloneSheetPageSetup(state.pageSetup ?? DEFAULT_SHEET_PAGE_SETUP),
    pageDecoration: cloneSheetPageDecoration(state.pageDecoration),
    drawings: normalizeSheetDrawings(state.drawings),
    protection: normalizeSheetProtection(state.protection),
    floatingImages: state.floatingImages.map(cloneFloatingImage),
  };
}

export function cloneStyle(style: CellStyle | null | undefined): CellStyle | null {
  return cloneCellStyle(style ?? undefined) ?? null;
}
