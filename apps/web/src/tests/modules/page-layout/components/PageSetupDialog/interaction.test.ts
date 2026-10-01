import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
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
});
