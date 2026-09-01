import { describe, expect, test } from "vitest";
import {
  formatCellValueForDisplay,
  formatCellValueForInput,
  parseCellInput,
} from "../../../../modules/workbook/input";

describe("cell input formatting", () => {
  test("maps blank input to an empty cell", () => {
    expect(parseCellInput("")).toBeNull();
  });

  test("formats values for editing", () => {
    expect(formatCellValueForInput(null)).toBe("");
    expect(formatCellValueForInput(12)).toBe("12");
    expect(formatCellValueForInput(true)).toBe("TRUE");
  });

  test("does not expose an editing escape in displayed text", () => {
    expect(formatCellValueForDisplay("0012")).toBe("0012");
    expect(formatCellValueForInput("0012")).toBe("'0012");
  });
});
