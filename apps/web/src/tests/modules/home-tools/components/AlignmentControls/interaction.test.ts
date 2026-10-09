import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
import HorizontalAlignmentControls from "../../../../../modules/home-tools/components/HorizontalAlignmentControls.vue";
import IndentationControls from "../../../../../modules/home-tools/components/IndentationControls.vue";
import VerticalAlignmentControls from "../../../../../modules/home-tools/components/VerticalAlignmentControls.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function createStyleState(
  overrides: Partial<SelectionCellStyleState> = {},
): SelectionCellStyleState {
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
    ...overrides,
  };
}

const global = { plugins: [createAppI18n("en-US")] };

describe("alignment ribbon controls", () => {
  test("applies every horizontal alignment and represents a mixed selection", async () => {
    const wrapper = mount(HorizontalAlignmentControls, {
      global,
      props: {
        state: createStyleState({
          horizontalAlign: { value: "center", mixed: false },
        }),
        disabled: false,
      },
    });

    expect(wrapper.findAll("[data-horizontal-alignment-action]")).toHaveLength(5);
    expect(
      wrapper.get('[data-horizontal-alignment-action="center"]').attributes("aria-pressed"),
    ).toBe("true");
    await wrapper.get('[data-horizontal-alignment-action="justify"]').trigger("click");
    await wrapper.get('[data-horizontal-alignment-action="distributed"]').trigger("click");
    expect(wrapper.emitted("applyStyle")).toEqual([
      [{ horizontalAlign: "justify" }],
      [{ horizontalAlign: "distributed" }],
    ]);

    await wrapper.setProps({
      state: createStyleState({
        horizontalAlign: { value: "center", mixed: true },
      }),
    });
    expect(
      wrapper
        .findAll("[data-horizontal-alignment-action]")
        .map((button) => button.attributes("aria-pressed")),
    ).toEqual(["false", "false", "false", "false", "false"]);
  });

  test("uses bottom's sparse default and clears active state for a mixed vertical selection", async () => {
    const wrapper = mount(VerticalAlignmentControls, {
      global,
      props: { state: { value: "bottom", mixed: false }, disabled: false },
    });

    expect(wrapper.findAll("[data-vertical-alignment-action]")).toHaveLength(3);
    expect(
      wrapper.get('[data-vertical-alignment-action="bottom"]').attributes("aria-pressed"),
    ).toBe("true");
    await wrapper.get('[data-vertical-alignment-action="top"]').trigger("click");
    await wrapper.get('[data-vertical-alignment-action="bottom"]').trigger("click");
    expect(wrapper.emitted("applyStyle")).toEqual([
      [{ verticalAlign: "top" }],
      [{ verticalAlign: null }],
    ]);

    await wrapper.setProps({ state: { value: "top", mixed: true } });
    expect(
      wrapper
        .findAll("[data-vertical-alignment-action]")
        .map((button) => button.attributes("aria-pressed")),
    ).toEqual(["false", "false", "false"]);
  });

  test("adjusts indentation relatively and respects only uniform boundary values", async () => {
    const wrapper = mount(IndentationControls, {
      global,
      props: { state: { value: 0, mixed: false }, disabled: false },
    });
    const decrease = wrapper.get('[data-ribbon-action="decrease-indent"]');
    const increase = wrapper.get('[data-ribbon-action="increase-indent"]');

    expect((decrease.element as HTMLButtonElement).disabled).toBe(true);
    expect((increase.element as HTMLButtonElement).disabled).toBe(false);
    await increase.trigger("click");
    expect(wrapper.emitted("adjustIndent")).toEqual([[1]]);

    await wrapper.setProps({ state: { value: 250, mixed: false } });
    expect((increase.element as HTMLButtonElement).disabled).toBe(true);
    expect((decrease.element as HTMLButtonElement).disabled).toBe(false);

    await wrapper.setProps({ state: { value: 0, mixed: true } });
    expect((decrease.element as HTMLButtonElement).disabled).toBe(false);
    expect((increase.element as HTMLButtonElement).disabled).toBe(false);
    await decrease.trigger("click");
    expect(wrapper.emitted("adjustIndent")?.at(-1)).toEqual([-1]);
  });
});
