import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import HomeCellFormatGroup from "../../../../../modules/home-tools/components/HomeCellFormatGroup.vue";
import type { SelectionCellStyleState } from "../../../../../modules/workbook/style-state";
import { createAppI18n } from "../../../../../shared/i18n";

function createStyleState(): SelectionCellStyleState {
  return {
    fontFamily: { value: undefined, mixed: false },
    fontSize: { value: undefined, mixed: false },
    bold: "off",
    italic: "off",
    underline: "off",
    textColor: { value: undefined, mixed: false },
    fillColor: { value: undefined, mixed: false },
    horizontalAlign: { value: undefined, mixed: false },
    verticalAlign: { value: undefined, mixed: false },
    wrapText: "off",
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

function placeholders(wrapper: ReturnType<typeof mountGroup>, lane: string): string[] {
  return wrapper
    .get(`[data-cell-format-lane="${lane}"]`)
    .findAll("[data-ribbon-placeholder]")
    .map((action) => action.attributes("data-ribbon-placeholder"))
    .filter((value): value is string => value !== undefined);
}

describe("HomeCellFormatGroup layout", () => {
  test("organizes controls into three semantic two-level lanes", () => {
    const wrapper = mountGroup();

    expect(
      wrapper
        .findAll(":scope > [data-cell-format-lane]")
        .map((lane) => lane.attributes("data-cell-format-lane")),
    ).toEqual(["typography", "appearance", "styles"]);
    expect(placeholders(wrapper, "typography")).toEqual(["strikethrough"]);
    expect(placeholders(wrapper, "appearance")).toEqual(["borders"]);
    expect(placeholders(wrapper, "styles")).toEqual(["table-styles", "conditional-formatting"]);
    expect(
      wrapper
        .get(".text-format-controls")
        .findAll('[role="button"]')
        .map((action) => action.attributes("aria-label")),
    ).toEqual(["Bold", "Italic", "Underline", "Strikethrough, not available yet"]);
    expect(
      wrapper
        .get("[data-font-format-control]")
        .findAll(":scope > [data-font-format-segment]")
        .map((segment) => segment.attributes("data-font-format-segment")),
    ).toEqual(["family", "size"]);
    expect(
      wrapper.get('[data-cell-format-lane="typography"] [data-cell-color-control="text"]'),
    ).toBeTruthy();
    expect(
      wrapper.get('[data-cell-format-lane="appearance"] [data-cell-color-control="fill"]'),
    ).toBeTruthy();
    expect(wrapper.get('[data-ribbon-placeholder="borders"] svg').attributes()).toMatchObject({
      width: "18",
      height: "18",
    });
    const colorIcons = wrapper.findAll(".cell-color-picker__icon svg");
    expect(colorIcons).toHaveLength(2);
    for (const colorIcon of colorIcons) {
      expect(colorIcon.attributes()).toMatchObject({ width: "18", height: "18" });
    }
    expect(wrapper.find(".cell-color-picker__swatch").exists()).toBe(false);
    expect(wrapper.findAll("[data-color-indicator]")).toHaveLength(2);
    expect(wrapper.get('[data-cell-color-icon="text"] [data-color-indicator]')).toBeTruthy();
    expect(wrapper.get('[data-cell-color-icon="fill"] [data-color-indicator]')).toBeTruthy();
    expect(wrapper.get('[data-cell-color-icon="text"]').attributes("style")).toContain(
      "--cell-color-indicator: #20242c",
    );
    expect(wrapper.get('[data-cell-color-icon="fill"]').attributes("style")).toContain(
      "--cell-color-indicator: #ffffff",
    );
  });

  test.each([
    [
      "en-US",
      "Cell tools",
      ["Text formatting", "Cell appearance", "Style rules"],
      "Bold",
      "Text color",
      "Fill color",
    ],
    ["zh-CN", "单元格工具", ["文字格式", "单元格外观", "样式规则"], "加粗", "文字颜色", "填充颜色"],
  ] as const)(
    "localizes the %s group and formatting controls",
    (locale, group, lanes, bold, text, fill) => {
      const wrapper = mountGroup(locale);

      expect(wrapper.attributes("aria-label")).toBe(group);
      expect(
        wrapper
          .findAll(":scope > [data-cell-format-lane]")
          .map((lane) => lane.attributes("aria-label")),
      ).toEqual(lanes);
      expect(wrapper.get(`[aria-label="${bold}"]`)).toBeTruthy();
      expect(wrapper.get(`[aria-label="${text}"]`)).toBeTruthy();
      expect(wrapper.get(`[aria-label="${fill}"]`)).toBeTruthy();
    },
  );
});
