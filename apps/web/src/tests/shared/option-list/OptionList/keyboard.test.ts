import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import OptionList from "../../../../shared/option-list/OptionList.vue";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

function mountList() {
  const wrapper = mount(OptionList, {
    attachTo: document.body,
    props: {
      modelValue: "first",
      label: "Options",
      options: [
        { value: "first", label: "Same label" },
        { value: "second", label: "Same label" },
        { value: "third", label: "Another label" },
      ],
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("OptionList keyboard interaction", () => {
  test("keeps distinct values with duplicate labels and moves one tab stop through the list", async () => {
    const wrapper = mountList();
    const first = wrapper.get<HTMLButtonElement>('[data-option-list-value="first"]');
    first.element.focus();
    await first.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.emitted("select")).toEqual([["second"]]);
    await wrapper.setProps({ modelValue: "second" });
    expect(document.activeElement?.getAttribute("data-option-list-value")).toBe("second");
    expect(wrapper.findAll('[role="option"][tabindex="0"]')).toHaveLength(1);

    await wrapper.get('[data-option-list-value="second"]').trigger("keydown", { key: "End" });
    expect(wrapper.emitted("select")?.at(-1)).toEqual(["third"]);
    await wrapper.setProps({ modelValue: "third" });
    await wrapper.get('[data-option-list-value="third"]').trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.emitted("select")?.at(-1)).toEqual(["first"]);
  });

  test("selects on click and activates only on Enter or double click", async () => {
    const wrapper = mountList();
    const second = wrapper.get('[data-option-list-value="second"]');
    await second.trigger("click");
    expect(wrapper.emitted("select")).toEqual([["second"]]);
    expect(wrapper.emitted("activate")).toBeUndefined();
    await second.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("activate")).toEqual([["second"]]);
    await second.trigger("dblclick");
    expect(wrapper.emitted("activate")).toEqual([["second"], ["second"]]);
  });

  test("locates a search match without filtering or changing the selection", async () => {
    const wrapper = mountList();
    await wrapper.setProps({ searchText: "another" });
    expect(wrapper.findAll('[role="option"]')).toHaveLength(3);
    expect(wrapper.get("[data-option-list-match]").attributes("data-option-list-value")).toBe(
      "third",
    );
    expect(wrapper.get('[aria-selected="true"]').attributes("data-option-list-value")).toBe(
      "first",
    );
    expect(wrapper.emitted("select")).toBeUndefined();
    await wrapper.setProps({ options: [] });
    await wrapper.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
    expect(wrapper.emitted("select")).toBeUndefined();
  });
});
