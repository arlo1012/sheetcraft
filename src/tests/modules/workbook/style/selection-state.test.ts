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
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true, textColor: "#112233" });
    setCellStyle(sheet, { row: 0, column: 1 }, { bold: true, textColor: "#112233" });

    const uniform = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 1 },
    });
    expect(uniform.bold).toBe("on");
    expect(uniform.italic).toBe("off");
    expect(uniform.textColor).toEqual({ value: "#112233", mixed: false });

    const withBlank = getSelectionCellStyleState(sheet, {
      start: { row: 0, column: 0 },
      end: { row: 0, column: 2 },
    });
    expect(withBlank.bold).toBe("mixed");
    expect(withBlank.textColor.mixed).toBe(true);
  });
});
