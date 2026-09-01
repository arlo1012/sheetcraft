import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import CellBorderMenu from "../../../../../modules/home-tools/components/CellBorderMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{
  host: HTMLElement;
  wrapper: { unmount(): void };
}> = [];

function mountMenu(locale: "en-US" | "zh-CN" = "en-US", disabled = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(CellBorderMenu, {
    attachTo: host,
    global: { plugins: [createAppI18n(locale)] },
    props: { disabled },
  });
  mountedWrappers.push({ host, wrapper });
  return wrapper;
}

function getMenu() {
  return new DOMWrapper(document.body).get("[data-cell-border-panel]");
}

function getSubmenu(kind: "color" | "style" | "settings") {
  return new DOMWrapper(document.body).get(`[data-border-submenu="${kind}"]`);
}

afterEach(() => {
  for (const { host, wrapper } of mountedWrappers.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
});

describe("CellBorderMenu interaction", () => {
  test("opens a compact icon matrix and applies its default border", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get<HTMLButtonElement>("[data-cell-border-trigger]");
    expect(trigger.attributes()).toMatchObject({
      "aria-label": "Cell borders",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
    });
    await trigger.trigger("keydown", { key: "ArrowDown" });

    const menu = getMenu();
    expect(menu.attributes("role")).toBe("menu");
    expect(menu.findAll("[data-border-preset]")).toHaveLength(10);
    expect(menu.findAll("[data-border-preset-icon]")).toHaveLength(10);
    expect(
      menu.findAll("[data-border-preset-icon]").every((icon) => icon.attributes("aria-hidden")),
    ).toBe(true);
    expect(
      menu
        .findAll("[data-border-preset-icon]")
        .map((icon) => icon.attributes("data-border-preset-icon")),
    ).toEqual([
      "none",
      "all",
      "outer",
      "inner",
      "top",
      "innerHorizontal",
      "innerVertical",
      "left",
      "bottom",
      "right",
    ]);
    expect(
      menu
        .get('[data-border-preset-icon="innerHorizontal"]')
        .find(".cell-border-preset-icon__line.is-top")
        .exists(),
    ).toBe(false);
    expect(
      menu
        .get('[data-border-preset-icon="innerVertical"]')
        .find(".cell-border-preset-icon__line.is-left")
        .exists(),
    ).toBe(false);
    expect(menu.findAll("[data-border-menu-row]").map((item) => item.text())).toEqual([
      "Border color",
      "Border style",
      "More settings",
    ]);
    expect(document.activeElement).toBe(menu.get('[data-border-preset="none"]').element);
    await menu.trigger("keydown", { key: "ArrowDown" });
    const all = menu.get('[data-border-preset="all"]');
    expect(document.activeElement).toBe(all.element);
    await all.trigger("click");

    expect(wrapper.emitted("applyBorders")).toEqual([
      [{ preset: "all", border: { style: "thin", color: "#20242c" } }],
    ]);
    expect(document.body.querySelector("[data-cell-border-panel]")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("opens localized color and style submenus with real line samples", async () => {
    const wrapper = mountMenu("zh-CN");
    const trigger = wrapper.get<HTMLButtonElement>("[data-cell-border-trigger]");
    await trigger.trigger("click");
    const menu = getMenu();
    expect(menu.findAll("[data-border-menu-row]").map((item) => item.text())).toEqual([
      "边框颜色",
      "边框样式",
      "更多设置",
    ]);

    const styleRow = menu.get('[data-border-menu-row="style"]');
    await styleRow.trigger("click");
    const style = getSubmenu("style");
    expect(style.findAll('[role="menuitemradio"]')).toHaveLength(5);
    expect(style.get('[data-border-line-option="thin"]').attributes("aria-checked")).toBe("true");
    expect(style.findAll(".cell-border-menu__line-sample")).toHaveLength(5);
    await style.get('[data-border-line-option="double"]').trigger("click");
    expect(document.body.querySelector('[data-border-submenu="style"]')).toBeNull();
    expect(document.activeElement).toBe(styleRow.element);

    await menu.get('[data-border-menu-row="color"]').trigger("click");
    const color = getSubmenu("color");
    expect(color.attributes("role")).toBe("dialog");
    expect(color.findAll("[data-border-color]")).toHaveLength(8);
    expect(color.get('[data-border-color="#20242c"]').attributes("aria-checked")).toBe("true");
    await color.get('[data-border-color="#3b82f6"]').trigger("click");
    expect(color.get('[data-border-color="#3b82f6"]').attributes("aria-checked")).toBe("true");
    await menu.get('[data-border-preset="outer"]').trigger("click");
    expect(wrapper.emitted("applyBorders")?.[0]).toEqual([
      { preset: "outer", border: { style: "double", color: "#3b82f6" } },
    ]);
  });

  test("keeps more settings functional and closes its submenu before the parent", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get<HTMLButtonElement>("[data-cell-border-trigger]");
    await trigger.trigger("click");
    const menu = getMenu();
    const settingsRow = menu.get('[data-border-menu-row="settings"]');
    await settingsRow.trigger("click");
    const settings = getSubmenu("settings");
    await settings.get('[data-border-settings-style="dashed"]').trigger("click");
    const color = settings.get<HTMLInputElement>("[data-border-settings-color]");
    color.element.value = "#ef4444";
    await color.trigger("input");
    await settings.trigger("keydown", { key: "Escape" });
    expect(document.body.querySelector('[data-border-submenu="settings"]')).toBeNull();
    expect(document.body.querySelector("[data-cell-border-panel]")).not.toBeNull();
    expect(document.activeElement).toBe(settingsRow.element);
    await menu.get('[data-border-preset="bottom"]').trigger("click");
    expect(wrapper.emitted("applyBorders")).toEqual([
      [{ preset: "bottom", border: { style: "dashed", color: "#ef4444" } }],
    ]);
    expect(document.activeElement).toBe(trigger.element);
  });

  test("emits no border without a payload and remains closed when disabled", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get<HTMLButtonElement>("[data-cell-border-trigger]");
    await trigger.trigger("click");
    await getMenu().get('[data-border-preset="none"]').trigger("click");
    expect(wrapper.emitted("applyBorders")).toEqual([[{ preset: "none" }]]);
    await wrapper.setProps({ disabled: true });
    expect(trigger.element.disabled).toBe(true);
    await trigger.trigger("click");
    expect(document.body.querySelector("[data-cell-border-panel]")).toBeNull();
  });

  test("forwards workbook history shortcuts from teleported menus", async () => {
    const wrapper = mountMenu();
    await wrapper.get<HTMLButtonElement>("[data-cell-border-trigger]").trigger("click");
    const menu = getMenu();
    await menu.trigger("keydown", { key: "z", ctrlKey: true });
    await menu.get('[data-border-menu-row="style"]').trigger("click");
    await getSubmenu("style").trigger("keydown", { key: "y", metaKey: true });

    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(1);
  });

  test("stacks the submenu below the parent menu on narrow viewports", async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const wrapper = mountMenu();
    await wrapper.get<HTMLButtonElement>("[data-cell-border-trigger]").trigger("click");
    await getMenu().get('[data-border-menu-row="settings"]').trigger("click");

    expect(getSubmenu("settings").attributes("data-border-submenu-layout")).toBe("stacked");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousWidth,
    });
  });
});
