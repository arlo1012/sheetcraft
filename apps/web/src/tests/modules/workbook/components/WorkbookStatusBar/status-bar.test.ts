import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import WorkbookStatusBar from "../../../../../modules/workbook/components/WorkbookStatusBar.vue";
import { createSheet } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../../shared/i18n";

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
        numericCount: 2,
        selectedCellCount: 3,
        sum: 30,
      },
    },
  });
}

describe("WorkbookStatusBar", () => {
  test("renders real workbook state and forwards sheet commands", async () => {
    const wrapper = mountStatusBar();

    expect(wrapper.get("footer").attributes("aria-label")).toBe("Workbook status");
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
    expect(wrapper.get("[data-selection-summary]").attributes("aria-label")).toBe(
      "Selection summary",
    );
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Count:3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Average:15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Sum:30");

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    await wrapper.get('[title="Sheet1 (double-click to rename)"]').trigger("click");
    await wrapper.get('[aria-label="Actions for Sheet1"]').trigger("click");
    await new DOMWrapper(document.body).findAll('[role="menuitem"]')[4]?.trigger("click");
    await wrapper.get('[aria-label="Actions for Sheet1"]').trigger("click");
    await new DOMWrapper(document.body).findAll('[role="menuitem"]')[0]?.trigger("click");
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
    expect(wrapper.get("[data-selection-summary]").text()).toContain("均值:15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("计数:3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("求和:30");
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
          numericCount: 0,
          selectedCellCount: 1,
          sum: 0,
        },
      },
    });

    expect(wrapper.find("[data-selection-summary]").exists()).toBe(false);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
    expect(
      wrapper.get('[aria-label="Normal view, not available yet"]').attributes("disabled"),
    ).toBe("");
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
          numericCount: 0,
          selectedCellCount: 2,
          sum: 0,
        },
      },
    });

    const summary = wrapper.get("[data-selection-summary]").text();
    expect(summary).toContain("Count:2");
    expect(summary).not.toContain("Average:");
    expect(summary).not.toContain("Sum:");
  });
});
