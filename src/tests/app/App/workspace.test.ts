import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import App from "../../../app/App.vue";
import { createAppI18n, type AppLocale } from "../../../shared/i18n";

function mountApp(locale: AppLocale = "en-US") {
  return mount(App, {
    global: {
      plugins: [createAppI18n(locale)],
    },
  });
}

describe("App", () => {
  test("mounts the spreadsheet workspace", () => {
    const wrapper = mountApp();

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 workspace");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet1");
    expect(wrapper.get('[role="grid"]').attributes("aria-rowcount")).toBe("1000");
    expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("100");
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("A1");
  });

  test("creates, renames, and deletes sheets from the sheet tabs", async () => {
    const wrapper = mountApp();

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
    const wrapper = mountApp();
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
    const wrapper = mountApp();
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

  test("navigates to an A1 address and finds sparse sheet values", async () => {
    const wrapper = mountApp();
    const addressInput = wrapper.get('[aria-label="Cell address"]');

    await addressInput.setValue("D20");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("D20");

    const editor = wrapper.get("input.cell-editor");
    await editor.trigger("keydown", { key: "n" });
    await editor.setValue("needle");
    await editor.trigger("keydown", { key: "Enter" });
    await addressInput.setValue("A1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    await wrapper.get('[aria-label="Find in sheet"]').setValue("needle");
    await wrapper.get('[aria-label="Find next"]').trigger("click");

    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("D20");
    expect(wrapper.text()).toContain("Found D20");
  });

  test("reports invalid addresses and missing search results without moving", async () => {
    const wrapper = mountApp();

    await wrapper.get('[aria-label="Cell address"]').setValue("XFE1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("A1");
    expect(wrapper.text()).toContain("Invalid address");

    await wrapper.get('[aria-label="Find in sheet"]').setValue("missing");
    await wrapper.get('[aria-label="Find next"]').trigger("click");
    expect(wrapper.text()).toContain("No matches");
  });

  test("defers address navigation until IME composition commits to its source cell", async () => {
    const wrapper = mountApp();
    const editor = wrapper.get("input.cell-editor");
    await editor.trigger("compositionstart");
    await editor.setValue("中文");

    await wrapper.get('[aria-label="Cell address"]').setValue("C3");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("A1");

    await editor.trigger("compositionend", { data: "中文" });
    expect(wrapper.get("[data-active-cell]").attributes("data-active-cell")).toBe("C3");

    await wrapper.get('[aria-label="Cell address"]').setValue("A1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(wrapper.get('[data-row="0"][data-column="0"]').text()).toContain("中文");
  });

  test("reports localized sheet-name validation without mutating the workbook", async () => {
    const wrapper = mountApp();
    await wrapper.get('[aria-label="Add sheet"]').trigger("click");

    await wrapper.get('[title="Sheet2 (double-click to rename)"]').trigger("dblclick");
    const renameInput = wrapper.get('[aria-label="Rename Sheet2"]');
    await renameInput.setValue(" ");
    await renameInput.trigger("keydown", { key: "Enter" });
    expect(wrapper.text()).toContain("Sheet name cannot be empty");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet2");

    await wrapper.get('[title="Sheet2 (double-click to rename)"]').trigger("dblclick");
    await wrapper.get('[aria-label="Rename Sheet2"]').setValue("Sheet1");
    await wrapper.get('[aria-label="Rename Sheet2"]').trigger("keydown", { key: "Enter" });
    expect(wrapper.text()).toContain("A sheet named Sheet1 already exists");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet2");
  });

  test("switches visible, status, and assistive text between English and Chinese", async () => {
    const wrapper = mountApp();

    await wrapper.get('[aria-label="Cell address"]').setValue("XFE1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(wrapper.text()).toContain("Invalid address");

    await wrapper.get('select[aria-label="Language"]').setValue("zh-CN");

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 工作区");
    expect(wrapper.get("section.sheet-grid").attributes("aria-label")).toBe("Sheet1 工作表");
    expect(wrapper.get('select[aria-label="语言"]').element).toBeInstanceOf(HTMLSelectElement);
    expect(wrapper.get(".home-format-toolbar").attributes("aria-label")).toBe("单元格格式");
    expect(wrapper.text()).toContain("单元格地址无效");
    expect(wrapper.text()).toContain("就绪");

    await wrapper.get('[data-select-row="2"]').trigger("contextmenu", {
      clientX: 16,
      clientY: 72,
    });
    expect(wrapper.get('[role="dialog"]').attributes("aria-label")).toBe("行操作");
    expect(wrapper.get('[role="dialog"]').text()).toContain("向下插入 1 行");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem("idea10.locale")).toBe("zh-CN");
  });

  test("formats the current selection as one reversible workbook action", async () => {
    const wrapper = mountApp();
    await wrapper.get('[data-row="0"][data-column="1"]').trigger("mousedown", {
      button: 0,
      shiftKey: true,
    });

    await wrapper.get('[aria-label="Bold"]').trigger("click");
    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("true");
    expect(
      (wrapper.get('[data-row="0"][data-column="0"]').element as HTMLElement).style.fontWeight,
    ).toBe("700");
    expect(
      (wrapper.get('[data-row="0"][data-column="1"]').element as HTMLElement).style.fontWeight,
    ).toBe("700");

    await wrapper.get('[aria-label="Bold"]').trigger("keydown", { key: "z", ctrlKey: true });
    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("false");
    expect(
      (wrapper.get('[data-row="0"][data-column="0"]').element as HTMLElement).style.fontWeight,
    ).toBe("");
    expect(
      (wrapper.get('[data-row="0"][data-column="1"]').element as HTMLElement).style.fontWeight,
    ).toBe("");
  });

  test("disables formatting when a whole-column selection exceeds the command limit", async () => {
    const wrapper = mountApp();
    await wrapper.get('[data-select-column="0"]').trigger("mousedown", { button: 0 });

    const toolbar = wrapper.get(".home-format-toolbar");
    expect(toolbar.attributes("aria-disabled")).toBe("true");
    expect(toolbar.attributes("title")).toBe(
      "This selection is too large to format in one action.",
    );
    expect((wrapper.get('[aria-label="Bold"]').element as HTMLButtonElement).disabled).toBe(true);
  });
});
