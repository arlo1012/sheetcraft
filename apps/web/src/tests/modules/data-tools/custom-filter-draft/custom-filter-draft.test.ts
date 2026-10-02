import { describe, expect, test } from "vitest";
import { datePartsToExcelSerial } from "@idea10/core/formula";
import {
  buildCustomFilterCondition,
  createCustomFilterDraft,
} from "../../../../modules/data-tools/custom-filter-draft";

describe("custom filter draft", () => {
  test("builds two populated rows with AND and OR independently", () => {
    const draft = createCustomFilterDraft("number", undefined, "1900");
    draft.first = { kind: "number", operator: "greaterThan", value: "12", value2: "" };
    draft.second = { kind: "number", operator: "lessThan", value: "20", value2: "" };

    expect(buildCustomFilterCondition(draft, "1900")).toEqual({
      kind: "compound",
      operator: "and",
      conditions: [
        { kind: "number", operator: "greaterThan", value: 12 },
        { kind: "number", operator: "lessThan", value: 20 },
      ],
    });

    draft.join = "or";
    expect(buildCustomFilterCondition(draft, "1900")).toMatchObject({ operator: "or" });
  });

  test("expands between and not-between criteria into editable compound rows", () => {
    expect(
      createCustomFilterDraft(
        "number",
        { kind: "number", operator: "between", value: 10, value2: 20 },
        "1900",
      ),
    ).toMatchObject({
      join: "and",
      first: { operator: "greaterThanOrEqual", value: "10" },
      second: { operator: "lessThanOrEqual", value: "20" },
    });
    expect(
      createCustomFilterDraft(
        "number",
        { kind: "number", operator: "notBetween", value: 10, value2: 20 },
        "1900",
      ),
    ).toMatchObject({
      join: "or",
      first: { operator: "lessThan", value: "10" },
      second: { operator: "greaterThan", value: "20" },
    });
  });

  test("uses the active date system and rejects an invalid second condition", () => {
    const serial = datePartsToExcelSerial(
      { year: 2026, month: 9, day: 16, hour: 0, minute: 0, second: 0, millisecond: 0 },
      "1904",
    );
    const draft = createCustomFilterDraft(
      "date",
      { kind: "date", operator: "equals", value: serial },
      "1904",
    );
    expect(draft.first.value).toBe("2026-09-16");
    expect(buildCustomFilterCondition(draft, "1904")).toEqual({
      kind: "date",
      operator: "equals",
      value: serial,
    });

    draft.second = { kind: "date", operator: "greaterThan", value: "not a date", value2: "" };
    expect(buildCustomFilterCondition(draft, "1904")).toBeUndefined();
  });

  test("treats a nonnumeric numeric-equals wildcard as a text condition", () => {
    const draft = createCustomFilterDraft("number", undefined, "1900", "equals");
    draft.first.value = "12*";
    expect(buildCustomFilterCondition(draft, "1900")).toEqual({
      kind: "text",
      operator: "equals",
      value: "12*",
    });
  });
});
