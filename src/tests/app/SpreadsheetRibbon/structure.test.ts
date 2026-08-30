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
    expect(
      new Set(
        wrapper
          .get("[data-ribbon-tools]")
          .findAll("[data-ribbon-row]")
          .map((row) => row.attributes("data-ribbon-row")),
      ),
    ).toEqual(new Set(["1", "2"]));
    expect(wrapper.get('[data-ribbon-group="cell"] [data-ribbon-row="1"]')).toBeTruthy();
    expect(wrapper.get('[data-ribbon-group="history"] [data-ribbon-row="2"]')).toBeTruthy();
    expect(wrapper.get("[data-locale-select] input").element).toBeInstanceOf(HTMLInputElement);

    await wrapper.get('[aria-label="Bold"]').trigger("click");
    expect(wrapper.emitted("applyStyle")?.[0]).toEqual([{ bold: true }]);
  });

  test("keeps concrete history actions and unavailable placeholders in the ribbon", async () => {
    const wrapper = mountRibbon();

    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    await wrapper.get('[data-ribbon-action="redo"]').trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("undo")).toHaveLength(1);
    expect(wrapper.emitted("redo")).toHaveLength(1);
    expect(wrapper.findAll("[data-ribbon-placeholder]")).toHaveLength(32);
    for (const placeholder of wrapper.findAll("[data-ribbon-placeholder]")) {
      expect(placeholder.attributes()).toMatchObject({
        role: "button",
        tabindex: "-1",
        "aria-disabled": "true",
      });
    }
  });

  test("localizes the category and surface labels", () => {
    const wrapper = mountRibbon("zh-CN");

    expect(wrapper.get("header").attributes("aria-label")).toBe("工作簿工具");
    expect(wrapper.get('[data-ribbon-category="home"]').text()).toBe("开始");
    expect(wrapper.get(".spreadsheet-ribbon__panel").attributes("aria-label")).toBe("开始工具");
    expect(wrapper.get(".font-format-controls__family input").element).toHaveProperty(
      "value",
      "默认字体",
    );
  });
});
