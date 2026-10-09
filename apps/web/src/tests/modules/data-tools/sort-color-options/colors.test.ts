import { describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbookSession } from "@sheetcraft/core/history";
import {
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { DEFAULT_CELL_TEXT_COLOR } from "@sheetcraft/core/style";
import { getSortColorColumns } from "../../../../modules/data-tools/sort-color-options";

describe("getSortColorColumns", () => {
  test("collects styled blanks and sparse defaults, with header colors separate", () => {
    const sheet = getActiveSheet(
      createWorkbookSession({ idFactory: createSequentialIdFactory() }).workbook,
    );
    setCellStyle(sheet, { row: 0, column: 0 }, { fillColor: "#0000FF" });
    setCellStyle(sheet, { row: 1, column: 0 }, { fillColor: "#FF0000", textColor: "#00FF00" });
    setCellStyle(sheet, { row: 2, column: 0 }, { fillColor: "#ff0000" });
    const [column] = getSortColorColumns(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 3, column: 0 },
    });
    expect(column).toMatchObject({
      column: 0,
      cellColors: ["#ff0000", null],
      headerCellColor: "#0000ff",
    });
    expect(column?.fontColors).toEqual(["#00ff00", DEFAULT_CELL_TEXT_COLOR]);
  });

  test("does not list a gradient as no fill or include styles outside the selected body", () => {
    const sheet = getActiveSheet(
      createWorkbookSession({ idFactory: createSequentialIdFactory() }).workbook,
    );
    setCellStyle(
      sheet,
      { row: 1, column: 0 },
      {
        fillGradient: {
          type: "linear",
          angle: 0,
          stops: [
            { position: 0, color: "#ff0000" },
            { position: 1, color: "#0000ff" },
          ],
        },
      },
    );
    setCellStyle(sheet, { row: 2, column: 0 }, { fillColor: "#ffff00" });
    const [column] = getSortColorColumns(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 1, column: 0 },
    });
    expect(column?.cellColors).toEqual([]);
    expect(column?.fontColors).toEqual([DEFAULT_CELL_TEXT_COLOR]);
  });

  test("discovers conditional-format colors through the same effective-style resolver as sorting", () => {
    const sheet = getActiveSheet(
      createWorkbookSession({ idFactory: createSequentialIdFactory() }).workbook,
    );
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 5 });
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: 1 });
    sheet.conditionalFormats = [
      {
        id: "green-values",
        ranges: [{ start: { row: 1, column: 0 }, end: { row: 2, column: 0 } }],
        anchor: { row: 1, column: 0 },
        condition: { kind: "cellValue", operator: "greaterThan", value: 3 },
        style: { fillColor: "#00FF00", textColor: "#112233" },
      },
    ];

    const [column] = getSortColorColumns(
      sheet,
      { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      createSheetEvaluator(sheet),
    );
    expect(column?.cellColors).toEqual(["#00ff00", null]);
    expect(column?.fontColors).toEqual(["#112233", DEFAULT_CELL_TEXT_COLOR]);
  });
});
