import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import ConditionalFormatPreview from "../../../modules/conditional-formatting/components/ConditionalFormatPreview.vue";
import { createAppI18n } from "../../../shared/i18n";

describe("conditional format preview", () => {
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
