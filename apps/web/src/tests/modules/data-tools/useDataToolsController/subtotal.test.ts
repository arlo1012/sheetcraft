import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbookEvaluator, getActiveSheet, setCellValue } from "@sheetcraft/core/workbook";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";
import { createAppI18n } from "../../../../shared/i18n";
let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  localStorage.clear();
});
function mountController(
  session: ReturnType<typeof createWorkbookSession>,
  range: { start: { row: number; column: number }; end: { row: number; column: number } },
) {
  const sheet = getActiveSheet(session.workbook);
  let controller!: ReturnType<typeof useDataToolsController>;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useDataToolsController({
          getWorkbook: () => session.workbook,
          getSelection: () => ({ address: range.start, range }),
          getSheetEvaluator: () => createWorkbookEvaluator(session.workbook, sheet.id),
          getGeneration: () => 0,
          isBusy: () => false,
          execute: (command) => executeWorkbookCommand(session, command),
          flush: () => true,
          focusSheet: () => {},
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  return controller;
}
test("applies product subtotals above details with page breaks as one undoable edit", () => {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  [
    ["Group", "Amount"],
    ["A", 2],
    ["A", 3],
    ["B", 4],
  ].forEach((row, r) =>
    row.forEach((value, c) => setCellValue(sheet, { row: r, column: c }, value)),
  );
  const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
  const controller = mountController(session, range);
  controller.openSubtotal();
  controller.applySubtotal({
    groupColumn: 0,
    valueColumns: [1],
    function: "product",
    replaceExisting: true,
    pageBreaks: true,
    summaryBelow: false,
  });
  expect(controller.subtotalVisible.value).toBe(false);
  expect(session.history.undoStack).toHaveLength(1);
  const evaluator = createWorkbookEvaluator(session.workbook, sheet.id);
  expect(evaluator.getComputedValue({ row: 1, column: 1 })).toBe(24);
  expect(evaluator.getComputedValue({ row: 2, column: 1 })).toBe(6);
  expect(evaluator.getComputedValue({ row: 5, column: 1 })).toBe(4);
  expect(sheet.subtotalMetadata?.[0]).toMatchObject({ summaryBelow: false, pageBreakRows: [5] });
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(sheet.subtotalMetadata).toEqual([]);
  expect(
    createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 3, column: 1 }),
  ).toBe(4);
});

test("reopens the full inserted-column range and excludes generated label columns from field choices", () => {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  [
    ["Group", "Amount"],
    ["A", 2],
    ["A", 3],
    ["B", 4],
  ].forEach((values, row) =>
    values.forEach((value, column) => setCellValue(sheet, { row, column }, value)),
  );
  const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
  const controller = mountController(session, range);
  const settings = {
    function: "sum" as const,
    replaceExisting: true,
    pageBreaks: false,
    summaryBelow: true,
  };
  controller.openSubtotal();
  controller.applySubtotal({ ...settings, groupColumn: 0, valueColumns: [0, 1] });
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([0]);
  controller.openSubtotal();
  expect(controller.columns.value.map((column) => column.column)).toEqual([1, 2]);
  expect(controller.columns.value.map((column) => column.header)).toEqual(["Group", "Amount"]);
  controller.applySubtotal({ ...settings, groupColumn: 1, valueColumns: [1, 2] });
  expect(sheet.subtotalMetadata).toHaveLength(1);
  expect(sheet.subtotalMetadata?.[0]?.generatedColumns).toEqual([0]);
  expect(sheet.subtotalMetadata?.[0]?.range.end.column).toBe(2);
  const totalRow = sheet.subtotalMetadata![0]!.generatedRows.at(-1)!;
  expect(
    createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({
      row: totalRow,
      column: 2,
    }),
  ).toBe(9);
  controller.openSubtotal();
  controller.removeSubtotals();
  expect(sheet.subtotalMetadata).toEqual([]);
  expect(
    createWorkbookEvaluator(session.workbook, sheet.id).getComputedValue({ row: 3, column: 1 }),
  ).toBe(4);
});
