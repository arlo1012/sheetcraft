import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import {
  createSetCellContentCommand,
  createSetSheetDataValidationsCommand,
} from "@idea10/core/commands";
import { executeWorkbookCommand, createWorkbookSession } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSheetEvaluator, getActiveSheet } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";

function fixture(
  selection = {
    address: { row: 1, column: 1 },
    range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
  },
) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  let generation = 0;
  let recalculate = 0;
  const set = (row: number, column: number, value: string | number) =>
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row, column }, { kind: "literal", value }),
    );
  let controller: ReturnType<typeof useDataToolsController> | undefined;
  mount(
    defineComponent({
      setup: () => {
        controller = useDataToolsController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getSheetEvaluator: () => createSheetEvaluator(sheet),
          getGeneration: () => generation,
          isBusy: () => false,
          execute: (command) => executeWorkbookCommand(session, command),
          flush: () => true,
          focusSheet: () => undefined,
          recalculate: () => {
            recalculate += 1;
          },
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n()] } },
  );
  return {
    session,
    sheet,
    set,
    controller: controller!,
    selection,
    changeGeneration: () => {
      generation += 1;
    },
    recalculate: () => recalculate,
  };
}

describe("useDataToolsController", () => {
  test("quick-sorts a B2 single cell over its data region while retaining the text header", () => {
    const f = fixture();
    f.set(0, 1, "Name");
    f.set(1, 1, 3);
    f.set(2, 1, 1);
    f.set(3, 1, 2);
    f.controller.sort("ascending");
    const values = [0, 1, 2, 3].map((row) =>
      createSheetEvaluator(f.sheet).getComputedValue({ row, column: 1 }),
    );
    expect(values).toEqual(["Name", 1, 2, 3]);
  });
  test("uses a captured sort range and rejects it when the workbook generation changes", () => {
    const f = fixture();
    f.set(0, 1, "Name");
    f.set(1, 1, 2);
    f.set(2, 1, 1);
    f.controller.openSort();
    f.selection.address = { row: 20, column: 4 };
    f.selection.range = { start: { row: 20, column: 4 }, end: { row: 20, column: 4 } };
    f.controller.applySort({
      range: "B1:B3",
      hasHeader: true,
      levels: [{ column: 1, direction: "ascending" }],
    });
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 1, column: 1 })).toBe(1);
    f.controller.openSort();
    f.changeGeneration();
    f.controller.applySort({
      range: "B1:B3",
      hasHeader: true,
      levels: [{ column: 1, direction: "descending" }],
    });
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 1, column: 1 })).toBe(1);
  });
  test("keeps inactive dialog columns empty and reapplies a no-op filter", () => {
    const f = fixture();
    f.set(0, 1, "Status");
    f.set(1, 1, "Open");
    f.controller.toggleFilter();
    f.controller.closeSort();
    expect(f.controller.columns.value).toEqual([]);
    f.controller.clearFilter();
    expect(f.sheet.filter?.range).toEqual({
      start: { row: 0, column: 1 },
      end: { row: 1, column: 1 },
    });
    f.controller.reapplyFilter();
    expect(f.recalculate()).toBe(1);
  });

  test("splits the exact selected C2:C4 source into E with text output types", () => {
    const f = fixture({
      address: { row: 1, column: 2 },
      range: { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
    });
    f.set(1, 2, "A|001");
    f.set(2, 2, "B|002");
    f.set(3, 2, "C|003");
    f.controller.openTextToColumns();
    f.controller.applyTextToColumns({
      mode: "delimiter",
      delimiters: ["|"],
      otherDelimiter: "",
      fixedWidths: [],
      destination: "E",
      overwrite: false,
      columnTypes: ["general", "text"],
    });
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 1, column: 4 })).toBe("A");
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 1, column: 5 })).toBe("001");
    expect(createSheetEvaluator(f.sheet).getComputedValue({ row: 3, column: 5 })).toBe("003");
  });

  test("updates duplicate count from the draft key columns and header choice", () => {
    const f = fixture({
      address: { row: 1, column: 0 },
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    });
    f.set(0, 0, "Name");
    f.set(0, 1, "Status");
    f.set(1, 0, "A");
    f.set(1, 1, "Open");
    f.set(2, 0, "A");
    f.set(2, 1, "Closed");
    f.set(3, 0, "A");
    f.set(3, 1, "Open");
    f.controller.openRemoveDuplicates();
    f.controller.updateRemoveDuplicatesDraft({ hasHeader: true, columns: [0] });
    expect(f.controller.duplicateCount.value).toBe(2);
    f.controller.updateRemoveDuplicatesDraft({ hasHeader: true, columns: [0, 1] });
    expect(f.controller.duplicateCount.value).toBe(1);
  });

  test("replaces one validation cell without losing outer custom-rule fragments", () => {
    const f = fixture({
      address: { row: 2, column: 1 },
      range: { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
    });
    executeWorkbookCommand(
      f.session,
      createSetSheetDataValidationsCommand(f.sheet.id, [
        {
          id: "custom",
          range: { start: { row: 0, column: 1 }, end: { row: 4, column: 1 } },
          type: "custom",
          formula1: "=A1>0",
          allowBlank: false,
        },
      ]),
    );
    f.controller.openValidation();
    expect(f.controller.validationInitial.value?.formula1).toBe("=A3>0");
    f.controller.applyValidation({
      type: "custom",
      operator: "between",
      minimum: "",
      maximum: "",
      source: "=A1<10",
      ignoreBlank: true,
      showDropdown: true,
      inputTitle: "",
      inputMessage: "",
      showInputMessage: false,
      errorTitle: "",
      errorMessage: "",
      errorStyle: "stop",
      showErrorAlert: true,
    });
    const rules = f.sheet.dataValidations ?? [];
    expect(rules.map((rule) => rule.range)).toEqual(
      expect.arrayContaining([
        { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } },
        { start: { row: 3, column: 1 }, end: { row: 4, column: 1 } },
        { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
      ]),
    );
    expect(rules.find((rule) => rule.range.start.row === 2)?.formula1).toBe("=A1<10");
  });
});
