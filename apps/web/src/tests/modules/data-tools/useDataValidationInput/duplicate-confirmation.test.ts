import { ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type SheetDataValidation,
} from "@idea10/core/workbook";
import { useDataValidationInput } from "../../../../modules/data-tools/useDataValidationInput";

const target = { row: 1, column: 0 };

function fixture(validation?: SheetDataValidation) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Taken" });
  sheet.duplicateRules = [
    {
      id: "reject-duplicates",
      kind: "reject",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
    },
  ];
  if (validation) sheet.dataValidations = [validation];
  const generation = ref(0);
  const execute = vi.fn<Parameters<typeof useDataValidationInput>[0]["execute"]>(() => true);
  const input = useDataValidationInput({
    getWorkbook: () => workbook,
    getGeneration: () => generation.value,
    execute,
    getDuplicateRejectionFeedback: () => ({ title: "Duplicate", message: "Already used" }),
  });
  const candidate = {
    sheetId: sheet.id,
    address: target,
    content: { kind: "literal" as const, value: "Taken" },
  };
  return { sheet, generation, execute, input, candidate };
}

describe("duplicate input confirmation", () => {
  test("requires an explicit second confirmation for the exact pending candidate", () => {
    const f = fixture();

    expect(f.input.commit(f.candidate)).toBe(false);
    expect(f.input.commit(f.candidate)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();

    expect(f.input.commit(f.candidate, { confirmPendingWarning: true })).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.execute.mock.calls[0]?.[1]).toEqual({ allowDuplicateEntry: true });
  });

  test("does not reuse confirmation after dismissal, a draft change, generation change, or rule change", () => {
    const f = fixture();
    expect(f.input.commit(f.candidate)).toBe(false);
    f.input.dismiss();
    expect(f.input.commit(f.candidate, { confirmPendingWarning: true })).toBe(false);

    expect(f.input.commit(f.candidate)).toBe(false);
    setCellContent(
      f.sheet,
      { row: 0, column: 0 },
      {
        kind: "literal",
        value: "Another taken value",
      },
    );
    expect(
      f.input.commit(
        { ...f.candidate, content: { kind: "literal", value: "Another taken value" } },
        { confirmPendingWarning: true },
      ),
    ).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();

    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "Taken" });
    expect(f.input.commit(f.candidate)).toBe(false);
    f.generation.value += 1;
    expect(f.input.commit(f.candidate, { confirmPendingWarning: true })).toBe(false);

    expect(f.input.commit(f.candidate)).toBe(false);
    f.sheet.duplicateRules![0]!.id = "changed-rule";
    expect(f.input.commit(f.candidate, { confirmPendingWarning: true })).toBe(false);
  });

  test("does not let duplicate confirmation bypass a stop validation", () => {
    const f = fixture({
      id: "stop-rule",
      range: { start: target, end: target },
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "10",
      allowBlank: false,
      errorStyle: "stop",
    });

    expect(f.input.commit(f.candidate)).toBe(false);
    expect(f.input.commit(f.candidate, { confirmPendingWarning: true })).toBe(false);
    expect(f.input.feedback.value).toMatchObject({ style: "stop" });
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("keeps an exact duplicate confirmation while a warning awaits acceptance", () => {
    const f = fixture({
      id: "warning-rule",
      range: { start: target, end: target },
      type: "whole",
      operator: "between",
      formula1: "1",
      formula2: "10",
      allowBlank: false,
      errorStyle: "warning",
    });

    expect(f.input.commit(f.candidate)).toBe(false);
    expect(f.input.commit(f.candidate, { confirmPendingWarning: true })).toBe(false);
    expect(f.input.feedback.value).toMatchObject({ style: "warning" });
    expect(f.input.accept()).toBe(true);
    expect(f.execute.mock.calls[0]?.[1]).toEqual({ allowDuplicateEntry: true });
  });
});
