import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import HeaderFooterFontDialog from "../../../../../modules/page-layout/components/HeaderFooterFontDialog.vue";
import { DEFAULT_HEADER_FOOTER_FORMAT } from "../../../../../modules/page-layout/header-footer-text";
import FontFormatPanel from "../../../../../shared/font-format/FontFormatPanel.vue";
import ColorPaletteSelect from "../../../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountFont() {
  const format = {
    ...DEFAULT_HEADER_FOOTER_FORMAT,
    fontFamily: "Calibri",
    fontSize: 96,
    color: "112233",
  };
  const wrapper = mount(HeaderFooterFontDialog, {
    props: { visible: true, format, sampleText: "Title" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return { wrapper, format };
}

describe("HeaderFooterFontDialog", () => {
  test("uses the detailed font panel with point sizes and supported underline choices", () => {
    const { wrapper } = mountFont();
    try {
      expect(wrapper.findComponent(FontFormatPanel).exists()).toBe(true);
      expect(
        wrapper.get<HTMLElement>("[data-cell-format-font-preview]").element.style.fontSize,
      ).toBe("96pt");
      expect(
        wrapper.get("[data-cell-format-underline]").getComponent(TSelect).props("options"),
      ).toEqual([
        { value: "none", label: "None" },
        { value: "single", label: "Single" },
        { value: "double", label: "Double" },
      ]);
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      expect(wrapper.emitted("confirm")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  test("allows header and footer point sizes below the cell minimum", async () => {
    const { wrapper } = mountFont();
    try {
      const size = wrapper.get("[data-cell-format-font-size]").getComponent(TInput);
      size.vm.$emit("change", "1");
      size.vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(size.props("modelValue")).toBe("1");
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({ fontSize: 1 });
    } finally {
      wrapper.unmount();
    }
  });

  test("maps default font, point size bounds and automatic color without changing its source", async () => {
    const { wrapper, format } = mountFont();
    try {
      await wrapper
        .get('[data-cell-format-font-family-list] [data-option-list-value="Arial"]')
        .trigger("click");
      const size = wrapper.get("[data-cell-format-font-size]").getComponent(TInput);
      size.vm.$emit("change", "999");
      size.vm.$emit("blur");
      wrapper.getComponent(ColorPaletteSelect).vm.$emit("select", null);
      await wrapper.vm.$nextTick();
      expect(size.props("modelValue")).toBe("409");
      expect(
        wrapper.get<HTMLElement>("[data-cell-format-font-preview]").element.style.fontSize,
      ).toBe("409pt");
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
        fontFamily: "Arial",
        fontSize: 409,
        color: "000000",
      });
      expect(format).toMatchObject({ fontFamily: "Calibri", fontSize: 96, color: "112233" });
    } finally {
      wrapper.unmount();
    }
  });
});
