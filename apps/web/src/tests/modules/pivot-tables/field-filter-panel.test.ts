import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { setCellContent } from "@sheetcraft/core/workbook";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import PivotValueFilterDialog from "../../../modules/pivot-tables/components/PivotValueFilterDialog.vue";
import PivotFieldFilterPanel from "../../../modules/pivot-tables/components/PivotFieldFilterPanel.vue";
import PivotFieldFilterConditions from "../../../modules/pivot-tables/components/PivotFieldFilterConditions.vue";
import FilterConditionMenu from "../../../shared/filter/components/FilterConditionMenu.vue";
import FilterConditionDialog from "../../../shared/filter/components/FilterConditionDialog.vue";
import FilterValueList from "../../../shared/filter/components/FilterValueList.vue";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.querySelectorAll("[data-test-trigger]").forEach((node) => node.remove());
});
function setup(
  area: "filters" | "rows" | "columns" = "filters",
  disabled = false,
  blanks = false,
  overrides: Partial<SheetPivotTable> = {},
) {
  const f = fixture();
  ["North", "Q1", 5].forEach((value, column) =>
    setCellContent(f.source, { row: 4, column }, { kind: "literal", value }),
  );
  if (blanks) {
    setCellContent(f.source, { row: 1, column: 0 }, null);
    setCellContent(f.source, { row: 2, column: 0 }, { kind: "literal", value: "" });
  }
  f.actions.open();
  const table: SheetPivotTable = {
    ...f.actions.editing.value!.table,
    source: { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } },
    filters: [
      { field: 0, values: blanks ? [""] : [], all: !blanks },
      { field: 1, all: false, values: ["Q1"] },
    ],
    rowFields: [0],
    columnFields: [1],
    values: [
      { field: 2, aggregate: "sum", caption: "Revenue" },
      { field: 2, aggregate: "count", caption: "Orders" },
    ],
    ...overrides,
  };
  const trigger = document.createElement("button");
  trigger.dataset.testTrigger = "true";
  document.body.append(trigger);
  const wrapper = mount(PivotFieldFilterPanel, {
    attachTo: document.body,
    props: { table, workbook: f.workbook, area, index: 0, trigger, disabled },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, table };
}
function panel() {
  return new DOMWrapper(document.querySelector(".pivot-field-filter-panel")!);
}
async function confirm() {
  await panel().get(".filter-panel-actions .t-button--theme-primary").trigger("click");
}
function updated(wrapper: ReturnType<typeof setup>["wrapper"]) {
  return wrapper.emitted("update")![0]![0] as SheetPivotTable;
}

