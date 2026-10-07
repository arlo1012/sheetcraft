import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, insertSheet, setCellContent } from "@idea10/core/workbook";
import { getPivotTableSource } from "@idea10/core/pivot-tables";
import PivotConsolidationWizard from "../../../modules/pivot-tables/components/PivotConsolidationWizard.vue";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import type { PivotDraft } from "../../../modules/pivot-tables/usePivotActions";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function numericFixture() {
  const f = fixture();
  f.source.cells.clear();
  const second = createSheet("Second", "second");
  insertSheet(f.workbook, second);
  for (const sheet of [f.source, second]) {
    [
      ["Region", "Q1", "Q2"],
      ["East", 10, 20],
      ["West", 40, 0],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  return f;
}
function setup(patch: Partial<PivotDraft> = {}, f = numericFixture()) {
  f.actions.open();
  const initial = { ...f.actions.editing.value!, ...patch };
  const wrapper = mount(PivotConsolidationWizard, {
    attachTo: document.body,
    props: {
      initial,
      workbook: f.workbook,
      revision: 0,
      disabled: false,
      suspended: false,
      selectReference: async () => undefined,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { f, wrapper, initial };
}
function wizard() {
  return new DOMWrapper(document.querySelector(".pivot-consolidation-wizard")!);
}
function buttons() {
  return new DOMWrapper(wizard().element.closest(".t-dialog")!).findAll(".t-dialog__footer button");
}
async function radio(value: string) {
  await new DOMWrapper(
    wizard().get(`input[type="radio"][value="${value}"]`).element.closest("label")!,
  ).trigger("click");
  await flushPromises();
}
function isDisabled(index: number) {
  return (buttons()[index]!.element as HTMLButtonElement).disabled;
}
const sources = ["'Source Data'!A1:C3", "Second!A1:C3"];

describe("WPS consolidation wizard", () => {
  test("allows inherited custom page labels before adding an area", async () => {
    const { wrapper } = setup({ consolidationPageMode: "custom" });
    await flushPromises();
    await radio("4");
    const inputs = () => wizard().findAll(".pivot-consolidation-ranges__page-items input");
    const labels = ["East", "2026", "Store", "Owner"];
    expect(inputs()).toHaveLength(4);
    for (const [index, label] of labels.entries()) {
      expect((inputs()[index]!.element as HTMLInputElement).disabled).toBe(false);
      await inputs()[index]!.setValue(label);
    }
    expect(isDisabled(1)).toBe(true);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual(labels);
    await wizard().get('[data-pivot-range-action="add"]').trigger("click");
    await flushPromises();
    expect(wizard().findAll("tr[data-pivot-range-row]")).toHaveLength(1);
    expect(isDisabled(1)).toBe(false);
    await buttons()[1]!.trigger("click");
    expect((wrapper.emitted("confirm")![0]![0] as PivotDraft).consolidationPageItems).toEqual([
      labels,
    ]);
  });
  test("keeps page fields editable after removing the last area", async () => {
    const labels = ["East", "2026", "Store", "Owner"];
    setup({
      sources: [sources[0]!],
      consolidationPageItems: [labels],
      consolidationPageMode: "custom",
      consolidationPageCount: 4,
    });
    await flushPromises();
    await wizard().get('[data-pivot-range-action="remove"]').trigger("click");
    await flushPromises();
    expect(wizard().findAll("tr[data-pivot-range-row]")).toHaveLength(0);
    const inputs = wizard().findAll(".pivot-consolidation-ranges__page-items input");
    expect(inputs.map((input) => (input.element as HTMLInputElement).value)).toEqual(labels);
    expect(inputs.every((input) => !(input.element as HTMLInputElement).disabled)).toBe(true);
    expect(isDisabled(1)).toBe(true);
  });
  test("requires a valid range before confirming and cancels without publishing a draft", async () => {
    const { wrapper } = setup();
    await flushPromises();
    expect(isDisabled(1)).toBe(true);
    expect(wizard().find(".pivot-consolidation-ranges").exists()).toBe(true);
    await buttons()[0]!.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
  test("supports zero page fields and creates a numeric Sum report without filters", async () => {
    const { f, wrapper } = setup({ sources, consolidationPageMode: "custom" });
    await flushPromises();
    await radio("0");
    expect(wizard().find(".pivot-consolidation-ranges__page-items").exists()).toBe(false);
    expect(isDisabled(1)).toBe(false);
    await buttons()[1]!.trigger("click");
    const draft = wrapper.emitted("confirm")![0]![0] as PivotDraft;
    expect(draft).toMatchObject({ consolidationPageMode: "custom", consolidationPageCount: 0 });
    f.actions.confirm(draft);
    expect(f.actions.error.value).toBe(false);
    const table = f.sheet.pivotTables![0]!;
    expect(table.filters).toEqual([]);
    expect(table.values).toMatchObject([{ field: 2, aggregate: "sum" }]);
    expect(getPivotTableSource(f.workbook, table).headers).toEqual(["Row", "Column", "Value"]);
    expect(table.consolidation!.pageFields).toEqual({ mode: "custom", count: 0 });
    expect(table.reportLayout).toBeDefined();
  });
  test("requires four assignments per area and groups different areas under matching page items", async () => {
    const { f, wrapper } = setup({ sources, consolidationPageMode: "custom" });
    await flushPromises();
    await radio("4");
    const inputs = () => wizard().findAll(".pivot-consolidation-ranges__page-items input");
    expect(inputs()).toHaveLength(4);
    expect(isDisabled(1)).toBe(true);
    for (const [index, value] of ["Group", "2026", "Site", "Owner"].entries())
      await inputs()[index]!.setValue(value);
    expect(isDisabled(1)).toBe(true);
    await wizard().findAll("tr[data-pivot-range-row]")[1]!.trigger("click");
    for (const [index, value] of ["Group", "2026", "Site", "Owner"].entries())
      await inputs()[index]!.setValue(value);
    expect(isDisabled(1)).toBe(false);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual([
      "Group",
      "2026",
      "Site",
      "Owner",
    ]);
    await buttons()[1]!.trigger("click");
    const draft = wrapper.emitted("confirm")![0]![0] as PivotDraft;
    expect(draft.consolidationPageItems).toEqual([
      ["Group", "2026", "Site", "Owner"],
      ["Group", "2026", "Site", "Owner"],
    ]);
    f.actions.confirm(draft);
    expect(f.actions.error.value).toBe(false);
    const table = f.sheet.pivotTables![0]!;
    expect(table.filters.map((filter) => filter.field)).toEqual([3, 4, 5, 6]);
    const info = getPivotTableSource(f.workbook, table);
    expect(info.headers).toEqual(["Row", "Column", "Value", "Page1", "Page2", "Page3", "Page4"]);
    expect([...info.records()].map((record) => record.slice(3))).toEqual(
      Array.from({ length: 8 }, () => ["Group", "2026", "Site", "Owner"]),
    );
  });
  test("browses the specified row and preserves its custom page assignments", async () => {
    const { wrapper } = setup({
      sources,
      consolidationPageMode: "custom",
      consolidationPageCount: 1,
      consolidationPageItems: [["First"], ["Second"]],
    });
    const pick = vi.fn(async (_current: string) => "Second!A1:B3");
    await wrapper.setProps({ selectReference: pick });
    await flushPromises();
    await wizard()
      .get('tr[data-pivot-range-row="1"] [data-pivot-range-action="browse"]')
      .trigger("click");
    await flushPromises();
    expect(pick).toHaveBeenCalledWith("Second!A1:C3");
    await buttons()[1]!.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      sources: [sources[0], "=Second!$A$1:$B$3"],
      consolidationPageItems: [
        ["First", "", "", ""],
        ["Second", "", "", ""],
      ],
    });
  });
  test.each([undefined, "'Source Data'!A1:B3", "Second!A1:A3", "Second!A1:C1"])(
    "leaves the browsed row unchanged for canceled or invalid selection %s",
    async (picked) => {
      const { wrapper } = setup({ sources });
      await wrapper.setProps({ selectReference: async () => picked });
      await flushPromises();
      await wizard()
        .get('tr[data-pivot-range-row="1"] [data-pivot-range-action="browse"]')
        .trigger("click");
      await flushPromises();
      await buttons()[1]!.trigger("click");
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({ sources });
    },
  );
  test.each([0, 1])(
    "removes row %s while retaining the remaining area's page assignments",
    async (removed) => {
      const { wrapper } = setup({
        sources,
        consolidationPageMode: "custom",
        consolidationPageCount: 1,
        consolidationPageItems: [["First"], ["Second"]],
      });
      await flushPromises();
      await wizard().get('tr[data-pivot-range-row="1"]').trigger("click");
      await wizard()
        .get(`tr[data-pivot-range-row="${removed}"] [data-pivot-range-action="remove"]`)
        .trigger("click");
      await flushPromises();
      const remaining = removed === 0 ? 1 : 0;
      expect(wizard().findAll("tr[data-pivot-range-row]")).toHaveLength(1);
      expect(
        (wizard().get(".pivot-consolidation-ranges__page-items input").element as HTMLInputElement)
          .value,
      ).toBe(remaining === 0 ? "First" : "Second");
      await buttons()[1]!.trigger("click");
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
        sources: [sources[remaining]],
        consolidationPageItems: [[remaining === 0 ? "First" : "Second", "", "", ""]],
      });
    },
  );
  test("uses Count for source matrices containing text values", async () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm({
      ...f.actions.editing.value!,
      sourceKind: "consolidation",
      sources: ["'Source Data'!A1:C4"],
    });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.values).toMatchObject([{ field: 2, aggregate: "count" }]);
  });
  test("canceling edits leaves the parent range list and custom page settings intact", async () => {
    const f = numericFixture();
    f.actions.open();
    const initial: PivotDraft = {
      ...f.actions.editing.value!,
      sourceKind: "consolidation",
      sources,
      consolidationPageMode: "custom",
      consolidationPageCount: 1,
      consolidationPageItems: [["Original"], ["Second"]],
    };
    const wrapper = mount(PivotTableDialog, {
      attachTo: document.body,
      props: {
        initial,
        workbook: f.workbook,
        revision: 0,
        disabled: false,
        error: false,
        suspended: false,
        selectReference: async () => undefined,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    await flushPromises();
    const parent = () => new DOMWrapper(document.querySelector(".pivot-create")!);
    await parent().get(".pivot-create__range-summary button").trigger("click");
    await flushPromises();
    await wizard().get(".pivot-consolidation-ranges__page-items input").setValue("Edited");
    await wizard().get('[data-pivot-range-action="remove"]').trigger("click");
    await buttons()[0]!.trigger("click");
    await flushPromises();
    const confirm = parent()
      .element.closest(".t-dialog")!
      .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!;
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await flushPromises();
    expect(wrapper.emitted("confirm")![0]![0]).toMatchObject({
      sources,
      consolidationPageMode: "custom",
      consolidationPageCount: 1,
      consolidationPageItems: [["Original"], ["Second"]],
    });
    expect(initial.consolidationPageItems).toEqual([["Original"], ["Second"]]);
  });
});
