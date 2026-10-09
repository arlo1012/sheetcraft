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
function setup(disabled = false, normalRange = false) {
  const f = fixture();
  f.source.cells.clear();
  const data = normalRange
    ? [
        ["title1", "title2", "title3", "title4"],
        [2, 3, 4, 5],
        [3, 5, 7, 9],
      ]
    : [
        ["Region", "Q1", "Q2"],
        ["East", 10, 20],
      ];
  data.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(f.source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  f.actions.open();
  f.actions.confirm(
    normalRange
      ? {
          ...f.actions.editing.value!,
          source: "'Source Data'!A1:D3",
          table: {
            ...f.actions.editing.value!.table,
            filters: [{ field: 0, all: true, values: [] }],
            columnFields: [1],
            rowFields: [2],
            values: [{ field: 3, aggregate: "sum", caption: "Sum of title4" }],
          },
        }
      : {
          ...f.actions.editing.value!,
          sourceKind: "consolidation",
          sources: ["'Source Data'!A1:C2"],
          consolidationPageMode: "custom",
          consolidationPageCount: 2,
          consolidationPageItems: [["Group", "2026"]],
        },
  );
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
  return new DOMWrapper(document.querySelector(".pivot-field-filter-panel")!);
}

describe("report page filter overlay", () => {
  test("applying all page members preserves the other page filters", async () => {
    const { wrapper, table } = setup();
    expect(wrapper.findAll("[data-pivot-report-filter]")).toHaveLength(2);
    await open(wrapper, 0);
    expect(menu().text()).toContain("Group");
    await menu().get(".pivot-field-filter-panel__footer .t-button--theme-primary").trigger("click");
    const updated = wrapper.emitted("update")![0]![0] as SheetPivotTable;
    expect(updated.filters[0]).toEqual({ field: 3, all: true, values: [] });
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
    await menu().get(".filter-value-list__tools input[type=checkbox]").setValue(true);
    await menu().get(".pivot-field-filter-panel__footer .t-button--theme-primary").trigger("click");
    const updated = wrapper.emitted("update")![0]![0] as SheetPivotTable;
    expect(updated.filters).toEqual([{ field: 3, all: true, values: [] }, table.filters[1]]);
  });
  test("cancel closes a page panel without changing the report", async () => {
    const { wrapper } = setup();
    await open(wrapper, 1);
    await menu().get(".pivot-field-filter-panel__footer .t-button--theme-default").trigger("click");
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(document.querySelector(".pivot-field-filter-panel")).toBeNull();
  });
  test("disabled editing leaves both report filter buttons disabled", () => {
    const { wrapper } = setup(true);
    expect(
      wrapper
        .findAll("[data-pivot-report-filter]")
        .every((button) => button.attributes("aria-disabled") === "true"),
    ).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  test("positions ordinary range filter and dimension controls beside their real field names", () => {
    const { wrapper } = setup(false, true);
    const filter = wrapper.get('[data-pivot-report-filter="0"]');
    const column = wrapper.get('[data-pivot-report-dimension="columns"]');
    const row = wrapper.get('[data-pivot-report-dimension="rows"]');
    expect(filter.attributes("aria-label")).toContain("title1");
    expect(column.attributes("aria-label")).toContain("title2");
    expect(row.attributes("aria-label")).toContain("title3");
    for (const [control, left, top] of [
      [filter, "182px", "27px"],
      [column, "182px", "67px"],
      [row, "102px", "87px"],
    ] as const) {
      expect((control.element as HTMLElement).style.left).toBe(left);
      expect((control.element as HTMLElement).style.top).toBe(top);
    }
  });
  test.each(["rows", "columns"])(
    "sorting from %s preserves report fields and filters",
    async (area) => {
      const { wrapper, table } = setup(false, true);
      await wrapper.get(`[data-pivot-report-dimension="${area}"]`).trigger("click");
      await flushPromises();
      await menu().findAll(".filter-sort-bar button")[1]!.trigger("click");
      const updated = wrapper.emitted("update")![0]![0] as SheetPivotTable;
      expect(updated.sort).toBe(table.sort);
      expect(updated.sortFields).toEqual([
        {
          axis: area,
          field: area === "rows" ? table.rowFields[0] : table.columnFields[0],
          order: "descending",
        },
      ]);
      expect(updated.rowFields).toEqual(table.rowFields);
      expect(updated.columnFields).toEqual(table.columnFields);
      expect(updated.filters).toEqual(table.filters);
      expect(updated.values).toEqual(table.values);
      expect(updated.reportLayout).toEqual(table.reportLayout);
      expect(table.sort).toBe("ascending");
    },
  );
  test("hiding row and column headers hides their controls while retaining page filters", async () => {
    const { wrapper, table } = setup(false, true);
    await wrapper.setProps({
      tables: [
        {
          ...table,
          presentation: { ...table.presentation!, rowHeaders: false, columnHeaders: false },
        },
      ],
    });
    expect(wrapper.findAll("[data-pivot-report-dimension]")).toHaveLength(0);
    expect(wrapper.findAll("[data-pivot-report-filter]")).toHaveLength(1);
  });
});
