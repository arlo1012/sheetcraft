import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import PageHeaderFooterField from "../../../../../modules/page-layout/components/PageHeaderFooterField.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountField() {
  return mount(PageHeaderFooterField, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      value: "Report &P / &N - &A &&",
      section: "header",
      part: "center",
      pageNumber: 2,
      pageCount: 4,
      sheetName: "Sales",
      disabled: false,
    },
  });
}

describe("PageHeaderFooterField", () => {
  test("displays page fields and commits raw tokens once when Enter ends editing", async () => {
    const wrapper = mountField();
    try {
      const input = wrapper.get<HTMLInputElement>("input");
      expect(input.element.value).toBe("Report 2 / 4 - Sales &");
      input.element.focus();
      await nextTick();
      expect(input.element.value).toBe("Report &P / &N - &A &&");
      await input.setValue("Summary &P / &N");
      await input.trigger("keydown", { key: "Enter", code: "Enter" });
      expect(wrapper.emitted("change")).toEqual([["Summary &P / &N"]]);
      expect(document.activeElement).not.toBe(input.element);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });

  test("Escape discards the draft without changing the saved header", async () => {
    const wrapper = mountField();
    try {
      const input = wrapper.get<HTMLInputElement>("input");
      input.element.focus();
      await input.setValue("Discard this");
      await input.trigger("keydown", { key: "Escape", code: "Escape" });
      expect(wrapper.emitted("change")).toBeUndefined();
      expect(input.element.value).toBe("Report 2 / 4 - Sales &");
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});
