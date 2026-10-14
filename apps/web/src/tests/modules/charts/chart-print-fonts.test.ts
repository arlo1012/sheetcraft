import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const local = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../../shared/cell-text/local-font-source", async () => {
  const errors = await import("../../../shared/cell-text/local-font-errors");
  return {
    LocalSymbolFontError: errors.LocalSymbolFontError,
    readLoadedLocalSymbolFontSource: local.read,
  };
});

type PrintModule = typeof import("../../../modules/charts/chart-print-fonts");
type ManagedModule = typeof import("../../../shared/cell-text/managed-fonts");
let module: PrintModule;
let managed: ManagedModule;
let fontSet: TestFontSet;
let faces: TestFace[];
let loadPrivate: (face: TestFace) => Promise<void>;
let fetchMock: ReturnType<typeof vi.fn>;
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

class TestFace {
  status: FontFaceLoadStatus = "unloaded";
  weight = "normal";
  style = "normal";
  stretch = "normal";
  unicodeRange = "U+0-10FFFF";
  featureSettings = "normal";
  variationSettings = "normal";
  display: FontDisplay = "auto";
  ascentOverride = "normal";
  descentOverride = "normal";
  lineGapOverride = "normal";
  constructor(
    public family: string,
    readonly source: string | ArrayBuffer,
    descriptor: FontFaceDescriptors = {},
  ) {
    Object.assign(this, descriptor);
    faces.push(this);
  }
  async load() {
    this.status = "loading";
    if (this.family.startsWith("SheetcraftPrint_")) await loadPrivate(this);
    this.status = "loaded";
    return this;
  }
}

class TestFontSet extends EventTarget {
  status: FontFaceSetLoadStatus = "loaded";
  readonly faces = new Set<FontFace>();
  readonly deleted: FontFace[] = [];
  add(face: FontFace) {
    this.faces.add(face);
    return this;
  }
  has(face: FontFace) {
    return this.faces.has(face);
  }
  delete(face: FontFace) {
    this.deleted.push(face);
    return this.faces.delete(face);
  }
  [Symbol.iterator]() {
    return this.faces[Symbol.iterator]();
  }
  emit(type: string, changed?: readonly TestFace[]) {
    const event = new Event(type);
    if (changed) Object.defineProperty(event, "fontfaces", { value: changed });
    this.dispatchEvent(event);
  }
}

