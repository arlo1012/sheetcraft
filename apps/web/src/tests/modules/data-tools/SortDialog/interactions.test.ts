import { PrimaryTable } from "tdesign-vue-next/es/table";
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import CustomSortListDialog from "../../../../modules/data-tools/components/CustomSortListDialog.vue";
import SortDialog from "../../../../modules/data-tools/components/SortDialog.vue";
import ConditionalFormatIcon from "../../../../shared/conditional-formatting/ConditionalFormatIcon.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});
function fixture(headerLocked = false) {
  const wrapper = mount(SortDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      visible: true,
      rangeLabel: "A1:B8",
      columns: [
        { column: 0, label: "A", header: "Name" },
        { column: 1, label: "B", header: "Amount" },
      ],
      colorColumns: [
        {
          column: 0,
          cellColors: ["#ff0000", null],
          fontColors: ["#20242c", "#00ff00"],
          headerCellColor: "#0000ff",
          headerFontColor: "#20242c",
        },
        { column: 1, cellColors: ["#ffff00"], fontColors: ["#20242c"], headerFontColor: "#20242c" },
      ],
      iconColumns: [
        {
          column: 0,
          icons: [
            { iconSet: "threeArrows", iconIndex: 0 },
            { iconSet: "fourArrows", iconIndex: 0 },
            null,
          ],
          headerIcon: { iconSet: "fiveArrows", iconIndex: 4 },
        },
        { column: 1, icons: [{ iconSet: "threeFlags", iconIndex: 2 }], headerIcon: null },
      ],
      initial: { hasHeader: true, headerLocked, column: 0, direction: "ascending" },
    },
  });
  mounted.push(wrapper);
  const action = async (name: string) => {
    await new DOMWrapper(document.querySelector(`[data-sort-action="${name}"]`)!).trigger("click");
  };
  const rowAction = async (
    rowIndex: number,
    name: string,
    event: "click" | "keydown" = "click",
    options: Record<string, unknown> = {},
  ) => {
    const row = wrapper.findAll("[data-sort-row]")[rowIndex]!;
    await row.get(`[data-sort-action="${name}"]`).trigger(event, options);
  };
  const confirm = () => wrapper.findAllComponents({ name: "TDialog" })[0]!.vm.$emit("confirm");
  return { wrapper, action, rowAction, confirm };
}

