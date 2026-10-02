import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
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
            firstHeader: { left: '&"Calibri,Bold"&12&K112233Original', center: "", right: "" },
          },
        },
      },
    });
    try {
      const variantSelector = wrapper
        .findAllComponents(TRadioGroup)
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

  test("applies toolbar formatting without text edits and confirms only on Ctrl+Enter", async () => {
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
      const textarea = wrapper.get('[data-page-setup="header-center"] textarea');
      await textarea.trigger("focus");
      const toolbar = wrapper.findComponent({ name: "PageHeaderFooterToolbar" });
      toolbar.vm.$emit("action", { type: "format", patch: { bold: true } });
      await wrapper.vm.$nextTick();
      await textarea.trigger("keydown", { key: "Enter" });
      await textarea.trigger("keydown", { key: "Enter", ctrlKey: true, isComposing: true });
      expect(wrapper.emitted("confirm")).toBeUndefined();
      await textarea.trigger("keydown", { key: "Enter", ctrlKey: true });
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toEqual(
        expect.objectContaining({
          header: expect.objectContaining({ center: expect.stringContaining("Bold") }),
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
      wrapper.findComponent({ name: "PageHeaderFooterToolbar" }).vm.$emit("action", {
        type: "insertField",
        field: "pageNumber",
      });
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
