import { expect, test } from "vitest";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { getNamedRangeValue } from "../../../../modules/formula-tools/named-range-values";

function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  return { workbook, sheet };
}

test("previews calculated scalars, literal strings, blanks and range arrays", () => {
  const { workbook, sheet } = fixture();
  setCellValue(sheet, { row: 0, column: 0 }, 2);
  setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1*3" } });
  setCellValue(sheet, { row: 1, column: 0 }, "#REF!");
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  expect(
    getNamedRangeValue(
      sheet,
      { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
      evaluator,
    ),
  ).toEqual({ value: "6", hasError: false });
  expect(
    getNamedRangeValue(
      sheet,
      { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
      evaluator,
    ),
  ).toEqual({ value: '{2,6;"#REF!",0}', hasError: false });
});

test("detects computed errors and missing references", () => {
  const { workbook, sheet } = fixture();
  setCellContent(sheet, { row: 2, column: 0 }, { kind: "formula", formula: { source: "=1/0" } });
  const range = { start: { row: 2, column: 0 }, end: { row: 2, column: 0 } };
  expect(getNamedRangeValue(sheet, range, createWorkbookEvaluator(workbook, sheet.id))).toEqual({
    value: "#DIV/0!",
    hasError: true,
  });
  expect(getNamedRangeValue(undefined, range, undefined)).toEqual({
    value: "#REF!",
    hasError: true,
  });
});

test("detects errors in large sparse ranges and in spills rooted outside a range", () => {
  const { workbook, sheet } = fixture();
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    { kind: "formula", formula: { source: "={1,#N/A}" } },
  );
  const range = { start: { row: 0, column: 1 }, end: { row: 1_048_575, column: 1 } };
  expect(getNamedRangeValue(sheet, range, createWorkbookEvaluator(workbook, sheet.id))).toEqual({
    value: "{...}",
    hasError: true,
  });
});
