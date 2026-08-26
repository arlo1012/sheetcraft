import { describe, expect, test } from "vitest";
import { getCellValue } from "../../../../../modules/workbook/workbook";
import { mountSheetGrid } from "./fixture";

describe("workbook history shortcuts", () => {
  test("undoes and redoes committed edits with spreadsheet shortcuts", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");

    await editor.trigger("keydown", { key: "x" });
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("x");

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();

    await wrapper
      .get("input.cell-editor")
      .trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("x");
  });
});
