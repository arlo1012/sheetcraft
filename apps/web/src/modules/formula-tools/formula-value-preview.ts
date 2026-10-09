import { formatComputedValueForDisplay, parseCellContent } from "@sheetcraft/core/input";
import { isTextCellNumberFormat } from "@sheetcraft/core/number-format";
import {
  createWorkbookEvaluator,
  getCellStyle,
  setCellContent,
  type CellAddress,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";

function contentForPreview(sheet: Sheet, address: CellAddress, input: string) {
  return parseCellContent(input, {
    asText: isTextCellNumberFormat(getCellStyle(sheet, address)?.numberFormat),
  });
}

/**
 * Evaluates an uncommitted cell input in a copy-on-write workbook shadow.
 * Only the target sheet and its sparse cell map are copied, so previewing never
 * changes the live workbook or its command history.
 */
export function previewFormulaInput(
  workbook: Workbook,
  sheetId: string,
  address: CellAddress,
  input: string,
): string {
  const sourceSheet = workbook.sheets.get(sheetId);
  if (!sourceSheet) return "";

  const sheets = new Map(workbook.sheets);
  const targetSheet = { ...sourceSheet, cells: new Map(sourceSheet.cells) };
  sheets.set(sheetId, targetSheet);
  setCellContent(targetSheet, address, contentForPreview(sourceSheet, address, input));

  const shadow = { ...workbook, sheets };
  return formatComputedValueForDisplay(
    createWorkbookEvaluator(shadow, sheetId).getComputedValue(address),
  );
}
