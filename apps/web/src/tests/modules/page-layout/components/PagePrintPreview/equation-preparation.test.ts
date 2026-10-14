import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createGraphicDrawing } from "../../../../../modules/sheet-drawings/drawing-defaults";
import PagePrintPreview from "../../../../../modules/page-layout/components/PagePrintPreview.vue";
import * as printRenderer from "../../../../../modules/page-layout/page-print-renderer";
import { createAppI18n } from "../../../../../shared/i18n";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const sheet = createSheet("Equations", "sheet");
  sheet.drawings = [createGraphicDrawing("math", "equation", "Equation", { row: 0, column: 0 })];
  let ready = false,
    invalidate: (() => void) | undefined;
  const actualFactory = printRenderer.createPrintPreviewRenderer;
  const prepare = vi.fn<printRenderer.PrintPreviewRenderer["prepareEquations"]>(async () => {
    ready = true;
  });
  const render = vi.fn<printRenderer.PrintPreviewRenderer["render"]>();
  vi.spyOn(printRenderer, "createPrintPreviewRenderer").mockImplementation(
    (onImages, onInvalidate) => {
      invalidate = () => {
        ready = false;
        onInvalidate?.();
      };
      return {
        ...actualFactory(onImages, onInvalidate),
        render,
        prepareEquations: prepare,
        equationsReady: () => ready,
      };
    },
  );
  const mountPreview = () =>
    mount(PagePrintPreview, {
      props: {
        visible: true,
        sheet,
        evaluator: createSheetEvaluator(sheet),
        setup: DEFAULT_SHEET_PAGE_SETUP,
        workbookRevision: 0,
      },
      global: {
        plugins: [createAppI18n("en-US")],
        stubs: {
          TDialog: { template: '<section><slot /><slot name="footer" /></section>' },
          TButton: { template: "<button><slot /></button>" },
        },
      },
    });
  return { sheet, prepare, render, mountPreview, invalidate: () => invalidate!() };
}
function printButton(wrapper: ReturnType<ReturnType<typeof fixture>["mountPreview"]>) {
  return wrapper.findAll("button").find((button) => button.text() === "Print")!;
}
test("real preview shows preparation and retries after notified font invalidation", async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  const normal = f.prepare.getMockImplementation()!;
  f.prepare.mockImplementationOnce(async (preview, owner) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await normal(preview, owner);
  });
  const wrapper = f.mountPreview(),
    before = JSON.stringify(f.sheet.drawings);
  try {
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain("Preparing mathematical layout");
    expect(wrapper.find("canvas").exists()).toBe(false);
    expect(printButton(wrapper).element.disabled).toBe(true);
    release!();
    await flushPromises();
    expect(printButton(wrapper).element.disabled).toBe(false);
    expect(f.render).toHaveBeenCalled();
    f.invalidate();
    await flushPromises();
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(printButton(wrapper).element.disabled).toBe(false);
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  } finally {
    wrapper.unmount();
  }
});
test("mathematical preparation failure shows an error and never opens a blank print", async () => {
  const f = fixture();
  f.prepare.mockRejectedValue(new Error("Missing bundled mathematical face"));
  const open = vi.spyOn(window, "open"),
    wrapper = f.mountPreview();
  try {
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Missing bundled mathematical face");
    expect(printButton(wrapper).element.disabled).toBe(true);
    await printButton(wrapper).trigger("click");
    expect(open).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
  }
});
test("source revision changed during final preparation closes the popup before any print images", async () => {
  const f = fixture(),
    wrapper = f.mountPreview();
  const popupDocument = document.implementation.createHTMLDocument("Print");
  const popup = {
    closed: false,
    document: popupDocument,
    close: vi.fn(),
    addEventListener: vi.fn(),
    opener: null,
  } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  let release: (() => void) | undefined;
  try {
    await flushPromises();
    f.prepare.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await printButton(wrapper).trigger("click");
    await flushPromises();
    expect(release).toBeDefined();
    await wrapper.setProps({ workbookRevision: 1 });
    await flushPromises();
    release!();
    await flushPromises();
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popupDocument.querySelectorAll("img")).toHaveLength(0);
    expect(popup.addEventListener).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
  }
});
test("verified final preparation produces print images without substituting source text", async () => {
  const f = fixture(),
    wrapper = f.mountPreview();
  const popupDocument = document.implementation.createHTMLDocument("Print");
  const popup = {
    closed: false,
    document: popupDocument,
    close: vi.fn(),
    addEventListener: vi.fn(),
    opener: null,
  } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,verified-math",
  );
  try {
    await flushPromises();
    await printButton(wrapper).trigger("click");
    await flushPromises();
    expect(popup.close).not.toHaveBeenCalled();
    expect(popupDocument.querySelectorAll("img")).toHaveLength(1);
    expect(popupDocument.body.textContent).not.toContain("\\frac");
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(popup.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), {
      once: true,
    });
  } finally {
    wrapper.unmount();
  }
});
