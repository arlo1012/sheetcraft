import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import WorkbookSheetNavigator from "../../../../../modules/workbook/components/WorkbookSheetNavigator.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountNavigator(locale: "en-US" | "zh-CN" = "en-US") {
  const wrapper = mount(WorkbookSheetNavigator, {
    attachTo: document.body,
    global: { plugins: [createAppI18n(locale)] },
    props: {
      sheets: [
        createSheet("Overview", "sheet-overview"),
        createSheet("Budget 2026", "sheet-budget"),
        createSheet("Archive", "sheet-archive"),
      ],
      activeSheetId: "sheet-budget",
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get(".workbook-sheet-navigator__menu");
}

describe("WorkbookSheetNavigator", () => {
  test("localizes its trigger and search field", async () => {
    const wrapper = mountNavigator("zh-CN");
    const trigger = wrapper.get('[data-workbook-sheet-navigator="trigger"]');

    expect(trigger.attributes("aria-label")).toBe("全部工作表");
    await trigger.trigger("click");
    expect(menu().text()).not.toContain("全部工作表");
    expect(
      menu().get('[data-workbook-sheet-navigator="search"] input').attributes("placeholder"),
    ).toBe("搜索工作表");
  });

  test("opens an upward sheet list with search and a selected radio", async () => {
    const wrapper = mountNavigator();
    const trigger = wrapper.get('[data-workbook-sheet-navigator="trigger"]');

    await trigger.trigger("click");
    expect(wrapper.emitted("open")).toEqual([[]]);
    expect(menu().text()).not.toContain("All sheets");
    expect(
      menu().get('[data-workbook-sheet-navigator="search"] input').attributes("placeholder"),
    ).toBe("Search sheets");
    const active = menu().get('[data-workbook-sheet-id="sheet-budget"]');
    expect(active.attributes()).toMatchObject({
      role: "menuitemradio",
      "aria-checked": "true",
      title: "Budget 2026",
    });
    expect((active.get('input[type="radio"]').element as HTMLInputElement).checked).toBe(true);
    expect(menu().attributes("style")).toContain("position: fixed");

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await nextTick();
    await trigger.trigger("keydown", { key: "ArrowUp" });
    await nextTick();
    expect(document.activeElement).toBe(
      menu().get('[data-workbook-sheet-id="sheet-archive"]').element,
    );
  });

  test("filters the list and moves from search into the result menu with ArrowDown", async () => {
    const wrapper = mountNavigator();
    await wrapper.get('[data-workbook-sheet-navigator="trigger"]').trigger("click");
    const search = menu().get<HTMLInputElement>('[data-workbook-sheet-navigator="search"] input');

    await search.setValue("budget");
    expect(menu().findAll('[role="menuitemradio"]')).toHaveLength(1);
    expect(menu().get('[role="menuitemradio"]').text()).toBe("Budget 2026");
    await search.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(menu().get('[role="menuitemradio"]').element);

    await menu().get('[role="menuitemradio"]').trigger("keydown", { key: "Enter" });
    await nextTick();
    expect(wrapper.emitted("select")).toEqual([["sheet-budget"]]);
    expect(document.body.querySelector(".workbook-sheet-navigator__menu")).toBeNull();
    expect(document.activeElement).toBe(
      wrapper.get('[data-workbook-sheet-navigator="trigger"]').element,
    );
  });

  test("shows an empty result and restores trigger focus after Escape or outside dismissal", async () => {
    const wrapper = mountNavigator();
    const trigger = wrapper.get('[data-workbook-sheet-navigator="trigger"]');

    await trigger.trigger("click");
    await menu().get('[data-workbook-sheet-navigator="search"] input').setValue("missing");
    expect(menu().text()).toContain("No matching sheets");
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await nextTick();
    expect(document.body.querySelector(".workbook-sheet-navigator__menu")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);

    await trigger.trigger("click");
    expect(menu().findAll('[role="menuitemradio"]')).toHaveLength(3);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector(".workbook-sheet-navigator__menu")).toBeNull();
  });
});
