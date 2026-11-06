// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import {
  createWorkbook,
  createSheet,
  createSheetEvaluator,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import PagePrintPreview from "../../../modules/page-layout/components/PagePrintPreview.vue";
import {
  createPrintPreviewDocument,
  type PrintPreviewRenderer,
} from "../../../modules/page-layout/page-print-renderer";
import {
  writePrintOutput,
  type PrintSheetSource,
} from "../../../modules/page-layout/page-print-job";
import { createAppI18n } from "../../../shared/i18n";

type RenderRequest = Parameters<PrintPreviewRenderer["render"]>[0];
const renderer = vi.hoisted(() => ({
  nextOwner: 0,
  ready: true,
  render: vi.fn<(owner: number, request: RenderRequest) => void>(),
  prepareImages: vi.fn<PrintPreviewRenderer["prepareImages"]>(async () => {}),
  prepareShapes: vi.fn<PrintPreviewRenderer["prepareShapes"]>(async () => {}),
  prepareChartFonts: vi.fn<PrintPreviewRenderer["prepareChartFonts"]>(async () => {}),
  prepareEquations: vi.fn<PrintPreviewRenderer["prepareEquations"]>(async () => {}),
  prepareCharts: vi.fn<PrintPreviewRenderer["prepareCharts"]>(async () => {}),
}));
vi.mock("../../../modules/page-layout/page-print-renderer", async (original) => {
  const actual =
    await original<typeof import("../../../modules/page-layout/page-print-renderer")>();
  return {
    ...actual,
    createPrintPreviewDocument: vi.fn(actual.createPrintPreviewDocument),
    createPrintPreviewRenderer: () => {
      const owner = ++renderer.nextOwner;
      return {
        render: (request: RenderRequest) => renderer.render(owner, request),
        prepareImages: renderer.prepareImages,
        prepareShapes: renderer.prepareShapes,
        prepareChartFonts: renderer.prepareChartFonts,
        prepareEquations: renderer.prepareEquations,
        prepareCharts: renderer.prepareCharts,
        chartsReady: () => renderer.ready,
        equationsReady: () => renderer.ready,
        clearCharts: vi.fn(),
        getShapePaintResources: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
});
vi.mock("../../../modules/page-layout/page-print-job", async (original) => {
  const actual = await original<typeof import("../../../modules/page-layout/page-print-job")>();
  return { ...actual, writePrintOutput: vi.fn(actual.writePrintOutput) };
});

const mounted: Array<{ unmount(): void }> = [];
beforeEach(() => {
  renderer.nextOwner = 0;
  renderer.ready = true;
  renderer.render.mockReset().mockImplementation((_owner, request) => {
    request.canvas.dataset.printSheet = request.document.sheet.id;
    request.canvas.dataset.localPage = String(request.page.pageNumber);
  });
  renderer.prepareImages.mockReset().mockResolvedValue(undefined);
  renderer.prepareShapes.mockReset().mockResolvedValue(undefined);
  renderer.prepareChartFonts.mockReset().mockResolvedValue(undefined);
  renderer.prepareEquations.mockReset().mockResolvedValue(undefined);
  renderer.prepareCharts.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    function (this: HTMLCanvasElement) {
      return `data:image/png;base64,${btoa(`${this.dataset.printSheet}:${this.dataset.localPage}`)}`;
    },
  );
});
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function fixture(withWorkbook = true) {
  const workbook = createWorkbook({ id: "print-workbook", sheetId: "report-a" });
  const first = getActiveSheet(workbook);
  first.name = "Report A";
  const second = createSheet("Report B", "report-b");
  const hidden = createSheet("Hidden report", "hidden-report");
  hidden.properties.hidden = true;
  insertSheet(workbook, second);
  insertSheet(workbook, hidden);
  const firstSetup = cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP);
  firstSetup.printArea = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
  firstSetup.rowBreaks = [2];
  const secondSetup = cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP);
  secondSetup.paperSize = "letter";
  secondSetup.orientation = "landscape";
  secondSetup.printArea = { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } };
  secondSetup.rowBreaks = [1];
  first.pageSetup = firstSetup;
  second.pageSetup = secondSetup;
  const sources: PrintSheetSource[] = [
    { sheet: second, evaluator: createSheetEvaluator(second), setup: secondSetup },
    {
      sheet: hidden,
      evaluator: createSheetEvaluator(hidden),
      setup: cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP),
    },
    { sheet: first, evaluator: createSheetEvaluator(first), setup: firstSetup },
  ];
  const before = serializeWorkbook(workbook);
  const wrapper = mount(PagePrintPreview, {
    props: {
      visible: true,
      sheet: first,
      evaluator: sources[2]!.evaluator,
      setup: firstSetup,
      workbookSheets: withWorkbook ? sources : undefined,
      workbookRevision: 0,
      fileName: "mixed-paper.xlsx",
      selection: { start: { row: 1, column: 0 }, end: { row: 1, column: 1 } },
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        TDialog: { template: '<section><slot /><slot name="footer" /></section>' },
        TButton: { template: "<button><slot /></button>" },
      },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, workbook, first, second, hidden, sources, firstSetup, secondSetup, before };
}
function numberInput(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"], label: string) {
  const input = wrapper
    .findAllComponents(InputNumber)
    .find((candidate) => candidate.vm.$attrs["aria-label"] === label);
  expect(input).toBeDefined();
  return input!;
}
async function setNumber(
  wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"],
  label: string,
  value: number,
) {
  numberInput(wrapper, label).vm.$emit("update:modelValue", value);
  await nextTick();
}
async function setScope(
  wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"],
  scope: "sheet" | "selection" | "workbook",
) {
  wrapper.getComponent(RadioGroup).vm.$emit("update:modelValue", scope);
  await flushPromises();
}
function button(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"], label: string) {
  const found = wrapper
    .findAll<HTMLButtonElement>("button")
    .find((candidate) => candidate.text() === label);
  expect(found).toBeDefined();
  return found!;
}
function popup() {
  const target = document.implementation.createHTMLDocument();
  const documentClose = vi.spyOn(target, "close").mockImplementation(() => {});
  const result = {
    document: target,
    closed: false,
    opener: {} as unknown,
    close: vi.fn(),
    addEventListener: vi.fn(),
    focus: vi.fn(),
    print: vi.fn(),
  };
  result.close.mockImplementation(() => {
    result.closed = true;
  });
  vi.spyOn(window, "open").mockReturnValue(result as unknown as Window);
  return { window: result, documentClose };
}

