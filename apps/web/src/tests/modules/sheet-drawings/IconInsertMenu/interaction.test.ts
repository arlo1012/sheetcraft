// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import IconInsertMenu from "../../../../modules/sheet-drawings/components/IconInsertMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(disabled = false, accepted = true) {
  const handler = vi.fn(() => accepted);
  const wrapper = mount(IconInsertMenu, {
    attachTo: document.body,
    props: { disabled, handler, ownerId: "sheet-1" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mountedWrappers.push(wrapper);
  return { wrapper, handler };
}
function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("IconInsertMenu", () => {
  test.each([
    "star",
    "heart",
    "arrow",
    "ellipse",
    "triangle",
    "diamond",
    "rectangle",
    "roundedRectangle",
    "line",
  ] as const)("inserts the selected %s icon and closes after acceptance", async (shape) => {
    const { wrapper, handler } = fixture();
    const trigger = wrapper.get('[data-insert-tool="icon"]');
    await trigger.trigger("click");
    expect(menu().findAll('[role="menuitem"]')).toHaveLength(9);
    expect(handler).not.toHaveBeenCalled();

    await menu().get(`[data-insert-icon="${shape}"]`).trigger("click");

    expect(handler).toHaveBeenCalledExactlyOnceWith(shape);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.attributes("aria-expanded")).toBe("false");
  });

  test("keeps a rejected selection open with an inline error and allows retry", async () => {
    const { wrapper, handler } = fixture(false, false);
    const trigger = wrapper.get('[data-insert-tool="icon"]');
    await trigger.trigger("click");
    await menu().get('[data-insert-icon="heart"]').trigger("click");

    expect(handler).toHaveBeenCalledExactlyOnceWith("heart");
    expect(menu().get('[role="alert"]').text()).toBe(
      "Could not apply this change. Your draft is preserved.",
    );
    expect(trigger.attributes("aria-expanded")).toBe("true");

    handler.mockReturnValue(true);
    await menu().get('[data-insert-icon="diamond"]').trigger("click");
    expect(handler).toHaveBeenLastCalledWith("diamond");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  test("does not open or invoke insertion while disabled", async () => {
    const { wrapper, handler } = fixture(true);
    const trigger = wrapper.get('[data-insert-tool="icon"]');
    expect(trigger.attributes("aria-disabled")).toBe("true");
    await trigger.trigger("click");
    await trigger.trigger("keydown", { key: "ArrowDown" });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  test("dismisses stale choices when the owning sheet changes", async () => {
    const { wrapper, handler } = fixture();
    await wrapper.get('[data-insert-tool="icon"]').trigger("click");
    const oldChoice = menu().get('[data-insert-icon="star"]');
    await wrapper.setProps({ ownerId: "sheet-2" });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    await oldChoice.trigger("click");
    expect(handler).not.toHaveBeenCalled();
  });
});
