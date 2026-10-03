import { strFromU8, unzipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet, getCellStyle, setCellStyle } from "@idea10/core/workbook";
import { createClearCellStylePatch } from "@idea10/core/style";
import { createApplyCellStyleCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { describe, expect, test } from "vitest";
import { decodeXlsx, encodeXlsx } from "../index.js";
import { readXlsxCellStyles } from "../cell-styles.js";

describe("named cell styles", () => {
  test("writes and restores a custom style through cellStyleXfs and cellStyles", async () => {
    const workbook = createWorkbook({ id: "cell-styles", sheetId: "sheet" });
    workbook.cellStyles = [
      {
        id: "accent",
        name: "Accent heading",
        category: "custom",
        style: {
          bold: true,
          textColor: "#ffffff",
          fillColor: "#4472c4",
          horizontalAlign: "center",
          wrapText: true,
          numberFormat: { kind: "custom", code: "0.00" },
          borderBottom: { style: "thin", color: "#203864" },
        },
      },
    ];

    const encoded = await encodeXlsx(workbook);
    const xml = strFromU8(unzipSync(encoded.bytes)["xl/styles.xml"]!);
    expect(xml).toContain('<cellStyle name="Accent heading" xfId="1"/>');
    expect(xml).toContain('<cellStyleXfs count="2">');
    expect(readXlsxCellStyles(unzipSync(encoded.bytes)["xl/styles.xml"])).toHaveLength(1);

    const restored = await decodeXlsx(encoded.bytes);
    expect(restored.workbook.cellStyles).toEqual([
      expect.objectContaining({
        id: "xlsx-cell-style-Accent heading",
        name: "Accent heading",
        category: "custom",
        style: expect.objectContaining({
          bold: true,
          textColor: "#FFFFFF",
          fillColor: "#4472C4",
          horizontalAlign: "center",
          wrapText: true,
          numberFormat: { kind: "number", fractionDigits: 2, useGrouping: false },
          borderBottom: { style: "thin", color: "#203864" },
        }),
      }),
    ]);
  });

  test("roundtrips a blank custom style as an explicit clearing patch", async () => {
    const workbook = createWorkbook({ id: "blank-cell-style", sheetId: "sheet" });
    workbook.cellStyles = [
      {
        id: "blank",
        name: "Blank custom style",
        category: "custom",
        style: createClearCellStylePatch(),
      },
    ];

    const restored = await decodeXlsx((await encodeXlsx(workbook)).bytes);
    const blank = restored.workbook.cellStyles?.[0];
    expect(blank?.id).toBe("xlsx-cell-style-Blank custom style");
    const sheet = getActiveSheet(restored.workbook);
    const target = { row: 0, column: 0 };
    setCellStyle(sheet, target, { bold: true, fillColor: "#4472c4" });
    const session = createWorkbookSession({ workbook: restored.workbook, idFactory: () => "id" });
    expect(
      executeWorkbookCommand(
        session,
        createApplyCellStyleCommand(sheet.id, { start: target, end: target }, blank!),
      ),
    ).toBe(true);
    expect(getCellStyle(sheet, target)).toBeUndefined();
  });
});
