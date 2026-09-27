import { describe, expect, test } from "vitest";
import { isNumericText, parseCellContent } from "../../input.js";

describe("numeric text recognition", () => {
  test.each(["11111111111111111111", "0012", " -12.5 ", "+.5", "1e20", "0"])(
    "recognizes %s without changing its literal text",
    (value) => {
      expect(isNumericText(value)).toBe(true);
      expect(parseCellContent(value, { asText: true })).toEqual({ kind: "literal", value });
    },
  );

  test.each(["", " ", "TRUE", "NaN", "Infinity", "1e400", "=12", "12a", "0x12"])(
    "does not classify %s as numeric text",
    (value) => expect(isNumericText(value)).toBe(false),
  );

  test("preserves all digits of a long direct input while recognizing it as numeric text", () => {
    const value = "11111111111111111111";
    expect(parseCellContent(value)).toEqual({ kind: "literal", value });
    expect(isNumericText(value)).toBe(true);
    expect(parseCellContent("111111111111111")).toEqual({
      kind: "literal",
      value: 111111111111111,
    });
  });
});
