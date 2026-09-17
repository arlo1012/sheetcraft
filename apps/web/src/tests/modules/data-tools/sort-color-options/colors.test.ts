import { describe, expect, test } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createWorkbookSession } from "@idea10/core/history";
import { getActiveSheet, setCellStyle } from "@idea10/core/workbook";
import { DEFAULT_CELL_TEXT_COLOR } from "@idea10/core/style";
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
});
