import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createSheetEvaluator,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import PagePrintPreview from "../../../modules/page-layout/components/PagePrintPreview.vue";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import * as chartFonts from "../../../modules/charts/chart-print-fonts";
import * as chartPresentation from "../../../modules/charts/chart-print-presentation";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createAppI18n } from "../../../shared/i18n";

const messageError = vi.hoisted(() => vi.fn());
vi.mock("tdesign-vue-next/es/message", () => ({ MessagePlugin: { error: messageError } }));

type NativeFontLease = {
  invalid: boolean;
  disposed: boolean;
  dispose: ReturnType<typeof vi.fn>;
};
type CanvasRecord = { copies: string[] };
const wrappers: VueWrapper[] = [];
let nativeFontPreparation: ReturnType<typeof vi.fn<chartFonts.ChartPrintFontLease["prepare"]>>;
let nativeFonts: NativeFontLease[];
let canvases: WeakMap<HTMLCanvasElement, CanvasRecord>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

/** Only the DOM canvas boundary is synthetic. All page, shape and chart dispatch is real. */
function nativeCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const record = { copies: [] as string[] };
  canvases.set(canvas, record);
  let paintedPixels: ImageData | undefined;
  let painted = false;
  const imageData = (width: number, height: number, opaque = false) => {
    const data = new Uint8ClampedArray(width * height * 4);
    if (opaque) data.fill(255);
    return { width, height, data, colorSpace: "srgb" } as ImageData;
  };
  const state: Partial<CanvasRenderingContext2D> = {
    canvas,
    font: "11px sans-serif",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) as DOMMatrix,
    getLineDash: () => [],
    measureText: (text) =>
      ({
        width: text.length * 6,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text.length * 6,
      }) as TextMetrics,
    createLinearGradient: () => ({ addColorStop() {} }) as CanvasGradient,
    createRadialGradient: () => ({ addColorStop() {} }) as CanvasGradient,
    fill: () => {
      painted = true;
    },
    fillRect: () => {
      painted = true;
    },
    stroke: () => {
      painted = true;
    },
    getImageData: (_x, _y, width, height) =>
      paintedPixels?.width === width && paintedPixels.height === height
        ? paintedPixels
        : imageData(width, height, painted),
    createImageData: ((width: number, height: number) =>
      imageData(width, height)) as CanvasRenderingContext2D["createImageData"],
    putImageData: (pixels) => {
      paintedPixels = pixels;
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        if (pixels.data[offset + 3]) {
          canvas.dataset.shapeColor = `#${Array.from(pixels.data.slice(offset, offset + 3), (value) => value.toString(16).padStart(2, "0")).join("")}`;
          break;
        }
      }
    },
    drawImage: (source) => {
      if (source instanceof HTMLCanvasElement) {
        const label = source.dataset.chartId ?? source.dataset.shapeColor;
        if (label) record.copies.push(label);
      }
    },
  };
  return new Proxy(state, {
    get(target, field) {
      if (!(field in target) && typeof field === "string") Reflect.set(target, field, vi.fn());
      return Reflect.get(target, field);
    },
  }) as CanvasRenderingContext2D;
}

beforeEach(() => {
  nativeFonts = [];
  canvases = new WeakMap();
  nativeFontPreparation = vi.fn<chartFonts.ChartPrintFontLease["prepare"]>(async () => {});
  messageError.mockReset();
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    if (contextId !== "2d") return null;
    let context = contexts.get(this);
    if (!context) {
      context = nativeCanvasContext(this);
      contexts.set(this, context);
    }
    return context;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,cGFnZQ==",
  );
  vi.spyOn(chartFonts, "createChartPrintFontLease").mockImplementation((ownerDocument) => {
    expect(ownerDocument).toBe(document);
    const lease = { invalid: false, disposed: false, dispose: vi.fn() };
    nativeFonts.push(lease);
    let ready = false;
    let isCurrent = () => true;
    lease.dispose.mockImplementation(() => {
      lease.disposed = true;
    });
    return {
      prepare: async (stacks, owner) => {
        isCurrent = owner.isCurrent;
        await nativeFontPreparation(stacks, owner);
        ready = true;
      },
      mapFamily: (family) => family,
      assertCurrent: () => {
        if (!ready || lease.invalid || lease.disposed || !isCurrent())
          throw new Error("Native chart font lease is unavailable.");
      },
      dispose: lease.dispose,
    };
  });
  vi.spyOn(chartPresentation, "renderChartPrintPresentation").mockImplementation(
    (drawing, _data, options) => {
      const canvas = options.document.createElement("canvas");
      canvas.width = Math.ceil(options.width * options.density);
      canvas.height = Math.ceil(options.height * options.density);
      canvas.dataset.chartId = drawing.id;
      return {
        canvas,
        dispose: vi.fn(() => {
          canvas.width = canvas.height = 0;
        }),
      };
    },
  );
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

function chart(sheetId: string, id = "live-chart"): SheetChartDrawing {
  const vector = (column: number) => ({ start: { row: 1, column }, end: { row: 3, column } });
  return {
    id,
    name: "Revenue",
    kind: "chart",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 192,
    height: 96,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 0,
    color: "#000000",
    fontSize: 11,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: null,
      title: "Revenue",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "range", sheetId, range: vector(0) },
        series: [
          {
            id: "revenue-series",
            colorIndex: 6,
            name: { kind: "cell", sheetId, cell: { row: 0, column: 1 } },
            values: { kind: "range", sheetId, range: vector(1) },
          },
        ],
      },
    },
  };
}

