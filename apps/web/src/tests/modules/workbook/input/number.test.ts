import { describe, expect, test } from "vitest";
import { parseCellInput } from "../../../../modules/workbook/input";

describe("numeric cell input", () => {
  test("parses an ordinary decimal number", () => {
    expect(parseCellInput("42.5")).toBe(42.5);
  });

  test("keeps precision-sensitive numbers as text", () => {
    expect(parseCellInput("1234567890123456")).toBe("1234567890123456");
    expect(parseCellInput("123456789012345.6")).toBe("123456789012345.6");
  });
});
