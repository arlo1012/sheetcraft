import { DOMWrapper, mount } from "@vue/test-utils";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { afterEach, describe, expect, test, vi } from "vitest";
import App from "../../../app/App.vue";
import LocaleSwitcher from "../../../app/LocaleSwitcher.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetSurface from "../../../modules/sheet-grid/components/SheetSurface.vue";
import { getCellStyle } from "@idea10/core/workbook";
import { createAppI18n, type AppLocale } from "../../../shared/i18n";
import { triggerCanvasCell, triggerCanvasCorner, triggerCanvasHeader } from "../canvas-interaction";

function mountApp(locale: AppLocale = "en-US") {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(App, {
    attachTo: host,
    global: {
      plugins: [createAppI18n(locale)],
    },
  });
  mountedWrappers.push(wrapper);
  mountedHosts.push(host);
  return wrapper;
}

function activeCellAddress(wrapper: ReturnType<typeof mountApp>): string | undefined {
  return wrapper.get("textarea.cell-editor").attributes("data-cell-editor");
}

function getAddressInput(wrapper: ReturnType<typeof mountApp>) {
  return wrapper.get<HTMLInputElement>("[data-address-input]");
}

function getFormulaInput(wrapper: ReturnType<typeof mountApp>) {
  return wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
}

function getSearchInput(wrapper: ReturnType<typeof mountApp>) {
  return wrapper.get<HTMLInputElement>("[data-search-input]");
}

const mountedWrappers: Array<{ unmount(): void }> = [];
const mountedHosts: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) {
    wrapper.unmount();
  }
  for (const host of mountedHosts.splice(0)) {
    host.remove();
  }
  vi.useRealTimers();
});

