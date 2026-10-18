import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheet, createSheetEvaluator, createWorkbook } from "@sheetcraft/core/workbook";
import {
  createChartPrintFontLease,
  type ChartPrintFontLease,
} from "../../../modules/charts/chart-print-fonts";
import type {
  ChartPrintPresentation,
  renderChartPrintPresentation,
} from "../../../modules/charts/chart-print-presentation";
import {
  capturePrintChartPass,
  ChartPrintUnavailableError,
  type PrintChartEntry,
  type PrintChartPass,
} from "../../../modules/page-layout/page-print-charts";
import {
  createPrintChartPixels,
  getPrintChartFontStacks,
} from "../../../modules/page-layout/page-print-chart-pixels";
import { ensureCellFontResource } from "../../../shared/cell-text/font-resources";

vi.mock("../../../shared/cell-text/font-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/cell-text/font-resources")>()),
  ensureCellFontResource: vi.fn(async () => undefined),
}));

const family = '"Noto Sans", serif';
const current = { isCurrent: () => true };
const viewport = { x: 10, y: 12, width: 1000, height: 1000 };
const consumers: ReturnType<typeof createPrintChartPixels>[] = [];

function chart(index: number): SheetChartDrawing {
  return {
    id: `chart-${index}`,
    name: `Chart ${index}`,
    kind: "chart",
    anchor: { row: 0, column: 0 },
    offsetX: 20 + index * 240,
    offsetY: 30,
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
    rotation: index === 0 ? 37 : 0,
    chart: {
      type: "column",
      range: null,
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: `series-${index}`,
            colorIndex: index,
            name: { kind: "literal", text: "Revenue" },
            values: { kind: "literal", values: [1, 0, -3] },
          },
        ],
      },
      format: {
        title: { fontFamily: family },
        categoryAxis: { text: { fontFamily: family } },
        valueAxis: { text: { fontFamily: family } },
        secondaryValueAxis: { text: { fontFamily: family } },
      },
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(count = 1, onInvalidate?: () => void) {
  const sheet = createSheet("Chart print pixels", "sheet");
  sheet.drawings = Array.from({ length: count }, (_, index) => chart(index));
  const metrics = createPictureSheetMetrics(sheet);
  const evaluator = createSheetEvaluator(sheet);
  const capture = () => capturePrintChartPass({ sheet, metrics, evaluator, revision: 17 });
  const pass = capture();
  const registered = new Set([{ family: "Noto Sans", status: "loaded" } as FontFace]);
  const fonts = Object.assign(new EventTarget(), {
    ready: Promise.resolve(),
    [Symbol.iterator]: () => registered[Symbol.iterator](),
  });
  const addListener = vi.spyOn(fonts, "addEventListener");
  const removeListener = vi.spyOn(fonts, "removeEventListener");
  const computedFont = vi.fn(() => ({ fontFamily: "Arial, sans-serif" }));
  const native = {
    fonts,
    body: {},
    documentElement: {},
    defaultView: { navigator: { platform: "Linux" }, getComputedStyle: computedFont },
  } as unknown as Document;
  const originalFontSet = native.fonts;
  const leases: ReturnType<typeof makeLease>[] = [];
  const presentations: ChartPrintPresentation[] = [];
  const steps: string[] = [];

  function makeLease() {
    let prepared = false,
      disposed = false;
    let snapshot: FontFace[] = [];
    let stacks: readonly string[] = [];
    const lease = {
      prepare: vi.fn<ChartPrintFontLease["prepare"]>(async (input) => {
        steps.push("fonts-ready");
        snapshot = [...registered];
        stacks = input;
        prepared = true;
      }),
      assertCurrent: vi.fn(() => {
        if (
          !prepared ||
          disposed ||
          native.fonts !== originalFontSet ||
          snapshot.length !== registered.size ||
          snapshot.some((face) => !registered.has(face))
        )
          throw new Error("Chart print font registry changed.");
      }),
      mapFamily: vi.fn((input: string) => {
        lease.assertCurrent();
        if (!stacks.includes(input)) throw new Error("Font stack was not prepared.");
        return input === family ? '"SheetcraftPrint_Test", serif' : input;
      }),
      dispose: vi.fn(() => {
        disposed = true;
        steps.push("fonts-disposed");
      }),
    };
    return lease;
  }

  const createFonts = vi.fn((document: Document) => {
    expect(document).toBe(native);
    const lease = makeLease();
    leases.push(lease);
    return lease;
  });
  const render = vi.fn<typeof renderChartPrintPresentation>((_drawing, _data, options) => {
    steps.push("render");
    const canvas = {
      width: Math.ceil(options.width * options.density),
      height: Math.ceil(options.height * options.density),
    } as HTMLCanvasElement;
    const presentation = {
      canvas,
      dispose: vi.fn(() => {
        canvas.width = canvas.height = 0;
        steps.push("pixels-disposed");
      }),
    };
    presentations.push(presentation);
    return presentation;
  });
  const consumer = createPrintChartPixels({ document: native, createFonts, render, onInvalidate });
  consumers.push(consumer);
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return {
    sheet,
    pass,
    capture,
    native,
    fonts,
    registered,
    addListener,
    removeListener,
    computedFont,
    leases,
    presentations,
    steps,
    createFonts,
    render,
    consumer,
    context,
  };
}

