import { describe, expect, test } from "vitest";
import { getSelectionCellStyleState } from "../../../../modules/workbook/style-state";
import {
  createWorkbook,
  getActiveSheet,
  setCellStyle,
} from "../../../../modules/workbook/workbook";

describe("selection cell style state", () => {
  test("reports uniform, off, and mixed properties without scanning empty cells", () => {
    const sheet = getActiveSheet(createWorkbook());
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        bold: true,
        textColor: "#112233",
        verticalAlign: "top",
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        bold: true,
        textColor: "#112233",
        verticalAlign: "top",
      },
    );

    const uniform = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 1 },
    });
    expect(uniform.bold).toBe("on");
    expect(uniform.italic).toBe("off");
    expect(uniform.textColor).toEqual({ value: "#112233", mixed: false });
    expect(uniform.verticalAlign).toEqual({ value: "top", mixed: false });

    const withBlank = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 2 },
    });
    expect(withBlank.bold).toBe("mixed");
    expect(withBlank.textColor.mixed).toBe(true);
    expect(withBlank.verticalAlign).toEqual({ value: "top", mixed: true });
  });

  test("queries a small selection directly when the sheet contains many other cells", () => {
    const sheet = getActiveSheet(createWorkbook());
    setCellStyle(sheet, { row: 1, column: 1 }, { bold: true });
    for (let row = 10; row < 30; row += 1) {
      setCellStyle(sheet, { row, column: 5 }, { italic: true });
    }

    const state = getSelectionCellStyleState(sheet, {
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 },
    });

    expect(state.bold).toBe("on");
    expect(state.italic).toBe("off");
  });
});