describe("whole workbook print preview", () => {
  test("preserves supplied visible-sheet order and independent settings/renderers with global preview page numbers", async () => {
    const f = await fixture();
    vi.mocked(createPrintPreviewDocument).mockClear();
    renderer.render.mockClear();
    await setScope(f.wrapper, "workbook");

    const captured = vi.mocked(createPrintPreviewDocument).mock.calls.map(([options]) => options);
    expect(captured.slice(0, 2).map(({ sheet }) => sheet.id)).toEqual(["report-b", "report-a"]);
    expect(captured.every(({ sheet }) => sheet !== f.hidden)).toBe(true);
    expect(captured.find(({ sheet }) => sheet === f.second)?.setup).toMatchObject({
      paperSize: "letter",
      orientation: "landscape",
      rowBreaks: [1],
    });
    expect(captured.find(({ sheet }) => sheet === f.first)?.setup).toMatchObject({
      paperSize: "a4",
      orientation: "portrait",
      rowBreaks: [2],
    });
    expect(numberInput(f.wrapper, "To page").props("modelValue")).toBe(4);
    expect(f.wrapper.get('[aria-label="Pages"]').text()).toContain("1 · Report B");
    expect(f.wrapper.get('[aria-label="Pages"]').text()).toContain("3 · Report A");
    const firstOwners = new Set(
      renderer.render.mock.calls
        .filter(([, request]) => request.document.sheet === f.first)
        .map(([owner]) => owner),
    );
    const secondOwners = new Set(
      renderer.render.mock.calls
        .filter(([, request]) => request.document.sheet === f.second)
        .map(([owner]) => owner),
    );
    expect(firstOwners.size).toBe(1);
    expect(secondOwners.size).toBe(1);
    expect([...firstOwners][0]).not.toBe([...secondOwners][0]);

    await button(f.wrapper, "Next page").trigger("click");
    await button(f.wrapper, "Next page").trigger("click");
    await flushPromises();
    expect(f.wrapper.get('[aria-label="Page preview"]').text()).toContain("Report A · Page 3 of 4");
    expect(renderer.render.mock.calls.at(-1)?.[1]).toMatchObject({
      document: { sheetName: "Report A" },
      page: { pageNumber: 1 },
    });
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
  });

  test("prints a global range crossing worksheets with each page's original paper dimensions", async () => {
    const f = await fixture();
    await setScope(f.wrapper, "workbook");
    await setNumber(f.wrapper, "From page", 2);
    await setNumber(f.wrapper, "To page", 3);
    const output = popup();
    renderer.render.mockClear();
    await button(f.wrapper, "Print").trigger("click");
    await flushPromises();

    const printed = renderer.render.mock.calls
      .map(([, request]) => request)
      .filter(({ density }) => density === 2);
    expect(printed.map(({ document, page }) => [document.sheet.id, page.pageNumber])).toEqual([
      ["report-b", 2],
      ["report-a", 1],
    ]);
    expect(writePrintOutput).toHaveBeenCalledTimes(1);
    const pages = vi.mocked(writePrintOutput).mock.calls[0]![2];
    expect(pages).toHaveLength(2);
    expect(pages[0]!.widthMm).toBeCloseTo(279.4);
    expect(pages[0]!.heightMm).toBeCloseTo(215.9);
    expect(pages[1]!.widthMm).toBeCloseTo(210);
    expect(pages[1]!.heightMm).toBeCloseTo(297);
    expect(output.window.document.querySelectorAll("img")).toHaveLength(2);
    expect(output.documentClose).toHaveBeenCalledTimes(1);
    expect(output.window.close).not.toHaveBeenCalled();
    const loaded = output.window.addEventListener.mock.calls.find(
      ([name]) => name === "load",
    )?.[1] as (() => void) | undefined;
    expect(loaded).toBeTypeOf("function");
    loaded!();
    expect(output.window.focus).toHaveBeenCalledTimes(1);
    expect(output.window.print).toHaveBeenCalledTimes(1);
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
  });

  test("restores the current worksheet and selection scopes without mutating either worksheet's page setup", async () => {
    const f = await fixture();
    await setScope(f.wrapper, "workbook");
    expect(button(f.wrapper, "Page setup").element.disabled).toBe(true);
    await setScope(f.wrapper, "sheet");
    expect(numberInput(f.wrapper, "From page").props("modelValue")).toBe(1);
    expect(numberInput(f.wrapper, "To page").props("modelValue")).toBe(2);
    expect(button(f.wrapper, "Page setup").element.disabled).toBe(false);
    expect(vi.mocked(createPrintPreviewDocument).mock.calls.at(-1)?.[0]).toMatchObject({
      sheetName: "Report A",
      setup: { printArea: f.firstSetup.printArea },
    });
    await setScope(f.wrapper, "selection");
    expect(numberInput(f.wrapper, "To page").props("modelValue")).toBe(1);
    expect(vi.mocked(createPrintPreviewDocument).mock.calls.at(-1)?.[0].setup?.printArea).toEqual({
      start: { row: 1, column: 0 },
      end: { row: 1, column: 1 },
    });
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
  });

  test("disables workbook scope when sources are unavailable or all worksheets are hidden", async () => {
    const f = await fixture(false);
    const option = f.wrapper
      .findAllComponents(Radio)
      .find((radio) => radio.props("value") === "workbook")!;
    expect(option.props("disabled")).toBe(true);
    await f.wrapper.setProps({ workbookSheets: [] });
    expect(option.props("disabled")).toBe(true);
    await f.wrapper.setProps({ workbookSheets: [f.sources[1]!] });
    expect(option.props("disabled")).toBe(true);
  });

  test("keeps printing unavailable while any worksheet's resources are preparing", async () => {
    renderer.ready = false;
    const f = await fixture();
    await setScope(f.wrapper, "workbook");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(button(f.wrapper, "Print").element.disabled).toBe(true);
    await button(f.wrapper, "Print").trigger("click");
    expect(open).not.toHaveBeenCalled();
    expect(writePrintOutput).not.toHaveBeenCalled();
  });

  test("disables output when a workbook worksheet's print resources fail to prepare", async () => {
    const f = await fixture();
    renderer.prepareImages.mockRejectedValueOnce(new Error("Workbook resource unavailable"));
    await setScope(f.wrapper, "workbook");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(button(f.wrapper, "Print").element.disabled).toBe(true);
    expect(
      f.wrapper
        .findAll('[role="alert"]')
        .some((alert) => alert.text().includes("Workbook resource unavailable")),
    ).toBe(true);
    await button(f.wrapper, "Print").trigger("click");
    expect(open).not.toHaveBeenCalled();
    expect(writePrintOutput).not.toHaveBeenCalled();
  });

  test("does not invoke system printing if the source revision changes after output closes but before its load callback", async () => {
    const f = await fixture();
    await setScope(f.wrapper, "workbook");
    const output = popup();
    await button(f.wrapper, "Print").trigger("click");
    await flushPromises();
    expect(output.documentClose).toHaveBeenCalledTimes(1);
    const loaded = output.window.addEventListener.mock.calls.find(
      ([name]) => name === "load",
    )?.[1] as (() => void) | undefined;
    expect(loaded).toBeTypeOf("function");
    await f.wrapper.setProps({ workbookRevision: 1 });
    await flushPromises();
    loaded!();

    expect(output.window.close).toHaveBeenCalledTimes(1);
    expect(output.window.focus).not.toHaveBeenCalled();
    expect(output.window.print).not.toHaveBeenCalled();
  });

  test.each(["scope", "source"] as const)(
    "stops an in-flight print job if its %s changes during resource preparation",
    async (change) => {
      const f = await fixture();
      await setScope(f.wrapper, "workbook");
      let finish!: () => void;
      renderer.prepareImages.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const output = popup();
      renderer.render.mockClear();
      await button(f.wrapper, "Print").trigger("click");
      expect(finish).toBeDefined();
      if (change === "scope")
        f.wrapper.getComponent(RadioGroup).vm.$emit("update:modelValue", "sheet");
      else {
        const replacement = createSheet("Replacement B", f.second.id);
        f.workbook.sheets.set(replacement.id, replacement);
        await f.wrapper.setProps({
          workbookSheets: [
            {
              sheet: replacement,
              evaluator: createSheetEvaluator(replacement),
              setup: f.secondSetup,
            },
            f.sources[2]!,
          ],
        });
      }
      await nextTick();
      finish();
      await flushPromises();

      expect(output.window.close).toHaveBeenCalledTimes(1);
      expect(writePrintOutput).not.toHaveBeenCalled();
      expect(output.documentClose).not.toHaveBeenCalled();
      expect(renderer.render.mock.calls.some(([, request]) => request.density === 2)).toBe(false);
    },
  );
});
