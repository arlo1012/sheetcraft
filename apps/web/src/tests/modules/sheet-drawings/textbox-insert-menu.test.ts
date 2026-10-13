import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import TextBoxInsertMenu from "../../../modules/sheet-drawings/components/TextBoxInsertMenu.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { TEXT_BOX_CHOICES } from "../../../modules/sheet-drawings/shape-gallery";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture() {
  const handler = vi.fn(() => true);
  const wrapper = mount(TextBoxInsertMenu, {
    attachTo: document.body,
    props: { handler, ownerId: "owner-1", editSessionId: "edit-1" },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  wrappers.push(wrapper);
  return { wrapper, handler };
}
function menu() {
  return document.body.querySelector<HTMLElement>(".text-box-insert-menu");
}
async function open(wrapper: VueWrapper) {
  await wrapper.get('[data-insert-tool="text-box"]').trigger("click");
  await nextTick();
}
test.each(["horizontal", "vertical"] as const)(
  "%s uses the exact shared one-shot choice and owned menu",
  async (direction) => {
    const { wrapper, handler } = fixture();
    await open(wrapper);
    expect(menu()!.getAttribute("data-cell-edit-session")).toBe("edit-1");
    expect(menu()!.getAttribute("data-text-box-insert-owner")).toBe("owner-1");
    expect(menu()!.textContent).toContain("横排文本框");
    expect(menu()!.textContent).toContain("竖排文本框");
    menu()!.querySelector<HTMLElement>(`[data-text-box-direction="${direction}"]`)!.click();
    await nextTick();
    expect(handler).toHaveBeenCalledExactlyOnceWith(TEXT_BOX_CHOICES[direction], false);
    expect(menu()).toBeNull();
  },
);
test.each(["reject", "throw"] as const)(
  "%s keeps direction choices and feedback for retry",
  async (outcome) => {
    const { wrapper, handler } = fixture();
    handler.mockImplementation(() => {
      if (outcome === "throw") throw Error("unavailable");
      return false;
    });
    await open(wrapper);
    menu()!.querySelector<HTMLElement>('[data-text-box-direction="horizontal"]')!.click();
    await nextTick();
    expect(menu()!.querySelector('[role="status"]')!.textContent).toContain("暂时无法选择");
    handler.mockReturnValue(true);
    menu()!.querySelector<HTMLElement>('[data-text-box-direction="vertical"]')!.click();
    await nextTick();
    expect(menu()).toBeNull();
  },
);
test.each(["owner", "handler", "session", "disabled", "reopen", "unmount"] as const)(
  "old menu callback is inert after %s",
  async (change) => {
    const { wrapper, handler } = fixture();
    await open(wrapper);
    const oldSelect = wrapper.findAllComponents(MenuItem)[0]!.vm.$.vnode.props!
      .onSelect as () => void;
    const replacement = vi.fn(() => true);
    if (change === "owner") await wrapper.setProps({ ownerId: "owner-2" });
    if (change === "handler") await wrapper.setProps({ handler: replacement });
    if (change === "session") await wrapper.setProps({ editSessionId: "edit-2" });
    if (change === "disabled") await wrapper.setProps({ disabled: true });
    if (change === "reopen") {
      await open(wrapper);
      await open(wrapper);
    }
    if (change === "unmount") wrapper.unmount();
    if (["owner", "handler", "session"].includes(change)) await open(wrapper);
    oldSelect();
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  },
);
test("shared keyboard menu navigation and Escape do not arm drawing", async () => {
  const { wrapper, handler } = fixture();
  await wrapper.get('[data-insert-tool="text-box"]').trigger("keydown", { key: "ArrowDown" });
  expect(document.activeElement?.getAttribute("data-text-box-direction")).toBe("horizontal");
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
  );
  await nextTick();
  expect(document.activeElement?.getAttribute("data-text-box-direction")).toBe("vertical");
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await nextTick();
  expect(menu()).toBeNull();
  expect(handler).not.toHaveBeenCalled();
  await wrapper.setProps({ disabled: true });
  await open(wrapper);
  expect(menu()).toBeNull();
});

test("repeated keyboard opening refreshes captured actions while the menu stays open", async () => {
  const { wrapper, handler } = fixture();
  const trigger = wrapper.get('[data-insert-tool="text-box"]');
  await trigger.trigger("keydown", { key: "ArrowDown" });
  await trigger.trigger("keydown", { key: "ArrowDown" });
  menu()!.querySelector<HTMLElement>('[data-text-box-direction="vertical"]')!.click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith(TEXT_BOX_CHOICES.vertical, false);
  expect(menu()).toBeNull();
});
