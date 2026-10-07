import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import HomeCellFormatGroup from "../../../../../modules/home-tools/components/HomeCellFormatGroup.vue";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { createAppI18n } from "../../../../../shared/i18n";

function createStyleState(): SelectionCellStyleState {
  return {
    fontFamily: { value: undefined, mixed: false },
    fontSize: { value: undefined, mixed: false },
    bold: "off",
    italic: "off",
    underline: "off",
    underlineStyle: { value: undefined, mixed: false },
    strikethrough: "off",
    fontScript: { value: undefined, mixed: false },
    textColor: { value: undefined, mixed: false },
    fillColor: { value: undefined, mixed: false },
    fillPattern: { value: undefined, mixed: false },
    fillPatternColor: { value: undefined, mixed: false },
    fillGradient: { value: undefined, mixed: false },
    horizontalAlign: { value: undefined, mixed: false },
    verticalAlign: { value: undefined, mixed: false },
    indent: { value: 0, mixed: false },
    shrinkToFit: "off",
    textDirection: { value: "context", mixed: false },
    textRotation: { value: 0, mixed: false },
    wrapText: "off",
    numberFormat: { value: undefined, mixed: false },
  };
}

function mountGroup(locale: "en-US" | "zh-CN" = "en-US") {
  return mount(HomeCellFormatGroup, {
    global: {
      plugins: [createAppI18n(locale)],
    },
    props: {
      state: createStyleState(),
      disabled: false,
    },
  });
}

describe("HomeCellFormatGroup layout", () => {
  test("organizes controls across two direct ribbon rows", () => {
    const wrapper = mountGroup();

    expect(
      wrapper.findAll(":scope > [data-ribbon-row]").map((row) => row.attributes("data-ribbon-row")),
    ).toEqual(["1", "2"]);
    const firstRow = wrapper.get('[data-ribbon-row="1"]');
    const secondRow = wrapper.get('[data-ribbon-row="2"]');
    expect(firstRow.get("[data-font-format-control]")).toBeTruthy();
    expect(firstRow.get("[data-cell-border-control]")).toBeTruthy();
    expect(secondRow.get(".text-format-controls")).toBeTruthy();
    expect(secondRow.get('[data-cell-color-control="text"]')).toBeTruthy();
    expect(secondRow.get('[data-cell-color-control="fill"]')).toBeTruthy();
    expect(wrapper.get(':scope > [data-ribbon-dialog-launcher="font"]')).toBeTruthy();
    expect(
      wrapper
        .get(".text-format-controls")
        .findAll('[role="button"]')
        .map((action) => action.attributes("aria-label")),
    ).toEqual(["Bold", "Italic", "Underline", "Strikethrough"]);
    expect(
      wrapper
        .get("[data-font-format-control]")
        .findAll(":scope > [data-font-format-segment]")
        .map((segment) => segment.attributes("data-font-format-segment")),
    ).toEqual(["family", "size"]);
    expect(
      wrapper
        .get("[data-cell-border-control] [data-border-preset-icon]")
        .attributes("data-border-preset-icon"),
    ).toBe("bottom");
    const colorIcons = wrapper.findAll(".cell-color-control__icon svg");
    expect(colorIcons).toHaveLength(2);
    for (const colorIcon of colorIcons) {
      expect(colorIcon.attributes()).toMatchObject({
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
      });
    }
    expect(wrapper.find(".cell-color-picker__swatch").exists()).toBe(false);
    expect(wrapper.findAll("[data-color-indicator]")).toHaveLength(2);
    expect(wrapper.get('[data-cell-color-icon="text"] [data-color-indicator]')).toBeTruthy();
    expect(wrapper.get('[data-cell-color-icon="fill"] [data-color-indicator]')).toBeTruthy();
    expect(wrapper.get('[data-cell-color-icon="text"]').attributes("style")).toContain(
      "--cell-color-indicator: #ff0000",
    );
    expect(wrapper.get('[data-cell-color-icon="fill"]').attributes("style")).toContain(
      "--cell-color-indicator: #ffff00",
    );
  });

  test.each([
    ["en-US", "Cell tools", "Bold", "Text color", "Fill color"],
    ["zh-CN", "单元格工具", "加粗", "文字颜色", "填充颜色"],
  ] as const)(
    "localizes the %s group and formatting controls",
    (locale, group, bold, text, fill) => {
      const wrapper = mountGroup(locale);

      expect(wrapper.attributes("aria-label")).toBe(group);
      expect(wrapper.get(`[aria-label="${bold}"]`)).toBeTruthy();
      expect(wrapper.get(`[aria-label="${text}"]`)).toBeTruthy();
      expect(wrapper.get(`[aria-label="${fill}"]`)).toBeTruthy();
    },
  );
});