function withEntries(pass: PrintChartPass, entries: readonly PrintChartEntry[]): PrintChartPass {
  return { ...pass, entries, key: `${pass.key}:test-entries` };
}

beforeEach(() => {
  vi.mocked(ensureCellFontResource).mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  for (const consumer of consumers.splice(0)) consumer.dispose();
});

describe("native Chart pixel batch ownership", () => {
  test("warms selected resources and one font lease before any renderer uses its consistent alias", async () => {
    const f = fixture(2),
      before = JSON.stringify(f.sheet.drawings),
      gate = deferred();
    const mapped: string[] = [],
      original = f.render.getMockImplementation()!;
    f.render.mockImplementation((drawing, data, options) => {
      const index = mapped.length;
      expect(drawing).toBe(f.pass.entries[index]!.drawing);
      expect(data).toBe(f.pass.entries[index]!.data);
      expect(options).toMatchObject({ document: f.native, width: 192, height: 96, density: 2 });
      mapped.push(options.resolveFontFamily!(family));
      return original(drawing, data, options);
    });
    vi.mocked(ensureCellFontResource).mockImplementation(async () => {
      await gate.promise;
      f.steps.push("resource-ready");
    });
    const preparing = f.consumer.prepare(f.pass, 2, current);
    await vi.waitFor(() => expect(ensureCellFontResource).toHaveBeenCalledOnce());
    expect(f.createFonts).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
    gate.resolve();
    await preparing;
    expect(ensureCellFontResource).toHaveBeenCalledWith("Noto Sans");
    expect(f.createFonts).toHaveBeenCalledOnce();
    expect(f.leases[0]!.prepare).toHaveBeenCalledWith(
      ["sans-serif", "Arial, sans-serif", family],
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
    expect(f.steps).toEqual(["resource-ready", "fonts-ready", "render", "render"]);
    expect(mapped).toEqual(['"SheetcraftPrint_Test", serif', '"SheetcraftPrint_Test", serif']);
    expect(f.consumer.isReady(f.pass, 2)).toBe(true);
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  });

  test("publishes the whole batch atomically and reuses it for equivalent pagination at lower density", async () => {
    const f = fixture(2),
      original = f.render.getMockImplementation()!;
    f.render.mockImplementation((...args) => {
      expect(f.consumer.isReady(f.pass, 2)).toBe(false);
      return original(...args);
    });
    await f.consumer.prepare(f.pass, 2, current);
    const rebuilt = f.capture();
    expect(rebuilt).not.toBe(f.pass);
    expect(f.consumer.isReady(rebuilt, 1)).toBe(true);
    await f.consumer.prepare(rebuilt, 1, current);
    expect(f.render).toHaveBeenCalledTimes(2);
    expect(f.leases).toHaveLength(1);
    expect(f.presentations[0]!.canvas).not.toBe(f.presentations[1]!.canvas);
    for (const entry of rebuilt.entries) f.consumer.paint(f.context, rebuilt, entry, viewport);
    expect(vi.mocked(f.context.drawImage).mock.calls.map(([canvas]) => canvas)).toEqual(
      f.presentations.map(({ canvas }) => canvas),
    );
    expect(f.consumer.isReady(rebuilt, 3)).toBe(false);
  });

  test("a higher-density replacement releases the previous pixels and font lease before rendering", async () => {
    const f = fixture();
    await f.consumer.prepare(f.pass, 1, current);
    const previous = f.presentations[0]!,
      font = f.leases[0]!;
    await f.consumer.prepare(f.pass, 2, current);
    expect(previous.dispose).toHaveBeenCalledOnce();
    expect(font.dispose).toHaveBeenCalledOnce();
    expect(f.steps).toEqual([
      "fonts-ready",
      "render",
      "pixels-disposed",
      "fonts-disposed",
      "fonts-ready",
      "render",
    ]);
    expect(f.consumer.isReady(f.pass, 2)).toBe(true);
    f.consumer.clear();
    expect(f.presentations[1]!.dispose).toHaveBeenCalledOnce();
    expect(f.leases[1]!.dispose).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(f.pass)).toBe(false);
  });

  test("a replaced real source owner invalidates equal-content pixels", async () => {
    const f = fixture();
    await f.consumer.prepare(f.pass, 1, current);
    f.sheet.drawings![0] = structuredClone(f.sheet.drawings![0]!);
    const replacement = f.capture();
    expect(f.consumer.isReady(replacement)).toBe(false);
    expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    await f.consumer.prepare(replacement, 1, current);
    expect(f.consumer.isReady(replacement)).toBe(true);
    expect(f.render).toHaveBeenCalledTimes(2);
  });

  test("superseding async requests wait for stale font preparation to release ownership", async () => {
    const f = fixture(),
      gate = deferred(),
      original = f.createFonts.getMockImplementation()!;
    f.createFonts.mockImplementationOnce((document) => {
      const lease = original(document),
        prepare = lease.prepare.getMockImplementation()!;
      lease.prepare.mockImplementation(async (...args) => {
        await gate.promise;
        await prepare(...args);
      });
      return lease;
    });
    const first = f.consumer.prepare(f.pass, 1, current);
    const firstResult = first.catch((error: unknown) => error);
    await vi.waitFor(() => expect(f.leases[0]!.prepare).toHaveBeenCalledOnce());
    const root = f.sheet.drawings![0]!;
    if (root.kind !== "chart") throw new Error("fixture");
    root.chart.title = "Revised sales";
    const replacement = f.capture();
    const second = f.consumer.prepare(replacement, 2, current);
    expect(f.createFonts).toHaveBeenCalledOnce();
    expect(f.render).not.toHaveBeenCalled();
    gate.resolve();
    expect(await firstResult).toBeInstanceOf(ChartPrintUnavailableError);
    await second;
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.createFonts).toHaveBeenCalledTimes(2);
    expect(f.render).toHaveBeenCalledOnce();
    expect(f.steps.indexOf("fonts-disposed")).toBeLessThan(f.steps.indexOf("render"));
    expect(f.consumer.isReady(replacement, 2)).toBe(true);
  });

  test.each(["clear", "dispose"] as const)(
    "%s cancels pending fonts and prevents publishing pixels",
    async (action) => {
      const f = fixture(),
        gate = deferred();
      vi.mocked(ensureCellFontResource).mockReturnValueOnce(gate.promise);
      const preparing = f.consumer.prepare(f.pass, 1, current);
      const result = preparing.catch((error: unknown) => error);
      await vi.waitFor(() => expect(ensureCellFontResource).toHaveBeenCalledOnce());
      f.consumer[action]();
      gate.resolve();
      expect(await result).toBeInstanceOf(ChartPrintUnavailableError);
      expect(f.createFonts).not.toHaveBeenCalled();
      expect(f.render).not.toHaveBeenCalled();
      expect(f.consumer.isReady(f.pass)).toBe(false);
    },
  );

  test("caller invalidation during rendering releases partial pixels and the lease", async () => {
    const f = fixture(2),
      original = f.render.getMockImplementation()!;
    let valid = true;
    f.render.mockImplementation((...args) => {
      const pixel = original(...args);
      valid = false;
      return pixel;
    });
    await expect(f.consumer.prepare(f.pass, 1, { isCurrent: () => valid })).rejects.toThrow(
      /outdated/i,
    );
    expect(f.render).toHaveBeenCalledOnce();
    expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(f.pass)).toBe(false);
  });
});

