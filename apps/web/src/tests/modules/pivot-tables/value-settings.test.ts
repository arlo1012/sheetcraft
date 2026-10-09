import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Tabs } from "tdesign-vue-next/es/tabs";
import type { SheetPivotTable, PivotValueField } from "@idea10/core/pivot-tables";
import PivotFieldSettingsDialog from "../../../modules/pivot-tables/components/PivotFieldSettingsDialog.vue";
import CellFormatDialog from "../../../modules/cell-format/components/CellFormatDialog.vue";
import OptionList from "../../../shared/option-list/OptionList.vue";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});
function setup(initialDisplay?: PivotValueField["display"]) {
  const f = fixture();
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  const table: SheetPivotTable = {
    ...f.sheet.pivotTables![0]!,
    rowFields: [0],
    columnFields: [1],
    values: [
      {
        field: 2,
        aggregate: "sum",
        caption: "Sales",
        ...(initialDisplay ? { display: initialDisplay } : {}),
      },
    ],
  };
  const host = document.createElement("div");
  host.setAttribute("inert", "");
  document.body.append(host);
  const wrapper = mount(PivotFieldSettingsDialog, {
    attachTo: host,
    props: {
      table,
      area: "values",
      index: 0,
      name: "Amount",
      choices: [],
      disabled: false,
      headers: ["Region", "Quarter", "Amount"],
      records: [
        ["East", "Q1", 10],
        ["East", "Q2", 20],
        ["West", "Q1", 40],
      ],
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { CellFormatDialog: true },
    },
  });
  cleanup.push(() => {
    wrapper.unmount();
    host.remove();
  });
  return { wrapper, table, host };
}
function optionLists(f: ReturnType<typeof setup>): VueWrapper<any>[] {
  return f.wrapper.findAllComponents(OptionList) as unknown as VueWrapper<any>[];
}
async function display(f: ReturnType<typeof setup>, type: string) {
  f.wrapper.findComponent(Tabs).vm.$emit("update:modelValue", "display");
  await flushPromises();
  f.wrapper.findComponent(Select).vm.$emit("change", type);
  await flushPromises();
}
async function confirm(f: ReturnType<typeof setup>) {
  f.wrapper.findComponent(Dialog).vm.$emit("confirm");
  await flushPromises();
  return f.wrapper.emitted("confirm")![0]![0] as SheetPivotTable;
}
describe("pivot value field settings", () => {
  test("offers all twelve summaries and stages aggregate and custom caption until confirm", async () => {
    const f = setup();
    const list = optionLists(f)[0]!;
    expect(list.props("options").map((option: { value: string }) => option.value)).toEqual([
      "sum",
      "count",
      "average",
      "max",
      "min",
      "product",
      "countNums",
      "stdev",
      "stdevp",
      "var",
      "varp",
      "distinctCount",
    ]);
    await list.get('[data-option-list-value="stdevp"]').trigger("click");
    f.wrapper.findComponent(Input).vm.$emit("update:modelValue", "Population deviation");
    await flushPromises();
    expect(f.table.values).toEqual([{ field: 2, aggregate: "sum", caption: "Sales" }]);
    const result = await confirm(f);
    expect(result.values[0]).toMatchObject({
      aggregate: "stdevp",
      caption: "Population deviation",
    });
    expect(result).not.toBe(f.table);
  });
  test("offers fifteen display modes and enables base controls only where needed", async () => {
    const f = setup();
    await display(f, "normal");
    expect(
      (f.wrapper.findComponent(Select).props("options") ?? []).map((option) =>
        "value" in option ? option.value : undefined,
      ),
    ).toEqual([
      "normal",
      "percentOfTotal",
      "percentOfCol",
      "percentOfRow",
      "percent",
      "percentOfParentRow",
      "percentOfParentCol",
      "percentOfParent",
      "difference",
      "percentDiff",
      "runTotal",
      "percentOfRunningTotal",
      "rankAscending",
      "rankDescending",
      "index",
    ]);
    const inert = () => document.querySelectorAll(".pivot-value-settings__bases [inert]").length;
    expect(inert()).toBe(2);
    await display(f, "runTotal");
    expect(inert()).toBe(1);
    await display(f, "difference");
    expect(inert()).toBe(0);
    const lists = optionLists(f);
    const fieldList = lists.find((list) => list.props("label") === "Base field")!;
    const itemList = lists.find((list) => list.props("label") === "Base item")!;
    const quarter = fieldList
      .props("options")
      .find((option: { label: string }) => option.label === "Quarter")!;
    fieldList.vm.$emit("select", quarter.value);
    await flushPromises();
    const item = itemList
      .props("options")
      .find((option: { label: string }) => option.label === "Q2")!;
    itemList.vm.$emit("select", item.value);
    const result = await confirm(f);
    expect(result.values[0]?.display).toEqual({
      type: "difference",
      baseField: 1,
      baseItem: { kind: "value", value: "Q2" },
    });
    expect(f.table.values[0]?.display).toBeUndefined();
  });
  test("previous and next items remain typed choices and field changes reset the base item", async () => {
    const f = setup();
    await display(f, "percentDiff");
    let lists = optionLists(f);
    const items = lists.find((list) => list.props("label") === "Base item")!;
    expect(
      items
        .props("options")
        .slice(0, 2)
        .map((option: { value: string }) => JSON.parse(option.value)),
    ).toEqual([{ kind: "previous" }, { kind: "next" }]);
    items.vm.$emit("select", JSON.stringify({ kind: "next" }));
    await flushPromises();
    lists = optionLists(f);
    const fields = lists.find((list) => list.props("label") === "Base field")!;
    const quarter = fields
      .props("options")
      .find((option: { label: string }) => option.label === "Quarter")!;
    fields.vm.$emit("select", quarter.value);
    const result = await confirm(f);
    expect(result.values[0]?.display).toEqual({
      type: "percentDiff",
      baseField: 1,
      baseItem: { kind: "previous" },
    });
  });
  test("editing an existing nested base item leaves the original definition untouched on cancel", async () => {
    const original = {
      type: "difference" as const,
      baseField: 0,
      baseItem: { kind: "value" as const, value: "East" },
    };
    const f = setup(original);
    f.wrapper.findComponent(Tabs).vm.$emit("update:modelValue", "display");
    await flushPromises();
    expect(f.wrapper.findComponent(Select).props("value")).toBe("difference");
    const items = optionLists(f).find((list) => list.props("label") === "Base item")!;
    items.vm.$emit("select", JSON.stringify({ kind: "value", value: "West" }));
    await flushPromises();
    f.wrapper.findComponent(Dialog).vm.$emit("close");
    expect(f.table.values[0]?.display).toEqual(original);
    expect(original.baseItem.value).toBe("East");
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
  });
  test("cancel discards nested display changes and reopening starts from the source table", async () => {
    const f = setup();
    await display(f, "rankDescending");
    f.wrapper.findComponent(Dialog).vm.$emit("close");
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(f.wrapper.emitted("close")).toEqual([[]]);
    expect(f.table.values[0]?.display).toBeUndefined();
    f.wrapper.unmount();
    const reopened = setup();
    await display(reopened, "normal");
    expect(reopened.wrapper.findComponent(Select).props("value")).toBe("normal");
  });
  test("settings attach outside an inert parent and numeric format edits stay in the draft", async () => {
    const f = setup();
    await flushPromises();
    const settings = document.querySelector(".pivot-field-settings")!;
    expect(settings.closest("[inert]")).toBeNull();
    expect(f.host.contains(settings)).toBe(false);
    expect(f.wrapper.findComponent(Dialog).props("header")).toBe("Value field settings");
    expect(settings.textContent).toContain("Amount");
    const formatButton = [...settings.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Number format",
    )!;
    await new DOMWrapper(formatButton).trigger("click");
    const dialog = f.wrapper.findComponent(CellFormatDialog);
    expect(dialog.props("availableTabs")).toEqual(["number"]);
    dialog.vm.$emit("confirm", {
      style: { numberFormat: { kind: "number", code: "0.00" } },
    });
    await flushPromises();
    expect(f.table.values[0]?.numberFormat).toBeUndefined();
    expect((await confirm(f)).values[0]?.numberFormat).toEqual({
      kind: "number",
      code: "0.00",
    });
  });
});
