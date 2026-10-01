import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import PageSetupDialog from "../../../../../modules/page-layout/components/PageSetupDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("PageSetupDialog", () => {
  test("converts a local A1 range and resets manual breaks before confirmation", async () => {
    const wrapper = mount(PageSetupDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        setup: {
          ...DEFAULT_SHEET_PAGE_SETUP,
          rowBreaks: [12],
          columnBreaks: [4],
        },
      },
    });
    try {
      await wrapper.get('[data-page-setup="print-area"] input').setValue("D50:A1");
      await wrapper.get(".page-setup-dialog__breaks button").trigger("click");
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("confirm")).toEqual([
        [
          expect.objectContaining({
            printArea: {
              start: { row: 0, column: 0 },
              end: { row: 49, column: 3 },
            },
            rowBreaks: [],
            columnBreaks: [],
          }),
        ],
      ]);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("rejects sheet-qualified or invalid print areas", async () => {
    const wrapper = mount(PageSetupDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, setup: DEFAULT_SHEET_PAGE_SETUP },
    });
    try {
      await wrapper.get('[data-page-setup="print-area"] input').setValue("Sheet1!A1:B2");
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("confirm")).toBeUndefined();
      expect(wrapper.text()).toContain("Enter one range such as A1:D50.");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("saves multiline first-page text and header/footer options without confirming on Enter", async () => {
    const wrapper = mount(PageSetupDialog, {
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

      const checkbox = (option: string) =>
        wrapper.get(`[data-page-setup-option="${option}"] input`);
      await checkbox("different-first").setValue(true);
      await checkbox("different-odd-even").setValue(true);
      await checkbox("scale-with-document").setValue(false);
      await checkbox("align-with-margins").setValue(false);
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await wrapper.vm.$nextTick();

      const setup = wrapper.emitted("confirm")?.[0]?.[0] as typeof DEFAULT_SHEET_PAGE_SETUP;
      expect(setup.headerFooter).toMatchObject({
        differentFirst: true,
        differentOddEven: true,
        scaleWithDocument: false,
        alignWithMargins: false,
      });
      expect(setup.headerFooter?.firstHeader.left).toBe('&"Calibri,Bold"&12&K112233First page\n&P');
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});