describe("pivot field filter panel", () => {
  test("one checked blank member represents null and empty-string records and emits null", async () => {
    const { wrapper } = setup("filters", false, true);
    const blank = panel().findAll('.filter-value-list__checkbox[title="(blank)"]');
    expect(blank).toHaveLength(1);
    expect((blank[0]!.get("input").element as HTMLInputElement).checked).toBe(true);
    const choices = wrapper.findComponent(FilterValueList).props("values");
    expect(choices.filter((choice) => choice.key.kind === "blank")).toEqual([
      { key: { kind: "blank" }, value: null, label: "(blank)", count: 2 },
    ]);
    expect(
      panel()
        .findAll(".filter-value-list__checkbox input")
        .filter((input) => (input.element as HTMLInputElement).checked),
    ).toHaveLength(1);
    await confirm();
    expect(updated(wrapper).filters[0]).toEqual({ field: 0, all: false, values: [null] });
  });
  test("page selection supports multiple items and preserves another page filter", async () => {
    const { wrapper, table } = setup();
    await panel().get('.filter-value-list__tools input[type="checkbox"]').setValue(false);
    await panel().get('.filter-value-list__checkbox[title="East"] input').setValue(true);
    await panel().get('.filter-value-list__checkbox[title="West"] input').setValue(true);
    await confirm();
    expect(updated(wrapper).filters).toEqual([
      { field: 0, all: false, values: ["East", "West"] },
      table.filters[1],
    ]);
    expect(wrapper.emitted("close")?.length).toBeGreaterThan(0);
  });
  test("page subset and empty selection remain distinct from all", async () => {
    const { wrapper } = setup();
    await panel().get('.filter-value-list__checkbox[title="West"] input').setValue(false);
    await panel().get('.filter-value-list__checkbox[title="North"] input').setValue(false);
    await confirm();
    expect(updated(wrapper).filters[0]).toEqual({ field: 0, all: false, values: ["East"] });
    expect(wrapper.props("table").filters[0]!.all).toBe(true);
  });
  test("no selected page items emits an explicitly empty filter", async () => {
    const { wrapper } = setup();
    await panel().get('.filter-value-list__tools input[type="checkbox"]').setValue(false);
    await confirm();
    expect(updated(wrapper).filters[0]).toEqual({ field: 0, all: false, values: [] });
  });
  test("select all restores all page members", async () => {
    const { wrapper } = setup();
    await panel().get('.filter-value-list__tools input[type="checkbox"]').setValue(false);
    await panel().get('.filter-value-list__tools input[type="checkbox"]').setValue(true);
    await confirm();
    expect(updated(wrapper).filters[0]).toEqual({ field: 0, all: true, values: [] });
  });
  test("search applies only matching checked items", async () => {
    const { wrapper } = setup();
    await panel().get('input[type="search"]').setValue("East");
    expect(panel().findAll(".filter-value-list__row")).toHaveLength(1);
    await confirm();
    expect(updated(wrapper).filters[0]).toEqual({ field: 0, all: false, values: ["East"] });
  });
  test("cancel discards edits without emitting a report update", async () => {
    const { wrapper } = setup();
    await panel().get('.filter-value-list__tools input[type="checkbox"]').setValue(false);
    await panel().get(".filter-panel-actions .t-button--theme-default").trigger("click");
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("close")?.length).toBeGreaterThan(0);
  });
  test("axis member selection, label condition and chosen aggregate measure apply together", async () => {
    const { wrapper, table } = setup("rows");
    wrapper
      .findComponent(FilterValueList)
      .vm.$emit("update:modelValue", [{ kind: "string", value: "East" }]);
    wrapper.findAllComponents(FilterConditionMenu)[0]!.vm.$emit("select", "contains");
    await flushPromises();
    wrapper
      .findComponent(FilterConditionDialog)
      .vm.$emit("apply", { kind: "text", operator: "contains", value: "E" });
    await flushPromises();
    wrapper.findAllComponents(FilterConditionMenu)[1]!.vm.$emit("select", "greaterThan");
    await flushPromises();
    wrapper.findComponent(PivotValueFilterDialog).vm.$emit("apply", {
      measure: 1,
      condition: { kind: "number", operator: "greaterThan", value: 3 },
    });
    await flushPromises();
    await confirm();
    expect(updated(wrapper).axisFilters).toEqual([
      {
        axis: "rows",
        field: 0,
        values: ["East"],
        labelCondition: { kind: "text", operator: "contains", value: "E" },
        valueCondition: {
          measure: 1,
          condition: { kind: "number", operator: "greaterThan", value: 3 },
        },
      },
    ]);
    expect(updated(wrapper).filters).toEqual(table.filters);
    expect(updated(wrapper).values).toEqual(table.values);
  });
  test("sort preserves report filters and values", async () => {
    const { wrapper, table } = setup("columns");
    await panel().findAll(".filter-sort-bar button")[1]!.trigger("click");
    expect(updated(wrapper)).toMatchObject({
      sort: table.sort,
      sortFields: [{ axis: "columns", field: 1, order: "descending" }],
      filters: table.filters,
      values: table.values,
    });
    expect(wrapper.emitted("close")?.length).toBeGreaterThan(0);
  });
  test.each(["apply", "cancel"] as const)(
    "clearing manual and both condition filters is local until %s",
    async (action) => {
      const axisFilters: SheetPivotTable["axisFilters"] = [
        {
          axis: "rows",
          field: 0,
          values: ["East"],
          labelCondition: { kind: "text", operator: "contains", value: "E" },
          valueCondition: {
            measure: 0,
            condition: { kind: "number", operator: "greaterThan", value: 5 },
          },
        },
        { axis: "columns", field: 1, values: ["Q1"] },
      ];
      const { wrapper, table } = setup("rows", false, false, { axisFilters });
      await panel().get('[aria-label="Clear filters"]').trigger("click");
      expect(wrapper.emitted("update")).toBeUndefined();
      expect(
        wrapper.findComponent(PivotFieldFilterConditions).props("labelCondition"),
      ).toBeUndefined();
      expect(
        wrapper.findComponent(PivotFieldFilterConditions).props("valueCondition"),
      ).toBeUndefined();
      expect(wrapper.findComponent(FilterValueList).props("modelValue")).toHaveLength(3);
      if (action === "apply") {
        await confirm();
        expect(updated(wrapper).axisFilters).toEqual([axisFilters[1]]);
        expect(updated(wrapper).filters).toEqual(table.filters);
      } else {
        await panel().get(".filter-panel-actions .t-button--theme-default").trigger("click");
        expect(wrapper.emitted("update")).toBeUndefined();
      }
      expect(table.axisFilters).toEqual(axisFilters);
    },
  );
  test("sorting replaces only the chosen field and preserves other sort rules", async () => {
    const { wrapper } = setup("rows", false, false, {
      sort: "source",
      sortFields: [
        { axis: "rows", field: 0, order: "ascending", measure: 1 },
        { axis: "columns", field: 1, order: "ascending" },
      ],
    });
    await panel().findAll(".filter-sort-bar button")[1]!.trigger("click");
    expect(updated(wrapper).sort).toBe("source");
    expect(updated(wrapper).sortFields).toEqual(
      expect.arrayContaining([
        { axis: "rows", field: 0, order: "descending" },
        { axis: "columns", field: 1, order: "ascending" },
      ]),
    );
    expect(updated(wrapper).sortFields).toHaveLength(2);
  });
  test("clearing only a label condition retains manual and value filters", async () => {
    const valueCondition = {
      measure: 0,
      condition: { kind: "number", operator: "greaterThan", value: 5 },
    } as const;
    const { wrapper } = setup("rows", false, false, {
      axisFilters: [
        {
          axis: "rows",
          field: 0,
          values: ["East"],
          labelCondition: { kind: "text", operator: "contains", value: "E" },
          valueCondition,
        },
      ],
    });
    wrapper.findComponent(PivotFieldFilterConditions).vm.$emit("update:labelCondition", undefined);
    await flushPromises();
    expect(wrapper.emitted("update")).toBeUndefined();
    await confirm();
    expect(updated(wrapper).axisFilters).toEqual([
      { axis: "rows", field: 0, values: ["East"], valueCondition },
    ]);
  });

  test("cancelling a value condition leaves the panel draft unchanged", async () => {
    const { wrapper } = setup("rows");
    wrapper.findAllComponents(FilterConditionMenu)[1]!.vm.$emit("select", "greaterThan");
    await flushPromises();
    expect(wrapper.findComponent(PivotValueFilterDialog).props("visible")).toBe(true);
    wrapper.findComponent(PivotValueFilterDialog).vm.$emit("close");
    await flushPromises();
    await confirm();
    expect(updated(wrapper).axisFilters).toBeUndefined();
  });
  test("disabled panel does not apply or sort", async () => {
    const { wrapper } = setup("rows", true);
    await confirm();
    await panel().findAll(".filter-sort-bar button")[1]!.trigger("click");
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(
      panel()
        .findAll('input[type="checkbox"]')
        .every((node) => (node.element as HTMLInputElement).disabled),
    ).toBe(true);
  });
});
