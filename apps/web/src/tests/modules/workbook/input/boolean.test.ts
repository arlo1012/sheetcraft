import { describe, expect, test } from "vitest";
import { parseCellInput } from "../../../../modules/workbook/input";

describe("boolean cell input", () => {
  test("parses case-insensitive boolean values", () => {
    expect(parseCellInput("TRUE")).toBe(true);
    expect(parseCellInput("false")).toBe(false);
  });
});
