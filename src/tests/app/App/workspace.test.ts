import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import App from "../../../app/App.vue";

describe("App", () => {
  test("mounts the spreadsheet workspace", () => {
    const wrapper = mount(App);

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 workspace");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet1");
    expect(wrapper.get('[role="grid"]').attributes("aria-rowcount")).toBe("1000");
    expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("100");
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("A1");
  });

  test("creates, renames, and deletes sheets from the sheet tabs", async () => {
    const wrapper = mount(App);

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2);
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet2");

    const sheetTab = wrapper.get('[title="Sheet2 (double-click to rename)"]');
    await sheetTab.trigger("dblclick");
    const renameInput = wrapper.get('[aria-label="Rename Sheet2"]');
    await renameInput.setValue("Budget");
    await renameInput.trigger("keydown", { key: "Enter" });
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Budget");

    await wrapper.get('[aria-label="Delete active sheet"]').trigger("click");
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(1);
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet1");
  });

  test("switches sheet tabs with the standard arrow and boundary keys", async () => {
    const wrapper = mount(App);
    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    await wrapper.get('[aria-label="Add sheet"]').trigger("click");

    await wrapper.get('[role="tab"][aria-selected="true"]').trigger("keydown", { key: "Home" });
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("Sheet1");

    await wrapper.get('[role="tab"][aria-selected="true"]').trigger("keydown", {
      key: "ArrowLeft",
    });
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("Sheet3");

    await wrapper.get('[role="tab"][aria-selected="true"]').trigger("keydown", { key: "End" });
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("Sheet3");
  });

  test("restores each sheet's selection and scroll position after switching tabs", async () => {
    const wrapper = mount(App);
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 120;
    (scroller.element as HTMLDivElement).scrollLeft = 192;
    await scroller.trigger("scroll");
    await wrapper.get('[data-row="6"][data-column="2"]').trigger("mousedown", { button: 0 });

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    await wrapper.get('[title="Sheet1 (double-click to rename)"]').trigger("click");

    const restoredScroller = wrapper.get(".sheet-grid__scroller").element as HTMLDivElement;
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("C7");
    expect(restoredScroller.scrollTop).toBe(120);
    expect(restoredScroller.scrollLeft).toBe(192);
  });
});