describe("App", () => {
  test("mounts the spreadsheet workspace", () => {
    const wrapper = mountApp();

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 workspace");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet1 worksheet");
    expect(wrapper.get('[role="grid"]').attributes("aria-rowcount")).toBe("100");
    expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("26");
    expect(activeCellAddress(wrapper)).toBe("A1");
    expect(wrapper.get(".spreadsheet-ribbon").attributes("aria-label")).toBe("Workbook tools");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("Home");
    expect(wrapper.get(".workbook-status-bar").attributes("aria-label")).toBe("Workbook status");
    expect(wrapper.find(".workbook-status-bar__status").exists()).toBe(false);
    expect(wrapper.find("[data-selection-summary]").exists()).toBe(false);
  });

  test("creates, renames, and deletes sheets from the sheet tabs", async () => {
    const wrapper = mountApp();

    await wrapper
      .get('[role="tab"][title="Sheet1 (double-click to rename)"]')
      .trigger("contextmenu");
    let sheetMenu = new DOMWrapper(document.body).get('[role="menu"]');
    expect(sheetMenu.get('[data-sheet-tab-action="delete"]').attributes("aria-disabled")).toBe(
      "true",
    );
    await sheetMenu.trigger("keydown", { key: "Escape" });

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(2);
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet2 worksheet");

    const sheetTab = wrapper.get('[title="Sheet2 (double-click to rename)"]');
    await sheetTab.trigger("dblclick");
    const renameInput = wrapper.get('[aria-label="Rename Sheet2"]');
    await renameInput.setValue("Budget");
    await renameInput.trigger("keydown", { key: "Enter" });
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Budget worksheet");

    await wrapper
      .get('[role="tab"][title="Budget (double-click to rename)"]')
      .trigger("contextmenu");
    sheetMenu = new DOMWrapper(document.body).get('[role="menu"]');
    await sheetMenu.get('[data-sheet-tab-action="delete"]').trigger("click");
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(1);
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet1 worksheet");
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
    await triggerCanvasCell(wrapper, { row: 6, column: 2 }, "mousedown", { button: 0 });

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    await wrapper.get('[title="Sheet1 (double-click to rename)"]').trigger("click");

    const restoredScroller = wrapper.get(".sheet-grid__scroller").element as HTMLDivElement;
    expect(activeCellAddress(wrapper)).toBe("C7");
    expect(restoredScroller.scrollTop).toBe(120);
    expect(restoredScroller.scrollLeft).toBe(192);
  });

  test("navigates to an A1 address and edits the active cell from the formula bar", async () => {
    const wrapper = mountApp();
    const addressInput = getAddressInput(wrapper);

    await addressInput.setValue("D20");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(activeCellAddress(wrapper)).toBe("D20");

    const formulaInput = getFormulaInput(wrapper);
    await formulaInput.trigger("focus");
    await formulaInput.setValue("42");
    await formulaInput.trigger("keydown", { key: "Enter" });
    await formulaInput.trigger("blur");
    expect(wrapper.find("[data-sheet-canvas]").exists()).toBe(true);
    expect(activeCellAddress(wrapper)).toBe("D21");
    expect(document.activeElement).toBe(wrapper.get("textarea.cell-editor").element);

    await addressInput.setValue("A1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(getFormulaInput(wrapper).element.value).toBe("");

    await addressInput.setValue("D20");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");

    expect(activeCellAddress(wrapper)).toBe("D20");
    expect(getFormulaInput(wrapper).element.value).toBe("42");
  });

  test("finds sparse sheet values from the formula bar search", async () => {
    const wrapper = mountApp();

    await getFormulaInput(wrapper).trigger("focus");
    await getFormulaInput(wrapper).setValue("needle");
    await getFormulaInput(wrapper).trigger("keydown", { key: "Enter" });
    await getAddressInput(wrapper).setValue("A1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");

    await getSearchInput(wrapper).setValue("needle");
    await wrapper.get('[aria-label="Find next"]').trigger("click");

    expect(activeCellAddress(wrapper)).toBe("A1");
    expect(wrapper.find(".workbook-status-bar__status").exists()).toBe(false);
  });

  test("rejects invalid addresses without moving or showing an operation notice", async () => {
    const wrapper = mountApp();

    await getAddressInput(wrapper).setValue("XFE1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(activeCellAddress(wrapper)).toBe("A1");
    expect(wrapper.find(".workbook-status-bar__status").exists()).toBe(false);
  });

  test("defers address navigation until IME composition commits to its source cell", async () => {
    const wrapper = mountApp();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("compositionstart");
    await editor.setValue("中文");

    await getAddressInput(wrapper).setValue("C3");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(activeCellAddress(wrapper)).toBe("A1");

    await editor.trigger("compositionend", { data: "中文" });
    expect(activeCellAddress(wrapper)).toBe("C3");

    await getAddressInput(wrapper).setValue("A1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(getFormulaInput(wrapper).element.value).toBe("中文");
  });

  test("rejects invalid sheet names without mutating the workbook or showing operation notices", async () => {
    const wrapper = mountApp();
    await wrapper.get('[aria-label="Add sheet"]').trigger("click");

    await wrapper.get('[title="Sheet2 (double-click to rename)"]').trigger("dblclick");
    const renameInput = wrapper.get('[aria-label="Rename Sheet2"]');
    await renameInput.setValue(" ");
    await renameInput.trigger("keydown", { key: "Enter" });
    expect(wrapper.text()).not.toContain("Sheet name cannot be empty");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet2 worksheet");

    await wrapper.get('[title="Sheet2 (double-click to rename)"]').trigger("dblclick");
    await wrapper.get('[aria-label="Rename Sheet2"]').setValue("Sheet1");
    await wrapper.get('[aria-label="Rename Sheet2"]').trigger("keydown", { key: "Enter" });
    expect(wrapper.text()).not.toContain("A sheet named Sheet1 already exists");
    expect(wrapper.get('[role="grid"]').attributes("aria-label")).toBe("Sheet2 worksheet");
  });

  test("switches visible and assistive labels between English and Chinese", async () => {
    const wrapper = mountApp();

    await getAddressInput(wrapper).setValue("XFE1");
    await wrapper.get('[aria-label="Go to cell"]').trigger("submit");
    expect(wrapper.text()).not.toContain("Invalid address");

    const localeSelect = wrapper.findComponent(LocaleSwitcher).findComponent(TSelect);
    localeSelect.vm.$emit("change", "zh-CN");
    await wrapper.vm.$nextTick();

    expect(wrapper.get("[data-app-root]").attributes("aria-label")).toBe("idea10 工作区");
    expect(wrapper.get("section.sheet-grid").attributes("aria-label")).toBe("Sheet1 工作表");
    expect(wrapper.get(".spreadsheet-ribbon").attributes("aria-label")).toBe("工作簿工具");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("开始");
    expect(wrapper.get(".workbook-status-bar").attributes("aria-label")).toBe("工作簿状态");
    expect(wrapper.get("[data-locale-select] input").element).toBeInstanceOf(HTMLInputElement);
    expect(wrapper.get(".home-format-toolbar").attributes("aria-label")).toBe("单元格格式");
    expect(wrapper.get("[data-formula-bar]").attributes("aria-label")).toBe("地址和公式栏");
    expect(wrapper.text()).not.toContain("单元格地址无效");
    expect(wrapper.text()).not.toContain("就绪");

    await triggerCanvasHeader(wrapper, "row", 2, "contextmenu", {
      clientX: 16,
      clientY: 72,
    });
    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    expect(menu.attributes("aria-label")).toBe("行操作");
    expect(menu.get('[data-axis-action="insert-after"]').attributes("aria-label")).toBe(
      "向下插入 1 行",
    );
    expect(menu.text()).toContain("在下方插入");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem("idea10.locale")).toBe("zh-CN");
  });

  test("summarizes the populated values in the current selection", async () => {
    const wrapper = mountApp();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "1" });
    await editor.setValue("10");
    await editor.trigger("keydown", { key: "Enter" });
    const nextEditor = wrapper.get("textarea.cell-editor");
    await nextEditor.trigger("keydown", { key: "2" });
    await nextEditor.setValue("20");
    await nextEditor.trigger("keydown", { key: "Enter" });

    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0 });
    await triggerCanvasCell(wrapper, { row: 1, column: 0 }, "mousedown", {
      button: 0,
      shiftKey: true,
    });

    const summary = wrapper.get("[data-selection-summary]").text();
    expect(summary).toContain("Average=15");
    expect(summary).toContain("Count=2");
    expect(summary).toContain("Sum=30");
  });

  test("summarizes whole rows, columns, and the full sheet", async () => {
    vi.useFakeTimers();
    const wrapper = mountApp();
    const enterValue = async (value: string): Promise<void> => {
      const editor = wrapper.get("textarea.cell-editor");
      await editor.trigger("keydown", { key: value[0] });
      await editor.setValue(value);
      await editor.trigger("keydown", { key: "Enter" });
    };

    await enterValue("10");
    await enterValue("99");
    await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0 });
    await enterValue("20");

    await triggerCanvasHeader(wrapper, "row", 0, "mousedown", { button: 0 });
    await vi.advanceTimersByTimeAsync(120);
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Average=15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Count=2");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Sum=30");

    await triggerCanvasHeader(wrapper, "column", 0, "mousedown", { button: 0 });
    await vi.advanceTimersByTimeAsync(120);
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Average=54.5");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Count=2");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Sum=109");

    await triggerCanvasCorner(wrapper, "mousedown", { button: 0 });
    await vi.advanceTimersByTimeAsync(120);
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Average=43");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Count=3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Sum=129");
  });

  test("formats and clears the current selection as reversible workbook actions", async () => {
    const wrapper = mountApp();
    const sheet = () => wrapper.getComponent(SheetGrid).props("sheet");
    await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      shiftKey: true,
    });

    await wrapper.get('[aria-label="Bold"]').trigger("click");
    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("true");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.bold).toBe(true);
    expect(getCellStyle(sheet(), { row: 0, column: 1 })?.bold).toBe(true);

    const clearFormatting = wrapper.get('[data-ribbon-action="clear-formatting"]');
    await clearFormatting.trigger("click");
    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("false");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.bold).toBeUndefined();
    expect(getCellStyle(sheet(), { row: 0, column: 1 })?.bold).toBeUndefined();

    await clearFormatting.trigger("keydown", { key: "z", ctrlKey: true });
    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("true");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.bold).toBe(true);
    expect(getCellStyle(sheet(), { row: 0, column: 1 })?.bold).toBe(true);

    await clearFormatting.trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(wrapper.get('[aria-label="Bold"]').attributes("aria-pressed")).toBe("false");
  });

  test("arms format painter and cancels it with Escape before a target is selected", async () => {
    const wrapper = mountApp();
    const formatPainter = wrapper.get('[data-ribbon-action="format-painter"]');

    await formatPainter.trigger("click");
    expect(formatPainter.attributes("aria-pressed")).toBe("true");

    await formatPainter.trigger("keydown", { key: "Escape" });
    expect(formatPainter.attributes("aria-pressed")).toBe("false");
  });

  test("applies, restores, and clears range borders through the ribbon", async () => {
    const wrapper = mountApp();
    await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      shiftKey: true,
    });

    const borderTrigger = wrapper.get("[data-cell-border-control] [data-ribbon-split-menu]");
    await borderTrigger.trigger("click");
    await new DOMWrapper(document.body).get('[data-border-preset="outer"]').trigger("click");

    const sheet = () => wrapper.getComponent(SheetGrid).props("sheet");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.borderTop).toMatchObject({
      style: "thin",
      color: "#20242c",
    });
    expect(getCellStyle(sheet(), { row: 0, column: 1 })?.borderRight).toMatchObject({
      style: "thin",
      color: "#20242c",
    });

    await borderTrigger.trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.borderTop).toBeUndefined();

    await borderTrigger.trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(getCellStyle(sheet(), { row: 0, column: 1 })?.borderRight?.style).toBe("thin");

    await wrapper.get('[data-ribbon-action="clear-formatting"]').trigger("click");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.borderTop).toBeUndefined();
  });

  test("reapplies the remembered ribbon color to a new selection and undoes only that edit", async () => {
    const wrapper = mountApp();
    const sheet = () => wrapper.getComponent(SheetGrid).props("sheet");
    const textTool = wrapper.get('[data-cell-color-control="text"]');

    await textTool.get("[data-ribbon-split-menu]").trigger("click");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.textColor).toBeUndefined();
    await new DOMWrapper(document.body).get('[data-color-swatch="#4472c4"]').trigger("click");
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.textColor).toBe("#4472c4");

    await triggerCanvasCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    expect(activeCellAddress(wrapper)).toBe("B2");
    await textTool.get("[data-ribbon-split-main]").trigger("click");
    expect(getCellStyle(sheet(), { row: 1, column: 1 })?.textColor).toBe("#4472c4");
    expect(textTool.get("[data-ribbon-split-menu]").attributes("aria-expanded")).toBe("false");

    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(getCellStyle(sheet(), { row: 1, column: 1 })?.textColor).toBeUndefined();
    expect(getCellStyle(sheet(), { row: 0, column: 0 })?.textColor).toBe("#4472c4");
    await textTool.get("[data-ribbon-split-main]").trigger("click");
    expect(getCellStyle(sheet(), { row: 1, column: 1 })?.textColor).toBe("#4472c4");
  });

  test("toggles wrapped content and its derived row height through workbook history", async () => {
    const wrapper = mountApp();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "A" });
    await editor.setValue(
      "A long sentence with enough words to wrap across several lines in the first cell.",
    );
    await editor.trigger("keydown", { key: "Enter" });
    await triggerCanvasCell(wrapper, { row: 0, column: 0 }, "mousedown", { button: 0 });
    const wrapText = wrapper.get('[data-ribbon-action="wrap-text"]');

    await wrapText.trigger("click");
    expect(wrapText.attributes("aria-pressed")).toBe("true");
    expect(
      (
        wrapper.getComponent(SheetSurface).props("frame") as {
          layout: {
            getCellViewportRect(address: {
              row: number;
              column: number;
            }): { height: number } | undefined;
          };
        }
      ).layout.getCellViewportRect({ row: 0, column: 0 })?.height,
    ).toBeGreaterThan(24);

    await wrapText.trigger("click");
    expect(wrapText.attributes("aria-pressed")).toBe("false");
    expect(
      (
        wrapper.getComponent(SheetSurface).props("frame") as {
          layout: {
            getCellViewportRect(address: {
              row: number;
              column: number;
            }): { height: number } | undefined;
          };
        }
      ).layout.getCellViewportRect({ row: 0, column: 0 })?.height,
    ).toBe(24);

    await wrapText.trigger("keydown", { key: "z", ctrlKey: true });
    expect(wrapText.attributes("aria-pressed")).toBe("true");
    await wrapText.trigger("keydown", { key: "z", ctrlKey: true, shiftKey: true });
    expect(wrapText.attributes("aria-pressed")).toBe("false");
  });

  test("disables formatting when a whole-column selection exceeds the command limit", async () => {
    const wrapper = mountApp();
    await triggerCanvasHeader(wrapper, "column", 0, "mousedown", { button: 0 });

    const formatGroup = wrapper.get('[data-ribbon-group="cell"]');
    expect(formatGroup.attributes("aria-disabled")).toBe("true");
    expect(formatGroup.attributes("title")).toBe(
      "This selection is too large to format in one action.",
    );
    expect(wrapper.get('[aria-label="Bold"]').attributes("disabled")).toBe("");
    expect(wrapper.get('[data-ribbon-action="wrap-text"]').attributes("disabled")).toBe("");
    expect(wrapper.get('[data-ribbon-action="clear-formatting"]').attributes("disabled")).toBe("");
  });
});
