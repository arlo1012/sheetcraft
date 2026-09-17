import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import {
  createSetCellContentCommand,
  createSetSheetDataValidationsCommand,
} from "@idea10/core/commands";
import { executeWorkbookCommand, createWorkbookSession } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSheetEvaluator, getActiveSheet, setCellStyle } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";

function fixture(
  selection = {
    address: { row: 1, column: 1 },
    range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
  },
) {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
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
  test("sorts by a custom sequence with unlisted values after the sequence", () => {
    const f = fixture();
    f.set(0, 1, "Priority");
    f.set(1, 1, "Low");
    f.set(2, 1, "Other");
    f.set(3, 1, "High");
    f.set(4, 1, "Medium");
    f.controller.openSort();
    f.controller.applySort({
      range: "B1:B5",
      hasHeader: true,
      levels: [{ column: 1, direction: "ascending", customOrder: ["High", "Medium", "Low"] }],
    });
    const values = [0, 1, 2, 3, 4].map((row) =>
      createSheetEvaluator(f.sheet).getComputedValue({ row, column: 1 }),
    );
    expect(values).toEqual(["Priority", "High", "Medium", "Low", "Other"]);
  });
  test("discovers column colors and applies selected color placement through Core", () => {
    const f = fixture();
    f.set(0, 1, "Name");
    f.set(1, 1, "Ada");
    f.set(2, 1, "Bo");
    f.set(3, 1, "Cy");
    setCellStyle(f.sheet, { row: 2, column: 1 }, { fillColor: "#ff0000", textColor: "#00ff00" });
    f.controller.openSort();
    expect(f.controller.sortColorColumns.value[0]?.cellColors).toContain("#ff0000");
    f.controller.applySort({
      range: "B1:B4",
      hasHeader: true,
      levels: [{ column: 1, direction: "ascending", sortOn: "cellColor", color: "#ff0000" }],
    });
    const values = () =>
      [0, 1, 2, 3].map((row) => createSheetEvaluator(f.sheet).getComputedValue({ row, column: 1 }));
    expect(values()).toEqual(["Name", "Bo", "Ada", "Cy"]);
    f.controller.openSort();
    f.controller.applySort({
      range: "B1:B4",
      hasHeader: true,
      levels: [{ column: 1, direction: "descending", sortOn: "fontColor", color: "#00ff00" }],
    });
    expect(values()).toEqual(["Name", "Ada", "Cy", "Bo"]);
  });
  test("custom sort forwards case options and protects an active filter header", () => {
    const f = fixture();
    f.set(0, 1, "Name");
    f.set(1, 1, "a");
    f.set(2, 1, "B");
    f.controller.toggleFilter();
    f.controller.openSort();
    expect(f.controller.sortInitial.value).toMatchObject({ hasHeader: true, headerLocked: true });
    const draft = {
      range: "B1:B3",
      hasHeader: false,
      levels: [{ column: 1, direction: "ascending" as const }],
    };
    f.controller.applySort(draft);
    const values = () =>
      [0, 1, 2].map((row) => createSheetEvaluator(f.sheet).getComputedValue({ row, column: 1 }));
    expect(values()).toEqual(["Name", "a", "B"]);
    f.controller.openSort();
    f.controller.applySort({ ...draft, caseSensitive: true });
    expect(values()).toEqual(["Name", "B", "a"]);
  });
  test("counts other-column matches and normalizes all selected values to no column restriction", () => {
    const f = fixture();
    f.set(0, 0, "Team");
    f.set(0, 1, "Amount");
    f.set(1, 0, "East");
    f.set(1, 1, 10);
    f.set(2, 0, "East");
    f.set(2, 1, 2);
    f.set(3, 0, "West");
    f.set(3, 1, 2);
    f.controller.toggleFilter();
    f.controller.openColumnFilter(0);
    f.controller.applyColumnFilter({ includedKeys: [{ kind: "string", value: "East" }] });
    f.controller.openColumnFilter(1);
    expect(f.controller.filterState.value).toMatchObject({
      columnLabel: "Amount (B)",
      preferredKind: "number",
      values: [
        { key: { kind: "number", value: 2 }, count: 1 },
        { key: { kind: "number", value: 10 }, count: 1 },
      ],
    });
    f.controller.applyColumnFilter({
      includedKeys: f.controller.filterState.value!.values.map((item) => item.key),
    });
    expect(f.sheet.filter?.columns).toEqual([
      { column: 0, allowedValues: [{ kind: "string", value: "East" }] },
    ]);
    f.set(1, 1, 99);
    f.controller.openColumnFilter(1);
    expect(f.controller.filterState.value?.appliedKeys).toContainEqual({
      kind: "number",
      value: 99,
    });
    f.controller.applyColumnFilter({ includedKeys: [] });
    expect(f.sheet.filter?.columns.find((item) => item.column === 1)?.allowedValues).toEqual([]);
  });
  test("sorts the opened filter column and its full table when the active cell is elsewhere", () => {
    const f = fixture();
    f.set(0, 0, "Name");
    f.set(0, 1, "Amount");
    f.set(1, 0, "A");
    f.set(1, 1, 20);
    f.set(2, 0, "Z");
    f.set(2, 1, 10);
    f.controller.toggleFilter();
    f.selection.address = { row: 20, column: 5 };
    f.selection.range = { start: { row: 20, column: 5 }, end: { row: 20, column: 5 } };
    f.controller.openColumnFilter(1);
    f.controller.sortFilterColumn("ascending");
    const evaluator = createSheetEvaluator(f.sheet);
    expect(evaluator.getComputedValue({ row: 0, column: 1 })).toBe("Amount");
    expect(evaluator.getComputedValue({ row: 1, column: 1 })).toBe(10);
    expect(evaluator.getComputedValue({ row: 1, column: 0 })).toBe("Z");
  });
  test("enables outline actions only for eligible groups at the active cell", () => {
    const f = fixture();
    expect(f.controller.capabilities.value).toMatchObject({
      ungroupRows: false,
      expand: false,
      collapse: false,
      clearFilter: false,
    });
    f.controller.group("rows");
    expect(f.controller.capabilities.value).toMatchObject({
      ungroupRows: true,
      expand: false,
      collapse: true,
    });
    f.controller.setGroupsCollapsed(true);
    expect(f.controller.capabilities.value).toMatchObject({ expand: true, collapse: false });
  });
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
