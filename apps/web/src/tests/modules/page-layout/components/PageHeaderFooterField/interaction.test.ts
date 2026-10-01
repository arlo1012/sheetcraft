import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import PageHeaderFooterField from "../../../../../modules/page-layout/components/PageHeaderFooterField.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const props = {
  value: '&"Calibri,Bold"&12&K112233Report &P of &N',
  section: "header" as const,
  part: "center" as const,
  variant: "even" as const,
  pageNumber: 2,
  pageCount: 5,
  sheetName: "Sales",
  disabled: false,
};

describe("PageHeaderFooterField preview", () => {
  test("previews stored formatting and fields, then requests the matching dialog section", async () => {
    const wrapper = mount(PageHeaderFooterField, {
      props,
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.text()).toBe("Report 2 of 5");
      expect(wrapper.get("span").attributes("style")).toContain("font-weight: 700");
      await wrapper.get("button").trigger("click");
      expect(wrapper.emitted("open")).toEqual([
        [{ section: "header", part: "center", variant: "even" }],
      ]);
      expect(wrapper.find("textarea").exists()).toBe(false);
      expect(wrapper.emitted("change")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  test("read-only pages keep text visible and do not open the editor", async () => {
    const wrapper = mount(PageHeaderFooterField, {
      props: { ...props, disabled: true },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.text()).toBe("Report 2 of 5");
      await wrapper.get("button").trigger("click");
      expect(wrapper.emitted("open")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
});
