import { describe, expect, test } from "vitest";
import { datePartsToExcelSerial } from "@idea10/core/formula";
import {
  createValidationDraft,
  isValidationDraftComplete,
  serializeValidationDraft,
} from "../../../../modules/data-tools/validation-draft";

const empty = () => ({
  type: "any" as const,
  operator: "between" as const,
  minimum: "",
  maximum: "",
  source: "",
  ignoreBlank: true,
  showDropdown: true,
  inputTitle: "",
  inputMessage: "",
  showInputMessage: false,
  errorTitle: "",
  errorMessage: "",
  errorStyle: "stop" as const,
  showErrorAlert: true,
});

describe("validation date and time drafts", () => {
  test("requires applicable bounds and a nonempty list or custom source", () => {
    const number = { ...empty(), type: "whole" as const };
    expect(isValidationDraftComplete(number, "1900")).toBe(false);
    expect(isValidationDraftComplete({ ...number, minimum: "1" }, "1900")).toBe(false);
    expect(
      isValidationDraftComplete({ ...number, minimum: "1", maximum: "=Limits!A1" }, "1900"),
    ).toBe(true);
    expect(isValidationDraftComplete({ ...number, type: "list", source: " " }, "1900")).toBe(false);
    expect(isValidationDraftComplete({ ...number, type: "custom", source: "=" }, "1900")).toBe(
      false,
    );
    expect(isValidationDraftComplete({ ...number, type: "custom", source: "=A1>0" }, "1900")).toBe(
      true,
    );
    expect(
      isValidationDraftComplete(
        { ...number, type: "date", minimum: "not-a-date", maximum: "2026-09-16" },
        "1900",
      ),
    ).toBe(false);
  });
  test("shows date serials in the workbook date system and serializes typed dates", () => {
    const serial = datePartsToExcelSerial(
      { year: 2026, month: 9, day: 16, hour: 0, minute: 0, second: 0, millisecond: 0 },
      "1904",
    );
    const draft = createValidationDraft(
      { id: "date", type: "date", formula1: String(serial), allowBlank: true },
      "1904",
      empty,
    );
    expect(draft.minimum).toBe("2026-09-16");
    expect(serializeValidationDraft(draft, "1904").minimum).toBe(String(serial));
  });
  test("shows time serials and retains formulas as references", () => {
    const draft = createValidationDraft(
      { id: "time", type: "time", formula1: "0.5", formula2: "=Limits!A1", allowBlank: false },
      "1900",
      empty,
    );
    expect(draft.minimum).toBe("12:00");
    expect(draft.maximum).toBe("=Limits!A1");
    expect(
      Number(serializeValidationDraft({ ...draft, minimum: "01:30:15" }, "1900").minimum),
    ).toBeCloseTo((90 * 60 + 15) / 86400);
  });
});
