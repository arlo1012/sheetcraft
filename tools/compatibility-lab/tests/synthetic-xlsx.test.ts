import { describe, expect, test } from "vitest";
import {
  SYNTHETIC_FIXTURE_LABEL,
  createSyntheticWorkbookBuffer,
  readSyntheticWorkbook,
} from "../src/probes/synthetic-xlsx-fixture.js";

describe("ExcelJS synthetic XLSX write/read probe", () => {
  test("roundtrips the labelled synthetic X1-shaped fixture without formula calculation", async () => {
    const bytes = await createSyntheticWorkbookBuffer();
    const workbook = await readSyntheticWorkbook(bytes);
    const sheet = workbook.getWorksheet("Synthetic Data");
    if (!sheet) throw new Error("Synthetic sheet was not restored.");

    expect(SYNTHETIC_FIXTURE_LABEL).toBe("synthetic-not-excel-verified");
    expect(workbook.properties.date1904).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(sheet.getCell("A2").value).toBe(41);
    expect(sheet.getCell("B2").value).toEqual(new Date(Date.UTC(1904, 0, 2)));
    expect(sheet.getCell("B2").numFmt).toBe("yyyy-mm-dd");
    expect(sheet.getCell("C2").value).toEqual({ formula: "A2+1", result: 42 });
    expect(sheet.getCell("C2").value).not.toEqual({ formula: "A2+1", result: 43 });
    expect(sheet.getCell("A1").font?.bold).toBe(true);
    expect(sheet.getCell("A1").fill).toMatchObject({ type: "pattern", pattern: "solid" });
    expect(sheet.getColumn(1).width).toBe(18);
    expect(sheet.getRow(4).height).toBe(30);
    expect(sheet.autoFilter).toEqual("A1:C4");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1 });
    expect(sheet.getCell("A4").value).toBe("Merged synthetic note");
    expect(sheet.getCell("B4").isMerged).toBe(true);
  });
});