describe("bounded Chart pixel preparation failures", () => {
  test.each([
    ["zero width", 0, 96],
    ["negative height", 192, -1],
    ["subpixel width", 0.1, 96],
    ["NaN width", Number.NaN, 96],
    ["infinite height", 192, Number.POSITIVE_INFINITY],
    ["missing width", undefined, 96],
    ["missing height", 192, undefined],
    ["edge budget", 16385, 1],
    ["pixel budget", 4096, 2049],
  ])("rejects %s before creating fonts or render surfaces", async (_label, width, height) => {
    const f = fixture(),
      entry = f.pass.entries[0]!;
    const invalid = withEntries(f.pass, [
      { ...entry, rect: { ...entry.rect, width, height } } as PrintChartEntry,
    ]);
    await expect(f.consumer.prepare(invalid, 1, current)).rejects.toThrow();
    expect(f.createFonts).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
    expect(ensureCellFontResource).not.toHaveBeenCalled();
    expect(f.consumer.isReady(invalid)).toBe(false);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 8.01])(
    "rejects density %s before allocation",
    async (density) => {
      const f = fixture();
      await expect(f.consumer.prepare(f.pass, density, current)).rejects.toThrow();
      expect(f.createFonts).not.toHaveBeenCalled();
      expect(f.render).not.toHaveBeenCalled();
      expect(f.consumer.isReady(f.pass, density)).toBe(false);
    },
  );

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 8.01])(
    "does not let cached pixels bypass invalid density %s",
    async (density) => {
      const f = fixture();
      await f.consumer.prepare(f.pass, 2, current);
      expect(f.consumer.isReady(f.pass, density)).toBe(false);
      await expect(f.consumer.prepare(f.pass, density, current)).rejects.toThrow();
      expect(f.render).toHaveBeenCalledOnce();
      expect(() =>
        f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport, density),
      ).toThrow(ChartPrintUnavailableError);
      expect(f.context.drawImage).not.toHaveBeenCalled();
    },
  );

  test("rejects a sheet-wide retained budget before allocating any member of the batch", async () => {
    const f = fixture(3);
    const pass = withEntries(
      f.pass,
      f.pass.entries.map((entry) => ({
        ...entry,
        rect: { ...entry.rect, width: 2048, height: 2048 },
      })),
    );
    await expect(f.consumer.prepare(pass, 1, current)).rejects.toThrow(/32 MiB/);
    expect(f.createFonts).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
    expect(ensureCellFontResource).not.toHaveBeenCalled();
  });

  test("accepts the exact retained and transient canvas budget boundary", async () => {
    const f = fixture(),
      entry = f.pass.entries[0]!;
    const pass = withEntries(f.pass, [
      { ...entry, rect: { ...entry.rect, width: 4096, height: 2048 } },
    ]);
    await f.consumer.prepare(pass, 1, current);
    expect(f.render).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(pass)).toBe(true);
  });

  test("a renderer failure rejects the entire batch and disposes every completed surface", async () => {
    const f = fixture(3),
      original = f.render.getMockImplementation()!;
    f.render
      .mockImplementationOnce(original)
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        throw new Error("native renderer unavailable");
      });
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(
      /native renderer unavailable/,
    );
    expect(f.presentations).toHaveLength(2);
    for (const pixel of f.presentations) {
      expect(pixel.dispose).toHaveBeenCalledOnce();
      expect(pixel.canvas.width).toBe(0);
    }
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(f.pass)).toBe(false);
    expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport)).toThrow(
      ChartPrintUnavailableError,
    );
  });

  test("wrong renderer dimensions are rejected and disposed before pixels become ready", async () => {
    const f = fixture(),
      original = f.render.getMockImplementation()!;
    f.render.mockImplementation((...args) => {
      const pixel = original(...args);
      pixel.canvas.width++;
      return pixel;
    });
    await expect(f.consumer.prepare(f.pass, 2, current)).rejects.toThrow(/captured dimensions/);
    expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(f.pass)).toBe(false);
  });

  test("duplicate ownership rejects and releases the partial batch", async () => {
    const f = fixture(),
      entry = f.pass.entries[0]!;
    const duplicated = withEntries(f.pass, [entry, { ...entry }]);
    await expect(f.consumer.prepare(duplicated, 1, current)).rejects.toThrow(
      /ownership is duplicated/,
    );
    expect(f.render).toHaveBeenCalledOnce();
    expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(duplicated)).toBe(false);
  });

  test("font lease preparation failure never renders or publishes a partial batch", async () => {
    const f = fixture(2),
      original = f.createFonts.getMockImplementation()!;
    f.createFonts.mockImplementation((document) => {
      const lease = original(document);
      lease.prepare.mockRejectedValueOnce(new Error("verified font bytes unavailable"));
      return lease;
    });
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(
      /verified font bytes unavailable/,
    );
    expect(f.render).not.toHaveBeenCalled();
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.consumer.isReady(f.pass)).toBe(false);
  });

  test.each(["resource", "factory"] as const)(
    "%s failure remains a typed print failure before any pixel allocation",
    async (stage) => {
      const f = fixture(),
        failure = new Error(`${stage} unavailable`);
      if (stage === "resource") vi.mocked(ensureCellFontResource).mockRejectedValueOnce(failure);
      else
        f.createFonts.mockImplementationOnce(() => {
          throw failure;
        });
      const result = await f.consumer.prepare(f.pass, 1, current).catch((error: unknown) => error);
      expect(result).toBeInstanceOf(ChartPrintUnavailableError);
      expect(result).toMatchObject({ cause: failure, drawingIds: ["chart-0"] });
      expect(f.render).not.toHaveBeenCalled();
      expect(f.leases).toHaveLength(0);
      expect(f.consumer.isReady(f.pass)).toBe(false);
    },
  );

  test("an empty real capture needs no fonts or native renderer", async () => {
    const f = fixture(0);
    expect(f.consumer.isReady(f.pass)).toBe(true);
    await f.consumer.prepare(f.pass, 1, current);
    expect(f.createFonts).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
  });
});

