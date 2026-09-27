import { expect, test } from "vitest";
import {
  resolveDataValidationListValues,
  validateCellContentDataValidation,
} from "../../data-validation.js";
import { getActiveSheet, setCellContent, type SheetDataValidation } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const address = { row: 0, column: 2 };
const rule: SheetDataValidation = {
  id: "typed-list",
  range: { start: address, end: address },
  type: "list",
  formula1: "=$A$1:$A$11",
  allowBlank: false,
};

test.each(["=$A$1:$A$11", "=choices"])(
  "preserves literal and computed value types from %s",
  (formula1) => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const literals = [42, "0042", "=literal", true, 0, false];
    literals.forEach((value, row) => {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    });
    ["=21*2", '=IF(TRUE,"0042",0)', "=1=2", "=1/0"].forEach((source, index) => {
      setCellContent(
        sheet,
        { row: index + 6, column: 0 },
        { kind: "formula", formula: { source } },
      );
    });
    session.workbook.definedNames.set("choices", {
      id: "choices",
      name: "choices",
      reference: { sheetId: sheet.id, start: { row: 0, column: 0 }, end: { row: 10, column: 0 } },
    });

    const context = { workbook: session.workbook, sheet, address };
    const values = resolveDataValidationListValues({ ...rule, formula1 }, context);
    expect(values).toEqual([42, "0042", "=literal", true, 0, false, 42, "0042", false]);
    for (const value of values) {
      expect(
        validateCellContentDataValidation(
          { ...rule, formula1 },
          { kind: "literal", value },
          context,
        ),
      ).toEqual({ valid: true });
    }
    // Preserve the existing text-based membership check for typed manual input.
    expect(
      validateCellContentDataValidation(rule, { kind: "literal", value: "42" }, context),
    ).toEqual({
      valid: true,
    });
    expect(
      validateCellContentDataValidation(rule, { kind: "literal", value: 99 }, context),
    ).toEqual({
      valid: false,
      reason: "list",
    });
  },
);

test("keeps manual entries as configured text without modifying the list", () => {
  const list = ["42", "0042", "=literal", "42", ""];
  const values = resolveDataValidationListValues({ ...rule, list }, { address });
  expect(values).toEqual(list);
  expect(values).not.toBe(list);
  expect(
    validateCellContentDataValidation(
      { ...rule, list },
      { kind: "literal", value: 42 },
      { address },
    ),
  ).toEqual({
    valid: true,
  });
});

test.each([0, 42, true, false])("preserves scalar reference result %s", (value) => {
  expect(resolveDataValidationListValues(rule, { address, resolveReference: () => value })).toEqual(
    [value],
  );
});

test("retains comma-separated callback lists and ignores missing results", () => {
  expect(
    resolveDataValidationListValues(rule, { address, resolveReference: () => "Open, Closed" }),
  ).toEqual(["Open", "Closed"]);
  expect(resolveDataValidationListValues(rule, { address, resolveReference: () => null })).toEqual(
    [],
  );
});
