import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  setRowHeight,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, type XlsxDecodeResult } from "@sheetcraft/xlsx-io";

export const SYNTHETIC_FIXTURE_LABEL = "synthetic-not-excel-verified";

export function createSyntheticWorkbook(): Workbook {
  const workbook = createWorkbook({
    id: "lab-synthetic",
    sheetId: "lab-data",
    sheetName: "Synthetic Data",
    dateSystem: "1904",
  });
  const sheet = getActiveSheet(workbook);
  sheet.freezePanes = { rows: 1, columns: 1 };
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    columns: [],
    allowMergedCells: true,
  };
  setColumnWidth(sheet, 0, 126);
  setColumnWidth(sheet, 1, 98);
  setRowHeight(sheet, 3, 40);

  for (const [column, value] of ["Amount", "When", "Formula"].entries()) {
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value });
    setCellStyle(
      sheet,
      { row: 0, column },
      {
        bold: true,
        textColor: "#112233",
        fillColor: "#fde68a",
      },
    );
  }
  setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 41 });
  // 1904-01-02 is serial 1 in this workbook; no host Date or timezone is involved.
  setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1 });
  setCellStyle(
    sheet,
    { row: 1, column: 1 },
    {
      numberFormat: { kind: "date", code: "yyyy-mm-dd" },
    },
  );
  setCellContent(
    sheet,
    { row: 1, column: 2 },
    {
      kind: "formula",
      formula: { source: "=A2+1" },
    },
  );
  // Keep the merge entirely to the right of the frozen first column.
  sheet.mergedCells = [{ start: { row: 3, column: 1 }, end: { row: 3, column: 2 } }];
  setCellContent(
    sheet,
    { row: 3, column: 1 },
    {
      kind: "literal",
      value: "Merged synthetic note",
    },
  );
  setCellStyle(sheet, { row: 3, column: 1 }, { horizontalAlign: "center" });
  return workbook;
}

export async function createSyntheticWorkbookBuffer(): Promise<Uint8Array> {
  return (await encodeXlsx(createSyntheticWorkbook())).bytes;
}

export async function readSyntheticWorkbook(buffer: Uint8Array): Promise<XlsxDecodeResult> {
  return decodeXlsx(buffer);
}
