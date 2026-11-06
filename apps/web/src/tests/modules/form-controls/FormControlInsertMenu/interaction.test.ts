// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import FormControlInsertMenu from "../../../../modules/form-controls/components/FormControlInsertMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(disabled = false) {
  const wrapper = mount(FormControlInsertMenu, {
    attachTo: document.body,
    props: { disabled, ownerId: "sheet-1" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}
function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("FormControlInsertMenu", () => {
  test.each([
    ["checkbox", "Checkbox"],
    ["radio", "Option button"],
    ["combo", "Combo box"],
    ["list", "List box"],
    ["spinner", "Spin button"],
    ["scrollbar", "Scroll bar"],
    ["button", "Button"],
    ["label", "Label"],
    ["group", "Group box"],
  ] as const)("selects %s and forwards its type before closing", async (type, label) => {
    const wrapper = fixture();
    const trigger = wrapper.get('[data-insert-tool="control"]');
    await trigger.trigger("click");
    const choices = menu().findAll('[role="menuitem"]');
    expect(choices).toHaveLength(9);
    expect(wrapper.emitted("insert")).toBeUndefined();
    const choice = choices.find((candidate) => candidate.text() === label);
    expect(choice).toBeDefined();
    await choice!.trigger("click");

    expect(wrapper.emitted("insert")).toEqual([[type]]);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.attributes("aria-expanded")).toBe("false");
  });

  test("does not open while disabled", async () => {
    const wrapper = fixture(true);
    const trigger = wrapper.get('[data-insert-tool="control"]');
    expect(trigger.attributes("aria-disabled")).toBe("true");
    await trigger.trigger("click");
    await trigger.trigger("keydown", { key: "ArrowDown" });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("insert")).toBeUndefined();
  });

  test("cancels the open choices when the owning sheet changes", async () => {
    const wrapper = fixture();
    await wrapper.get('[data-insert-tool="control"]').trigger("click");
    await wrapper.setProps({ ownerId: "sheet-2" });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("insert")).toBeUndefined();
  });
});
