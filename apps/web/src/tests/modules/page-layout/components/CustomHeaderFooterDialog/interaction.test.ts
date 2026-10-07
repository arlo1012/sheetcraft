import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import FontFormatPanel from "../../../../../shared/font-format/FontFormatPanel.vue";
import HeaderFooterFontDialog from "../../../../../modules/page-layout/components/HeaderFooterFontDialog.vue";
import ColorPaletteSelect from "../../../../../shared/color/ColorPaletteSelect.vue";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import CustomHeaderFooterDialog from "../../../../../modules/page-layout/components/CustomHeaderFooterDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";
describe("CustomHeaderFooterDialog", () => {
  test("saves multiline first-page text without confirming on Enter", async () => {
    const wrapper = mount(CustomHeaderFooterDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        setup: {
          ...DEFAULT_SHEET_PAGE_SETUP,
          headerFooter: {
            ...DEFAULT_SHEET_PAGE_SETUP.headerFooter!,
            differentFirst: true,
            firstHeader: { left: '&"Calibri,Bold"&12&K112233Original', center: "", right: "" },
          },
        },
      },
    });
    try {
      const variantSelector = wrapper
        .findAllComponents(TTabs)
        .find((component) => component.attributes("data-page-setup") === "header-footer-variant");
      variantSelector!.vm.$emit("update:modelValue", "first");
      await wrapper.vm.$nextTick();
      await wrapper.get('[data-page-setup="header-left"] textarea').setValue("First page\n&[Page]");
      await wrapper
        .get('[data-page-setup="header-left"] textarea')
        .trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("confirm")).toBeUndefined();

      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();

      const setup = wrapper.emitted("confirm")?.[0]?.[0] as typeof DEFAULT_SHEET_PAGE_SETUP;
      expect(setup.headerFooter?.firstHeader.left).toBe('&"Calibri,Bold"&12&K112233First page\n&P');
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("keeps font changes local until confirmation and confirms text only on Ctrl+Enter", async () => {
    const wrapper = mount(CustomHeaderFooterDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        setup: {
          ...DEFAULT_SHEET_PAGE_SETUP,
          header: { left: "", center: "Title", right: "" },
        },
      },
    });
    try {
      await wrapper.vm.$nextTick();
      const textarea = wrapper.get('[data-page-setup="header-center"] textarea');
      (textarea.element as HTMLTextAreaElement).focus();
      await wrapper.vm.$nextTick();
      const toolbar = wrapper.findComponent({ name: "PageHeaderFooterToolbar" });
      const fontAction = toolbar.get('[data-header-footer-action="font"]');
      expect(fontAction.attributes()).toMatchObject({
        role: "button",
        "aria-disabled": "false",
        tabindex: "0",
      });
      await fontAction.trigger("keydown", { key: "Enter" });
      let font = toolbar.getComponent(HeaderFooterFontDialog);
      expect(font.props("visible")).toBe(true);
      expect(font.findComponent(FontFormatPanel).exists()).toBe(true);
      const changeStyle = async (value: string) => {
        await font
          .get(`[data-cell-format-font-style-list] [data-option-list-value="${value}"]`)
          .trigger("click");
      };
      await changeStyle("bold");
      font.getComponent(ColorPaletteSelect).vm.$emit("select", "#2874A6");
      font.findComponent({ name: "TDialog" }).vm.$emit("close");
      await wrapper.vm.$nextTick();
      expect(toolbar.emitted("action")).toBeUndefined();
      await toolbar.get('[data-header-footer-action="font"]').trigger("click");
      font = toolbar.getComponent(HeaderFooterFontDialog);
      expect(
        font
          .get('[data-cell-format-font-style-list] [data-option-list-value="regular"]')
          .attributes("aria-selected"),
      ).toBe("true");
      expect(font.getComponent(ColorPaletteSelect).props("modelValue")).toBe("#000000");
      await changeStyle("bold");
      await font
        .get('[data-cell-format-font-family-list] [data-option-list-value="Inter"]')
        .trigger("click");
      const size = font.get("[data-cell-format-font-size]").getComponent(TInput);
      size.vm.$emit("change", "13");
      size.vm.$emit("blur");
      font.get("[data-cell-format-underline]").getComponent(TSelect).vm.$emit("change", "double");
      font.get("[data-cell-format-strikethrough]").getComponent(TCheckbox).vm.$emit("change", true);
      font.get("[data-cell-format-superscript]").getComponent(TCheckbox).vm.$emit("change", true);
      font.getComponent(ColorPaletteSelect).vm.$emit("select", "#2874A6");
      await wrapper.vm.$nextTick();
      font.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      await textarea.trigger("keydown", { key: "Enter" });
      await textarea.trigger("keydown", { key: "Enter", ctrlKey: true, isComposing: true });
      expect(wrapper.emitted("confirm")).toBeUndefined();
      await textarea.trigger("keydown", { key: "Enter", ctrlKey: true });
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toEqual(
        expect.objectContaining({
          header: expect.objectContaining({ center: '&"Inter,Bold"&13&K2874A6&E&S&XTitle' }),
        }),
      );
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("opens an even footer target and inserts a field over the current selection", async () => {
    const wrapper = mount(CustomHeaderFooterDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        target: { section: "footer", part: "right", variant: "even" },
        setup: {
          ...DEFAULT_SHEET_PAGE_SETUP,
          headerFooter: {
            ...DEFAULT_SHEET_PAGE_SETUP.headerFooter!,
            evenFooter: { left: "", center: "", right: "abcdef" },
          },
        },
      },
    });
    try {
      await wrapper.vm.$nextTick();
      const textarea = wrapper.get('[data-page-setup="footer-right"] textarea');
      expect(document.activeElement).toBe(textarea.element);
      (textarea.element as HTMLTextAreaElement).setSelectionRange(1, 5);
      await wrapper.vm.$nextTick();
      await wrapper
        .findComponent({ name: "PageHeaderFooterToolbar" })
        .get('[role="button"][aria-label="Page"]')
        .trigger("keydown", { key: " " });
      await wrapper.vm.$nextTick();
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      const setup = wrapper.emitted("confirm")?.[0]?.[0] as typeof DEFAULT_SHEET_PAGE_SETUP;
      expect(setup.headerFooter?.evenFooter.right).toContain("a&Pf");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("discards header and footer drafts when closed and reopened", async () => {
    const wrapper = mount(CustomHeaderFooterDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        setup: { ...DEFAULT_SHEET_PAGE_SETUP, header: { left: "Original", center: "", right: "" } },
      },
    });
    try {
      const textarea = wrapper.get('[data-page-setup="header-left"] textarea');
      await textarea.setValue("Draft");
      await wrapper.setProps({ visible: false });
      await wrapper.setProps({ visible: true });
      await wrapper.vm.$nextTick();
      expect(
        (wrapper.get('[data-page-setup="header-left"] textarea').element as HTMLTextAreaElement)
          .value,
      ).toBe("Original");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});
