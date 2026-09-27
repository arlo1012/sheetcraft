import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import {
  createSheetFilterHiddenRowIntervals,
  createSetCellContentCommand,
} from "@idea10/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  insertSheet,
} from "@idea10/core/workbook";
import { useDataToolsController } from "../../../../modules/data-tools/useDataToolsController";
import type { AdvancedFilterDraft } from "../../../../modules/data-tools/data-tools-types";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const generation = { value: 0 };
  const selection = {
    address: { row: 1, column: 0 },
    range: { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
  };
  const set = (row: number, column: number, value: string | number) =>
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row, column }, { kind: "literal", value }),
    );
  const rows = [
    ["Team", "Amount"],
    ["East", 10],
    ["West", 30],
    ["East", 20],
    ["East", 20],
  ];
  rows.forEach((row, r) => row.forEach((value, c) => set(r, c, value!)));
  set(0, 4, "Amount");
  set(1, 4, ">=20");
  let controller!: ReturnType<typeof useDataToolsController>;
  mounted.push(
    mount(
      defineComponent({
        setup() {
          controller = useDataToolsController({
            getWorkbook: () => session.workbook,
            getSelection: () => selection,
            getSheetEvaluator: () => createWorkbookEvaluator(session.workbook, sheet.id),
            getGeneration: () => generation.value,
            isBusy: () => false,
            execute: (command) => executeWorkbookCommand(session, command),
            flush: () => true,
            focusSheet: () => undefined,
          });
          return () => null;
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    ),
  );
  const draft = (patch: Partial<AdvancedFilterDraft> = {}): AdvancedFilterDraft => ({
    mode: "inPlace",
    listRange: "A1:B5",
    criteriaRange: "E1:E2",
    destination: "",
    uniqueOnly: false,
    overwrite: false,
    ...patch,
  });
  return { session, sheet, controller, set, generation, selection, draft };
}

describe("advanced filter workflow", () => {
  test("captures the list, applies criteria and uniqueness, and clears with undo", () => {
    const f = fixture();
    f.controller.openAdvancedFilter();
    expect(f.controller.advancedFilterDraft.value.listRange).toContain("$A$1:$B$5");
    f.controller.applyAdvancedFilter(f.draft({ uniqueOnly: true }));
    expect(f.controller.advancedFilterVisible.value).toBe(false);
    expect(createSheetFilterHiddenRowIntervals(f.sheet)).toEqual([
      { start: 1, end: 1 },
      { start: 4, end: 4 },
    ]);
    expect(f.controller.capabilities.value.clearFilter).toBe(true);
    f.controller.openAdvancedFilter();
    expect(f.controller.advancedFilterDraft.value).toMatchObject({ uniqueOnly: true });
    expect(f.controller.advancedFilterDraft.value.criteriaRange).toContain("$E$1:$E$2");
    f.controller.closeAdvancedFilter();
    f.controller.clearFilter();
    expect(createSheetFilterHiddenRowIntervals(f.sheet)).toEqual([]);
    undoWorkbookCommand(f.session);
    expect(createSheetFilterHiddenRowIntervals(f.sheet)).toEqual([
      { start: 1, end: 1 },
      { start: 4, end: 4 },
    ]);
  });

  test("reapplies the stored criteria after its cells change", () => {
    const f = fixture();
    f.controller.openAdvancedFilter();
    f.controller.applyAdvancedFilter(f.draft());
    f.set(1, 4, ">=30");
    expect(createSheetFilterHiddenRowIntervals(f.sheet)).toEqual([{ start: 1, end: 1 }]);
    f.controller.reapplyFilter();
    expect(createSheetFilterHiddenRowIntervals(f.sheet)).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 4 },
    ]);
  });

  test("copies unique records including headers and explicitly confirms occupied destinations", () => {
    const f = fixture();
    f.set(0, 7, "Keep me");
    const draft = f.draft({ mode: "copy", destination: "H1", criteriaRange: "", uniqueOnly: true });
    f.controller.openAdvancedFilter();
    f.controller.applyAdvancedFilter(draft);
    expect(f.controller.advancedFilterVisible.value).toBe(true);
    expect(f.controller.advancedFilterError.value).toContain("contains data");
    expect(getCellContent(f.sheet, { row: 0, column: 7 })).toEqual({
      kind: "literal",
      value: "Keep me",
    });
    f.controller.applyAdvancedFilter({ ...draft, overwrite: true });
    expect(f.controller.advancedFilterVisible.value).toBe(false);
    expect(getCellContent(f.sheet, { row: 0, column: 7 })).toEqual({
      kind: "literal",
      value: "Team",
    });
    expect(getCellContent(f.sheet, { row: 3, column: 7 })).toEqual({
      kind: "literal",
      value: "East",
    });
    expect(getCellContent(f.sheet, { row: 4, column: 7 })).toBeNull();
    expect(getCellContent(f.sheet, { row: 4, column: 0 })).toEqual({
      kind: "literal",
      value: "East",
    });
  });

  test("resolves another sheet's destination and reports protection inline", () => {
    const f = fixture();
    const target = createSheet("Output Sheet", "output");
    insertSheet(f.session.workbook, target);
    target.properties.protected = true;
    const draft = f.draft({ mode: "copy", destination: "'Output Sheet'!B2" });
    f.controller.openAdvancedFilter();
    f.controller.applyAdvancedFilter(draft);
    expect(f.controller.advancedFilterVisible.value).toBe(true);
    expect(f.controller.advancedFilterError.value).toContain("protected");
    target.properties.protected = false;
    f.controller.applyAdvancedFilter(draft);
    expect(getCellContent(target, { row: 1, column: 1 })).toEqual({
      kind: "literal",
      value: "Team",
    });
    expect(getCellContent(target, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 30 });
  });

  test("rejects invalid references and a stale workbook without mutation", () => {
    const f = fixture();
    f.controller.openAdvancedFilter();
    const history = f.session.history.undoStack.length;
    f.controller.applyAdvancedFilter(f.draft({ listRange: "A1:B5+E1:E2" }));
    expect(f.controller.advancedFilterError.value).toContain("list range");
    expect(f.session.history.undoStack).toHaveLength(history);
    f.generation.value++;
    f.controller.applyAdvancedFilter(f.draft());
    expect(f.controller.advancedFilterError.value).toContain("workbook changed");
    expect(f.sheet.filter).toBeNull();
  });
});
