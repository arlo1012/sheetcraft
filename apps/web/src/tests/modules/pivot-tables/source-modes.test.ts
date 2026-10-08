import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, insertSheet, getCellValue, setCellContent } from "@idea10/core/workbook";
import { getPivotTableSource } from "@idea10/core/pivot-tables";
import { serializeWorkbook } from "@idea10/core/serialization";
import PivotFieldsPane from "../../../modules/pivot-tables/components/PivotFieldsPane.vue";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import type { PivotDraft } from "../../../modules/pivot-tables/usePivotActions";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function mountDialog(
  f = fixture(),
  patch: Partial<PivotDraft> = {},
  selectReference = vi.fn(async (_current: string): Promise<string | undefined> => undefined),
) {
  f.actions.open();
  const wrapper = mount(PivotTableDialog, {
    attachTo: document.body,
    props: {
      initial: { ...f.actions.editing.value!, ...patch },
      workbook: f.workbook,
      revision: 0,
      disabled: false,
      error: false,
      suspended: false,
      selectReference,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { f, wrapper, selectReference };
}
function editor() {
  return new DOMWrapper(document.querySelector(".pivot-create")!);
}
function confirmButton() {
  return document
    .querySelector(".pivot-create")!
    .closest(".t-dialog")!
    .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!;
}
async function mode(value: string) {
  await new DOMWrapper(
    editor().get(`input[type="radio"][value="${value}"]`).element.closest("label")!,
  ).trigger("click");
  await flushPromises();
}
function wizard() {
  return new DOMWrapper(document.querySelector(".pivot-consolidation-wizard")!);
}
function wizardButtons() {
  return new DOMWrapper(wizard().element.closest(".t-dialog")!).findAll(".t-dialog__footer button");
}
async function openRangesWizard() {
  await editor().get(".pivot-create__range-summary button").trigger("click");
  await flushPromises();
}
function configuredReport() {
  const f = fixture();
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  f.selectOutput();
  f.actions.update({
    ...f.sheet.pivotTables![0]!,
    rowFields: [0],
    values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
  });
  return f;
}
function matrixFixture() {
  const f = fixture();
  f.source.cells.clear();
  const second = createSheet("Second", "second");
  insertSheet(f.workbook, second);
  for (const [sheet, rows] of [
    [
      f.source,
      [
        ["Region", "Q1", "Q2"],
        ["East", 10, 20],
        ["West", 40, 0],
      ],
    ],
    [
      second,
      [
        ["Region", "Q1", "Q2"],
        ["East", 7, 3],
      ],
    ],
  ] as const) {
    rows.forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  f.actions.open();
  f.actions.confirm({
    ...f.actions.editing.value!,
    sourceKind: "consolidation",
    sources: ["'Source Data'!A1:C3", "Second!A1:C2"],
  });
  expect(f.actions.error.value).toBe(false);
  f.selectOutput();
  expect(
    f.actions.update({
      ...f.sheet.pivotTables![0]!,
      rowFields: [0],
      columnFields: [],
      values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
      filters: [],
    }),
  ).toBe(true);
  return { f, second };
}

describe("PivotTable source modes", () => {
  test("clearing a configured report removes axis rules together with their fields", () => {
    const f = configuredReport();
    expect(
      f.actions.update({
        ...f.sheet.pivotTables![0]!,
        axisFilters: [
          {
            axis: "rows",
            field: 0,
            values: ["East"],
            valueCondition: {
              measure: 0,
              condition: { kind: "number", operator: "greaterThan", value: 0 },
            },
          },
        ],
      }),
    ).toBe(true);
    f.actions.clear();
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.sheet.pivotTables![0]).toMatchObject({
      rowFields: [],
      columnFields: [],
      values: [],
      filters: [],
    });
    expect(f.sheet.pivotTables![0]!.axisFilters).toBeUndefined();
  });
  test.each([true, false])(
    "source replacement remaps axis identity and retained measure with keepAmount=%s",
    (keepAmount) => {
      const f = configuredReport();
      expect(
        f.actions.update({
          ...f.sheet.pivotTables![0]!,
          values: [
            { field: 1, aggregate: "count", caption: "Quarter count" },
            { field: 2, aggregate: "sum", caption: "Amount" },
          ],
          axisFilters: [
            {
              axis: "rows",
              field: 0,
              values: ["East"],
              valueCondition: {
                measure: 1,
                condition: { kind: "number", operator: "greaterThan", value: 0 },
              },
            },
          ],
        }),
      ).toBe(true);
      const second = createSheet("Replacement", "replacement-source");
      insertSheet(f.workbook, second);
      const rows = keepAmount
        ? [
            ["Amount", "Region"],
            [50, "East"],
            [60, "West"],
          ]
        : [["Region"], ["East"], ["West"]];
      rows.forEach((row, r) =>
        row.forEach((value, column) =>
          setCellContent(second, { row: r, column }, { kind: "literal", value: value! }),
        ),
      );
      f.actions.source();
      f.actions.confirm({
        ...f.actions.editing.value!,
        source: keepAmount ? "Replacement!A1:B3" : "Replacement!A1:A3",
      });
      expect(f.actions.error.value).toBe(false);
      const table = f.sheet.pivotTables![0]!;
      expect(table.rowFields).toEqual([keepAmount ? 1 : 0]);
      expect(table.axisFilters![0]).toMatchObject({
        axis: "rows",
        field: keepAmount ? 1 : 0,
        values: ["East"],
      });
      if (keepAmount) {
        expect(table.values).toEqual([{ field: 0, aggregate: "sum", caption: "Amount" }]);
        expect(table.axisFilters![0]!.valueCondition).toEqual({
          measure: 0,
          condition: { kind: "number", operator: "greaterThan", value: 0 },
        });
      } else {
        expect(table.values).toEqual([]);
        expect(table.axisFilters![0]!.valueCondition).toBeUndefined();
      }
    },
  );
  test("defaults to a cell range and validates only the selected source mode", async () => {
    const { wrapper } = mountDialog(fixture(), {
      sources: ["Missing!A1:C2"],
      sourcePivot: { sheetId: "missing", tableId: "missing" },
    });
    await flushPromises();
    expect((editor().get('input[value="range"]').element as HTMLInputElement).checked).toBe(true);
    expect(confirmButton().disabled).toBe(false);
    await mode("consolidation");
    expect(confirmButton().disabled).toBe(true);
    await mode("range");
    confirmButton().click();
    await flushPromises();
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({ sourceKind: "range" });
  });
  test.each(["single", "custom"] as const)(
    "selects %s page fields in the parent and finishes directly from range selection",
    async (pageMode) => {
      const f = fixture();
      const second = createSheet("Second", "second");
      second.cells = new Map(f.source.cells);
      insertSheet(f.workbook, second);
      const { wrapper } = mountDialog(f, {
        sources: ["'Source Data'!A1:C4"],
        consolidationPageCount: 1,
        consolidationPageItems: [["Original"]],
      });
      await flushPromises();
      expect(editor().find('input[value="single"]').exists()).toBe(false);
      await mode("consolidation");
      expect(editor().get('input[value="single"]').exists()).toBe(true);
      expect(editor().get('input[value="custom"]').exists()).toBe(true);
      await mode(pageMode);
      await openRangesWizard();
      expect(wizard().find(".pivot-consolidation-wizard__count").exists()).toBe(
        pageMode === "custom",
      );
      expect(wizard().findAll(".pivot-consolidation-ranges__page-items input")).toHaveLength(
        pageMode === "custom" ? 1 : 0,
      );
      if (pageMode === "custom") {
        await wizard().get(".pivot-consolidation-ranges__page-items input").setValue("Edited");
      }
      await wizard().get(".pivot-consolidation-ranges input").setValue("Second!A1:C4");
      await wizard().get('[data-pivot-range-action="add"]').trigger("click");
      await flushPromises();
      if (pageMode === "custom") {
        await wizard().get(".pivot-consolidation-ranges__page-items input").setValue("Added");
      }
      await wizardButtons()[1]!.trigger("click");
      await flushPromises();
      expect(wrapper.emitted("confirm")).toHaveLength(1);
      expect(editor().isVisible()).toBe(false);
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
        sourceKind: "consolidation",
        consolidationPageMode: pageMode,
        sources: ["'Source Data'!A1:C4", "=Second!$A$1:$C$4"],
      });
    },
  );
  test.each([true, false])(
    "Finish creates a report once with newSheet=%s without reopening the parent",
    async (newSheet) => {
      const f = fixture();
      const { wrapper } = mountDialog(f, {
        sourceKind: "consolidation",
        sources: ["'Source Data'!A1:C4"],
        destination: "F8",
        newSheet,
        overwrite: true,
        chart: true,
      });
      await wrapper.setProps({ onConfirm: (draft: PivotDraft) => f.actions.confirm(draft) });
      await flushPromises();
      await openRangesWizard();
      const calls = f.execute.mock.calls.length;
      await wizardButtons()[1]!.trigger("click");
      await flushPromises();
      expect(wrapper.emitted("confirm")).toHaveLength(1);
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
        newSheet,
        destination: "F8",
        overwrite: true,
        chart: true,
      });
      expect(f.actions.error.value).toBe(false);
      expect(f.execute.mock.calls.length).toBe(calls + 1);
      expect(f.sheet.pivotTables).toHaveLength(1);
      expect(editor().isVisible()).toBe(false);
    },
  );
  test("keeps overwrite feedback in range selection for a Finish retry", async () => {
    const f = fixture();
    setCellContent(f.source, { row: 7, column: 5 }, { kind: "literal", value: "Occupied" });
    const { wrapper } = mountDialog(f, {
      sourceKind: "consolidation",
      sources: ["'Source Data'!A1:C4"],
      destination: "F8",
      newSheet: false,
    });
    await wrapper.setProps({
      onConfirm: (draft: PivotDraft) => {
        f.actions.confirm(draft);
        void wrapper.setProps({
          error: f.actions.error.value,
          errorReason: f.actions.errorReason.value,
        });
      },
    });
    await flushPromises();
    await openRangesWizard();
    await wizardButtons()[1]!.trigger("click");
    await flushPromises();
    expect(f.actions.errorReason.value).toBe("overwrite");
    expect(wizard().isVisible()).toBe(true);
    expect(editor().isVisible()).toBe(false);
    expect(wizard().get('[role="alert"]').text()).toContain("destination contains content");
    await wizard().get('input[type="checkbox"]').setValue(true);
    await wizardButtons()[1]!.trigger("click");
    await flushPromises();
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables).toHaveLength(1);
    expect(wrapper.emitted("confirm")?.at(-1)?.[0]).toMatchObject({
      overwrite: true,
      destination: "F8",
    });
    expect(editor().isVisible()).toBe(false);
  });
  test("disables parent page-field choices while editing is disabled", async () => {
    const { wrapper } = mountDialog(fixture(), { sourceKind: "consolidation" });
    await flushPromises();
    await wrapper.setProps({ disabled: true });
    for (const pageMode of ["single", "custom"]) {
      expect(
        (editor().get(`input[value="${pageMode}"]`).element as HTMLInputElement).disabled,
      ).toBe(true);
    }
    expect(
      (editor().get(".pivot-create__range-summary button").element as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  test("adds a selected worksheet range, rejects duplicates, and removes the selection", async () => {
    const { wrapper, selectReference } = mountDialog();
    selectReference.mockResolvedValueOnce("'Source Data'!A1:C4");
    await flushPromises();
    await mode("consolidation");
    await openRangesWizard();
    const ranges = wizard().get(".pivot-consolidation-ranges");
    await ranges.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    const add = ranges.get('[data-pivot-range-action="add"]');
    await add.trigger("click");
    await flushPromises();
    expect(ranges.findAll("tr[data-pivot-range-row]")).toHaveLength(1);
    expect((add.element as HTMLButtonElement).disabled).toBe(true);
    expect((wizardButtons()[1]!.element as HTMLButtonElement).disabled).toBe(false);
    await ranges.get('[data-pivot-range-action="remove"]').trigger("click");
    await flushPromises();
    expect(ranges.findAll("tr[data-pivot-range-row]")).toHaveLength(0);
    expect(ranges.find('[data-pivot-range-action="remove"]').exists()).toBe(false);
    expect((wizardButtons()[1]!.element as HTMLButtonElement).disabled).toBe(true);
    await add.trigger("click");
    await flushPromises();
    await wizardButtons()[1]!.trigger("click");
    await flushPromises();
    expect(editor().isVisible()).toBe(false);
    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      sourceKind: "consolidation",
      sources: ["='Source Data'!$A$1:$C$4"],
    });
  });
  test("canceling an asynchronous range picker preserves the entered consolidation reference", async () => {
    let resolve!: (value: string | undefined) => void;
    const selectReference = vi.fn(
      (_current: string) =>
        new Promise<string | undefined>((done) => {
          resolve = done;
        }),
    );
    const { wrapper } = mountDialog(fixture(), {}, selectReference);
    await flushPromises();
    await mode("consolidation");
    await openRangesWizard();
    const ranges = wizard().get(".pivot-consolidation-ranges");
    await ranges.get("input").setValue("'Source Data'!A1:C4");
    await ranges.get("[data-select-formula-reference]").trigger("click");
    expect(selectReference).toHaveBeenCalledWith("'Source Data'!A1:C4");
    resolve(undefined);
    await flushPromises();
    expect((ranges.get("input").element as HTMLInputElement).value).toBe("'Source Data'!A1:C4");
    await ranges.get('[data-pivot-range-action="add"]').trigger("click");
    await flushPromises();
    expect((wizardButtons()[1]!.element as HTMLButtonElement).disabled).toBe(false);
    await wizardButtons()[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(editor().isVisible()).toBe(false);
  });
  test("requires an existing report selection and emits its stable identifiers", async () => {
    const f = configuredReport();
    const sheetId = f.sheet.id;
    const tableId = f.sheet.pivotTables![0]!.id;
    const { wrapper } = mountDialog(f);
    await flushPromises();
    await mode("pivot");
    expect(confirmButton().disabled).toBe(true);
    await editor().get('.pivot-create__reports [role="option"]').trigger("click");
    expect(confirmButton().disabled).toBe(false);
    confirmButton().click();
    await flushPromises();
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      sourceKind: "pivot",
      sourcePivot: { sheetId, tableId },
    });
  });
  test("cannot confirm another-report mode when the workbook has no reports", async () => {
    mountDialog();
    await flushPromises();
    await mode("pivot");
    expect(editor().find(".pivot-create__reports").exists()).toBe(false);
    expect(editor().findAll('.pivot-create__reports [role="option"]')).toHaveLength(0);
    expect(confirmButton().disabled).toBe(true);
    confirmButton().click();
  });
  test("reuses the original records rather than aggregating the selected report's displayed summary", () => {
    const f = configuredReport();
    const report = f.sheet.pivotTables![0]!;
    const sourcePivot = { sheetId: f.sheet.id, tableId: report.id };
    f.actions.open();
    f.actions.confirm({
      ...f.actions.editing.value!,
      sourceKind: "pivot",
      source: "Missing!A1",
      sourcePivot,
    });
    expect(f.actions.error.value).toBe(false);
    const table = f.sheet.pivotTables![0]!;
    expect(table.sourceSheetId).toBe(f.source.id);
    expect([...getPivotTableSource(f.workbook, table).records()]).toEqual([
      ["East", "Q1", 10],
      ["East", "Q2", 20],
      ["West", "Q1", 40],
    ]);
    f.selectOutput();
    expect(
      f.actions.update({
        ...table,
        rowFields: [0],
        values: [{ field: 2, aggregate: "count", caption: "Records" }],
      }),
    ).toBe(true);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(2);
  });
  test("rejects a deleted report reference without creating a sheet or changing history", () => {
    const f = configuredReport();
    const sheet = f.sheet;
    const sourcePivot = { sheetId: sheet.id, tableId: sheet.pivotTables![0]!.id };
    f.actions.open();
    const draft = { ...f.actions.editing.value!, sourceKind: "pivot" as const, sourcePivot };
    sheet.pivotTables = [];
    const before = serializeWorkbook(f.workbook);
    const calls = f.execute.mock.calls.length;
    f.actions.confirm(draft);
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBeDefined();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.execute).toHaveBeenCalledTimes(calls);
  });
  test("creates and refreshes combined matrix records across worksheets", () => {
    const { f, second } = matrixFixture();
    expect(getPivotTableSource(f.workbook, f.sheet.pivotTables![0]!).headers).toEqual([
      "Row",
      "Column",
      "Value",
      "Page1",
    ]);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(40);
    expect(getCellValue(f.sheet, { row: 2, column: 1 })).toBe(40);
    setCellContent(second, { row: 1, column: 1 }, { kind: "literal", value: 17 });
    f.actions.refresh();
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(50);
    expect(f.onError).not.toHaveBeenCalled();
  });
  test("another report retains all consolidated ranges instead of only the primary range", () => {
    const { f } = matrixFixture();
    const original = f.sheet.pivotTables![0]!;
    const sourcePivot = { sheetId: f.sheet.id, tableId: original.id };
    f.actions.open();
    f.actions.confirm({ ...f.actions.editing.value!, sourceKind: "pivot", sourcePivot });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.consolidation).toEqual(original.consolidation);
    f.selectOutput();
    expect(
      f.actions.update({
        ...f.sheet.pivotTables![0]!,
        rowFields: [0],
        columnFields: [],
        values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
        filters: [],
      }),
    ).toBe(true);
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(40);
  });
  test("repairs a combined source using a shorter replacement list without retaining stale areas", () => {
    const { f } = matrixFixture();
    f.actions.source();
    f.actions.confirm({ ...f.actions.editing.value!, sources: ["Second!A1:C2"] });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.consolidation!.ranges).toHaveLength(1);
    expect(f.sheet.pivotTables![0]!.consolidation!.ranges[0]!.sheetId).toBe("second");
    expect(getCellValue(f.sheet, { row: 1, column: 0 })).toBe("East");
    expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(10);
  });
  test("the fields pane offers combined headers and page items from both worksheet ranges as filter choices", async () => {
    const { f } = matrixFixture();
    f.actions.update({
      ...f.sheet.pivotTables![0]!,
      filters: [{ field: 3, values: [], all: true }],
    });
    const wrapper = mount(PivotFieldsPane, {
      attachTo: document.body,
      props: {
        table: f.sheet.pivotTables![0]!,
        workbook: f.workbook,
        revision: 0,
        disabled: false,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    expect(wrapper.findAll("[data-pivot-source-field]").map((field) => field.text())).toEqual([
      "Row",
      "Column",
      "Value",
      "Page1",
    ]);
    await wrapper.get('[data-pivot-area="filters"] .pivot-area__label').trigger("click");
    await flushPromises();
    const settings = new DOMWrapper(document.querySelector(".pivot-field-settings")!);
    await settings.get('input[type="checkbox"]').setValue(false);
    await settings.get(".t-input__inner").trigger("keydown", { code: "ArrowDown" });
    await expect
      .poll(() =>
        [...document.querySelectorAll<HTMLElement>(".t-select-option")].map((item) =>
          item.textContent?.trim(),
        ),
      )
      .toEqual(expect.arrayContaining(["Item1", "Item2"]));
  });
  test("confirms a narrower range while retaining matching fields and dropping removed fields", async () => {
    const f = configuredReport();
    const second = createSheet("Narrow", "narrow");
    insertSheet(f.workbook, second);
    [
      ["Region", "Quarter"],
      ["East", "Q1"],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(second, { row: r, column }, { kind: "literal", value }),
      ),
    );
    f.actions.source();
    const wrapper = mount(PivotTableDialog, {
      attachTo: document.body,
      props: {
        initial: f.actions.editing.value!,
        workbook: f.workbook,
        revision: 0,
        disabled: false,
        error: false,
        suspended: false,
        selectReference: async () => undefined,
        onConfirm: (draft: PivotDraft) => f.actions.confirm(draft),
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    await flushPromises();
    await editor().get(".t-input__inner").setValue("Narrow!A1:B2");
    await flushPromises();
    expect(confirmButton().disabled).toBe(false);
    confirmButton().click();
    await flushPromises();
    expect(f.actions.error.value).toBe(false);
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.sheet.pivotTables![0]).toMatchObject({
      sourceSheetId: second.id,
      rowFields: [0],
      values: [],
    });
  });
  test("migrates a legacy area-label selection when confirming its source", () => {
    const { f } = matrixFixture();
    const current = f.sheet.pivotTables![0]!;
    const legacy = {
      ...current,
      reportLayout: undefined,
      consolidation: {
        labels: ["Row", "Column", "Value", "Area"],
        ranges: current.consolidation!.ranges.map(({ pageItems: _pageItems, ...area }) => area),
      },
      filters: [{ field: 3, all: false, values: [current.consolidation!.ranges[1]!.label] }],
    };
    f.sheet.pivotTables = [legacy];
    f.actions.source();
    f.actions.confirm(f.actions.editing.value!);
    expect(f.actions.error.value).toBe(false);
    const updated = f.sheet.pivotTables![0]!;
    expect(updated.consolidation!.pageFields).toEqual({ mode: "single", count: 1 });
    expect(updated.consolidation!.ranges.map((range) => range.pageItems)).toEqual([
      ["Item1"],
      ["Item2"],
    ]);
    expect(updated.filters).toEqual([{ field: 3, all: false, values: ["Item2"] }]);
  });
  test("changing page field count adds new filters and removes them when switching to zero", () => {
    const { f } = matrixFixture();
    f.actions.update({
      ...f.sheet.pivotTables![0]!,
      filters: [{ field: 3, all: true, values: [] }],
    });
    f.actions.source();
    f.actions.confirm({
      ...f.actions.editing.value!,
      consolidationPageMode: "custom",
      consolidationPageCount: 4,
      consolidationPageItems: [
        ["A", "2026", "Site", "Owner"],
        ["B", "2026", "Site", "Owner"],
      ],
    });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.filters).toEqual(
      [3, 4, 5, 6].map((field) => ({ field, all: true, values: [] })),
    );
    f.actions.source();
    f.actions.confirm({
      ...f.actions.editing.value!,
      consolidationPageMode: "custom",
      consolidationPageCount: 0,
    });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.filters).toEqual([]);
    expect(getPivotTableSource(f.workbook, f.sheet.pivotTables![0]!).headers).toEqual([
      "Row",
      "Column",
      "Value",
    ]);
  });
});
