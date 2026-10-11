import { DOMWrapper, mount } from "@vue/test-utils";
import type { Component } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import FilterValueMenu from "../../../../../modules/home-tools/components/FilterValueMenu.vue";
import MergeCellsMenu from "../../../../../modules/home-tools/components/MergeCellsMenu.vue";
import SortMenu from "../../../../../modules/home-tools/components/SortMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountMenu(
  component: Component,
  props: Record<string, unknown>,
  locale: "en-US" | "zh-CN" = "en-US",
) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(component, {
    attachTo: host,
    global: { plugins: [createAppI18n(locale)] },
    props: props as never,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("Home data tool menus", () => {
  test("keeps typed filter values distinct and discards a cancelled draft", async () => {
    const wrapper = mountMenu(FilterValueMenu, {
      disabled: false,
      active: true,
      options: [
        { key: { kind: "number", value: 1 }, label: "1" },
        { key: { kind: "string", value: "1" }, label: "1" },
        { key: { kind: "boolean", value: true }, label: "TRUE" },
        { key: { kind: "error", code: "DIV0" }, label: "#DIV/0!" },
        { key: { kind: "blank" }, label: "(Blanks)" },
      ],
      appliedKeys: [{ kind: "string", value: "1" }],
    });
    const trigger = wrapper.get('[data-ribbon-action="filter"]');
    expect(trigger.attributes("aria-pressed")).toBe("true");
    await trigger.trigger("click");

    const valueItems = menu().findAll('[role="menuitemcheckbox"]');
    expect(valueItems.map((item) => item.attributes("data-filter-value-kind"))).toEqual([
      "number",
      "string",
      "boolean",
      "error",
      "blank",
    ]);
    expect(valueItems.map((item) => item.attributes("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
      "false",
      "false",
    ]);

    await menu().get('[data-filter-action="clear-selection"]').trigger("click");
    await menu().get('[data-filter-action="cancel"]').trigger("click");
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(document.activeElement).toBe(trigger.element);

    (trigger.element as HTMLElement).focus();
    await trigger.trigger("keydown", { key: "ArrowDown" });
    expect(menu().get('[data-filter-action="clear-filter"]').element).toBe(document.activeElement);
    await menu().get('[data-filter-value-kind="number"]').trigger("keydown", { key: " " });
    await menu().get('[data-filter-action="apply"]').trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("apply")).toEqual([
      [
        [
          { kind: "string", value: "1" },
          { kind: "number", value: 1 },
        ],
      ],
    ]);
  });

  test("opens the filter menu from keyboard and restores focus on Escape in Chinese", async () => {
    const wrapper = mountMenu(
      FilterValueMenu,
      {
        disabled: false,
        active: false,
        options: [{ key: { kind: "blank" }, label: "(空白)" }],
        appliedKeys: [],
      },
      "zh-CN",
    );
    const trigger = wrapper.get('[data-ribbon-action="filter"]');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger("keydown", { key: "ArrowDown" });
    expect(menu().attributes("aria-label")).toBe("筛选值");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  test("applies an empty value set instead of silently retaining every value", async () => {
    const wrapper = mountMenu(FilterValueMenu, {
      disabled: false,
      active: true,
      options: [{ key: { kind: "string", value: "Open" }, label: "Open" }],
      appliedKeys: [{ kind: "string", value: "Open" }],
    });
    const trigger = wrapper.get('[data-ribbon-action="filter"]');
    await trigger.trigger("click");

    await menu().get('[data-filter-action="clear-selection"]').trigger("click");
    const apply = menu().get('[data-filter-action="apply"]');
    expect(apply.attributes("aria-disabled")).toBe("false");
    await apply.trigger("click");

    expect(wrapper.emitted("apply")).toEqual([[[]]]);
    expect(document.activeElement).toBe(trigger.element);
  });

  test("emits sort intents from real menu actions", async () => {
    const sort = mountMenu(SortMenu, { disabled: false });
    const sortTrigger = sort.get('[data-ribbon-action="sort"]');
    await sortTrigger.trigger("click");
    await menu().get('[data-sort-direction="descending"]').trigger("keydown", { key: "Enter" });
    expect(sort.emitted("sort")).toEqual([["descending"]]);
  });

  test("toggles merged selections from the main action and exposes every merge mode", async () => {
    const wrapper = mountMenu(MergeCellsMenu, {
      disabled: false,
      state: {
        canMerge: true,
        canUnmerge: false,
        availableModes: {
          all: true,
          center: true,
          "same-columns": true,
          "same-rows": true,
          content: true,
          across: true,
        },
      },
    });
    const control = wrapper.get('[data-ribbon-action="merge-cells"]');
    const main = control.get("[data-ribbon-split-main]");
    const menuTrigger = control.get("[data-ribbon-split-menu]");
    expect(main.attributes("aria-pressed")).toBe("false");
    await main.trigger("click");
    expect(wrapper.emitted("merge")).toEqual([["all"]]);
    await menuTrigger.trigger("click");
    expect(
      menu()
        .findAll("[data-merge-action]")
        .map((item) => item.attributes("data-merge-action")),
    ).toEqual(["center", "merge", "same", "content", "across", "unmerge"]);
    expect(menu().get('[data-merge-action="unmerge"]').attributes("aria-disabled")).toBe("true");
    expect(menu().get('[data-merge-action="across"]').attributes("aria-description")).toBe(
      "Merge the selected cells in each row into one larger cell.",
    );
    await menu().get('[data-merge-action="center"]').trigger("click");
    expect(wrapper.emitted("merge")).toEqual([["all"], ["center"]]);

    await menuTrigger.trigger("click");
    const same = menu().get('[data-merge-action="same"]');
    (same.element as HTMLElement).focus();
    await same.trigger("keydown", { key: "ArrowRight" });
    const sameMenu = new DOMWrapper(document.body).get('[data-merge-submenu="same"]');
    expect(same.attributes("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(sameMenu.get('[data-merge-action="same-columns"]').element);
    await sameMenu.trigger("keydown", { key: "ArrowLeft" });
    expect(document.body.querySelector('[data-merge-submenu="same"]')).toBeNull();
    expect(document.activeElement).toBe(same.element);

    await same.trigger("click");
    const reopenedSameMenu = new DOMWrapper(document.body).get('[data-merge-submenu="same"]');
    await reopenedSameMenu.trigger("keydown", { key: "Escape" });
    expect(document.body.querySelector('[data-merge-submenu="same"]')).toBeNull();
    expect(document.activeElement).toBe(same.element);

    await same.trigger("click");
    await new DOMWrapper(document.body)
      .get('[data-merge-submenu="same"] [data-merge-action="same-rows"]')
      .trigger("click");
    expect(wrapper.emitted("merge")).toEqual([["all"], ["center"], ["same-rows"]]);
    expect(menuTrigger.attributes("aria-expanded")).toBe("false");

    await wrapper.setProps({ state: { canMerge: false, canUnmerge: true } });
    expect(main.attributes("aria-pressed")).toBe("true");
    expect(main.attributes("aria-disabled")).toBe("false");
    expect(menuTrigger.attributes("aria-disabled")).toBe("false");
    await main.trigger("click");
    expect(wrapper.emitted("unmerge")).toEqual([[]]);
    expect(wrapper.emitted("merge")).toEqual([["all"], ["center"], ["same-rows"]]);
    await menuTrigger.trigger("keydown", { key: "ArrowDown" });
    await menu().get('[data-merge-action="unmerge"]').trigger("keydown", { key: " " });
    expect(wrapper.emitted("unmerge")).toEqual([[], []]);
  });
});
