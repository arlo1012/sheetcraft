import { unzipSync } from "fflate";
import { expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { decodeXlsx, encodeXlsx } from "../../index.js";

test.each(["textBox", "wordArt"] as const)(
  "%s XLSX omission is located and does not change the workbook",
  async (kind) => {
    const workbook = createWorkbook({ id: "text-drawing", sheetId: "sheet", sheetName: "Data" });
    const sheet = getActiveSheet(workbook);
    const drawing: SheetGraphicDrawing = {
      id: kind,
      kind,
      name: "Synthetic text",
      anchor: { row: 1, column: 1 },
      offsetX: 8,
      offsetY: 8,
      width: 240,
      height: 120,
      text: "Line one\nLine two",
      shape: "rectangle",
      fill: "#abcdef",
      stroke: "#123456",
      strokeWidth: 3,
      color: "#654321",
      fontSize: 28,
      bold: true,
      italic: false,
      rotation: 15,
    };
    sheet.drawings = [drawing];
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Kept cell" });
    const before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook);
    expect(encoded.report.issues).toContainEqual(
      expect.objectContaining({
        code: "feature-omitted",
        severity: "warning",
        locations: [`Data.drawings[${JSON.stringify(kind)}]`],
      }),
    );
    expect(
      Object.keys(unzipSync(encoded.bytes)).filter((path) =>
        /^xl\/(drawings|charts|media)\//.test(path),
      ),
    ).toEqual([]);
    expect(serializeWorkbook(workbook)).toEqual(before);
    const decoded = await decodeXlsx(encoded.bytes);
    expect(getActiveSheet(decoded.workbook).drawings ?? []).toEqual([]);
    expect(getCellContent(getActiveSheet(decoded.workbook), { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "Kept cell",
    });
  },
);