describe("SortDialog", () => {
  test("enables icon sorting, previews the exact family and copies icon conditions independently", async () => {
    const { wrapper, action, confirm } = fixture();
    const fields = (field: string) =>
      wrapper
        .findAllComponents({ name: "TSelect" })
        .filter((item) => item.attributes("data-sort-field") === field);
    expect(fields("basis")[0]!.props("options")).toContainEqual({
      label: "Conditional formatting icon",
      value: "icon",
    });
    const initial = {
      hasHeader: true,
      column: 0,
      direction: "ascending" as const,
      levels: [
        {
          column: 0,
          direction: "ascending" as const,
          sortOn: "icon" as const,
          icon: { iconSet: "threeArrows" as const, iconIndex: 0 },
        },
      ],
    };
    await wrapper.setProps({ visible: false, initial });
    await wrapper.setProps({ visible: true });
    expect(wrapper.getComponent(ConditionalFormatIcon).props()).toMatchObject({
      iconSet: "threeArrows",
      iconIndex: 0,
    });
    expect(fields("direction")[0]!.props("options")).toEqual([
      { label: "On top", value: "ascending" },
      { label: "On bottom", value: "descending" },
    ]);
    await action("copy");
    fields("icon")[1]!.vm.$emit("update:value", "fourArrows:0");
    fields("direction")[1]!.vm.$emit("update:value", "descending");
    await wrapper.vm.$nextTick();
    confirm();
    const draft = wrapper.emitted("apply")!.at(-1)![0] as { levels: typeof initial.levels };
    expect(draft.levels).toEqual([
      initial.levels[0],
      {
        column: 0,
        direction: "descending",
        sortOn: "icon",
        icon: { iconSet: "fourArrows", iconIndex: 0 },
      },
    ]);
    draft.levels[0]!.icon.iconIndex = 2;
    expect(initial.levels[0]!.icon.iconIndex).toBe(0);
    confirm();
    expect(wrapper.emitted("apply")!.at(-1)![0]).toMatchObject({
      levels: [{ icon: { iconIndex: 0 } }, { icon: { iconSet: "fourArrows" } }],
    });
    fields("basis")[1]!.vm.$emit("update:value", "value");
    await wrapper.vm.$nextTick();
    confirm();
    expect((wrapper.emitted("apply")!.at(-1)![0] as { levels: unknown[] }).levels[1]).toEqual({
      column: 0,
      direction: "descending",
    });
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(fields("icon")).toHaveLength(1);
    expect(fields("icon")[0]!.props("value")).toBe("threeArrows:0");
  });

  test("includes header icons only without a header and resets stale icons when the column changes", async () => {
    const { wrapper, confirm } = fixture();
    const field = (name: string) =>
      wrapper
        .findAllComponents({ name: "TSelect" })
        .find((item) => item.attributes("data-sort-field") === name)!;
    field("basis").vm.$emit("update:value", "icon");
    await wrapper.vm.$nextTick();
    await field("icon").find(".t-input").trigger("click");
    await expect
      .poll(() => wrapper.findAllComponents({ name: "TOption" }).map((item) => item.props("value")))
      .toContain("fourArrows:0");
    expect(
      wrapper.findAllComponents({ name: "TOption" }).map((item) => item.props("value")),
    ).not.toContain("fiveArrows:4");
    wrapper.findComponent({ name: "TCheckbox" }).vm.$emit("update:modelValue", false);
    await wrapper.vm.$nextTick();
    expect(
      wrapper.findAllComponents({ name: "TOption" }).map((item) => item.props("value")),
    ).toContain("fiveArrows:4");
    field("icon").vm.$emit("update:value", "fiveArrows:4");
    await wrapper.vm.$nextTick();
    wrapper.findComponent({ name: "TCheckbox" }).vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    expect(field("icon").props("value")).toBe("threeArrows:0");
    field("icon").vm.$emit("update:value", "no-icon");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")!.at(-1)![0]).toMatchObject({
      levels: [{ sortOn: "icon", icon: null }],
    });
    field("column").vm.$emit("update:value", 1);
    await wrapper.vm.$nextTick();
    expect(field("icon").props("value")).toBe("threeFlags:2");
    await wrapper.setProps({ iconColumns: [] });
    expect(field("icon").props("disabled")).toBe(true);
    expect(wrapper.findAllComponents({ name: "TDialog" })[0]!.props("confirmBtn")).toMatchObject({
      disabled: true,
    });
    const applies = wrapper.emitted("apply")!.length;
    confirm();
    expect(wrapper.emitted("apply")).toHaveLength(applies);
  });
  test("restores applied levels and options without mutating them when draft changes are cancelled", async () => {
    const { wrapper, confirm } = fixture();
    const initial = {
      hasHeader: true,
      column: 0,
      direction: "descending" as const,
      caseSensitive: true,
      sortMethod: "stroke" as const,
      levels: [
        { column: 0, direction: "descending" as const, customOrder: ["High", "Low"] },
        {
          column: 1,
          direction: "ascending" as const,
          sortOn: "cellColor" as const,
          color: "#ffff00",
        },
      ],
    };
    await wrapper.setProps({ visible: false, initial });
    await wrapper.setProps({ visible: true });
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: initial.levels,
      caseSensitive: true,
      sortMethod: "stroke",
    });
    const order = wrapper
      .findAllComponents({ name: "TSelect" })
      .find((item) => item.attributes("data-sort-field") === "direction")!;
    expect(order.props("value")).toBe("selected-custom-reversed");
    order.vm.$emit("update:value", "ascending");
    await wrapper.vm.$nextTick();
    expect(initial.levels[0]?.customOrder).toEqual(["High", "Low"]);
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: initial.levels,
      caseSensitive: true,
    });
  });
  test("updates every sort row dropdown from its visible options and opens custom lists", async () => {
    const { wrapper } = fixture();
    const field = (name: string) =>
      new DOMWrapper(document.querySelector(`[data-sort-field="${name}"]`)!);
    const selectOption = async (name: string, label: string) => {
      await field(name).get(".t-input__inner").trigger("keydown", { code: "ArrowDown" });
      await expect
        .poll(() =>
          [...document.querySelectorAll<HTMLElement>(".t-select-option")].map((option) =>
            option.textContent?.trim(),
          ),
        )
        .toContain(label);
      const option = [...document.querySelectorAll<HTMLElement>(".t-select-option")].find(
        (item) => item.textContent?.trim() === label,
      );
      await new DOMWrapper(option!).trigger("click");
      await wrapper.vm.$nextTick();
    };

    await selectOption("column", "B (Amount)");
    expect(
      wrapper
        .findAllComponents({ name: "TSelect" })
        .find((item) => item.attributes("data-sort-field") === "column")
        ?.props("value"),
    ).toBe(1);
    await selectOption("column", "A (Name)");
    await selectOption("basis", "Font color");
    await expect.poll(() => document.querySelector('[data-sort-field="color"]')).not.toBeNull();
    await selectOption("color", "#00FF00");
    await selectOption("direction", "On bottom");
    await selectOption("basis", "Cell values");
    await selectOption("direction", "Custom list…");

    expect(wrapper.getComponent(CustomSortListDialog).props("visible")).toBe(true);
  });

  test("applies custom order, reverses it, and preserves row draft when its editor is cancelled", async () => {
    const { wrapper, action, confirm } = fixture();
    const order = () =>
      wrapper
        .findAllComponents({ name: "TSelect" })
        .filter((item) => item.attributes("data-sort-field") === "direction");
    order()[0]!.vm.$emit("update:value", "custom");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents({ name: "TDialog" })[0]!.props("visible")).toBe(false);
    wrapper.getComponent(CustomSortListDialog).vm.$emit("apply", ["High", "Medium", "Low"]);
    await wrapper.vm.$nextTick();
    expect(order()[0]!.props("value")).toBe("selected-custom");
    order()[0]!.vm.$emit("update:value", "selected-custom-reversed");
    await wrapper.vm.$nextTick();
    await action("copy");
    order()[1]!.vm.$emit("update:value", "custom");
    await wrapper.vm.$nextTick();
    wrapper.getComponent(CustomSortListDialog).vm.$emit("close");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [
        { customOrder: ["High", "Medium", "Low"], direction: "descending" },
        { customOrder: ["High", "Medium", "Low"], direction: "descending" },
      ],
    });
    order()[1]!.vm.$emit("update:value", "ascending");
    await wrapper.vm.$nextTick();
    confirm();
    const draft = wrapper.emitted("apply")!.at(-1)![0] as {
      levels: Array<{ customOrder?: string[] }>;
    };
    expect(draft.levels[0]?.customOrder).toEqual(["High", "Medium", "Low"]);
    expect(draft.levels[1]?.customOrder).toBeUndefined();
  });
  test("switches basis, color and placement, and copies color levels independently", async () => {
    const { wrapper, action, confirm } = fixture();
    const fields = (field: string) =>
      wrapper
        .findAllComponents({ name: "TSelect" })
        .filter((item) => item.attributes("data-sort-field") === field);
    fields("basis")[0]!.vm.$emit("update:value", "cellColor");
    await wrapper.vm.$nextTick();
    expect(fields("color")[0]!.props("value")).toBe("#ff0000");
    expect(fields("direction")[0]!.props("options")).toEqual([
      { value: "ascending", label: "On top" },
      { value: "descending", label: "On bottom" },
    ]);
    fields("color")[0]!.vm.$emit("update:value", "no-fill");
    fields("direction")[0]!.vm.$emit("update:value", "descending");
    await wrapper.vm.$nextTick();
    await action("copy");
    fields("basis")[1]!.vm.$emit("update:value", "fontColor");
    await wrapper.vm.$nextTick();
    fields("color")[1]!.vm.$emit("update:value", "#00ff00");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [
        { column: 0, sortOn: "cellColor", color: null, direction: "descending" },
        { column: 0, sortOn: "fontColor", color: "#00ff00", direction: "descending" },
      ],
    });
    fields("basis")[1]!.vm.$emit("update:value", "value");
    await wrapper.vm.$nextTick();
    confirm();
    const applied = wrapper.emitted("apply")!.at(-1)![0] as { levels: unknown[] };
    expect(applied.levels[1]).toEqual({
      column: 0,
      direction: "descending",
    });
  });

  test("refreshes available colors when column or header choice changes and blocks missing colors", async () => {
    const { wrapper, confirm } = fixture();
    const field = (name: string) =>
      wrapper
        .findAllComponents({ name: "TSelect" })
        .find((item) => item.attributes("data-sort-field") === name)!;
    field("basis").vm.$emit("update:value", "cellColor");
    await wrapper.vm.$nextTick();
    await field("color").find(".t-input").trigger("click");
    await expect
      .poll(() => wrapper.findAllComponents({ name: "TOption" }).map((item) => item.props("value")))
      .toContain("#ff0000");
    expect(
      wrapper
        .findAllComponents({ name: "TOption" })
        .some((item) => item.props("value") === "#0000ff"),
    ).toBe(false);
    wrapper.findComponent({ name: "TCheckbox" }).vm.$emit("update:modelValue", false);
    await wrapper.vm.$nextTick();
    expect(
      wrapper
        .findAllComponents({ name: "TOption" })
        .some((item) => item.props("value") === "#0000ff"),
    ).toBe(true);
    field("color").vm.$emit("update:value", "#0000ff");
    await wrapper.vm.$nextTick();
    wrapper.findComponent({ name: "TCheckbox" }).vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    expect(field("color").props("value")).toBe("#ff0000");
    field("column").vm.$emit("update:value", 1);
    await wrapper.vm.$nextTick();
    expect(field("color").props("value")).toBe("#ffff00");
    await wrapper.setProps({ colorColumns: [] });
    expect(field("color").props("disabled")).toBe(true);
    expect(wrapper.findAllComponents({ name: "TDialog" })[0]!.props("confirmBtn")).toMatchObject({
      disabled: true,
    });
    confirm();
    expect(wrapper.emitted("apply")).toBeUndefined();
  });
  test("copies independently and lets each row reorder or remove itself", async () => {
    const { wrapper, action, rowAction, confirm } = fixture();
    await action("copy");
    const selects = wrapper.findAllComponents({ name: "TSelect" });
    selects
      .filter((item) => item.attributes("data-sort-field") === "column")[1]!
      .vm.$emit("update:value", 1);
    selects
      .filter((item) => item.attributes("data-sort-field") === "direction")[1]!
      .vm.$emit("update:value", "descending");
    await wrapper.vm.$nextTick();
    const firstUp = wrapper.findAll("[data-sort-row]")[0]!.get('[data-sort-action="up"]');
    const lastDown = wrapper.findAll("[data-sort-row]")[1]!.get('[data-sort-action="down"]');
    expect(firstUp.attributes("aria-disabled")).toBe("true");
    expect(firstUp.attributes("tabindex")).toBe("-1");
    expect(lastDown.attributes("aria-disabled")).toBe("true");
    expect(lastDown.attributes("tabindex")).toBe("-1");

    // The copied second row remains selected; operate on the unselected first row by keyboard.
    await rowAction(0, "down", "keydown", { key: "Enter" });
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toEqual({
      range: "A1:B8",
      hasHeader: true,
      caseSensitive: false,
      sortMethod: "pinyin",
      levels: [
        { column: 1, direction: "descending" },
        { column: 0, direction: "ascending" },
      ],
    });
    // Remove the moved row using its action cell.
    await rowAction(1, "delete");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [{ column: 1, direction: "descending" }],
    });
    await action("add");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [
        { column: 1, direction: "descending" },
        { column: 0, direction: "ascending" },
      ],
    });
    // The newly added second row is selected; delete the unselected first row.
    await rowAction(0, "delete");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [{ column: 0, direction: "ascending" }],
    });
  });

  test("uses header labels only when enabled and resets draft on reopening", async () => {
    const { wrapper, action } = fixture();
    const select = () => wrapper.findComponent({ name: "TSelect" });
    expect(select().props("options")[0].label).toBe("A (Name)");
    wrapper.findComponent({ name: "TCheckbox" }).vm.$emit("update:modelValue", false);
    await wrapper.vm.$nextTick();
    expect(select().props("options")[0].label).toBe("A");
    await action("copy");
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(wrapper.findAllComponents({ name: "TSelect" })).toHaveLength(3);
    expect(select().props("options")[0].label).toBe("A (Name)");
    await wrapper.setProps({
      visible: false,
      colorColumns: [
        {
          column: 0,
          cellColors: ["#ff0000", null],
          fontColors: ["#20242c", "#00ff00"],
          headerCellColor: "#0000ff",
          headerFontColor: "#20242c",
        },
        { column: 1, cellColors: ["#ffff00"], fontColors: ["#20242c"], headerFontColor: "#20242c" },
      ],
      initial: { hasHeader: false, headerLocked: true, column: 1, direction: "descending" },
    });
    await wrapper.setProps({ visible: true });
    expect(wrapper.findComponent({ name: "TCheckbox" }).props()).toMatchObject({
      disabled: true,
      modelValue: true,
    });
    expect(select().props("value")).toBe(1);
  });

  test("applies options only on confirm and cancels without losing sort levels", async () => {
    const { wrapper, action, confirm } = fixture();
    await action("add");
    await action("options");
    const dialogs = wrapper.findAllComponents({ name: "TDialog" });
    const method = () =>
      wrapper
        .findAllComponents({ name: "TRadioGroup" })
        .find((item) => item.attributes("data-sort-method") !== undefined)!;
    const orientations = wrapper
      .findAllComponents({ name: "TRadio" })
      .filter((item) => item.attributes("data-sort-orientation") !== undefined);
    expect(orientations.map((item) => [item.props("value"), item.props("disabled")])).toEqual([
      ["columns", undefined],
      ["rows", true],
    ]);
    expect(method().props("modelValue")).toBe("pinyin");
    const option = wrapper.findAllComponents({ name: "TCheckbox" }).at(-1)!;
    option.vm.$emit("update:modelValue", true);
    method().vm.$emit("update:modelValue", "stroke");
    await wrapper.vm.$nextTick();
    dialogs[1]!.vm.$emit("close");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      caseSensitive: false,
      sortMethod: "pinyin",
      levels: [{ column: 0 }, { column: 1 }],
    });
    await action("options");
    expect(method().props("modelValue")).toBe("pinyin");
    wrapper.findAllComponents({ name: "TCheckbox" }).at(-1)!.vm.$emit("update:modelValue", true);
    method().vm.$emit("update:modelValue", "stroke");
    await wrapper.vm.$nextTick();
    dialogs[1]!.vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      caseSensitive: true,
      sortMethod: "stroke",
    });
    await action("options");
    expect(method().props("modelValue")).toBe("stroke");
    dialogs[1]!.vm.$emit("close");
    dialogs[0]!.vm.$emit("close");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});

