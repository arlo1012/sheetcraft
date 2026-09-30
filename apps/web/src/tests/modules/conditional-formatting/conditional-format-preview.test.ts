import { mount } from "@vue/test-utils";
import type { ConditionalFormatCondition } from "@idea10/core/conditional-formatting";
import { describe, expect, test, vi } from "vitest";
import ConditionalFormatPreview from "../../../modules/conditional-formatting/components/ConditionalFormatPreview.vue";
import { paintConditionalFormatVisual } from "../../../shared/conditional-formatting/conditional-format-painter";
import { createAppI18n } from "../../../shared/i18n";

vi.mock("../../../shared/conditional-formatting/conditional-format-painter", () => ({
  paintConditionalFormatVisual: vi.fn(),
}));

describe("conditional format preview", () => {
  test("previews custom row icons, reversal and the no-icon choice", async () => {
    const context = { setTransform: vi.fn(), clearRect: vi.fn() };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const condition: Extract<ConditionalFormatCondition, { kind: "iconSet" }> = {
      kind: "iconSet",
      iconSet: "threeTrafficLights",
      thresholds: [
        { kind: "percent", value: 0 },
        { kind: "percent", value: 33 },
        { kind: "percent", value: 67 },
      ],
      icons: [
        { iconSet: "threeFlags", iconIndex: 1 },
        null,
        { iconSet: "fiveArrows", iconIndex: 4 },
      ],
    };
    const wrapper = mount(ConditionalFormatPreview, {
      props: { condition, iconIndex: 0, compact: true },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(paintConditionalFormatVisual).toHaveBeenLastCalledWith(context, expect.anything(), {
        iconSet: { iconSet: "threeFlags", iconIndex: 1, showValue: true },
      });
      await wrapper.setProps({ condition: { ...condition, reverse: true } });
      expect(paintConditionalFormatVisual).toHaveBeenLastCalledWith(context, expect.anything(), {
        iconSet: { iconSet: "fiveArrows", iconIndex: 4, showValue: true },
      });
      vi.mocked(paintConditionalFormatVisual).mockClear();
      await wrapper.setProps({ iconIndex: 1 });
      expect(paintConditionalFormatVisual).not.toHaveBeenCalled();
      expect(context.clearRect).toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      getContext.mockRestore();
    }
  });

  test("previews data-bar direction, border and axis changes in the inset control", async () => {
    const context = { setTransform: vi.fn(), clearRect: vi.fn() };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const condition = {
      kind: "dataBar" as const,
      minimum: { kind: "autoMin" as const },
      maximum: { kind: "autoMax" as const },
      color: "#638ec6",
      borderColor: "#112233",
      axisPosition: "middle" as const,
      axisColor: "#ff0000",
      direction: "rightToLeft" as const,
      gradient: false,
    };
    const wrapper = mount(ConditionalFormatPreview, {
      props: { wide: true, condition },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.classes()).toContain("conditional-format-preview--color-control");
      expect(paintConditionalFormatVisual).toHaveBeenLastCalledWith(
        context,
        expect.objectContaining({ height: 22 }),
        {
          dataBar: expect.objectContaining({
            start: expect.closeTo(0.05),
            end: 0.5,
            axis: 0.5,
            borderColor: "#112233",
            axisColor: "#ff0000",
            negative: false,
            gradient: false,
          }),
        },
      );
      await wrapper.setProps({
        condition: { ...condition, direction: "leftToRight", axisPosition: "none" },
      });
      expect(paintConditionalFormatVisual).toHaveBeenLastCalledWith(context, expect.anything(), {
        dataBar: expect.objectContaining({ start: 0, end: 0.9, axis: 0, axisPosition: "none" }),
      });
    } finally {
      wrapper.unmount();
      getContext.mockRestore();
    }
  });

  test("uses the effective custom style for number, typography, fill and borders", () => {
    const wrapper = mount(ConditionalFormatPreview, {
      props: {
        format: {
          numberFormat: { kind: "number", fractionDigits: 2, useGrouping: true },
          fontFamily: "serif",
          fontSize: 18,
          bold: true,
          textColor: "#9c0006",
          underline: true,
          strikethrough: true,
          fillPattern: "darkGrid",
          fillPatternColor: "#112233",
          borderTop: { style: "medium", color: "#7f6000" },
          borderRight: { style: "thin", color: "#4472c4" },
        },
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const preview = wrapper.get(".conditional-format-preview");
    const element = preview.element as HTMLElement;
    expect(preview.text()).toBe("1,234.50");
    expect(element.style.fontFamily).toContain("serif");
    expect(element.style.fontSize).toBe("18px");
    expect(element.style.fontWeight).toBe("700");
    expect(element.style.color).toBe("#9c0006");
    expect(element.style.textDecoration).toContain("underline");
    expect(element.style.textDecoration).toContain("line-through");
    expect(element.style.backgroundImage).toContain("data:image/svg+xml");
    expect(element.style.borderTop).toContain("#7f6000");
    expect(element.style.borderRight).toContain("#4472c4");
  });
});
