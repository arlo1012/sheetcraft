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
  test("copies independently, reorders selected levels, and removes the selected level", async () => {
    const { wrapper, action, confirm } = fixture();
    await action("copy");
    let selects = wrapper.findAllComponents({ name: "TSelect" });
    selects[2]!.vm.$emit("update:modelValue", 1);
    selects[3]!.vm.$emit("update:modelValue", "descending");
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
    expect(wrapper.findAllComponents({ name: "TSelect" })).toHaveLength(2);
    expect(select().props("options")[0].label).toBe("A (Name)");
    await wrapper.setProps({
      visible: false,
      initial: { hasHeader: false, headerLocked: true, column: 1, direction: "descending" },
    });
    await wrapper.setProps({ visible: true });
    expect(wrapper.findComponent({ name: "TCheckbox" }).props()).toMatchObject({
      disabled: true,
      modelValue: true,
    });
    expect(select().props("modelValue")).toBe(1);
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
