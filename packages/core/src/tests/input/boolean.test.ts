import { describe, expect, test } from "vitest";
import { parseCellInput } from "../../input.js";

describe("boolean cell input", () => {
  test("parses case-insensitive boolean values", () => {
    expect(parseCellInput("TRUE")).toBe(true);
    expect(parseCellInput("false")).toBe(false);
  });
});
