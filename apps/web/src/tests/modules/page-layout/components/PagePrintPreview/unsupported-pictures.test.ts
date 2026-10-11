import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheetEvaluator, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { framedPicture } from "../../../sheet-images/framed-picture-fixture";
import { pictureGroup } from "../../../sheet-images/picture-group-fixture";
import PagePrintPreview from "../../../../../modules/page-layout/components/PagePrintPreview.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const renderer = vi.hoisted(() => ({
  render: vi.fn(),
  prepareImages: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../../../../../modules/page-layout/page-print-renderer", async (original) => ({
  ...(await original<object>()),
  createPrintPreviewRenderer: () => renderer,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("unsupported picture print preview feedback", () => {
  test.each([framedPicture(), pictureGroup()])(
    "hidden $id shows an explicit paused print boundary before drawing or opening a window",
    async (image) => {
      const workbook = createWorkbook({ id: "print", sheetId: "sheet" }),
        sheet = getActiveSheet(workbook);
      image.hidden = true;
      sheet.floatingImages = [image];
      const before = serializeWorkbook(workbook),
        open = vi.spyOn(window, "open");
      const wrapper = mount(PagePrintPreview, {
        props: {
          visible: true,
          sheet,
          evaluator: createSheetEvaluator(sheet),
          setup: DEFAULT_SHEET_PAGE_SETUP,
        },
        global: {
          plugins: [createAppI18n("en-US")],
          stubs: {
            TDialog: { template: '<section><slot /><slot name="footer" /></section>' },
            TButton: { template: "<button><slot /></button>" },
          },
        },
      });
      try {
        await flushPromises();
        expect(wrapper.get('[role="alert"]').text()).toBe(
          "Print preview does not support picture frames or owned picture groups yet. Your workbook is unchanged.",
        );
        expect(wrapper.find("canvas").exists()).toBe(false);
        const print = wrapper.findAll("button").find((button) => button.text() === "Print")!;
        expect(print.element.disabled).toBe(true);
        await print.trigger("click");
        expect(renderer.render).not.toHaveBeenCalled();
        expect(renderer.prepareImages).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
        expect(serializeWorkbook(workbook)).toEqual(before);
      } finally {
        wrapper.unmount();
      }
    },
  );
});
