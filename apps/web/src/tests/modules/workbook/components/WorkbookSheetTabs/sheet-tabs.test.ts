import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import WorkbookSheetTabs from "../../../../../modules/workbook/components/WorkbookSheetTabs.vue";
import { createSheet } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../../shared/i18n";

function mountSheetTabs(sheetCount = 2) {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    createSheet(`Sheet${index + 1}`, `sheet-${index + 1}`),
  );

  return mount(WorkbookSheetTabs, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      sheets,
      activeSheetId: "sheet-1",
    },
  });
}

describe("WorkbookSheetTabs", () => {
  test("opens a menu for the targeted sheet and deletes that sheet", async () => {
    const wrapper = mountSheetTabs();

    await wrapper.get('[aria-label="Actions for Sheet2"]').trigger("contextmenu");

    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    expect(menu.attributes("aria-label")).toBe("Actions for Sheet2");
    expect(menu.element.tagName).toBe("UL");
    expect(menu.find("button").exists()).toBe(false);
    expect(menu.get('[role="menuitem"]').text()).toBe("Rename sheet");
    expect(menu.findAll('[role="menuitem"]')[1]?.text()).toBe("Delete sheet");
    expect(menu.findAll('[role="menuitem"]').every((item) => item.element.tagName === "LI")).toBe(
      true,
    );
    await menu.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(menu.findAll('[role="menuitem"]')[1]?.element);

    await menu.findAll('[role="menuitem"]')[1]?.trigger("click");

    expect(wrapper.emitted("delete")).toEqual([["sheet-2"]]);
    wrapper.unmount();
  });

  test("keeps the last sheet deletion disabled and restores trigger focus on Escape", async () => {
    const wrapper = mountSheetTabs(1);
    const trigger = wrapper.get('[aria-label="Actions for Sheet1"]');

    await trigger.trigger("click");
    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    const deleteAction = menu.findAll('[role="menuitem"]')[1];
    expect(deleteAction?.attributes("aria-disabled")).toBe("true");
    expect(deleteAction?.attributes("tabindex")).toBe("-1");
    await deleteAction?.trigger("click");
    expect(wrapper.emitted("delete")).toBeUndefined();

    await menu.trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  test("closes a stale sheet menu when another sheet is selected", async () => {
    const wrapper = mountSheetTabs();

    await wrapper.get('[aria-label="Actions for Sheet1"]').trigger("click");
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    await wrapper.get('[title="Sheet2 (double-click to rename)"]').trigger("click");

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(wrapper.emitted("select")).toEqual([["sheet-2"]]);
    wrapper.unmount();
  });

  test("preserves roving tab navigation and double-click rename", async () => {
    const wrapper = mountSheetTabs();
    const firstTab = wrapper.get('[role="tab"][aria-selected="true"]');

    await firstTab.trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("select")).toEqual([["sheet-2"]]);
    expect(document.activeElement).toBe(
      wrapper.get('[title="Sheet2 (double-click to rename)"]').element,
    );

    await firstTab.trigger("dblclick");
    const input = wrapper.get('input[aria-label="Rename Sheet1"]');
    await input.setValue("Renamed");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("rename")).toEqual([[{ sheetId: "sheet-1", name: "Renamed" }]]);
    wrapper.unmount();
  });
});
