import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import CustomSortListDialog from "../../../../modules/data-tools/components/CustomSortListDialog.vue";
import {
  readCustomSortLists,
  writeCustomSortLists,
} from "../../../../modules/data-tools/custom-sort-lists";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount: () => void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  localStorage.removeItem("idea10.sort.customLists");
  document.body.innerHTML = "";
});
function fixture(initialOrder?: string[]) {
  const wrapper = mount(CustomSortListDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { visible: true, ...(initialOrder ? { initialOrder } : {}) },
  });
  mounted.push(wrapper);
  const click = async (selector: string) =>
    new DOMWrapper(document.querySelector(selector)!).trigger("click");
  const confirm = () => wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
  return { wrapper, click, confirm };
}

describe("CustomSortListDialog", () => {
  test("edits an existing list in place, retains edits across selection changes, and saves on confirm", async () => {
    writeCustomSortLists([{ id: "priority", values: ["High", "Low"] }]);
    const { wrapper, click, confirm } = fixture(["High", "Low"]);
    const input = () => new DOMWrapper(document.querySelector("textarea")!);
    expect(wrapper.findComponent({ name: "TTextarea" }).props("readonly")).toBe(false);
    await input().setValue("High\nMedium\nLow");
    await click("[data-sort-list-save]");
    expect(readCustomSortLists()).toEqual([{ id: "priority", values: ["High", "Low"] }]);
    await input().setValue("Urgent\nHigh\nMedium\nLow");
    await click('[data-sort-list="builtin:weekday-short-en"]');
    await click('[data-sort-list="priority"]');
    expect(wrapper.findComponent({ name: "TTextarea" }).props("modelValue")).toBe(
      "Urgent\nHigh\nMedium\nLow",
    );
    await input().setValue("Urgent\nNormal\nLow");
    confirm();
    expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual(["Urgent", "Normal", "Low"]);
    expect(readCustomSortLists()).toEqual([
      { id: "priority", values: ["Urgent", "Normal", "Low"] },
    ]);
    await wrapper.setProps({ visible: false, initialOrder: ["Urgent", "Normal", "Low"] });
    await wrapper.setProps({ visible: true });
    expect(wrapper.findComponent({ name: "TTextarea" }).props("modelValue")).toBe(
      "Urgent\nNormal\nLow",
    );
  });

  test("cancels edits and does not replace a saved list with empty entries", async () => {
    const original = [{ id: "priority", values: ["High", "Low"] }];
    writeCustomSortLists(original);
    const { wrapper, click, confirm } = fixture(["High", "Low"]);
    await new DOMWrapper(document.querySelector("textarea")!).setValue("First\nLast");
    await click("[data-sort-list-save]");
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("close");
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(wrapper.findComponent({ name: "TTextarea" }).props("modelValue")).toBe("High\nLow");
    await new DOMWrapper(document.querySelector("textarea")!).setValue(" \n");
    expect(wrapper.findComponent({ name: "TDialog" }).props("confirmBtn")).toMatchObject({
      disabled: true,
    });
    confirm();
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(readCustomSortLists()).toEqual(original);
  });
  test("keeps a stored list named new distinct from the new-list entry", async () => {
    writeCustomSortLists([{ id: "new", values: ["First", "Last"] }]);
    const { wrapper, click, confirm } = fixture(["First", "Last"]);
    expect(wrapper.findComponent({ name: "TTextarea" }).props("readonly")).toBe(false);
    expect(document.querySelectorAll('[data-sort-list="new"]')).toHaveLength(1);
    expect(document.querySelector('[data-sort-list="builtin:new"]')).not.toBeNull();
    await click("[data-sort-list-delete]");
    confirm();
    expect(readCustomSortLists()).toEqual([]);
  });
  test("selects an immutable built-in sequence without saving it as a user list", async () => {
    const { wrapper, click, confirm } = fixture();
    await click('[data-sort-list="builtin:weekday-short-en"]');
    expect(wrapper.findComponent({ name: "TTextarea" }).props("readonly")).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("[data-sort-list-delete]")?.disabled).toBe(
      true,
    );
    confirm();
    expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(readCustomSortLists()).toEqual([]);
  });

  test("adds newline entries and saves only when confirmed", async () => {
    const { wrapper, click, confirm } = fixture();
    await new DOMWrapper(document.querySelector("textarea")!).setValue("High\nMedium\nLow\nHigh\n");
    await click("[data-sort-list-add]");
    expect(readCustomSortLists()).toEqual([]);
    expect(document.querySelector<HTMLButtonElement>("[data-sort-list-delete]")?.disabled).toBe(
      false,
    );
    confirm();
    expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual(["High", "Medium", "Low"]);
    expect(readCustomSortLists()[0]?.values).toEqual(["High", "Medium", "Low"]);
  });

  test("discards deletions on cancel and commits them on confirm", async () => {
    writeCustomSortLists([{ id: "priority", values: ["High", "Low"] }]);
    const { wrapper, click, confirm } = fixture(["High", "Low"]);
    await click("[data-sort-list-delete]");
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("close");
    expect(readCustomSortLists()).toHaveLength(1);
    expect(wrapper.emitted("apply")).toBeUndefined();
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    expect(wrapper.findComponent({ name: "TTextarea" }).props("modelValue")).toBe("High\nLow");
    await click("[data-sort-list-delete]");
    await click('[data-sort-list="builtin:month-short-en"]');
    confirm();
    expect(readCustomSortLists()).toEqual([]);
    expect(wrapper.emitted("apply")?.[0]?.[0]).toHaveLength(12);
  });

  test("confirms a new list directly and rejects empty entries", async () => {
    const { wrapper, confirm } = fixture();
    confirm();
    expect(wrapper.emitted("apply")).toBeUndefined();
    await new DOMWrapper(document.querySelector("textarea")!).setValue("Urgent\nLater");
    confirm();
    expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual(["Urgent", "Later"]);
    expect(readCustomSortLists()[0]?.values).toEqual(["Urgent", "Later"]);
  });
});
