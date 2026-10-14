import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createGraphicDrawing } from "../../../../../modules/sheet-drawings/drawing-defaults";
import PagePrintPreview from "../../../../../modules/page-layout/components/PagePrintPreview.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("unavailable Equation print feedback", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "shows %s feedback and blocks popup without changing source",
    async (locale) => {
      const sheet = createSheet("Equations", "sheet");
      sheet.drawings = [createGraphicDrawing("math", "equation", "Math", { row: 0, column: 0 })];
      const before = JSON.stringify(sheet.drawings);
      const open = vi.spyOn(window, "open");
      const wrapper = mount(PagePrintPreview, {
        props: {
          visible: true,
          sheet,
          evaluator: createSheetEvaluator(sheet),
          setup: DEFAULT_SHEET_PAGE_SETUP,
        },
        global: {
          plugins: [createAppI18n(locale)],
          stubs: {
            TDialog: { template: '<section><slot /><slot name="footer" /></section>' },
            TButton: { template: "<button><slot /></button>" },
          },
        },
      });
      try {
        await flushPromises();
        expect(wrapper.get('[role="alert"]').text()).toContain(
          locale === "zh-CN" ? "无法核验公式排版或字体" : "Equation printing is unavailable",
        );
        expect(wrapper.find("canvas").exists()).toBe(false);
        const print = wrapper
          .findAll("button")
          .find((button) => button.text() === (locale === "zh-CN" ? "打印" : "Print"))!;
        expect(print.element.disabled).toBe(true);
        await print.trigger("click");
        expect(open).not.toHaveBeenCalled();
        expect(JSON.stringify(sheet.drawings)).toBe(before);
      } finally {
        wrapper.unmount();
        open.mockRestore();
      }
    },
  );
});
