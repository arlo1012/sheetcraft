import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import WorkbookStatusBar from "../../../../../modules/workbook/components/WorkbookStatusBar.vue";
import { createSheet } from "../../../../../modules/workbook/workbook";
import { createAppI18n } from "../../../../../shared/i18n";

function mountStatusBar(locale: "en-US" | "zh-CN" = "en-US") {
  const sheets = [createSheet("Sheet1", "sheet-1"), createSheet("Sheet2", "sheet-2")];
  return mount(WorkbookStatusBar, {
    global: { plugins: [createAppI18n(locale)] },
    props: {
      sheets,
      activeSheetId: "sheet-2",
      statusText: locale === "zh-CN" ? "就绪" : "Ready",
      selectionSummary: { average: 15, count: 3, sum: 30 },
    },
  });
}

describe("WorkbookStatusBar", () => {
  test("renders real workbook state and forwards sheet commands", async () => {
    const wrapper = mountStatusBar();

    expect(wrapper.get("footer").attributes("aria-label")).toBe("Workbook status");
    expect(wrapper.get('[aria-live="polite"]').text()).toBe("Ready");
    expect(wrapper.get("[data-selection-summary]").attributes("aria-label")).toBe(
      "Selection summary",
    );
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Average:15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Count:3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("Sum:30");

    await wrapper.get('[aria-label="Add sheet"]').trigger("click");
    await wrapper.get('[title="Sheet1 (double-click to rename)"]').trigger("click");
    await wrapper.get('[aria-label="Delete active sheet"]').trigger("click");

    expect(wrapper.emitted("add")).toHaveLength(1);
    expect(wrapper.emitted("select")?.[0]).toEqual(["sheet-1"]);
    expect(wrapper.emitted("delete")?.[0]).toEqual(["sheet-2"]);
  });

  test("localizes status labels without changing sheet content", () => {
    const wrapper = mountStatusBar("zh-CN");

    expect(wrapper.get("footer").attributes("aria-label")).toBe("工作簿状态");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("均值:15");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("计数:3");
    expect(wrapper.get("[data-selection-summary]").text()).toContain("求和:30");
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("Sheet2");
  });
});