describe("Chart pixel paint and font invalidation", () => {
  test("positions rotated pixels in the viewport and clips before painting", async () => {
    const f = fixture();
    await f.consumer.prepare(f.pass, 2, current);
    f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport, 1);
    expect(vi.mocked(f.context.translate).mock.calls).toEqual([
      [106, 66],
      [-96, -48],
    ]);
    expect(f.context.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(f.context.rect).toHaveBeenCalledWith(0, 0, 192, 96);
    expect(f.context.drawImage).toHaveBeenCalledWith(f.presentations[0]!.canvas, 0, 0, 192, 96);
    expect(vi.mocked(f.context.clip).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(f.context.drawImage).mock.invocationCallOrder[0]!,
    );
    expect(f.context.save).toHaveBeenCalledOnce();
    expect(f.context.restore).toHaveBeenCalledOnce();
  });

  test("off-page pixels are skipped only after ownership and readiness are checked", async () => {
    const f = fixture(),
      offPage = { x: 2000, y: 2000, width: 100, height: 100 };
    expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, offPage)).toThrow(
      /not ready/,
    );
    await f.consumer.prepare(f.pass, 1, current);
    f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, offPage);
    expect(f.context.save).not.toHaveBeenCalled();
    expect(f.context.drawImage).not.toHaveBeenCalled();
    expect(() => f.consumer.paint(f.context, f.pass, { ...f.pass.entries[0]! }, offPage)).toThrow(
      /missing/,
    );
  });

  test("a ready batch cannot silently skip an entry with an unowned pixel source", async () => {
    const f = fixture();
    await f.consumer.prepare(f.pass, 1, current);
    const entry = { ...f.pass.entries[0]!, sourceRoot: chart(99) };
    expect(() => f.consumer.paint(f.context, f.pass, entry, viewport)).toThrow(/missing/);
    expect(f.context.drawImage).not.toHaveBeenCalled();
  });

  test("restores the destination context when painting throws", async () => {
    const f = fixture();
    await f.consumer.prepare(f.pass, 1, current);
    vi.mocked(f.context.drawImage).mockImplementationOnce(() => {
      throw new Error("destination unavailable");
    });
    expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport)).toThrow(
      /destination unavailable/,
    );
    expect(f.context.restore).toHaveBeenCalledOnce();
  });

  test.each(["loading", "loadingdone", "loadingerror"])(
    "%s invalidates changed font identities and releases pixels",
    async (event) => {
      const invalidated = vi.fn(),
        f = fixture(1, invalidated);
      await f.consumer.prepare(f.pass, 1, current);
      const face = [...f.registered][0]!;
      f.registered.delete(face);
      f.registered.add({ ...face } as FontFace);
      f.fonts.dispatchEvent(new Event(event));
      await Promise.resolve();
      expect(invalidated).toHaveBeenCalledOnce();
      expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
      expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
      expect(f.consumer.isReady(f.pass)).toBe(false);
      expect(() => f.consumer.paint(f.context, f.pass, f.pass.entries[0]!, viewport)).toThrow(
        /not ready/,
      );
      f.fonts.dispatchEvent(new Event(event));
      await Promise.resolve();
      expect(invalidated).toHaveBeenCalledOnce();
    },
  );

  test("a real lease delayed completion event notifies after later lease observers, even if readiness was already inspected", async () => {
    const f = fixture();
    const source = f.sheet.drawings?.[0];
    if (!source || source.kind !== "chart") throw new Error("Missing chart owner.");
    delete source.chart.format;
    const pass = f.capture(),
      invalidated = vi.fn();
    const original = Object.getOwnPropertyDescriptor(document, "fonts");
    const registry = new Set<FontFace>();
    const fontSet = Object.assign(new EventTarget(), {
      status: "loaded",
      has: (face: FontFace) => registry.has(face),
      delete: (face: FontFace) => registry.delete(face),
      [Symbol.iterator]: () => registry[Symbol.iterator](),
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: fontSet });
    vi.stubGlobal("FontFace", class {});
    const consumer = createPrintChartPixels({
      document,
      createFonts: createChartPrintFontLease,
      render: f.render,
      onInvalidate: invalidated,
    });
    consumers.push(consumer);
    try {
      await consumer.prepare(pass, 1, current);
      expect(consumer.isReady(pass)).toBe(true);
      fontSet.dispatchEvent(new Event("loadingdone"));
      expect(consumer.isReady(pass)).toBe(false);
      await Promise.resolve();
      expect(invalidated).toHaveBeenCalledOnce();
      expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    } finally {
      consumer.dispose();
      vi.unstubAllGlobals();
      if (original) Object.defineProperty(document, "fonts", original);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
  test("cold escaped font stacks warm the exact decoded source before lease preparation", async () => {
    const f = fixture();
    const source = f.sheet.drawings?.[0];
    if (!source || source.kind !== "chart") throw new Error("Missing chart owner.");
    source.chart.format = { title: { fontFamily: '"noto\\20 sans math", serif' } };
    await f.consumer.prepare(f.capture(), 1, current);
    expect(ensureCellFontResource).toHaveBeenCalledWith("Noto Sans Math");
    expect(ensureCellFontResource).not.toHaveBeenCalledWith("Noto20 Sans Math");
    expect(f.createFonts).toHaveBeenCalledOnce();
  });

  test("legend-only escaped font stacks warm the decoded font before print preparation", async () => {
    const f = fixture();
    const source = f.sheet.drawings?.[0];
    if (!source || source.kind !== "chart") throw new Error("Missing chart owner.");
    source.chart.format = { legend: { text: { fontFamily: '"noto\\20 sans math", serif' } } };
    await f.consumer.prepare(f.capture(), 1, current);
    expect(ensureCellFontResource).toHaveBeenCalledWith("Noto Sans Math");
    expect(ensureCellFontResource).not.toHaveBeenCalledWith("Noto20 Sans Math");
    expect(f.createFonts).toHaveBeenCalledOnce();
  });

  test("unrelated font events preserve a still-current font lease", async () => {
    const invalidated = vi.fn(),
      f = fixture(1, invalidated);
    await f.consumer.prepare(f.pass, 1, current);
    for (const event of ["loading", "loadingdone", "loadingerror"])
      f.fonts.dispatchEvent(new Event(event));
    await Promise.resolve();
    expect(invalidated).not.toHaveBeenCalled();
    expect(f.consumer.isReady(f.pass)).toBe(true);
    expect(f.presentations[0]!.dispose).not.toHaveBeenCalled();
  });

  test("isReady detects replacement of the FontFaceSet without waiting for an event", async () => {
    const f = fixture();
    await f.consumer.prepare(f.pass, 1, current);
    Object.assign(f.native, { fonts: new EventTarget() });
    expect(f.consumer.isReady(f.pass)).toBe(false);
    expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    f.consumer.dispose();
    expect(f.removeListener.mock.calls).toEqual(f.addListener.mock.calls);
  });

  test("dispose is idempotent, releases owned assets and unregisters every font listener", async () => {
    const invalidated = vi.fn(),
      f = fixture(1, invalidated);
    await f.consumer.prepare(f.pass, 1, current);
    expect(f.addListener.mock.calls.map(([event]) => event)).toEqual([
      "loading",
      "loadingdone",
      "loadingerror",
    ]);
    f.consumer.dispose();
    f.consumer.dispose();
    expect(f.presentations[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.leases[0]!.dispose).toHaveBeenCalledOnce();
    expect(f.removeListener.mock.calls).toEqual(f.addListener.mock.calls);
    f.fonts.dispatchEvent(new Event("loading"));
    await Promise.resolve();
    expect(invalidated).not.toHaveBeenCalled();
    expect(f.consumer.isReady(f.pass)).toBe(false);
    await expect(f.consumer.prepare(f.pass, 1, current)).rejects.toThrow(/outdated/);
  });
});

test("print preheat includes all script families resolved against the captured workbook theme", () => {
  const sheet = createSheet("Fonts", "fonts");
  const drawing = chart(0);
  drawing.chart.format = {
    title: {
      scriptFonts: {
        latin: { kind: "theme", role: "minor", slot: "latin" },
        eastAsia: { kind: "family", family: "宋体" },
        complexScript: { kind: "automatic" },
      },
    },
  };
  sheet.drawings = [drawing];
  const theme = createWorkbook({ id: "font-theme", sheetId: "font-sheet" }).theme;
  theme.bodyFont = "Inter";
  const pass = capturePrintChartPass({
    sheet,
    metrics: createPictureSheetMetrics(sheet),
    evaluator: createSheetEvaluator(sheet),
    theme,
  });
  expect(getPrintChartFontStacks(pass, document)).toEqual(
    expect.arrayContaining(["Inter", "宋体"]),
  );
});
