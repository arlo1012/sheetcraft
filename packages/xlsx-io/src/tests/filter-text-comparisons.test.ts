import { describe, expect, test } from "vitest";
import {
  readXlsxAutoFilter,
  writeXlsxAutoFilter,
  type XlsxFilter,
} from "../data-tools-metadata.js";

type TextCondition = Extract<
  NonNullable<XlsxFilter["columns"][number]["condition"]>,
  { kind: "text" }
>;
function filter(condition: TextCondition): XlsxFilter {
  return {
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
    columns: [{ column: 0, allowedValues: [], condition }],
  };
}

describe("XLSX text comparison filters", () => {
  test.each([
    ["doesNotBeginWith", "A~*B~?~~*"],
    ["doesNotEndWith", "*A~*B~?~~"],
  ] as const)(
    "round trips %s without double escaping literal wildcard characters",
    (operator, pattern) => {
      const source = filter({ kind: "text", operator, value: "A~*B~?~~" });
      const xml = writeXlsxAutoFilter(source);
      expect(xml).toContain(`<customFilter operator="notEqual" val="${pattern}"/>`);
      const restored = readXlsxAutoFilter(xml);
      expect(restored.unsupported).toBe(false);
      expect(restored.value).toEqual(source);
    },
  );

  test.each(["greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual"] as const)(
    "round trips lexical %s comparisons with XML escaping",
    (operator) => {
      const source = filter({ kind: "text", operator, value: "A&B" });
      const xml = writeXlsxAutoFilter(source);
      expect(xml).toContain(`<customFilter operator="${operator}" val="A&amp;B"/>`);
      const restored = readXlsxAutoFilter(xml);
      expect(restored.unsupported).toBe(false);
      expect(restored.value).toEqual(source);
    },
  );

  test.each([
    ["between", "and", "greaterThanOrEqual", "lessThanOrEqual"],
    ["notBetween", "or", "lessThan", "greaterThan"],
  ] as const)(
    "writes a text %s as two OOXML criteria and restores equivalent compound semantics",
    (operator, join, lower, upper) => {
      const xml = writeXlsxAutoFilter(
        filter({ kind: "text", operator, value: "Alpha", value2: "Omega" }),
      );
      expect(xml.match(/<customFilter\s/g)).toHaveLength(2);
      expect(xml).toContain(`<customFilters${join === "and" ? ' and="1"' : ""}>`);
      expect(xml).toContain(`<customFilter operator="${lower}" val="Alpha"/>`);
      expect(xml).toContain(`<customFilter operator="${upper}" val="Omega"/>`);
      const restored = readXlsxAutoFilter(xml);
      expect(restored.unsupported).toBe(false);
      expect(restored.value?.columns[0]?.condition).toEqual({
        kind: "compound",
        operator: join,
        conditions: [
          { kind: "text", operator: lower, value: "Alpha" },
          { kind: "text", operator: upper, value: "Omega" },
        ],
      });
      expect(readXlsxAutoFilter(writeXlsxAutoFilter(restored.value!)).value).toEqual(
        restored.value,
      );
    },
  );
});
