// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import ImageInsertMenu from "../../../../../modules/home-tools/components/ImageInsertMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountMenu(disabled = false, locale: "en-US" | "zh-CN" = "en-US") {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(ImageInsertMenu, {
    attachTo: host,
    global: { plugins: [createAppI18n(locale)] },
    props: { disabled },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("ImageInsertMenu", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "exposes two placement choices, one local file action and current limits (%s)",
    async (locale) => {
      const wrapper = mountMenu(false, locale);
      await wrapper.get('[data-ribbon-action="image"]').trigger("click");
      expect(menu().findAll('[role="menuitemradio"]')).toHaveLength(2);
      expect(menu().findAll('[role="menuitem"]')).toHaveLength(1);
      expect(menu().get("[data-image-insert-local]").attributes("role")).toBe("menuitem");
      expect(menu().get("[data-image-insert-local]").text()).toBe(
        locale === "en-US" ? "Pictures from file…" : "本地图片…",
      );
      const hint = menu().get(".image-insert-menu__limits");
      expect(hint.text()).toContain("PNG");
      expect(hint.text()).toContain("10 MiB");
      expect(hint.text()).toContain("16,384");
      expect(hint.text()).toContain("33,554,432");
      expect(hint.attributes("role")).toBe("none");
    },
  );
  test("defaults to in-cell placement and waits for the local file action", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="image"]');

    expect(trigger.attributes()).toMatchObject({
      "aria-label": "Insert image",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "data-ribbon-layout": "tall",
      "data-ribbon-span": "2",
    });
    await trigger.trigger("click");
    expect(menu().attributes("aria-label")).toBe("Insert image");
    expect(menu().get('[data-image-insert-mode="cell"]').text()).toBe("Image in cell");
    expect(menu().get('[data-image-insert-mode="cell"]').attributes("aria-checked")).toBe("true");
    expect(menu().get('[data-image-insert-mode="floating"]').attributes("aria-checked")).toBe(
      "false",
    );
    expect(wrapper.emitted("insertImage")).toBeUndefined();
    await menu().get("[data-image-insert-local]").trigger("click");

    expect(wrapper.emitted("insertImage")).toEqual([["cell"]]);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  test.each(["cell", "floating"] as const)(
    "selects %s placement without inserting until the local file action is chosen",
    async (mode) => {
      const wrapper = mountMenu();
      const trigger = wrapper.get('[data-ribbon-action="image"]');
      await trigger.trigger("click");
      await menu().get(`[data-image-insert-mode="${mode}"]`).trigger("click");

      expect(menu().get(`[data-image-insert-mode="${mode}"]`).attributes("aria-checked")).toBe(
        "true",
      );
      expect(trigger.attributes("aria-expanded")).toBe("true");
      expect(wrapper.emitted("insertImage")).toBeUndefined();
      await menu().get("[data-image-insert-local]").trigger("click");

      expect(wrapper.emitted("insertImage")).toEqual([[mode]]);
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(trigger.attributes("aria-expanded")).toBe("false");
    },
  );

  test("keeps the selected mode after Escape without requesting insertion", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="image"]');
    await trigger.trigger("click");
    await menu().get('[data-image-insert-mode="floating"]').trigger("click");
    await menu().trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("insertImage")).toBeUndefined();
    await trigger.trigger("click");
    expect(menu().get('[data-image-insert-mode="floating"]').attributes("aria-checked")).toBe(
      "true",
    );
    expect(menu().get('[data-image-insert-mode="cell"]').attributes("aria-checked")).toBe("false");
    await menu().get("[data-image-insert-local]").trigger("click");
    expect(wrapper.emitted("insertImage")).toEqual([["floating"]]);
  });

  test("cancels the open menu through its trigger without inserting", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="image"]');
    await trigger.trigger("click");
    await menu().get('[data-image-insert-mode="floating"]').trigger("click");
    await trigger.trigger("click");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("insertImage")).toBeUndefined();
  });

  test("keeps the menu disclosure visible while image insertion is disabled", async () => {
    const wrapper = mountMenu(true, "zh-CN");
    const trigger = wrapper.get('[data-ribbon-action="image"]');

    expect(trigger.attributes("aria-label")).toBe("插入图片");
    expect(trigger.attributes("aria-disabled")).toBe("true");
    expect(trigger.find(".ribbon-menu-button__arrow").exists()).toBe(true);
    await trigger.trigger("click");
    await trigger.trigger("keydown", { key: "ArrowDown" });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("insertImage")).toBeUndefined();
  });
});
