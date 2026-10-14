import {
  createEquationPresentationService,
  type EquationPresentationService,
} from "../sheet-drawings/equation/equation-presentation";
import type { PrintEquationEntry, PrintEquationPass } from "./page-print-equations";

const MAX_OWNED_BYTES = 32 * 1024 * 1024;
class EquationPrintFontChange extends Error {}
type OwnedPixels = { entry: PrintEquationEntry; canvas: HTMLCanvasElement; bytes: number };
type FontRegistry = readonly {
  face: FontFace;
  family: string;
  weight: string;
  style: string;
  status: FontFaceLoadStatus;
}[];

function fontsSnapshot(fonts: FontFaceSet | undefined): FontRegistry {
  if (!fonts || typeof fonts[Symbol.iterator] !== "function")
    throw new Error("Mathematical font readiness cannot be verified.");
  const result = [...fonts]
    .filter((face) => face.family.replace(/^["']|["']$/gu, "").startsWith("KaTeX_"))
    .map((face) =>
      Object.freeze({
        face,
        family: face.family,
        weight: face.weight,
        style: face.style,
        status: face.status,
      }),
    );
  if (!result.some((entry) => entry.status === "loaded"))
    throw new Error("Mathematical fonts are not ready for printing.");
  return Object.freeze(result);
}
function sameFonts(fonts: FontFaceSet | undefined, captured: FontRegistry): boolean {
  try {
    const next = fontsSnapshot(fonts);
    return (
      next.length === captured.length &&
      captured.every((previous) =>
        next.some(
          (current) =>
            current.face === previous.face &&
            current.family === previous.family &&
            current.weight === previous.weight &&
            current.style === previous.style &&
            current.status === previous.status,
        ),
      )
    );
  } catch {
    return false;
  }
}
function disposePixels(pixels: Iterable<OwnedPixels>): number {
  let bytes = 0;
  for (const item of pixels) {
    bytes += item.bytes;
    item.canvas.width = item.canvas.height = 0;
  }
  return bytes;
}

/** A print transaction owns bounded copies, not evictable presentation-cache canvases.
 * Warm all math faces first, then copy under one unchanged font/source lease. */
export function createPrintEquationPixels(
  options: {
    document?: Document;
    service?: EquationPresentationService;
    onInvalidate?: () => void;
  } = {},
) {
  const ownerDocument = options.document ?? globalThis.document;
  const service =
    options.service ??
    createEquationPresentationService({
      document: ownerDocument,
      limits: { retainedBytes: 32 * 1024 * 1024 },
    });
  let generation = 0,
    fontGeneration = 0,
    ownedBytes = 0,
    disposed = false;
  let batch:
    | {
        pass: PrintEquationPass;
        density: number;
        fonts: FontRegistry;
        fontGeneration: number;
        pixels: ReadonlyMap<PrintEquationEntry["sourceNode"], OwnedPixels>;
      }
    | undefined;
  let activePreparation: Promise<void> | undefined;
  const fontEvents = ["loading", "loadingdone", "loadingerror"] as const;
  const onFontChange = () => {
    fontGeneration++;
    const wasReady = Boolean(batch);
    releaseBatch();
    if (wasReady) options.onInvalidate?.();
  };
  for (const event of fontEvents) ownerDocument?.fonts?.addEventListener?.(event, onFontChange);
  function releaseBatch() {
    if (batch) {
      ownedBytes -= disposePixels(batch.pixels.values());
      batch = undefined;
    }
  }
  function matches(pass: PrintEquationPass, density: number) {
    batch?.pass.assertCurrent();
    return (
      batch &&
      batch.density >= density &&
      batch.pass.revision === pass.revision &&
      batch.pass.key === pass.key &&
      batch.pass.entries.length === pass.entries.length &&
      pass.entries.every((entry, index) => {
        const captured = batch!.pass.entries[index]!;
        return (
          captured.root === entry.root &&
          captured.sourceNode === entry.sourceNode &&
          captured.sourceIdentity === entry.sourceIdentity &&
          captured.path.length === entry.path.length &&
          captured.path.every((id, at) => id === entry.path[at])
        );
      }) &&
      batch.fontGeneration === fontGeneration &&
      sameFonts(ownerDocument?.fonts, batch.fonts)
    );
  }
  function isReady(pass: PrintEquationPass, density = 1): boolean {
    if (disposed) return false;
    try {
      pass.assertCurrent();
      return !pass.entries.length || Boolean(matches(pass, density));
    } catch {
      return false;
    }
  }
  async function prepareOwned(
    pass: PrintEquationPass,
    density: number,
    owner: { isCurrent(): boolean },
    request: number,
  ) {
    pass.assertCurrent();
    if (!Number.isFinite(density) || density <= 0 || disposed || !owner.isCurrent())
      throw new Error("Equation print preparation is outdated or has invalid density.");
    if (!ownerDocument)
      throw new Error("A browser document is required for mathematical printing.");
    if (isReady(pass, density)) return;
    releaseBatch();
    service.clear();
    const pending = new Map<PrintEquationEntry["sourceNode"], OwnedPixels>();
    let transferred = false;
    const current = () => !disposed && request === generation && owner.isCurrent();
    const checkpoint = () => {
      if (!current()) throw new Error("Equation print preparation is outdated.");
      pass.assertCurrent();
    };
    try {
      // A later formula can load a different bundled face and evict prior ready
      // cache entries. No surfaces from this font-warming pass are retained.
      for (const entry of pass.entries) {
        checkpoint();
        const result = await service.prepare({ ...entry.input, density }, { isCurrent: current });
        checkpoint();
        if (result.status !== "ready" || !result.isValid())
          throw new Error(
            result.status === "unavailable"
              ? result.message
              : "Mathematical layout became unavailable before printing.",
          );
      }
      const fonts = fontsSnapshot(ownerDocument?.fonts),
        fontLease = fontGeneration;
      for (const entry of pass.entries) {
        checkpoint();
        if (fontLease !== fontGeneration || !sameFonts(ownerDocument?.fonts, fonts))
          throw new EquationPrintFontChange("Mathematical fonts changed during print preparation.");
        const result = await service.prepare({ ...entry.input, density }, { isCurrent: current });
        checkpoint();
        if (result.status === "unavailable") throw new Error(result.message);
        if (fontLease !== fontGeneration || !sameFonts(ownerDocument?.fonts, fonts))
          throw new EquationPrintFontChange("Mathematical fonts changed during print preparation.");
        if (!result.isValid())
          throw new Error("Mathematical layout changed during print preparation.");
        if (pending.has(entry.sourceNode))
          throw new Error("Equation print source ownership was duplicated.");
        const bytes = result.pixelWidth * result.pixelHeight * 4;
        if (!Number.isSafeInteger(bytes) || bytes <= 0 || ownedBytes + bytes > MAX_OWNED_BYTES)
          throw new RangeError("Equation print surfaces exceed the 32 MiB sheet budget.");
        const canvas = ownerDocument.createElement("canvas");
        canvas.width = result.pixelWidth;
        canvas.height = result.pixelHeight;
        const pixel = { entry, canvas, bytes };
        pending.set(entry.sourceNode, pixel);
        ownedBytes += bytes;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Mathematical print canvas is unavailable.");
        context.drawImage(result.canvas, 0, 0);
        checkpoint();
        if (!result.isValid()) throw new Error("Mathematical pixels changed before copying.");
      }
      checkpoint();
      if (fontLease !== fontGeneration || !sameFonts(ownerDocument?.fonts, fonts))
        throw new EquationPrintFontChange(
          "Mathematical fonts changed before publishing print surfaces.",
        );
      batch = { pass, density, fonts, fontGeneration: fontLease, pixels: pending };
      transferred = true;
      // Owned copies have a separate font lease. Releasing the source cache
      // reduces retained memory and cannot invalidate already copied pixels.
      service.clear();
    } finally {
      if (!transferred) ownedBytes -= disposePixels(pending.values());
    }
  }
  async function prepare(
    pass: PrintEquationPass,
    density: number,
    owner: { isCurrent(): boolean },
  ) {
    if (!Number.isFinite(density) || density <= 0 || disposed || !owner.isCurrent())
      throw new Error("Equation print preparation is outdated or has invalid density.");
    if (isReady(pass, density)) return;
    const request = ++generation;
    // Cancel immediately, then await release of the previous adapter's bounded
    // in-flight reservations before asking it for the replacement source.
    service.clear();
    const previous = activePreparation;
    const work = (async () => {
      if (previous) await previous.catch(() => undefined);
      if (disposed || request !== generation || !owner.isCurrent())
        throw new Error("Equation print preparation is outdated.");
      try {
        await prepareOwned(pass, density, owner, request);
      } catch (error) {
        if (!(error instanceof EquationPrintFontChange)) throw error;
        // One font-settlement retry handles a late loadingdone during copying.
        // It never retries malformed math, budgets, stale owners or canvas errors.
        let settled = false;
        const ready = ownerDocument?.fonts?.ready;
        if (!ready) throw error;
        ready.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        const deadline = Date.now() + 5000;
        while (!settled) {
          if (disposed || request !== generation || !owner.isCurrent())
            throw new Error("Equation print preparation is outdated.");
          if (Date.now() > deadline) throw error;
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
        service.clear();
        await prepareOwned(pass, density, owner, request);
      }
    })();
    activePreparation = work;
    try {
      await work;
    } finally {
      if (activePreparation === work) activePreparation = undefined;
    }
  }
  function paint(
    context: CanvasRenderingContext2D,
    pass: PrintEquationPass,
    entry: PrintEquationEntry,
    viewport: { x: number; y: number; width: number; height: number },
    density = 1,
  ) {
    if (!isReady(pass, density)) throw new Error("Equation print pixels are not ready.");
    const pixel = batch?.pixels.get(entry.sourceNode);
    if (
      !pixel ||
      !pass.entries.includes(entry) ||
      pixel.entry.root !== entry.root ||
      pixel.entry.sourceIdentity !== entry.sourceIdentity
    )
      throw new Error("Equation print pixels are missing from the captured source.");
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
      if (entry.mathRotation) {
        // Keep the geometric frame/clip fixed. Only native glyph pixels turn
        // about their local center; horizontal identity never mirrors math.
        context.translate(entry.rect.width / 2, entry.rect.height / 2);
        context.rotate((entry.mathRotation * Math.PI) / 180);
        context.translate(-entry.rect.width / 2, -entry.rect.height / 2);
      }
      // Canvas dimensions are rounded up, but glyph advance/local coordinates
      // must not be squeezed to discard the fractional transparent edge.
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
  return {
    prepare,
    paint,
    isReady,
    clear() {
      generation++;
      releaseBatch();
      service.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      releaseBatch();
      service.dispose();
      for (const event of fontEvents)
        ownerDocument?.fonts?.removeEventListener?.(event, onFontChange);
    },
  };
}
