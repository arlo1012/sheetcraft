import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, createWorkbookEvaluator, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createGraphicDrawing } from "../../../../../modules/sheet-drawings/drawing-defaults";
import PagePrintPreview from "../../../../../modules/page-layout/components/PagePrintPreview.vue";
import { createTextBoxReferenceResolver } from "../../../../../modules/sheet-drawings/textbox-reference-display";
import { createAppI18n } from "../../../../../shared/i18n";

const renderer = vi.hoisted(() => ({
  render: vi.fn(),
  chartsReady: () => true,
  clearCharts: vi.fn(),
  prepareChartFonts: vi.fn(),
  prepareCharts: vi.fn(),
  equationsReady: () => true,
  prepareEquations: vi.fn(),
  prepareImages: vi.fn(),
  prepareShapes: vi.fn(),
  getShapePaintResources: vi.fn(),
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

describe("linked text print preview", () => {
  test("missing display context gives explicit print feedback and recovers with the current resolver", async () => {
    const workbook = createWorkbook({ id: "linked-print", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    sheet.drawings = [
      {
        ...createGraphicDrawing("linked", "textBox", "Linked", { row: 0, column: 0 }),
        text: "",
        textReference: { sheetId: sheet.id, cell: { row: 0, column: 0 } },
      },
    ];
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const before = serializeWorkbook(workbook);
    const open = vi.spyOn(window, "open");
    const wrapper = mount(PagePrintPreview, {
      props: { visible: true, sheet, evaluator, setup: DEFAULT_SHEET_PAGE_SETUP },
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
      expect(wrapper.get('[role="alert"]').text()).toMatch(/source.*cannot.*displayed/i);
      expect(wrapper.find("canvas").exists()).toBe(false);
      const print = wrapper.findAll("button").find((button) => button.text() === "Print")!;
      expect(print.element.disabled).toBe(true);
      await print.trigger("click");
      expect(open).not.toHaveBeenCalled();
      expect(renderer.render).not.toHaveBeenCalled();
      await wrapper.setProps({
        textBoxReferenceResolver: createTextBoxReferenceResolver({
          workbook,
          evaluator,
          locale: "en-US",
        }),
      });
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find("canvas").exists()).toBe(true);
      expect(renderer.render).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            shapeRenderPass: expect.objectContaining({
              leaves: expect.arrayContaining([
                expect.objectContaining({ textReference: { status: "ready", text: "" } }),
              ]),
            }),
          }),
        }),
      );
      expect(serializeWorkbook(workbook)).toEqual(before);
    } finally {
      wrapper.unmount();
    }
  });
});
