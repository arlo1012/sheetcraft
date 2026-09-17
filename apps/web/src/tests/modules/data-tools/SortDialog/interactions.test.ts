import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SortDialog from "../../../../modules/data-tools/components/SortDialog.vue";
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
      initial: { hasHeader: true, headerLocked, column: 0, direction: "ascending" },
    },
  });
  mounted.push(wrapper);
  const action = async (name: string) => {
    await new DOMWrapper(document.querySelector(`[data-sort-action="${name}"]`)!).trigger("click");
  };
  const confirm = () => wrapper.findAllComponents({ name: "TDialog" })[0]!.vm.$emit("confirm");
  return { wrapper, action, confirm };
}

describe("SortDialog", () => {
  test("switches basis, color and placement, and copies color levels independently", async () => {
    const { wrapper, action, confirm } = fixture();
    const fields = (field: string) =>
      wrapper
        .findAllComponents({ name: "TSelect" })
        .filter((item) => item.attributes("data-sort-field") === field);
    fields("basis")[0]!.vm.$emit("update:modelValue", "cellColor");
    await wrapper.vm.$nextTick();
    expect(fields("color")[0]!.props("value")).toBe("#ff0000");
    expect(fields("direction")[0]!.props("options")).toEqual([
      { value: "ascending", label: "On top" },
      { value: "descending", label: "On bottom" },
    ]);
    fields("color")[0]!.vm.$emit("update:modelValue", "no-fill");
    fields("direction")[0]!.vm.$emit("update:modelValue", "descending");
    await wrapper.vm.$nextTick();
    await action("copy");
    fields("basis")[1]!.vm.$emit("update:modelValue", "fontColor");
    await wrapper.vm.$nextTick();
    fields("color")[1]!.vm.$emit("update:modelValue", "#00ff00");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [
        { column: 0, sortOn: "cellColor", color: null, direction: "descending" },
        { column: 0, sortOn: "fontColor", color: "#00ff00", direction: "descending" },
      ],
    });
    fields("basis")[1]!.vm.$emit("update:modelValue", "value");
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
    field("basis").vm.$emit("update:modelValue", "cellColor");
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
    field("color").vm.$emit("update:modelValue", "#0000ff");
    await wrapper.vm.$nextTick();
    wrapper.findComponent({ name: "TCheckbox" }).vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    expect(field("color").props("value")).toBe("#ff0000");
    field("column").vm.$emit("update:modelValue", 1);
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
  test("copies independently, reorders selected levels, and removes the selected level", async () => {
    const { wrapper, action, confirm } = fixture();
    await action("copy");
    const selects = wrapper.findAllComponents({ name: "TSelect" });
    selects
      .filter((item) => item.attributes("data-sort-field") === "column")[1]!
      .vm.$emit("update:modelValue", 1);
    selects
      .filter((item) => item.attributes("data-sort-field") === "direction")[1]!
      .vm.$emit("update:modelValue", "descending");
    await wrapper.vm.$nextTick();
    await action("up");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toEqual({
      range: "A1:B8",
      hasHeader: true,
      caseSensitive: false,
      levels: [
        { column: 1, direction: "descending" },
        { column: 0, direction: "ascending" },
      ],
    });
    await action("down");
    await action("delete");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [{ column: 0, direction: "ascending" }],
    });
    await action("add");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [
        { column: 0, direction: "ascending" },
        { column: 1, direction: "ascending" },
      ],
    });
    // Clicking a previous row changes the toolbar target.
    await new DOMWrapper(document.querySelector("[data-sort-row]")!).trigger("click");
    await action("delete");
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      levels: [{ column: 1, direction: "ascending" }],
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
    const option = wrapper.findAllComponents({ name: "TCheckbox" }).at(-1)!;
    option.vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    dialogs[1]!.vm.$emit("close");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
      caseSensitive: false,
      levels: [{ column: 0 }, { column: 1 }],
    });
    await action("options");
    wrapper.findAllComponents({ name: "TCheckbox" }).at(-1)!.vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    dialogs[1]!.vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    confirm();
    expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({ caseSensitive: true });
    dialogs[0]!.vm.$emit("close");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
