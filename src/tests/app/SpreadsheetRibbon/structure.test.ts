import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createDefaultSelectionCellStyleState } from "../../../modules/workbook/style-state";
import { createAppI18n } from "../../../shared/i18n";

function mountRibbon(locale: "en-US" | "zh-CN" = "en-US") {
  return mount(SpreadsheetRibbon, {
    global: { plugins: [createAppI18n(locale)] },
    props: {
      state: createDefaultSelectionCellStyleState(),
      disabled: false,
    },
  });
}

describe("SpreadsheetRibbon", () => {
  test("exposes only the implemented Home category and its concrete tools", async () => {
    const wrapper = mountRibbon();

    expect(wrapper.get("header").attributes("aria-label")).toBe("Workbook tools");
    expect(wrapper.get("nav").attributes("aria-label")).toBe("Ribbon categories");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("Home");
    expect(wrapper.findAll(".spreadsheet-ribbon__category")).toHaveLength(1);
    expect(wrapper.get(".spreadsheet-ribbon__panel").attributes("aria-label")).toBe("Home tools");
    expect(wrapper.get(".home-format-toolbar").attributes("aria-label")).toBe("Cell formatting");
    expect(wrapper.get("[data-locale-select] input").element).toBeInstanceOf(HTMLInputElement);

    await wrapper.get('[aria-label="Bold"]').trigger("click");
    expect(wrapper.emitted("applyStyle")?.[0]).toEqual([{ bold: true }]);
  });

  test("localizes the category and surface labels", () => {
    const wrapper = mountRibbon("zh-CN");

    expect(wrapper.get("header").attributes("aria-label")).toBe("工作簿工具");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("开始");
    expect(wrapper.get(".spreadsheet-ribbon__panel").attributes("aria-label")).toBe("开始工具");
  });
});
