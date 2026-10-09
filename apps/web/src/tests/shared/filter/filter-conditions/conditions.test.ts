import { describe, expect, test } from "vitest";
import { datePartsToExcelSerial } from "@sheetcraft/core/formula";
import {
  buildFilterCondition,
  createFilterConditionDraft,
} from "../../../../shared/filter/filter-conditions";

describe("filter condition editing", () => {
  test("reopens and reapplies numeric operators without changing their meaning", () => {
    const condition = { kind: "number", operator: "greaterThanOrEqual", value: 12 } as const;
    expect(buildFilterCondition(createFilterConditionDraft(condition, "1900"), "1900")).toEqual({
      valid: true,
      condition,
    });
  });

  test("rejects missing and non-numeric boundaries rather than converting blanks to zero", () => {
    for (const first of ["", " ", "abc", "Infinity"]) {
      expect(
        buildFilterCondition(
          { kind: "number", operator: "greaterThan", first, second: "" },
          "1900",
        ),
      ).toEqual({ valid: false });
    }
    expect(
      buildFilterCondition(
        { kind: "number", operator: "between", first: "10", second: "2" },
        "1900",
      ),
    ).toEqual({ valid: false });
  });

  test("uses the workbook date system and rejects impossible dates", () => {
    const value = datePartsToExcelSerial(
      { year: 2026, month: 9, day: 16, hour: 0, minute: 0, second: 0, millisecond: 0 },
      "1904",
    );
    const condition = { kind: "date", operator: "equals", value } as const;
    const draft = createFilterConditionDraft(condition, "1904");
    expect(draft.first).toBe("2026-09-16");
    expect(buildFilterCondition(draft, "1904")).toEqual({ valid: true, condition });
    expect(buildFilterCondition({ ...draft, first: "2026-02-30" }, "1904")).toEqual({
      valid: false,
    });
  });

  test("retains text matching and treats the value-list mode independently", () => {
    const condition = { kind: "text", operator: "doesNotContain", value: "draft" } as const;
    expect(buildFilterCondition(createFilterConditionDraft(condition, "1900"), "1900")).toEqual({
      valid: true,
      condition,
    });
    expect(
      buildFilterCondition({ kind: "values", operator: "between", first: "", second: "" }, "1900"),
    ).toEqual({ valid: true });
  });
});