function populate(sheet: Sheet) {
  [
    ["Region", "Revenue"],
    ["East", 10],
    ["West", 0],
    ["North", -2],
  ].forEach((row, rowIndex) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: rowIndex, column }, { kind: "literal", value }),
    ),
  );
}

function fixture() {
  const sheet = createSheet("Chart print", "sheet");
  populate(sheet);
  sheet.drawings = [chart(sheet.id)];
  return { sheet, evaluator: createSheetEvaluator(sheet) };
}

function mountPreview(
  sheet: Sheet,
  evaluator: SheetEvaluator = createSheetEvaluator(sheet),
  resolveChartSheet?: (id: string) => Sheet | undefined,
) {
  const wrapper = mount(PagePrintPreview, {
    props: {
      visible: true,
      sheet,
      evaluator,
      setup: DEFAULT_SHEET_PAGE_SETUP,
      workbookRevision: 0,
      fileName: "chart-source.xlsx",
      resolveChartSheet,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        TDialog: { template: '<section><slot /><slot name="footer" /></section>' },
        TButton: {
          props: ["disabled", "loading"],
          template: '<button :disabled="disabled || loading"><slot /></button>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function printButton(wrapper: ReturnType<typeof mountPreview>) {
  return wrapper.findAll<HTMLButtonElement>("button").find((button) => button.text() === "Print")!;
}

function popupFixture() {
  const popupDocument = document.implementation.createHTMLDocument("Print");
  const popup = {
    closed: false,
    document: popupDocument,
    close: vi.fn(),
    addEventListener: vi.fn(),
    focus: vi.fn(),
    print: vi.fn(),
    opener: window,
  };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  return { popupDocument, popup, open };
}

const expectedData: ChartData = {
  categories: ["East", "West", "North"],
  series: [{ id: "revenue-series", colorIndex: 6, name: "Revenue", values: [10, 0, -2] }],
  records: [
    ["East", 10],
    ["West", 0],
    ["North", -2],
  ],
};

describe("real PagePrintPreview Chart consumer", () => {
  test("live Chart source is captured for native preparation and pending fonts block the Print button", async () => {
    const f = fixture(),
      gate = deferred(),
      before = JSON.stringify(f.sheet.drawings);
    const captured = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: f.evaluator,
      nativeChartConsumer: true,
      nativeEquationConsumer: true,
    });
    expect(captured.chartPrintPass!.entries[0]!.data).toEqual(expectedData);
    nativeFontPreparation.mockImplementationOnce(() => gate.promise);
    const { open } = popupFixture(),
      wrapper = mountPreview(f.sheet, f.evaluator);
    await flushPromises();
    expect(nativeFontPreparation).toHaveBeenCalledWith(
      expect.arrayContaining(["sans-serif", "Arial, sans-serif"]),
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
    expect(wrapper.get('[role="status"]').text()).toMatch(/preparing.*chart/i);
    expect(wrapper.find("canvas").exists()).toBe(false);
    expect(printButton(wrapper).element.disabled).toBe(true);
    await printButton(wrapper).trigger("click");
    expect(open).not.toHaveBeenCalled();
    expect(chartPresentation.renderChartPrintPresentation).not.toHaveBeenCalled();
    gate.resolve();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(printButton(wrapper).element.disabled).toBe(false);
    const [drawing, data, options] = vi.mocked(chartPresentation.renderChartPrintPresentation).mock
      .calls[0]!;
    expect(drawing.id).toBe("live-chart");
    expect(drawing).not.toBe(f.sheet.drawings![0]);
    expect(data).toEqual(expectedData);
    expect(Object.isFrozen(data)).toBe(true);
    expect(options).toMatchObject({ document, width: 192, height: 96, density: 2 });
    const pageCanvas = wrapper.get<HTMLCanvasElement>(".page-print-preview__page canvas").element;
    expect(canvases.get(pageCanvas)!.copies).toEqual(["live-chart"]);
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  });

  test.each(["fonts", "pixels"] as const)(
    "failed native %s preparation gives Chart feedback and no popup or cell-only print",
    async (boundary) => {
      const f = fixture(),
        before = JSON.stringify(f.sheet.drawings);
      if (boundary === "fonts")
        nativeFontPreparation.mockRejectedValue(new Error("Verified native chart font failed"));
      else
        vi.mocked(chartPresentation.renderChartPrintPresentation).mockImplementation(() => {
          throw new Error("Native chart pixel render failed");
        });
      const { open } = popupFixture(),
        wrapper = mountPreview(f.sheet, f.evaluator);
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toMatch(/chart.*failed/i);
      expect(wrapper.find("canvas").exists()).toBe(false);
      expect(printButton(wrapper).element.disabled).toBe(true);
      await printButton(wrapper).trigger("click");
      expect(open).not.toHaveBeenCalled();
      expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
      expect(JSON.stringify(f.sheet.drawings)).toBe(before);
      expect(nativeFonts[0]!.dispose).toHaveBeenCalledOnce();
    },
  );

  test("resolved native Chart pixels reach actual final page images and the normal native-print load entry", async () => {
    const f = fixture(),
      before = JSON.stringify(f.sheet.drawings),
      { popup, popupDocument, open } = popupFixture();
    const wrapper = mountPreview(f.sheet, f.evaluator);
    await flushPromises();
    expect(printButton(wrapper).element.disabled).toBe(false);
    await printButton(wrapper).trigger("click");
    await flushPromises();
    expect(open).toHaveBeenCalledExactlyOnceWith("", "_blank");
    expect(popup.opener).toBeNull();
    expect(popup.close).not.toHaveBeenCalled();
    expect(popupDocument.title).toBe("chart-source.xlsx");
    expect(Array.from(popupDocument.querySelectorAll("img"), (image) => image.src)).toEqual([
      "data:image/png;base64,cGFnZQ==",
    ]);
    expect(popupDocument.body.textContent).not.toContain("Revenue");
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledExactlyOnceWith("image/png");
    const finalCanvas = vi.mocked(HTMLCanvasElement.prototype.toDataURL).mock
      .contexts[0] as HTMLCanvasElement;
    expect(canvases.get(finalCanvas)!.copies).toEqual(["live-chart"]);
    expect(popup.addEventListener).toHaveBeenCalledExactlyOnceWith("load", expect.any(Function), {
      once: true,
    });
    expect(popup.print).not.toHaveBeenCalled();
    expect(messageError).not.toHaveBeenCalled();
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  });

  test.each(["source", "revision", "sheet", "resolver"] as const)(
    "a %s change during final native preparation closes obsolete output before any print image",
    async (change) => {
      const f = fixture(),
        wrapper = mountPreview(f.sheet, f.evaluator),
        { popup, popupDocument } = popupFixture();
      await flushPromises();
      expect(printButton(wrapper).element.disabled).toBe(false);
      // A font-resource change can require a fresh final native lease even when
      // the displayed preview was ready. Keep the page transaction and gate real.
      nativeFonts[0]!.invalid = true;
      const gate = deferred();
      nativeFontPreparation.mockImplementationOnce(() => gate.promise);
      await printButton(wrapper).trigger("click");
      await flushPromises();
      expect(nativeFonts).toHaveLength(2);
      expect(popupDocument.querySelectorAll("img")).toHaveLength(0);
      if (change === "source")
        setCellContent(f.sheet, { row: 1, column: 1 }, { kind: "literal", value: 123 });
      else if (change === "revision") await wrapper.setProps({ workbookRevision: 1 });
      else if (change === "resolver")
        await wrapper.setProps({ resolveChartSheet: () => undefined });
      else {
        const replacement = createSheet("Replacement", "replacement");
        populate(replacement);
        replacement.drawings = [chart(replacement.id)];
        await wrapper.setProps({
          sheet: replacement,
          evaluator: createSheetEvaluator(replacement),
        });
      }
      await flushPromises();
      gate.resolve();
      await flushPromises();
      expect(popup.close).toHaveBeenCalledOnce();
      expect(popupDocument.querySelectorAll("img")).toHaveLength(0);
      expect(popup.addEventListener).not.toHaveBeenCalled();
      expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
      expect(nativeFonts[1]!.dispose).toHaveBeenCalledOnce();
      expect(
        vi
          .mocked(chartPresentation.renderChartPrintPresentation)
          .mock.calls.filter((call) => call[1].series[0]?.values[0] === 10),
      ).toHaveLength(change === "source" ? 1 : 2);
    },
  );

  test("the real preview and final print forward the cross-sheet resolver and keep source-series identity", async () => {
    const workbook = createWorkbook({ id: "cross-sheet-print", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook);
    const source = createSheet("Source", "source");
    workbook.sheets.set(source.id, source);
    populate(source);
    sheet.drawings = [chart(source.id)];
    const resolveSheet = vi.fn((id: string) => workbook.sheets.get(id));
    const evaluator = createWorkbookEvaluator(workbook, sheet.id),
      before = JSON.stringify(sheet.drawings);
    const { popup, popupDocument } = popupFixture(),
      wrapper = mountPreview(sheet, evaluator, resolveSheet);
    await flushPromises();
    expect(resolveSheet).toHaveBeenCalledWith(source.id);
    expect(printButton(wrapper).element.disabled).toBe(false);
    expect(chartPresentation.renderChartPrintPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "live-chart" }),
      expectedData,
      expect.any(Object),
    );
    await printButton(wrapper).trigger("click");
    await flushPromises();
    expect(popup.close).not.toHaveBeenCalled();
    expect(popupDocument.querySelectorAll("img")).toHaveLength(1);
    expect(messageError).not.toHaveBeenCalled();
    expect(JSON.stringify(sheet.drawings)).toBe(before);
  });

  test("hiding a pending mounted preview cancels its lease before late fonts can allocate pixels", async () => {
    const f = fixture(),
      gate = deferred();
    nativeFontPreparation.mockImplementationOnce(() => gate.promise);
    const wrapper = mountPreview(f.sheet, f.evaluator);
    await flushPromises();
    const lease = nativeFonts[0]!;
    expect(lease.dispose).not.toHaveBeenCalled();
    await wrapper.setProps({ visible: false });
    expect(lease.dispose).toHaveBeenCalledOnce();
    gate.resolve();
    await flushPromises();
    expect(lease.dispose).toHaveBeenCalledOnce();
    expect(chartPresentation.renderChartPrintPresentation).not.toHaveBeenCalled();
  });

  test("closing a ready mounted preview releases private fonts and pixels immediately", async () => {
    const f = fixture(),
      wrapper = mountPreview(f.sheet, f.evaluator);
    await flushPromises();
    const lease = nativeFonts[0]!;
    expect(lease.dispose).not.toHaveBeenCalled();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Close print preview")!
      .trigger("click");
    expect(lease.dispose).toHaveBeenCalledOnce();
    await wrapper.setProps({ visible: false });
    expect(lease.dispose).toHaveBeenCalledOnce();
  });

  test("actual root shape painting interleaves Chart pixels in worksheet order on the mounted page and final output", async () => {
    const f = fixture();
    const shape = (id: string, fill: string) => ({
      ...createGraphicDrawing(id, "shape", id, { row: 0, column: 0 }),
      width: 64,
      height: 32,
      fill,
      strokeWidth: 0,
    });
    f.sheet.drawings = [
      chart(f.sheet.id, "chart-before"),
      shape("shape-middle", "#123456"),
      chart(f.sheet.id, "chart-after"),
      shape("shape-last", "#abcdef"),
    ];
    const { popup } = popupFixture(),
      wrapper = mountPreview(f.sheet, f.evaluator);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(printButton(wrapper).element.disabled).toBe(false);
    const expectedOrder = ["chart-before", "#123456", "chart-after", "#abcdef"];
    const pageCanvas = wrapper.get<HTMLCanvasElement>(".page-print-preview__page canvas").element;
    expect(canvases.get(pageCanvas)!.copies).toEqual(expectedOrder);
    await printButton(wrapper).trigger("click");
    await flushPromises();
    expect(popup.close).not.toHaveBeenCalled();
    const finalCanvas = vi.mocked(HTMLCanvasElement.prototype.toDataURL).mock
      .contexts[0] as HTMLCanvasElement;
    expect(canvases.get(finalCanvas)!.copies).toEqual(expectedOrder);
    expect(messageError).not.toHaveBeenCalled();
  });
});
