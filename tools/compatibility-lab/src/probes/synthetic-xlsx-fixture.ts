import ExcelJS from "exceljs";

export const SYNTHETIC_FIXTURE_LABEL = "synthetic-not-excel-verified";

export async function createSyntheticWorkbookBuffer(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.properties.date1904 = true;
  const sheet = workbook.addWorksheet("Synthetic Data", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });
  sheet.autoFilter = "A1:C4";
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 14;
  sheet.getRow(4).height = 30;

  sheet.getCell("A1").value = "Amount";
  sheet.getCell("B1").value = "When";
  sheet.getCell("C1").value = "Formula";
  sheet.getRow(1).font = { bold: true, color: { argb: "FF112233" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
  sheet.getCell("A2").value = 41;
  sheet.getCell("B2").value = new Date(Date.UTC(1904, 0, 2));
  sheet.getCell("B2").numFmt = "yyyy-mm-dd";
  sheet.getCell("C2").value = { formula: "A2+1", result: 42 };
  sheet.mergeCells("A4:C4");
  sheet.getCell("A4").value = "Merged synthetic note";
  sheet.getCell("A4").alignment = { horizontal: "center" };

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function readSyntheticWorkbook(buffer: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS 4.4.0's Buffer declaration is incompatible with Node 24's
  // resizable-ArrayBuffer Buffer type, although the runtime API accepts bytes.
  type ExcelJsLoadBytes = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJsLoadBytes);
  return workbook;
}
