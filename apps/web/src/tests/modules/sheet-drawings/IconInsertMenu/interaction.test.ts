// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import IconInsertMenu from "../../../../modules/sheet-drawings/components/IconInsertMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];
const favoritesKey = "sheetcraft.icon-favorites";
beforeEach(() => localStorage.removeItem(favoritesKey));
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  localStorage.removeItem(favoritesKey);
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
    { category: "arrows", id: "arrow-right" },
    { category: "letters", id: "letter-a" },
    { category: "buildings", id: "factory" },
  ] as const)(
    "inserts selected local icon $id and closes only after acceptance",
    async ({ category, id }) => {
      const { wrapper, handler } = fixture();
      const trigger = wrapper.get('[data-insert-tool="icon"]');
      await trigger.trigger("click");
      await menu().get(`[data-icon-category="${category}"]`).trigger("click");
      expect(menu().get(`[data-insert-icon="${id}"]`).find("svg").exists()).toBe(true);
      expect(handler).not.toHaveBeenCalled();

      await menu().get(`[data-insert-icon="${id}"]`).trigger("click");

      expect(handler).toHaveBeenCalledExactlyOnceWith(id);
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(trigger.attributes("aria-expanded")).toBe("false");
    },
  );

  test("filters icon categories without inserting a drawing", async () => {
    const { wrapper, handler } = fixture();
    await wrapper.get('[data-insert-tool="icon"]').trigger("click");
    await menu().get('[data-icon-category="letters"]').trigger("click");
    expect(menu().find('[data-insert-icon="letter-a"]').exists()).toBe(true);
    expect(menu().find('[data-insert-icon="letter-z"]').exists()).toBe(true);
    expect(menu().find('[data-insert-icon="arrow-right"]').exists()).toBe(false);
    await menu().get('[data-icon-category="buildings"]').trigger("click");
    expect(menu().find('[data-insert-icon="factory"]').exists()).toBe(true);
    expect(menu().find('[data-insert-icon="letter-a"]').exists()).toBe(false);
    expect(menu().find("[data-icon-more]").exists()).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  test("searches the local catalog and restores category results when the search is cleared", async () => {
    const { wrapper, handler } = fixture();
    await wrapper.get('[data-insert-tool="icon"]').trigger("click");
    await menu().get('[data-icon-category="all"]').trigger("click");
    const search = menu().get('input[aria-label="Search icons"]');
    await search.setValue("factory");
    expect(
      menu()
        .findAll("[data-insert-icon]")
        .map((entry) => entry.attributes("data-insert-icon")),
    ).toEqual(["factory"]);
    await search.setValue("unmatched-local-icon-query");
    expect(menu().findAll("[data-insert-icon]")).toHaveLength(0);
    expect(handler).not.toHaveBeenCalled();
    await search.setValue("");
    expect(menu().find('[data-insert-icon="arrow-right"]').exists()).toBe(true);
    expect(menu().find('[data-insert-icon="letter-a"]').exists()).toBe(true);
  });

  test("favorites persist on this device across reopening and can be removed without insertion", async () => {
    const first = fixture();
    await first.wrapper.get('[data-insert-tool="icon"]').trigger("click");
    await menu().get('[data-icon-category="buildings"]').trigger("click");
    await menu().get('[data-insert-icon="factory"]').trigger("focus");
    await menu().get('[data-icon-favorite="factory"]').trigger("click");
    expect(JSON.parse(localStorage.getItem(favoritesKey)!)).toContain("factory");
    expect(first.handler).not.toHaveBeenCalled();
    mountedWrappers.splice(mountedWrappers.indexOf(first.wrapper), 1);
    first.wrapper.unmount();

    const second = fixture();
    await second.wrapper.get('[data-insert-tool="icon"]').trigger("click");
    await menu().get('[data-icon-category="favorites"]').trigger("click");
    expect(
      menu()
        .findAll("[data-insert-icon]")
        .map((entry) => entry.attributes("data-insert-icon")),
    ).toEqual(["factory"]);
    await menu().get('[data-insert-icon="factory"]').trigger("focus");
    await menu().get('[data-icon-favorite="factory"]').trigger("click");
    expect(JSON.parse(localStorage.getItem(favoritesKey)!)).not.toContain("factory");
    expect(menu().findAll("[data-insert-icon]")).toHaveLength(0);
    expect(second.handler).not.toHaveBeenCalled();
  });

  test("keeps a rejected selection open with an inline error and allows retry", async () => {
    const { wrapper, handler } = fixture(false, false);
    const trigger = wrapper.get('[data-insert-tool="icon"]');
    await trigger.trigger("click");
    await menu().get('[data-icon-category="arrows"]').trigger("click");
    await menu().get('[data-insert-icon="arrow-right"]').trigger("click");

    expect(handler).toHaveBeenCalledExactlyOnceWith("arrow-right");
    expect(menu().get('[role="alert"]').text()).toBe(
      "Could not apply this change. Your draft is preserved.",
    );
    expect(trigger.attributes("aria-expanded")).toBe("true");

    handler.mockReturnValue(true);
    await menu().get('[data-insert-icon="arrow-left"]').trigger("click");
    expect(handler).toHaveBeenLastCalledWith("arrow-left");
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
    await menu().get('[data-icon-category="arrows"]').trigger("click");
    const oldChoice = menu().get('[data-insert-icon="arrow-right"]');
    await wrapper.setProps({ ownerId: "sheet-2" });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    await oldChoice.trigger("click");
    expect(handler).not.toHaveBeenCalled();
  });
});
