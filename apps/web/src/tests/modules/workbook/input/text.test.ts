import { describe, expect, test } from "vitest";
import { formatCellValueForInput, parseCellInput } from "../../../../modules/workbook/input";

describe("text cell input", () => {
  test("keeps escaped and formula-like input as text", () => {
    expect(parseCellInput("'0012")).toBe("0012");
    expect(parseCellInput("=A1+1")).toBe("=A1+1");
  });

  test.each(["0012", "TRUE", " 42 ", "'quoted"])(
    "round-trips the text value %j through the editor",
    (value) => {
      expect(parseCellInput(formatCellValueForInput(value))).toBe(value);
    },
  );
});
