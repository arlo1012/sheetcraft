import { expect, test } from "vitest";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createWorkbook,
  getActiveSheet,
  getSheetMetadata,
  setSheetMetadata,
} from "../../workbook.js";

test("persists subtotal placement and page breaks without sharing mutable rows", () => {
  const workbook = createWorkbook({ id: "book", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  setSheetMetadata(sheet, {
    ...getSheetMetadata(sheet),
    subtotalMetadata: [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 6, column: 1 } },
        generatedRows: [1, 2, 5],
        summaryBelow: false,
        pageBreakRows: [5],
      },
    ],
  });
  const snapshot = serializeWorkbook(workbook);
  const restored = getActiveSheet(deserializeWorkbook(snapshot));
  expect(restored.subtotalMetadata).toEqual(sheet.subtotalMetadata);
  expect(restored.subtotalMetadata?.[0]).toMatchObject({ summaryBelow: false, pageBreakRows: [5] });
  restored.subtotalMetadata![0]!.pageBreakRows!.push(6);
  expect(sheet.subtotalMetadata![0]!.pageBreakRows).toEqual([5]);
  expect(snapshot.sheets[0]).toMatchObject({ subtotalMetadata: [{ pageBreakRows: [5] }] });
});
