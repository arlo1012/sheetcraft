// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { createWorkbook, createSheetEvaluator, getActiveSheet } from "@sheetcraft/core/workbook";
import { cloneSheetPageSetup, DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import PagePrintPreview from "../../../modules/page-layout/components/PagePrintPreview.vue";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import { createAppI18n } from "../../../shared/i18n";

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
vi.mock("../../../modules/page-layout/page-print-renderer", async (original) => {
  const actual =
    await original<typeof import("../../../modules/page-layout/page-print-renderer")>();
  return {
    ...actual,
    createPrintPreviewDocument: vi.fn(actual.createPrintPreviewDocument),
    createPrintPreviewRenderer: () => renderer,
  };
});

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function fixture(withSelection = true) {
  const workbook = createWorkbook({ id: "print-controls", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const setup = cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP);
  setup.printArea = { start: { row: 0, column: 0 }, end: { row: 5, column: 1 } };
  setup.rowBreaks = [2, 4];
  sheet.pageSetup = setup;
  const selection = { start: { row: 1, column: 0 }, end: { row: 2, column: 1 } };
  const before = serializeWorkbook(workbook);
  const wrapper = mount(PagePrintPreview, {
    props: {
      visible: true,
      sheet,
      evaluator: createSheetEvaluator(sheet),
      setup,
      selection: withSelection ? selection : undefined,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        TDialog: { template: '<section><slot /><slot name="footer" /></section>' },
        TButton: { template: "<button><slot /></button>" },
      },
    },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return { wrapper, workbook, sheet, setup, selection, before };
}
function input(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"], label: string) {
  const result = wrapper
    .findAllComponents(InputNumber)
    .find((candidate) => candidate.vm.$attrs["aria-label"] === label);
  expect(result).toBeDefined();
  return result!;
}
async function setNumber(
  wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"],
  label: string,
  value: number,
) {
  input(wrapper, label).vm.$emit("update:modelValue", value);
  await nextTick();
}
function button(wrapper: Awaited<ReturnType<typeof fixture>>["wrapper"], label: string) {
  const result = wrapper
    .findAll<HTMLButtonElement>("button")
    .find((candidate) => candidate.text() === label);
  expect(result).toBeDefined();
  return result!;
}

describe("print preview controls", () => {
  test("previews the selection with a temporary print area and restores worksheet scope without changing page setup", async () => {
    const f = await fixture();
    const originalArea = structuredClone(f.setup.printArea);
    f.wrapper.getComponent(RadioGroup).vm.$emit("update:modelValue", "selection");
    await flushPromises();

    expect(vi.mocked(createPrintPreviewDocument).mock.calls.at(-1)?.[0].setup).toMatchObject({
      printArea: f.selection,
    });
    expect(f.setup.printArea).toEqual(originalArea);
    expect(f.sheet.pageSetup).toBe(f.setup);
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);

    f.wrapper.getComponent(RadioGroup).vm.$emit("update:modelValue", "sheet");
    await flushPromises();
    expect(vi.mocked(createPrintPreviewDocument).mock.calls.at(-1)?.[0].setup?.printArea).toEqual(
      originalArea,
    );
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
    expect(f.wrapper.emitted("pageSetup")).toBeUndefined();
  });

  test("disables selection scope when no selection is supplied", async () => {
    const f = await fixture(false);
    const selection = f.wrapper
      .findAllComponents(Radio)
      .find((radio) => radio.props("value") === "selection");
    expect(selection).toBeDefined();
    expect(selection!.props("disabled")).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
  });

  test.each([
    { name: "zero first page", from: 0, to: 1 },
    { name: "reversed range", from: 2, to: 1 },
    { name: "past the final page", from: 1, to: "pastEnd" },
    { name: "fractional page", from: 1.5, to: 2 },
    { name: "non-finite page", from: NaN, to: 1 },
  ])("rejects $name and recovers when the page range is corrected", async ({ from, to }) => {
    const f = await fixture();
    const count = Number(input(f.wrapper, "To page").props("modelValue"));
    expect(count).toBeGreaterThan(1);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await setNumber(f.wrapper, "From page", from);
    await setNumber(f.wrapper, "To page", to === "pastEnd" ? count + 1 : Number(to));

    expect(button(f.wrapper, "Print").element.disabled).toBe(true);
    expect(
      f.wrapper
        .findAll('[role="alert"]')
        .some((alert) => alert.text() === "Enter a valid page range."),
    ).toBe(true);
    await button(f.wrapper, "Print").trigger("click");
    expect(open).not.toHaveBeenCalled();

    await setNumber(f.wrapper, "From page", 1);
    await setNumber(f.wrapper, "To page", count);
    expect(button(f.wrapper, "Print").element.disabled).toBe(false);
    expect(
      f.wrapper
        .findAll('[role="alert"]')
        .some((alert) => alert.text() === "Enter a valid page range."),
    ).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
  });

  test("changes preview magnification without changing physical print scale or sheet setup", async () => {
    const f = await fixture();
    const originalScale = f.setup.scale;
    renderer.render.mockClear();
    await setNumber(f.wrapper, "Preview zoom (%)", 125);
    await flushPromises();

    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ scale: 1.25 }));
    expect(f.setup.scale).toBe(originalScale);
    expect(vi.mocked(createPrintPreviewDocument).mock.calls.at(-1)?.[0].setup?.scale).toBe(
      originalScale,
    );
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);
    expect(f.wrapper.emitted("pageSetup")).toBeUndefined();
  });

  test("emits pageSetup only from its explicit enabled action", async () => {
    const f = await fixture();
    expect(f.wrapper.emitted("pageSetup")).toBeUndefined();
    await button(f.wrapper, "Page setup").trigger("click");
    expect(f.wrapper.emitted("pageSetup")).toEqual([[]]);
    expect(serializeWorkbook(f.workbook)).toEqual(f.before);

    await f.wrapper.setProps({ setupDisabled: true });
    expect(button(f.wrapper, "Page setup").element.disabled).toBe(true);
    await button(f.wrapper, "Page setup").trigger("click");
    expect(f.wrapper.emitted("pageSetup")).toEqual([[]]);
  });
});
