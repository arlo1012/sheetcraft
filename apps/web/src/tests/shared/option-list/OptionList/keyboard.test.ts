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
  test("disabled options are skipped by arrows and endpoints while keeping one enabled tab stop", async () => {
    const wrapper = mountList();
    await wrapper.setProps({
      options: [
        { value: "first", label: "First" },
        { value: "second", label: "Disabled", disabled: true },
        { value: "third", label: "Third" },
      ],
    });
    await wrapper.get('[data-option-list-value="first"]').trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.emitted("select")?.at(-1)).toEqual(["third"]);
    await wrapper.setProps({ modelValue: "third" });
    expect(document.activeElement?.getAttribute("data-option-list-value")).toBe("third");
    await wrapper.get('[data-option-list-value="third"]').trigger("keydown", { key: "Home" });
    expect(wrapper.emitted("select")?.at(-1)).toEqual(["first"]);
    await wrapper.setProps({ modelValue: "first" });
    await wrapper.trigger("keydown", { key: "End" });
    expect(wrapper.emitted("select")?.at(-1)).toEqual(["third"]);
    expect(wrapper.findAll('[role="option"][tabindex="0"]')).toHaveLength(1);
    expect(wrapper.get('[data-option-list-value="second"]').attributes("aria-disabled")).toBe(
      "true",
    );
  });
  test("disabled choices reject pointer, Enter, and activation, including when all options are disabled", async () => {
    const wrapper = mountList();
    await wrapper.setProps({ options: [{ value: "first", label: "Disabled", disabled: true }] });
    const first = wrapper.get('[data-option-list-value="first"]');
    await first.trigger("click");
    await first.trigger("keydown", { key: "Enter" });
    await first.trigger("dblclick");
    await wrapper.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("activate")).toBeUndefined();
    expect(wrapper.findAll('[role="option"][tabindex="0"]')).toHaveLength(0);
    await wrapper.setProps({
      options: [
        { value: "first", label: "Disabled", disabled: true },
        { value: "second", label: "Enabled" },
      ],
    });
    expect(wrapper.get('[data-option-list-value="second"]').attributes("tabindex")).toBe("0");
  });
  test("composition does not navigate or activate a list choice", async () => {
    const wrapper = mountList();
    const first = wrapper.get('[data-option-list-value="first"]');
    await first.trigger("keydown", { key: "ArrowDown", isComposing: true });
    for (const init of [
      { key: "Enter", isComposing: true },
      { key: "Enter", keyCode: 229 },
      { key: "ArrowDown", keyCode: 229 },
    ]) {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      first.element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("activate")).toBeUndefined();
  });
  test("the optional icon slot keeps the default label and does not add icon chrome to ordinary lists", () => {
    const plain = mountList();
    expect(plain.find(".option-list__icon").exists()).toBe(false);
    const wrapper = mount(OptionList, {
      props: {
        modelValue: "first",
        label: "Icon list",
        options: [{ value: "first", label: "First" }],
      },
      slots: { icon: '<svg viewBox="0 0 16 16"><path d="M1 1h5" /></svg>' },
    });
    mounted.push(wrapper);
    expect(wrapper.get('[role="option"]').text()).toBe("First");
    expect(wrapper.get(".option-list__icon").attributes("aria-hidden")).toBe("true");
    expect(wrapper.find(".option-list__icon svg").exists()).toBe(true);
  });
});
