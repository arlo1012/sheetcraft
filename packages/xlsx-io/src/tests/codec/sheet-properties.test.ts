import { strFromU8, unzipSync } from "fflate/browser";
import { createSheet, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { describe, expect, test } from "vitest";
import { encodeXlsx } from "../../index.js";

describe("XLSX worksheet properties", () => {
  test("exports each worksheet tab color and leaves uncolored tabs unset", async () => {
    const workbook = createWorkbook({ id: "tab-colors", sheetId: "green" });
    getActiveSheet(workbook).properties.tabColor = "#22a06b";
    const blue = createSheet("Blue", "blue");
    blue.properties.tabColor = "#0066CC";
    workbook.sheets.set(blue.id, blue);
    const plain = createSheet("Plain", "plain");
    workbook.sheets.set(plain.id, plain);
    const before = serializeWorkbook(workbook);

    const archive = unzipSync((await encodeXlsx(workbook)).bytes);

    expect(strFromU8(archive["xl/worksheets/sheet1.xml"]!)).toContain('<tabColor rgb="FF22A06B"/>');
    expect(strFromU8(archive["xl/worksheets/sheet2.xml"]!)).toContain('<tabColor rgb="FF0066CC"/>');
    expect(strFromU8(archive["xl/worksheets/sheet3.xml"]!)).not.toContain("<tabColor");
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