test("dragging sort levels changes the confirmed priority and cancels without applying", async () => {
  const { wrapper, action, confirm } = fixture();
  await action("add");
  const table = wrapper.getComponent(PrimaryTable);
  const rows = [...(table.props("data") ?? [])];
  expect(table.props("dragSort")).toBe("row-handler");
  expect(table.findAll("svg.sheetcraft-table-drag-icon")).toHaveLength(
    (table.props("data") ?? []).length,
  );
  table.vm.$emit("drag-sort", {
    currentIndex: 0,
    targetIndex: 1,
    current: rows[0],
    target: rows[1],
    data: rows,
    newData: [rows[1], rows[0]],
    sort: "row",
  });
  await wrapper.vm.$nextTick();
  expect((table.props("data") ?? []).map((row) => row.id)).toEqual([rows[1]!.id, rows[0]!.id]);
  confirm();
  expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
    levels: [{ column: 1 }, { column: 0 }],
  });
  await wrapper.setProps({ visible: false });
  await wrapper.setProps({ visible: true });
  await action("add");
  const reopenedRows = [...(table.props("data") ?? [])];
  table.vm.$emit("drag-sort", {
    currentIndex: 0,
    targetIndex: 1,
    current: reopenedRows[0],
    target: reopenedRows[1],
    data: reopenedRows,
    newData: [...reopenedRows].reverse(),
    sort: "row",
  });
  await wrapper.vm.$nextTick();
  wrapper.findAllComponents({ name: "TDialog" })[0]!.vm.$emit("close");
  expect(wrapper.emitted("apply")).toHaveLength(1);
  await wrapper.setProps({ visible: false });
  await wrapper.setProps({ visible: true });
  expect(table.props("data")).toHaveLength(1);
});
