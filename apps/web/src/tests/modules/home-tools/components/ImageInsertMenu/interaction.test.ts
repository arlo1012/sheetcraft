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
    "exposes direct cell and floating placement actions with placement preview and limits (%s)",
    async (locale) => {
      const wrapper = mountMenu(false, locale);
      await wrapper.get('[data-ribbon-action="image"]').trigger("click");
      expect(menu().findAll('[role="menuitem"]')).toHaveLength(2);
      expect(menu().get('[data-image-insert-mode="cell"]').text()).toBe(
        locale === "en-US" ? "Image in cell" : "单元格内图片",
      );
      expect(menu().get('[data-image-insert-mode="floating"]').text()).toBe(
        locale === "en-US" ? "Floating image" : "浮动图片",
      );
      const hint = menu().get(".image-insert-menu__limits");
      expect(hint.text()).toContain("PNG");
      expect(hint.text()).toContain("10 MiB");
      expect(hint.text()).toContain("16,384");
      expect(hint.text()).toContain("33,554,432");
    },
  );

  test("updates placement preview on hover or focus without inserting", async () => {
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
    expect(menu().get(".image-insert-menu__hint").text()).toContain("inside cells");

    await menu().get('[data-image-insert-mode="floating"]').trigger("pointerenter");
    expect(menu().get(".image-insert-menu__hint").text()).toContain("float above cells");
    expect(wrapper.emitted("insertImage")).toBeUndefined();

    await menu().get('[data-image-insert-mode="cell"]').trigger("focus");
    expect(menu().get(".image-insert-menu__hint").text()).toContain("inside cells");
    expect(wrapper.emitted("insertImage")).toBeUndefined();
  });

  test.each(["cell", "floating"] as const)(
    "inserts immediately in one click when choosing %s placement",
    async (mode) => {
      const wrapper = mountMenu();
      const trigger = wrapper.get('[data-ribbon-action="image"]');
      await trigger.trigger("click");
      await menu().get(`[data-image-insert-mode="${mode}"]`).trigger("click");

      expect(wrapper.emitted("insertImage")).toEqual([[mode]]);
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(trigger.attributes("aria-expanded")).toBe("false");
    },
  );

  test("keeps the previewed mode after Escape without requesting insertion", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="image"]');
    await trigger.trigger("click");
    await menu().get('[data-image-insert-mode="floating"]').trigger("pointerenter");
    await menu().trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("insertImage")).toBeUndefined();
    await trigger.trigger("click");
    expect(menu().get(".image-insert-menu__hint").text()).toContain("float above cells");
  });

  test("cancels the open menu through its trigger without inserting", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="image"]');
    await trigger.trigger("click");
    await menu().get('[data-image-insert-mode="floating"]').trigger("pointerenter");
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
