import { expect, test } from "vitest";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  MAX_SHEET_COLUMNS,
  createWorkbook,
  getActiveSheet,
  getSheetMetadata,
  setSheetMetadata,
} from "../../workbook.js";

test("persists generated subtotal columns without sharing their mutable array", () => {
  const workbook = createWorkbook({ id: "book", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  setSheetMetadata(sheet, {
    ...getSheetMetadata(sheet),
    subtotalMetadata: [
      {
        id: "subtotal",
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
        generatedRows: [1, 3],
        generatedColumns: [1],
      },
    ],
  });

  const snapshot = serializeWorkbook(workbook);
  const restored = getActiveSheet(deserializeWorkbook(snapshot));
  expect(restored.subtotalMetadata?.[0]?.generatedColumns).toEqual([1]);
  restored.subtotalMetadata![0]!.generatedColumns!.push(2);
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([1]);
  expect(snapshot.sheets[0]).toMatchObject({
    subtotalMetadata: [{ generatedColumns: [1] }],
  });
});

test.each([
  { generatedColumns: [-1] },
  { generatedColumns: [1.5] },
  { generatedColumns: [MAX_SHEET_COLUMNS] },
])("rejects invalid generated subtotal columns: $generatedColumns", ({ generatedColumns }) => {
  const workbook = createWorkbook({ id: "book", sheetId: "data" });
  const sheet = getActiveSheet(workbook);
  expect(() =>
    setSheetMetadata(sheet, {
      ...getSheetMetadata(sheet),
      subtotalMetadata: [
        {
          id: "subtotal",
          range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
          generatedRows: [1],
          generatedColumns,
        },
      ],
    }),
  ).toThrow("Invalid subtotal metadata.");
});
