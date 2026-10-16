import {
  createChartPrintFontLease,
  getChartPrintOwnedFontFamilies,
  type ChartPrintFontLease,
} from "../charts/chart-print-fonts";
import {
  renderChartPrintPresentation,
  CHART_PRINT_MAX_SURFACE_PIXELS,
  CHART_PRINT_MAX_SURFACE_EDGE,
  CHART_PRINT_MAX_DENSITY,
  type ChartPrintPresentation,
} from "../charts/chart-print-presentation";
import {
  ChartPrintUnavailableError,
  type PrintChartEntry,
  type PrintChartPass,
} from "./page-print-charts";

import { ensureCellFontResource } from "../../shared/cell-text/font-resources";

const MAX_RETAINED_BYTES = 32 * 1024 * 1024;
const MAX_TRANSIENT_BYTES = 64 * 1024 * 1024;
type Batch = {
  pass: PrintChartPass;
  density: number;
  families: string;
  fonts: ChartPrintFontLease;
  pixels: ReadonlyMap<PrintChartEntry["sourceRoot"], ChartPrintPresentation>;
};

export function getPrintChartFontStacks(pass: PrintChartPass, ownerDocument: Document): string[] {
  const defaultFamily = ownerDocument.defaultView?.navigator.platform.startsWith("Win")
    ? "Microsoft YaHei"
    : "sans-serif";
  const result = new Set([defaultFamily, "Arial, sans-serif"]);
  for (const entry of pass.entries) {
    const format = entry.drawing.chart.format;
    for (const family of [
      format?.title?.fontFamily,
      format?.legend?.text?.fontFamily,
      format?.categoryAxis?.text?.fontFamily,
      format?.valueAxis?.text?.fontFamily,
      format?.secondaryValueAxis?.text?.fontFamily,
    ])
      if (family) result.add(family);
    if (entry.drawing.chart.type === "wordCloud")
      result.add(
        ownerDocument.defaultView?.getComputedStyle(
          ownerDocument.body ?? ownerDocument.documentElement,
        ).fontFamily || "sans-serif",
      );
  }
  return [...result];
}

function surfaceBytes(entry: PrintChartEntry, density: number): number {
  const width = Math.ceil(entry.rect.width * density),
    height = Math.ceil(entry.rect.height * density);
  if (
    !Number.isFinite(entry.rect.width) ||
    !Number.isFinite(entry.rect.height) ||
    entry.rect.width <= 0 ||
    entry.rect.height <= 0 ||
    !Number.isFinite(density) ||
    density <= 0 ||
    density > CHART_PRINT_MAX_DENSITY ||
    Math.floor(entry.rect.width * density) < 1 ||
    Math.floor(entry.rect.height * density) < 1 ||
    width > CHART_PRINT_MAX_SURFACE_EDGE ||
    height > CHART_PRINT_MAX_SURFACE_EDGE ||
    width * height > CHART_PRINT_MAX_SURFACE_PIXELS
  )
    throw new RangeError(
      "Chart print dimensions exceed the bounded canvas budget. Reduce print scale or chart size.",
    );
  return width * height * 4;
}

export async function preparePrintChartFonts(
  pass: PrintChartPass,
  ownerDocument: Document,
  owner: { isCurrent(): boolean },
): Promise<void> {
  try {
    for (const family of new Set(
      getPrintChartFontStacks(pass, ownerDocument).flatMap(getChartPrintOwnedFontFamilies),
    )) {
      if (!owner.isCurrent())
        throw new ChartPrintUnavailableError([], "Chart font preparation is outdated.");
      pass.assertCurrent();
      await ensureCellFontResource(family);
    }
    if (!owner.isCurrent())
      throw new ChartPrintUnavailableError([], "Chart font preparation is outdated.");
    pass.assertCurrent();
  } catch (cause) {
    throw cause instanceof ChartPrintUnavailableError
      ? cause
      : new ChartPrintUnavailableError(
          pass.entries.map((entry) => entry.sourceRoot.id),
          cause instanceof Error ? cause.message : "Chart fonts are unavailable.",
          cause,
        );
  }
}

