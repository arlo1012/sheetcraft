import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("browser cell text glyph metrics", () => {
  test("caches actual glyph extents separately for each effective family and invalidates on font loading", async () => {
    vi.resetModules();
    vi.stubGlobal("CanvasRenderingContext2D", class {});
    let fontLoaded: (() => void) | undefined;
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => ctx }),
      fonts: {
        addEventListener: (_name: string, callback: () => void) => {
          fontLoaded = callback;
        },
      },
    });
    const ctx = {
      font: "",
      textBaseline: "",
      measureText: vi.fn(function (this: { font: string }) {
        return this.font.includes("Symbols")
          ? { width: 20, actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 7 }
          : { width: 10, actualBoundingBoxAscent: 11, actualBoundingBoxDescent: 2 };
      }),
    };
    const { browserCellTextMeasurer, cellTextFontRevision, invalidateCellTextFontMetrics } =
      await import("../../../shared/cell-text/text-metrics");
    const base = { family: "Base", size: 13, weight: 400 as const, italic: false };
    expect(browserCellTextMeasurer.measure("☀", base)).toBe(10);
    expect(browserCellTextMeasurer.measureMetrics?.("☀", base)).toEqual({
      width: 10,
      ascent: 11,
      descent: 2,
    });
    expect(browserCellTextMeasurer.measureMetrics?.("☀", { ...base, family: "Symbols" })).toEqual({
      width: 20,
      ascent: 24,
      descent: 7,
    });
    expect(ctx.measureText).toHaveBeenCalledTimes(2);
    fontLoaded?.();
    expect(cellTextFontRevision.value).toBe(1);
    browserCellTextMeasurer.measure("☀", base);
    expect(ctx.measureText).toHaveBeenCalledTimes(3);
    invalidateCellTextFontMetrics();
    expect(cellTextFontRevision.value).toBe(2);
    browserCellTextMeasurer.measure("☀", base);
    expect(ctx.measureText).toHaveBeenCalledTimes(4);
  });

  test("keeps a runtime-neutral approximate fallback when a Canvas context is unavailable", async () => {
    vi.resetModules();
    vi.stubGlobal("CanvasRenderingContext2D", undefined);
    const { browserCellTextMeasurer } = await import("../../../shared/cell-text/text-metrics");
    const font = { family: "Base", size: 10, weight: 400 as const, italic: false };
    const metrics = browserCellTextMeasurer.measureMetrics?.("abc", font);
    expect(metrics?.width).toBe(browserCellTextMeasurer.measure("abc", font));
    expect(metrics?.ascent).toBe(8);
    expect(metrics?.descent).toBe(2);
  });
});
