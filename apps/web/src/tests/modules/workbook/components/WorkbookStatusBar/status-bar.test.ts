import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import WorkbookStatusBar from "../../../../../modules/workbook/components/WorkbookStatusBar.vue";
import { createSheet } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../../shared/i18n";
import { STATUS_BAR_SETTINGS_STORAGE_KEY } from "../../../../../modules/workbook/composables/useStatusBarSettings";

beforeEach(() => localStorage.removeItem(STATUS_BAR_SETTINGS_STORAGE_KEY));
afterEach(() => localStorage.removeItem(STATUS_BAR_SETTINGS_STORAGE_KEY));

function mountStatusBar(locale: "en-US" | "zh-CN" = "en-US") {
  const sheets = [createSheet("Sheet1", "sheet-1"), createSheet("Sheet2", "sheet-2")];
  return mount(WorkbookStatusBar, {
    global: { plugins: [createAppI18n(locale)] },
    props: {
      sheets,
      activeSheetId: "sheet-2",
      selectionSummary: {
        average: 15,
        count: 3,
        maximum: 20,
        minimum: 10,
        numericCount: 2,
        selectedCellCount: 3,
        sum: 30,
      },
    },
  });
}

describe("WorkbookStatusBar", () => {
  test("shows zero numeric count for a text-only selection when configured", async () => {
    localStorage.setItem(
      STATUS_BAR_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        count: false,
        average: false,
        sum: false,
        numericCount: true,
      }),
    );
    const wrapper = mountStatusBar();
    await wrapper.setProps({
      selectionSummary: {
        selectedCellCount: 2,
        count: 2,
        numericCount: 0,
        average: 0,
        sum: 0,
        minimum: 0,
        maximum: 0,
      },
    });
    expect(wrapper.get("[data-selection-summary]").text()).toBe("Numeric count=0");
    wrapper.unmount();
  });
  test("keeps sheet tabs and the supplied horizontal scrollbar in the top row", () => {
    const sheets = [createSheet("Sheet1", "sheet-1")];
    const wrapper = mount(WorkbookStatusBar, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        sheets,
        activeSheetId: "sheet-1",
        selectionSummary: {
          average: 0,
          count: 0,
          maximum: 0,
          minimum: 0,
          numericCount: 0,
          selectedCellCount: 1,
          sum: 0,
        },
      },
      slots: {
        "horizontal-scrollbar": '<div data-horizontal-scrollbar="true" />',
      },
    });

    const topRow = wrapper.get(".workbook-status-bar__top-row");
    expect(topRow.get(".workbook-status-bar__sheets").find('[role="tablist"]').exists()).toBe(true);
    expect(topRow.find('[data-horizontal-scrollbar="true"]').exists()).toBe(true);
    expect(
      wrapper.get(".workbook-status-bar__bottom-row").find("[data-selection-summary]").exists(),
    ).toBe(false);
    expect(
      wrapper.get(".workbook-status-bar__bottom-row").get('[aria-label="Zoom 100%"]').text(),
    ).toBe("100%");
  });

  test("renders real workbook state and forwards sheet commands", async () => {
    const wrapper = mountStatusBar();

    expect(wrapper.get("footer").attributes("aria-label")).toBe("Workbook status");
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
    expect(wrapper.get("[data-selection-summary]").attributes("aria-label")).toBe(
      "Selection summary",
    );
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Count=3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Average=15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Sum=30");

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    await wrapper.get('[title="Sheet1 (double-click to rename)"]').trigger("click");
    await wrapper
      .get('[role="tab"][title="Sheet1 (double-click to rename)"]')
      .trigger("contextmenu");
    await new DOMWrapper(document.body).get('[data-sheet-tab-action="delete"]').trigger("click");
    await wrapper
      .get('[role="tab"][title="Sheet1 (double-click to rename)"]')
      .trigger("contextmenu");
    await new DOMWrapper(document.body).get('[data-sheet-tab-action="duplicate"]').trigger("click");
    await wrapper
      .get('[title="Sheet1 (double-click to rename)"]')
      .trigger("keydown", { key: "ArrowRight", altKey: true, shiftKey: true });

    expect(wrapper.emitted("add")).toHaveLength(1);
    expect(wrapper.emitted("select")?.[0]).toEqual(["sheet-1"]);
    expect(wrapper.emitted("delete")?.[0]).toEqual(["sheet-1"]);
    expect(wrapper.emitted("duplicate")?.[0]).toEqual(["sheet-1"]);
    expect(wrapper.emitted("move")?.[0]).toEqual([{ sheetId: "sheet-1", toIndex: 1 }]);
  });

  test("localizes status labels without changing sheet content", () => {
    const wrapper = mountStatusBar("zh-CN");

    expect(wrapper.get("footer").attributes("aria-label")).toBe("工作簿状态");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("均值=15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("计数=3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("求和=30");
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("Sheet2");
  });

  test("keeps the status quiet when a single empty cell is selected", () => {
    const wrapper = mount(WorkbookStatusBar, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        sheets: [createSheet("Sheet1", "sheet-1")],
        activeSheetId: "sheet-1",
        selectionSummary: {
          average: 0,
          count: 0,
          maximum: 0,
          minimum: 0,
          numericCount: 0,
          selectedCellCount: 1,
          sum: 0,
        },
      },
    });

    expect(wrapper.find("[data-selection-summary]").exists()).toBe(false);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Zoom 100%"]').text()).toBe("100%");
    expect(wrapper.get('[aria-label="Add sheet"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.findAll(".workbook-sheet-tabs__scroll:disabled")).toHaveLength(4);
  });

  test("shows count alone for a multi-cell text selection", () => {
    const wrapper = mount(WorkbookStatusBar, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        sheets: [createSheet("Sheet1", "sheet-1")],
        activeSheetId: "sheet-1",
        selectionSummary: {
          average: 0,
          count: 2,
          maximum: 0,
          minimum: 0,
          numericCount: 0,
          selectedCellCount: 2,
          sum: 0,
        },
      },
    });

    const summary = wrapper.get("[data-selection-summary]").text();
    expect(summary).toContain("Count=2");
    expect(summary).not.toContain("Average=");
    expect(summary).not.toContain("Sum=");
  });

  test("configures displayed statistics and persists the selection", async () => {
    const wrapper = mountStatusBar();

    await wrapper.get("[data-status-bar-settings-trigger]").trigger("click");
    const menu = new DOMWrapper(document.body).get("[data-status-bar-settings-menu]");
    expect(menu.get('[data-status-bar-statistic="average"]').attributes("aria-checked")).toBe(
      "true",
    );
    expect(menu.get('[data-status-bar-statistic="minimum"]').attributes("aria-checked")).toBe(
      "false",
    );

    await menu.get('[data-status-bar-statistic="minimum"]').trigger("click");
    await menu.get('[data-status-bar-statistic="average"]').trigger("click");
    await menu.get('[data-status-bar-number-format="thousands"]').trigger("click");

    const summary = wrapper.get("[data-selection-summary]").text();
    expect(summary).toContain("Minimum=10");
    expect(summary).not.toContain("Average=");
    expect(localStorage.getItem(STATUS_BAR_SETTINGS_STORAGE_KEY)).toContain('"minimum":true');
    expect(localStorage.getItem(STATUS_BAR_SETTINGS_STORAGE_KEY)).toContain(
      '"numberFormat":"thousands"',
    );

    await menu.get('[data-status-bar-number-format="thousands"]').trigger("click");
    expect(menu.get('[data-status-bar-number-format="thousands"]').attributes("aria-checked")).toBe(
      "false",
    );
    expect(localStorage.getItem(STATUS_BAR_SETTINGS_STORAGE_KEY)).toContain(
      '"numberFormat":"none"',
    );
  });
});