/** One transaction owns native chart pixels and its selected, verified font sources. */
export function createPrintChartPixels(
  options: {
    document?: Document;
    createFonts?: (ownerDocument: Document) => ChartPrintFontLease;
    render?: typeof renderChartPrintPresentation;
    onInvalidate?: () => void;
  } = {},
) {
  const ownerDocument = options.document ?? globalThis.document;
  const observedFontSet = ownerDocument?.fonts;
  let batch: Batch | undefined;
  let generation = 0,
    disposed = false;
  let active: Promise<void> | undefined;
  let activeFontRelease: (() => void) | undefined;
  function releaseBatch() {
    if (!batch) return;
    const previous = batch;
    batch = undefined;
    for (const pixel of previous.pixels.values()) pixel.dispose();
    previous.fonts.dispose();
  }
  function isReady(pass: PrintChartPass, density = 1): boolean {
    if (disposed || !Number.isFinite(density) || density <= 0 || density > CHART_PRINT_MAX_DENSITY)
      return false;
    try {
      pass.assertCurrent();
      if (!pass.entries.length) return true;
      batch?.pass.assertCurrent();
      batch?.fonts.assertCurrent();
      return Boolean(
        batch &&
        batch.density >= density &&
        batch.pass.revision === pass.revision &&
        batch.pass.key === pass.key &&
        batch.families === JSON.stringify(getPrintChartFontStacks(pass, ownerDocument)) &&
        pass.entries.length === batch.pass.entries.length &&
        pass.entries.every(
          (entry, index) => batch!.pass.entries[index]?.sourceRoot === entry.sourceRoot,
        ),
      );
    } catch {
      releaseBatch();
      return false;
    }
  }
  async function prepare(pass: PrintChartPass, density: number, owner: { isCurrent(): boolean }) {
    if (
      disposed ||
      !Number.isFinite(density) ||
      density <= 0 ||
      density > CHART_PRINT_MAX_DENSITY ||
      !owner.isCurrent()
    )
      throw new ChartPrintUnavailableError([], "Chart print preparation is outdated.");
    if (isReady(pass, density)) return;
    const request = ++generation;
    activeFontRelease?.();
    const previous = active;
    const work = (async () => {
      await previous?.catch(() => undefined);
      releaseBatch();
      const current = () => !disposed && request === generation && owner.isCurrent();
      const checkpoint = () => {
        if (!current())
          throw new ChartPrintUnavailableError([], "Chart print preparation is outdated.");
        pass.assertCurrent();
      };
      checkpoint();
      if (!ownerDocument)
        throw new ChartPrintUnavailableError([], "The chart print document is unavailable.");
      let retained = 0;
      for (const entry of pass.entries) {
        const next = surfaceBytes(entry, density);
        if (retained + next > MAX_RETAINED_BYTES || retained + next * 2 > MAX_TRANSIENT_BYTES)
          throw new ChartPrintUnavailableError(
            [entry.sourceRoot.id],
            "Chart print surfaces exceed the 32 MiB sheet budget. Reduce chart size or print scale.",
          );
        retained += next;
      }
      const stacks = getPrintChartFontStacks(pass, ownerDocument),
        families = JSON.stringify(stacks);
      await preparePrintChartFonts(pass, ownerDocument, { isCurrent: current });
      checkpoint();
      const fonts = (options.createFonts ?? createChartPrintFontLease)(ownerDocument);
      let fontDisposed = false;
      const releaseFonts = () => {
        if (fontDisposed) return;
        fontDisposed = true;
        fonts.dispose();
      };
      activeFontRelease = releaseFonts;
      const pending = new Map<PrintChartEntry["sourceRoot"], ChartPrintPresentation>();
      let transferred = false;
      try {
        await fonts.prepare(stacks, { isCurrent: current });
        checkpoint();
        for (const entry of pass.entries) {
          fonts.assertCurrent();
          checkpoint();
          if (pending.has(entry.sourceRoot))
            throw new Error("Chart print source ownership is duplicated.");
          const pixel = (options.render ?? renderChartPrintPresentation)(
            entry.drawing,
            entry.data,
            {
              document: ownerDocument,
              width: entry.rect.width,
              height: entry.rect.height,
              density,
              resolveFontFamily: (family) => fonts.mapFamily(family),
            },
          );
          pending.set(entry.sourceRoot, pixel);
          if (
            pixel.canvas.width !== Math.ceil(entry.rect.width * density) ||
            pixel.canvas.height !== Math.ceil(entry.rect.height * density)
          )
            throw new Error("Chart print pixels do not match their captured dimensions.");
          checkpoint();
        }
        fonts.assertCurrent();
        checkpoint();
        if (JSON.stringify(getPrintChartFontStacks(pass, ownerDocument)) !== families)
          throw new Error("Chart print font selection changed.");
        batch = { pass, density, families, fonts, pixels: pending };
        transferred = true;
      } catch (cause) {
        throw cause instanceof ChartPrintUnavailableError
          ? cause
          : new ChartPrintUnavailableError(
              pass.entries.map((entry) => entry.sourceRoot.id),
              cause instanceof Error ? cause.message : "Chart print preparation failed.",
              cause,
            );
      } finally {
        if (activeFontRelease === releaseFonts) activeFontRelease = undefined;
        if (!transferred) {
          for (const pixel of pending.values()) pixel.dispose();
          releaseFonts();
        }
      }
    })().catch((cause: unknown) => {
      throw cause instanceof ChartPrintUnavailableError
        ? cause
        : new ChartPrintUnavailableError(
            pass.entries.map((entry) => entry.sourceRoot.id),
            cause instanceof Error ? cause.message : "Chart print preparation failed.",
            cause,
          );
    });
    active = work;
    try {
      await work;
    } finally {
      if (active === work) active = undefined;
    }
  }
  function paint(
    context: CanvasRenderingContext2D,
    pass: PrintChartPass,
    entry: PrintChartEntry,
    viewport: { x: number; y: number; width: number; height: number },
    density = 1,
  ) {
    if (!isReady(pass, density))
      throw new ChartPrintUnavailableError(
        [entry.sourceRoot.id],
        "Chart print pixels and fonts are not ready.",
      );
    const pixel = batch?.pixels.get(entry.sourceRoot);
    if (!pixel || !pass.entries.includes(entry))
      throw new ChartPrintUnavailableError(
        [entry.sourceRoot.id],
        "The captured chart pixels are missing.",
      );
    if (
      entry.bounds.right <= viewport.x ||
      entry.bounds.bottom <= viewport.y ||
      entry.bounds.left >= viewport.x + viewport.width ||
      entry.bounds.top >= viewport.y + viewport.height
    )
      return;
    context.save();
    try {
      context.translate(
        entry.rect.x + entry.rect.width / 2 - viewport.x,
        entry.rect.y + entry.rect.height / 2 - viewport.y,
      );
      context.rotate((entry.rotation * Math.PI) / 180);
      context.translate(-entry.rect.width / 2, -entry.rect.height / 2);
      context.beginPath();
      context.rect(0, 0, entry.rect.width, entry.rect.height);
      context.clip();
      context.drawImage(
        pixel.canvas,
        0,
        0,
        pixel.canvas.width / batch!.density,
        pixel.canvas.height / batch!.density,
      );
    } finally {
      context.restore();
    }
  }
  const invalidatedBatches = new WeakSet<Batch>();
  const onFontChange = () => {
    const observed = batch,
      request = generation;
    if (!observed) return;
    // The lease subscribes after this owner. Check after all native observers
    // have consumed the same event, including late completion notifications.
    queueMicrotask(() => {
      if (
        disposed ||
        request !== generation ||
        (batch && batch !== observed) ||
        invalidatedBatches.has(observed)
      )
        return;
      try {
        observed.fonts.assertCurrent();
      } catch {
        invalidatedBatches.add(observed);
        if (batch === observed) releaseBatch();
        options.onInvalidate?.();
      }
    });
  };
  for (const event of ["loading", "loadingdone", "loadingerror"])
    observedFontSet?.addEventListener?.(event, onFontChange);
  return {
    prepare,
    isReady,
    paint,
    clear() {
      generation++;
      activeFontRelease?.();
      releaseBatch();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      activeFontRelease?.();
      releaseBatch();
      for (const event of ["loading", "loadingdone", "loadingerror"])
        observedFontSet?.removeEventListener?.(event, onFontChange);
    },
  };
}
