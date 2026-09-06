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
  test("keeps the add button after the tabs and opens a tab menu without a dropdown trigger", async () => {
    const wrapper = mountSheetTabs();
    const viewport = wrapper.get(".workbook-sheet-tabs__viewport");
    const add = wrapper.get('[aria-label="Add sheet"]');
    expect(viewport.element.nextElementSibling).toBe(add.element);
    expect(wrapper.find(".workbook-sheet-tabs__menu-trigger").exists()).toBe(false);
    await add.trigger("click");
    expect(wrapper.emitted("add")).toEqual([[]]);
    const tab = wrapper.get('[role="tab"][aria-selected="true"]');
    await tab.trigger("keydown", { key: "ContextMenu" });
    expect(new DOMWrapper(document.body).get('[role="menu"]').attributes("aria-label")).toBe(
      "Actions for Sheet1",
    );
    wrapper.unmount();
  });

  test("opens a menu for the targeted sheet and deletes that sheet", async () => {
    const wrapper = mountSheetTabs();

    await wrapper
      .get('[role="tab"][title="Sheet2 (double-click to rename)"]')
      .trigger("contextmenu");

    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    expect(menu.attributes("aria-label")).toBe("Actions for Sheet2");
    expect(menu.element.tagName).toBe("UL");
    expect(menu.find("button").exists()).toBe(false);
    expect(menu.findAll('[role="menuitem"]').map((item) => item.text())).toEqual([
      "Create a copy",
      "Rename",
      "Protect this sheet",
      "Tab color",
      "Pin",
      "Move left",
      "Move right",
      "Hide",
      "Delete",
    ]);
    expect(menu.findAll('[role="menuitem"]').every((item) => item.element.tagName === "LI")).toBe(
      true,
    );
    await menu.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(menu.findAll('[role="menuitem"]')[1]?.element);

    await menu.get('[data-sheet-tab-action="delete"]').trigger("click");

    expect(wrapper.emitted("delete")).toEqual([["sheet-2"]]);
    wrapper.unmount();
  });

  test("keeps the last sheet deletion disabled and restores trigger focus on Escape", async () => {
    const wrapper = mountSheetTabs(1);
    const trigger = wrapper.get('[role="tab"][title="Sheet1 (double-click to rename)"]');

    await trigger.trigger("keydown", { key: "F10", shiftKey: true });
    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    const deleteAction = menu.get('[data-sheet-tab-action="delete"]');
    expect(menu.get('[data-sheet-tab-action="move-left"]').attributes("aria-disabled")).toBe(
      "true",
    );
    expect(menu.get('[data-sheet-tab-action="move-right"]').attributes("aria-disabled")).toBe(
      "true",
    );
    expect(deleteAction?.attributes("aria-disabled")).toBe("true");
    expect(deleteAction?.attributes("tabindex")).toBe("-1");
    await deleteAction?.trigger("click");
    expect(wrapper.emitted("delete")).toBeUndefined();

    await menu.trigger("keydown", { key: "Escape" });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  test("emits duplicate and menu moves without changing the active tab", async () => {
    const wrapper = mountSheetTabs(3);
    const firstTab = wrapper.get('[title="Sheet1 (double-click to rename)"]');

    await wrapper
      .get('[role="tab"][title="Sheet1 (double-click to rename)"]')
      .trigger("contextmenu");
    let menu = new DOMWrapper(document.body).get('[role="menu"]');
    expect(menu.get('[data-sheet-tab-action="move-left"]').attributes("aria-disabled")).toBe(
      "true",
    );
    await menu.get('[data-sheet-tab-action="duplicate"]').trigger("click");
    expect(wrapper.emitted("duplicate")).toEqual([["sheet-1"]]);

    await wrapper
      .get('[role="tab"][title="Sheet1 (double-click to rename)"]')
      .trigger("contextmenu");
    menu = new DOMWrapper(document.body).get('[role="menu"]');
    await menu.get('[data-sheet-tab-action="move-right"]').trigger("click");
    expect(wrapper.emitted("move")).toEqual([[{ sheetId: "sheet-1", toIndex: 1 }]]);
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(document.activeElement).toBe(firstTab.element);
    wrapper.unmount();
  });

  test("closes a stale sheet menu when another sheet is selected", async () => {
    const wrapper = mountSheetTabs();

    await wrapper
      .get('[role="tab"][title="Sheet1 (double-click to rename)"]')
      .trigger("contextmenu");
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

  test("moves tabs with Alt+Shift arrows without selecting another sheet", async () => {
    const wrapper = mountSheetTabs(3);
    const secondTab = wrapper.get('[title="Sheet2 (double-click to rename)"]');
    (secondTab.element as HTMLElement).focus();

    await secondTab.trigger("keydown", { key: "ArrowLeft", altKey: true, shiftKey: true });

    expect(wrapper.emitted("move")).toEqual([[{ sheetId: "sheet-2", toIndex: 0 }]]);
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(secondTab.attributes("aria-keyshortcuts")).toBe(
      "Shift+F10 Alt+Shift+ArrowLeft Alt+Shift+ArrowRight",
    );
    expect(document.activeElement).toBe(secondTab.element);

    await secondTab.trigger("keydown", { key: "ArrowRight", altKey: true, shiftKey: true });
    expect(wrapper.emitted("move")).toEqual([
      [{ sheetId: "sheet-2", toIndex: 0 }],
      [{ sheetId: "sheet-2", toIndex: 2 }],
    ]);
    wrapper.unmount();
  });

  test("emits final-index drag moves with insertion indicators and ignores self drops", async () => {
    const wrapper = mountSheetTabs(3);
    const tabs = wrapper.findAll('[role="tab"]');
    const source = tabs[0]!;
    const target = tabs[2]!;
    const targetItem = new DOMWrapper(target.element.parentElement!);
    (source.element as HTMLElement).focus();

    await source.trigger("dragstart");
    await targetItem.trigger("dragover", { clientX: -1 });
    expect(targetItem.classes()).toContain("is-drop-before");
    await targetItem.trigger("drop", { clientX: -1 });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("move")).toEqual([[{ sheetId: "sheet-1", toIndex: 1 }]]);
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(document.activeElement).toBe(source.element);

    await source.trigger("dragstart");
    await targetItem.trigger("dragover", { clientX: 1 });
    expect(targetItem.classes()).toContain("is-drop-after");
    await targetItem.trigger("drop", { clientX: 1 });

    expect(wrapper.emitted("move")).toEqual([
      [{ sheetId: "sheet-1", toIndex: 1 }],
      [{ sheetId: "sheet-1", toIndex: 2 }],
    ]);

    await source.trigger("dragstart");
    const sourceItem = new DOMWrapper(source.element.parentElement!);
    await sourceItem.trigger("drop", { clientX: -1 });
    expect(wrapper.emitted("move")).toHaveLength(2);
    wrapper.unmount();
  });
});
