import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { SheetPivotTable } from "@idea10/core/pivot-tables";
import { setCellContent } from "@idea10/core/workbook";
import PivotReportFilters from "../../../modules/pivot-tables/components/PivotReportFilters.vue";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function setup(disabled = false) {
  const f = fixture();
  f.source.cells.clear();
  [
    ["Region", "Q1", "Q2"],
    ["East", 10, 20],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(f.source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  f.actions.open();
  f.actions.confirm({
    ...f.actions.editing.value!,
    sourceKind: "consolidation",
    sources: ["'Source Data'!A1:C2"],
    consolidationPageMode: "custom",
    consolidationPageCount: 2,
    consolidationPageItems: [["Group", "2026"]],
  });
  expect(f.actions.error.value).toBe(false);
  const table = f.sheet.pivotTables![0]!;
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 20, columnCount: 8, rowHeight: 20, columnWidth: 80 }),
    rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 20 }),
    viewportSize: { width: 640, height: 400 },
  });
  const wrapper = mount(PivotReportFilters, {
    attachTo: document.body,
    props: {
      tables: [table],
      workbook: f.workbook,
      revision: 0,
      layout,
      body: { x: 40, y: 25, width: 640, height: 400 },
      disabled,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, table };
}
async function open(wrapper: ReturnType<typeof setup>["wrapper"], index: number) {
  await wrapper.get(`[data-pivot-report-filter="${index}"]`).trigger("click");
  await flushPromises();
}
function menu() {
  return new DOMWrapper(document.querySelector('[role="menu"]')!);
}

describe("report page filter overlay", () => {
  test("selecting a page item emits its filter and preserves the other page filters", async () => {
    const { wrapper, table } = setup();
    expect(wrapper.findAll("[data-pivot-report-filter]")).toHaveLength(2);
    await open(wrapper, 0);
    const options = menu().findAll('[role="menuitemradio"]');
    expect(options.map((option) => option.text())).toContain("Group");
    await options.find((option) => option.text() === "Group")!.trigger("click");
    const updated = wrapper.emitted("update")![0]![0] as SheetPivotTable;
    expect(updated.filters[0]).toEqual({ field: 3, all: false, values: ["Group"] });
    expect(updated.filters[1]).toEqual(table.filters[1]);
    expect(updated.consolidation).toEqual(table.consolidation);
    expect(table.filters[0]).toEqual({ field: 3, all: true, values: [] });
  });
  test("All clears selected values while preserving the remaining filters", async () => {
    const { wrapper, table } = setup();
    const selected = {
      ...table,
      filters: [{ ...table.filters[0]!, all: false, values: ["Group"] }, table.filters[1]!],
    };
    await wrapper.setProps({ tables: [selected] });
    await open(wrapper, 0);
    await menu().findAll('[role="menuitemradio"]')[0]!.trigger("click");
    const updated = wrapper.emitted("update")![0]![0] as SheetPivotTable;
    expect(updated.filters).toEqual([{ field: 3, all: true, values: [] }, table.filters[1]]);
  });
  test("advanced settings emits the selected report id and filter index", async () => {
    const { wrapper, table } = setup();
    await open(wrapper, 1);
    await menu().get('[role="menuitem"]').trigger("click");
    expect(wrapper.emitted("settings")).toEqual([[table.id, 1]]);
    expect(wrapper.emitted("update")).toBeUndefined();
  });
  test("disabled editing leaves both report filter buttons disabled", () => {
    const { wrapper } = setup(true);
    expect(
      wrapper
        .findAll("[data-pivot-report-filter]")
        .every((button) => (button.element as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