function native(face: TestFace): FontFace {
  return face as unknown as FontFace;
}
function aliases() {
  return faces.filter((face) => face.family.startsWith("SheetcraftPrint_"));
}
function response(data = Uint8Array.of(1, 2, 3, 4), contentLength?: number): Response {
  return {
    ok: true,
    headers: new Headers(
      contentLength === undefined ? {} : { "content-length": String(contentLength) },
    ),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }),
  } as Response;
}
async function readyManaged(family = "Noto Sans Math") {
  await managed.ensureManagedCellFont(family);
  const face = faces.at(-1);
  if (!face) throw new Error("Expected managed source face");
  return face;
}
function readyLocal(id = "a".repeat(64), bytes = Uint8Array.of(7, 8, 9).buffer) {
  const family = `SheetcraftLocal_${id}`;
  const face = new TestFace(family, bytes, { weight: "500", display: "swap" });
  face.status = "loaded";
  fontSet.add(native(face));
  return { id, family, bytes, face: native(face) };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  faces = [];
  loadPrivate = async () => undefined;
  fontSet = new TestFontSet();
  Object.defineProperty(document, "fonts", { configurable: true, value: fontSet });
  vi.stubGlobal("FontFace", TestFace);
  fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
  local.read.mockResolvedValue(undefined);
  managed = await import("../../../shared/cell-text/managed-fonts");
  module = await import("../../../modules/charts/chart-print-fonts");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

describe("bounded native chart print font aliases", () => {
  test("private aliases cannot collide with an existing closer-weight native face", async () => {
    await readyManaged();
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      if (array instanceof Uint32Array) array.fill(0);
      return array;
    });
    const prefix = `SheetcraftPrint_${"0".repeat(32)}`;
    const foreign = new TestFace(`${prefix.toLowerCase()}_1`, Uint8Array.of(2).buffer, {
      weight: "700",
    });
    foreign.status = "loaded";
    fontSet.add(native(foreign));
    const lease = module.createChartPrintFontLease(document);
    await lease.prepare(["Noto Sans Math"], { isCurrent: () => true });
    expect(lease.mapFamily("Noto Sans Math")).not.toContain(`"${prefix}_1"`);
    expect(lease.mapFamily("Noto Sans Math")).toContain(`"${prefix}_2"`);
    lease.dispose();
    expect(fontSet.has(native(foreign))).toBe(true);
  });
  test("warm-up and lease decode the same cold escaped and case-insensitive selected family", async () => {
    const stack = '"noto\\20 sans math", serif';
    expect(module.getChartPrintOwnedFontFamilies(stack)).toEqual(["Noto Sans Math"]);
    for (const family of module.getChartPrintOwnedFontFamilies(stack)) await readyManaged(family);
    const lease = module.createChartPrintFontLease(document);
    await lease.prepare([stack, "Noto Sans Math"], { isCurrent: () => true });
    expect(aliases()).toHaveLength(1);
    expect(lease.mapFamily(stack)).toMatch(/"SheetcraftPrint_[a-f0-9]{32}_1"/u);
    expect(lease.mapFamily(stack)).toContain(lease.mapFamily("Noto Sans Math"));
    lease.dispose();
  });

  test("leaves native/generic stacks intact without fetch, scan, aliases, or original mutation", async () => {
    const lease = module.createChartPrintFontLease(document);
    const stack = '"Native, comma family", Arial, sans-serif';
    await lease.prepare([stack], { isCurrent: () => true });
    expect(lease.mapFamily(stack)).toBe(stack);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(local.read).not.toHaveBeenCalled();
    expect(faces).toEqual([]);
    lease.dispose();
    lease.dispose();
    expect(() => lease.assertCurrent()).toThrow(/disposed/u);
  });

  test("loads an exact managed URL and copies every original descriptor before first measurement", async () => {
    const original = await readyManaged();
    original.style = "italic";
    original.stretch = "condensed";
    original.featureSettings = '"kern" 0';
    original.variationSettings = '"wght" 400';
    original.unicodeRange = "U+0-FFFF";
    original.ascentOverride = "95%";
    original.descentOverride = "20%";
    original.lineGapOverride = "0%";
    let release!: () => void;
    loadPrivate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const lease = module.createChartPrintFontLease(document);
    const stack = '  "Noto Sans Math" , Arial, sans-serif';
    let prepared = false;
    const pending = lease.prepare([stack], { isCurrent: () => true }).then(() => {
      prepared = true;
    });
    await vi.waitFor(() => expect(aliases()).toHaveLength(1));
    expect(prepared).toBe(false);
    expect(() => lease.mapFamily(stack)).toThrow(/unprepared/u);
    expect(fontSet.has(native(aliases()[0]!))).toBe(false);
    release();
    await pending;
    const alias = aliases()[0]!;
    expect(alias.status).toBe("loaded");
    expect(alias.source).toEqual(Uint8Array.of(1, 2, 3, 4).buffer);
    expect(alias).toMatchObject({
      weight: "400",
      style: "italic",
      stretch: "condensed",
      display: "swap",
      featureSettings: original.featureSettings,
      variationSettings: original.variationSettings,
      unicodeRange: original.unicodeRange,
      ascentOverride: "95%",
      descentOverride: "20%",
      lineGapOverride: "0%",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      managed.MANAGED_CELL_FONTS.find((entry) => entry.family === original.family)?.url,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
    expect(lease.mapFamily(stack)).toBe(`  "${alias.family}" , Arial, sans-serif`);
    expect(original.family).toBe("Noto Sans Math");
    expect(fontSet.has(native(original))).toBe(true);
    lease.dispose();
    expect(fontSet.has(native(alias))).toBe(false);
    expect(fontSet.has(native(original))).toBe(true);
  });

  test("maps quoted/escaped owned families in fallback order with the same verified local bytes", async () => {
    await readyManaged();
    const source = readyLocal();
    local.read.mockResolvedValue(source);
    const stack = `Arial, 'Noto\\20 Sans Math', "${source.family}", serif`;
    const lease = module.createChartPrintFontLease(document);
    await lease.prepare([stack, source.family], { isCurrent: () => true });
    const [packaged, imported] = aliases();
    expect(lease.mapFamily(stack)).toBe(
      `Arial, "${packaged!.family}", "${imported!.family}", serif`,
    );
    expect(lease.mapFamily(source.family)).toBe(`"${imported!.family}"`);
    expect(imported?.source).toBe(source.bytes);
    expect(imported).toMatchObject({ weight: "500", style: "normal", display: "swap" });
    expect(local.read).toHaveBeenCalledOnce();
    expect(local.read).toHaveBeenCalledWith(source.family, module.CHART_PRINT_MAX_FONT_BYTES - 4);
    lease.dispose();
  });

  test.each(['"Third-party font", serif', "third-party font, serif"])(
    "refuses an unverified registered CSS face for %s",
    async (stack) => {
      const face = new TestFace("Third-party font", Uint8Array.of(1).buffer);
      face.status = "loaded";
      fontSet.add(native(face));
      const lease = module.createChartPrintFontLease(document);
      await expect(lease.prepare([stack], { isCurrent: () => true })).rejects.toMatchObject({
        code: "source-unavailable",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(aliases()).toEqual([]);
    },
  );

  test("refuses unloaded managed resources and same-name unverified overrides", async () => {
    const cold = module.createChartPrintFontLease(document);
    await expect(cold.prepare(["Noto Sans Math"], { isCurrent: () => true })).rejects.toMatchObject(
      { code: "source-unavailable" },
    );
    await readyManaged();
    const duplicate = new TestFace("Noto Sans Math", Uint8Array.of(9).buffer, { weight: "400" });
    duplicate.status = "loaded";
    fontSet.add(native(duplicate));
    const lease = module.createChartPrintFontLease(document);
    await expect(
      lease.prepare(["Noto Sans Math"], { isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "source-unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects missing local bytes and source hash/budget errors without stale fallback", async () => {
    const source = readyLocal();
    const missing = module.createChartPrintFontLease(document);
    await expect(missing.prepare([source.family], { isCurrent: () => true })).rejects.toMatchObject(
      { code: "source-unavailable" },
    );
    const { LocalSymbolFontError } = await import("../../../shared/cell-text/local-font-source");
    local.read.mockRejectedValue(new LocalSymbolFontError("storage-corrupt"));
    const corrupt = module.createChartPrintFontLease(document);
    await expect(corrupt.prepare([source.family], { isCurrent: () => true })).rejects.toMatchObject(
      { code: "source-unavailable" },
    );
    local.read.mockRejectedValue(new LocalSymbolFontError("size"));
    const oversized = module.createChartPrintFontLease(document);
    await expect(
      oversized.prepare([source.family], { isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "budget" });
    expect(aliases()).toEqual([]);
  });

  test("rejects oversized managed metadata before pulling the response body", async () => {
    await readyManaged();
    const pull = vi.fn();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": String(module.CHART_PRINT_MAX_FONT_BYTES + 1) }),
      body: new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
    });
    const lease = module.createChartPrintFontLease(document);
    await expect(
      lease.prepare(["Noto Sans Math"], { isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "budget" });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(aliases()).toEqual([]);
  });

  test("caps streamed bytes even without trustworthy Content-Length and cancels excess", async () => {
    await readyManaged();
    const cancel = vi.fn();
    let count = 0;
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            count++;
            controller.enqueue(
              new Uint8Array(count <= 2 ? module.CHART_PRINT_MAX_FONT_BYTES / 2 : 1),
            );
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
    });
    const lease = module.createChartPrintFontLease(document);
    await expect(
      lease.prepare(["Noto Sans Math"], { isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "budget" });
    expect(count).toBe(3);
    expect(cancel).toHaveBeenCalledOnce();
    expect(aliases()).toEqual([]);
  });

  test("caps total faces across active leases and releases the budget on failure/disposal", async () => {
    const sources = Array.from({ length: 17 }, (_, index) =>
      readyLocal(index.toString(16).padStart(64, "0")),
    );
    local.read.mockImplementation(async (family: string) =>
      sources.find((source) => source.family === family),
    );
    const lease = module.createChartPrintFontLease(document);
    await expect(
      lease.prepare(
        sources.map((source) => source.family),
        { isCurrent: () => true },
      ),
    ).rejects.toMatchObject({ code: "budget" });
    expect([...fontSet]).toHaveLength(17);
    expect(aliases()).toHaveLength(16);
    for (const alias of aliases()) expect(fontSet.has(native(alias))).toBe(false);
    const retry = module.createChartPrintFontLease(document);
    await retry.prepare([sources[0]!.family], { isCurrent: () => true });
    const previous = aliases()[0]!.family;
    const current = aliases().at(-1)!.family;
    expect(current).not.toBe(previous);
    retry.dispose();
  });

  test("cleans every private face when a later alias load fails", async () => {
    await readyManaged();
    await readyManaged("Noto Sans Symbols");
    let count = 0;
    loadPrivate = async () => {
      if (++count === 2) throw new Error("Rejected private font");
    };
    const lease = module.createChartPrintFontLease(document);
    await expect(
      lease.prepare(["Noto Sans Math", "Noto Sans Symbols"], { isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "font-load" });
    expect([...fontSet]).toHaveLength(2);
    for (const alias of aliases()) expect(fontSet.deleted).toContain(native(alias));
  });

  test("owner loss between asynchronous checkpoints aborts and removes private faces", async () => {
    await readyManaged();
    let current = true;
    let release!: () => void;
    loadPrivate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const lease = module.createChartPrintFontLease(document);
    const pending = lease.prepare(["Noto Sans Math"], { isCurrent: () => current });
    await vi.waitFor(() => expect(aliases()).toHaveLength(1));
    current = false;
    release();
    await expect(pending).rejects.toMatchObject({ code: "stale" });
    expect([...fontSet]).toHaveLength(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true);
  });

  test("permits explicit own loading events, then invalidates on external events or source descriptors", async () => {
    const original = await readyManaged();
    loadPrivate = async (face) => {
      fontSet.emit("loading", [face]);
      fontSet.emit("loadingdone", [face]);
    };
    const lease = module.createChartPrintFontLease(document);
    await lease.prepare(["Noto Sans Math"], { isCurrent: () => true });
    lease.assertCurrent();
    original.weight = "500";
    expect(() => lease.assertCurrent()).toThrow(/stale/u);
    expect([...fontSet]).toHaveLength(1);
    original.weight = "400";
    const second = module.createChartPrintFontLease(document);
    await second.prepare(["Noto Sans Math"], { isCurrent: () => true });
    fontSet.emit("loadingdone", [original]);
    expect(() => second.assertCurrent()).toThrow(/stale/u);
    expect([...fontSet]).toHaveLength(1);
  });

  test("checks native registry, private descriptors and one-shot reuse at observer boundaries", async () => {
    await readyManaged();
    const lease = module.createChartPrintFontLease(document);
    await lease.prepare(["Noto Sans Math"], { isCurrent: () => true });
    await expect(
      lease.prepare(["Noto Sans Math"], { isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "unprepared" });
    expect(() => lease.mapFamily("Arial")).toThrow(/unprepared/u);
    aliases()[0]!.stretch = "expanded";
    expect(() => lease.mapFamily("Noto Sans Math")).toThrow(/stale/u);
    const second = module.createChartPrintFontLease(document);
    await second.prepare(["Arial"], { isCurrent: () => true });
    const foreign = new TestFace("Different family", Uint8Array.of(1).buffer);
    fontSet.add(native(foreign));
    expect(() => second.assertCurrent()).toThrow(/stale/u);
  });

  test("rejects popup documents and malformed family stacks before fetching", async () => {
    expect(() =>
      module.createChartPrintFontLease(document.implementation.createHTMLDocument()),
    ).toThrow(/unavailable/u);
    for (const stack of ['"Noto Sans Math', "Arial,", "Arial\\", ""]) {
      const lease = module.createChartPrintFontLease(document);
      await expect(lease.prepare([stack], { isCurrent: () => true })).rejects.toMatchObject({
        code: "invalid-family",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
