import { afterEach, describe, expect, test, vi } from "vitest";
import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSheetEvaluator, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";

const wrappers: Array<{ unmount: () => void }> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  localStorage.clear();
});

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const range = { start: { row: 0, column: 1 }, end: { row: 3, column: 2 } };
  const values = [
    ["Name", "Amount"],
    ["Bo", 20],
    ["Ada", 10],
    ["Cy", 30],
  ];
  values.forEach((row, rowIndex) =>
    row.forEach((value, offset) =>
      setCellContent(sheet, { row: rowIndex, column: offset + 1 }, { kind: "literal", value }),
    ),
  );
  sheet.filter = { range, columns: [] };
  const address = { row: 20, column: 9 };
  setCellContent(sheet, address, { kind: "literal", value: "Outside" });
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  let controller!: ReturnType<typeof useDataToolsController>;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          controller = useDataToolsController({
            getWorkbook: () => session.workbook,
            getSelection: () => ({ address, range: { start: address, end: address } }),
            getSheetEvaluator: () => createSheetEvaluator(getActiveSheet(session.workbook)),
            getGeneration: () => 0,
            isBusy: () => false,
            execute,
            flush: () => true,
            focusSheet: () => undefined,
          });
          return () => null;
        },
      }),
      { global: { plugins: [createAppI18n()] } },
    ),
  );
  const rows = () => {
    const evaluator = createSheetEvaluator(getActiveSheet(session.workbook));
    return Array.from({ length: 4 }, (_, row) => [
      evaluator.getComputedValue({ row, column: 1 }),
      evaluator.getComputedValue({ row, column: 2 }),
    ]);
  };
  return { controller, execute, rows, values, session, address };
}

describe("filter sort dialog", () => {
  test("opens for the filter column and full range without sorting, and cancellation preserves rows", () => {
    const f = fixture();
    f.controller.openColumnFilter(2);
    f.controller.openFilterSort();
    expect(f.controller.filterState.value).toBeUndefined();
    expect(f.controller.sortVisible.value).toBe(true);
    expect(f.controller.rangeLabel.value).toBe("B1:C4");
    expect(f.controller.columns.value.map((column) => column.column)).toEqual([1, 2]);
    expect(f.controller.sortInitial.value).toEqual({
      column: 2,
      direction: "ascending",
      hasHeader: true,
      headerLocked: true,
    });
    expect(f.execute).not.toHaveBeenCalled();
    f.controller.closeSort();
    expect(f.rows()).toEqual(f.values);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("confirmation sorts the captured filter range and keeps its header and outside cells", () => {
    const f = fixture();
    f.controller.openColumnFilter(2);
    f.controller.openFilterSort();
    f.controller.applySort({
      range: "B1:C4",
      hasHeader: true,
      levels: [{ column: 2, direction: "descending" }],
    });
    expect(f.rows()).toEqual([
      ["Name", "Amount"],
      ["Cy", 30],
      ["Bo", 20],
      ["Ada", 10],
    ]);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(
      createSheetEvaluator(getActiveSheet(f.session.workbook)).getComputedValue(f.address),
    ).toBe("Outside");
    expect(f.controller.sortVisible.value).toBe(false);
  });
});
