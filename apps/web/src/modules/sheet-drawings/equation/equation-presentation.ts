import "katex/dist/katex.min.css";
import { renderEquationSource } from "./equation-render";
import { awaitEquationFontFaces, equationFontUse } from "./equation-presentation-fonts";
import {
  assertEquationPresentationEnvironment,
  captureEquationDisplayList,
  equationDOMFontUses,
  equationDOMNodeCount,
  paintEquationDisplayList,
} from "./equation-presentation-dom";
import {
  assertEquationCurrent,
  equationPresentationLimits,
  EquationPresentationFailure,
  planEquationPresentation,
  type EquationDrawOperation,
  type EquationPresentationInput,
  type EquationPresentationLimits,
  type EquationPresentationUnavailable,
} from "./equation-presentation-plan";

export {
  EQUATION_PRESENTATION_LIMITS,
  planEquationPresentation,
} from "./equation-presentation-plan";
export type {
  EquationPresentationInput,
  EquationPresentationLimits,
  EquationPresentationReason,
  EquationPresentationUnavailable,
  EquationDrawOperation,
} from "./equation-presentation-plan";

export interface EquationPresentationReady {
  readonly status: "ready";
  readonly sourceIdentity: object;
  readonly signature: string;
  /** Service-owned; never mutate. Check owner.isCurrent and isValid before each later
   * consumption: eviction, clear/dispose, or font events can invalidate this canvas. */
  readonly canvas: HTMLCanvasElement;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly localW: number;
  readonly localH: number;
  readonly displayList: readonly EquationDrawOperation[];
  readonly isValid: () => boolean;
}
export type EquationPresentationResult =
  | EquationPresentationReady
  | EquationPresentationUnavailable;

export interface EquationPresentationService {
  prepare(
    input: EquationPresentationInput,
    owner: { readonly isCurrent: () => boolean },
  ): Promise<EquationPresentationResult>;
  /** Invalidates cache canvases and any in-flight captured source. The installed KaTeX
   * CSS is pinned; call clear after any explicit CSS/font-registry changes. */
  clear(): void;
  dispose(): void;
}

interface CacheEntry {
  readonly ready: EquationPresentationReady;
  readonly bytes: number;
  readonly displaySignature: string;
  readonly fonts: readonly FontFace[];
  dispose(): void;
}

/** Public KaTeX HTML -> measured DOM -> native canvas. Unsupported layout always fails closed.
 * No raw-source rendering, private parse tree, foreignObject, or system-font raster fallback.
 * Global drawing bold/italic flags intentionally have no input here: KaTeX owns math face choice.
 */
export function createEquationPresentationService(
  options: {
    readonly document?: Document;
    readonly limits?: Partial<Record<keyof EquationPresentationLimits, number>>;
  } = {},
): EquationPresentationService {
  const ownerDocument = options.document ?? globalThis.document;
  const limits = equationPresentationLimits(options.limits);
  const cache = new Map<string, CacheEntry>();
  const identities = new WeakMap<object, number>();
  let nextIdentity = 0;
  let generation = 0;
  let disposed = false;
  let retainedBytes = 0;
  let workingBytes = 0;
  let workingNodes = 0;
  let prepares = 0;
  const invalidateCache = () => {
    for (const entry of cache.values()) entry.dispose();
    cache.clear();
    retainedBytes = 0;
  };
  const clear = () => {
    generation++;
    invalidateCache();
  };
  const fontSet = ownerDocument?.fonts;
  const fontEvents = ["loading", "loadingdone", "loadingerror"] as const;
  const onFontChange = () => invalidateCache();
  for (const event of fontEvents) fontSet?.addEventListener?.(event, onFontChange);
  const evictFirst = () => {
    const first = cache.entries().next().value as [string, CacheEntry] | undefined;
    if (!first) return false;
    cache.delete(first[0]);
    retainedBytes -= first[1].bytes;
    first[1].dispose();
    return true;
  };
  const unavailable = (error: unknown): EquationPresentationUnavailable =>
    error instanceof EquationPresentationFailure
      ? { status: "unavailable", reason: error.reason, message: error.message }
      : {
          status: "unavailable",
          reason: "canvas",
          message: "Equation presentation could not be captured by this browser.",
        };

  return {
    clear,
    dispose() {
      if (!disposed) {
        disposed = true;
        for (const event of fontEvents) fontSet?.removeEventListener?.(event, onFontChange);
        clear();
      }
    },
    async prepare(source, owner) {
      if (disposed)
        return {
          status: "unavailable",
          reason: "disposed",
          message: "Equation presentation service has been disposed.",
        };
      let plan;
      try {
        assertEquationCurrent(owner.isCurrent);
        plan = planEquationPresentation(source, limits);
      } catch (error) {
        return unavailable(error);
      }
      if (plan.status !== "ready") return plan;
      const capturedGeneration = generation;
      const isCurrent = () => !disposed && generation === capturedGeneration && owner.isCurrent();
      const now = () => ownerDocument?.defaultView?.performance.now() ?? performance.now();
      const deadline = now() + limits.timeoutMs;
      const checkpoint = () => {
        if (disposed)
          throw new EquationPresentationFailure(
            "disposed",
            "Equation presentation service has been disposed.",
          );
        assertEquationCurrent(isCurrent);
        if (now() >= deadline)
          throw new EquationPresentationFailure(
            "budget",
            "Equation presentation exceeded its time budget.",
          );
      };
      let identity = identities.get(plan.input.sourceIdentity);
      if (identity === undefined) {
        identity = ++nextIdentity;
        identities.set(plan.input.sourceIdentity, identity);
      }
      const key = `${identity}:${plan.signature}`;
      if (prepares >= limits.concurrentPrepares)
        return {
          status: "unavailable",
          reason: "budget",
          message: "Too many concurrent equation presentations.",
        };
      // Reserve both raster and maximum possible display-list bytes before any font await.
      // Together with concurrency and total DOM-node bounds this also bounds pending work.
      const reservation =
        plan.rasterBytes + limits.displayListBytes + plan.signature.length * 4 + 1536;
      while (retainedBytes + workingBytes + reservation > limits.retainedBytes && evictFirst()) {
        /* LRU */
      }
      if (workingBytes + reservation > limits.retainedBytes)
        return {
          status: "unavailable",
          reason: "budget",
          message: "Concurrent equation resources exceed the retained-byte budget.",
        };
      prepares++;
      workingBytes += reservation;
      let countedNodes = 0;
      let nodesReserved = false;
      let host: HTMLDivElement | undefined;
      let canvas: HTMLCanvasElement | undefined;
      let retained = false;
      try {
        checkpoint();
        const result = renderEquationSource(plan.input.source);
        checkpoint();
        if (result.status !== "ready")
          throw new EquationPresentationFailure(
            result.status === "budget" ? "budget" : "invalid-source",
            result.message,
          );
        const view = ownerDocument?.defaultView;
        if (!ownerDocument?.body || !view || typeof view.getComputedStyle !== "function")
          throw new EquationPresentationFailure(
            "canvas",
            "A laid-out browser document is required for equation presentation.",
          );
        host = ownerDocument.createElement("div");
        host.setAttribute("aria-hidden", "true");
        host.inert = true;
        host.style.cssText =
          "all:initial;position:fixed;left:-100000px;top:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;contain:layout style paint;font-weight:normal;font-style:normal;line-height:normal;";
        host.style.width = `${plan.input.localW}px`;
        host.style.height = `${plan.input.localH}px`;
        host.style.fontSize = `${plan.input.fontSize}px`;
        host.style.color = plan.input.color;
        if (!host.style.color)
          throw new EquationPresentationFailure(
            "invalid-source",
            "Invalid equation presentation color.",
          );
        host.innerHTML = result.html;
        countedNodes = equationDOMNodeCount(host, limits.nodes - 1) + 1; // Include one transient baseline probe.
        if (workingNodes + countedNodes > limits.nodes)
          throw new EquationPresentationFailure(
            "budget",
            "Concurrent equation DOM exceeds the presentation budget.",
          );
        workingNodes += countedNodes;
        nodesReserved = true;
        const math = host.querySelector<HTMLElement>(".katex");
        const html = math?.querySelector<HTMLElement>(".katex-html");
        if (!math || !html)
          throw new EquationPresentationFailure(
            "unsupported-primitive",
            "Public KaTeX presentation HTML is missing.",
          );
        ownerDocument.body.append(host);
        assertEquationPresentationEnvironment(host, view);
        const capturedHTML = host.innerHTML;
        // The bundled stylesheet preserves KaTeX's existing 1.21em sizing. Check the
        // root as well, even for an all-SVG or empty expression with no glyph leaves.
        const assertRootFont = () => {
          const rootStyle = view.getComputedStyle(math);
          if (
            (rootStyle.fontFamily.split(",")[0] ?? "").trim().replace(/^["']|["']$/gu, "") !==
              "KaTeX_Main" ||
            !["normal", "400"].includes(rootStyle.fontWeight) ||
            rootStyle.fontStyle !== "normal" ||
            !Number.isFinite(Number.parseFloat(rootStyle.fontSize)) ||
            Math.abs(Number.parseFloat(rootStyle.fontSize) - plan.input.fontSize * 1.21) > 0.02
          )
            throw new EquationPresentationFailure(
              "font",
              "The bundled KaTeX stylesheet is not active.",
            );
          return rootStyle;
        };
        const rootFont = assertRootFont();
        // A covered, unpainted probe also verifies root line-box metrics for empty or all-SVG math.
        const uses = [equationFontUse(rootFont, "M"), ...equationDOMFontUses(html, view)];
        const verifiedFonts = await awaitEquationFontFaces(ownerDocument.fonts, uses, {
          isCurrent,
          now,
          deadline,
        });
        checkpoint();
        assertEquationPresentationEnvironment(host, view);
        const currentRootFont = assertRootFont();
        if (
          host.innerHTML !== capturedHTML ||
          JSON.stringify([
            equationFontUse(currentRootFont, "M"),
            ...equationDOMFontUses(html, view),
          ]) !== JSON.stringify(uses)
        )
          throw new EquationPresentationFailure(
            "font",
            "Equation presentation fonts or source DOM changed during font loading.",
          );
        const laidOut = host.getBoundingClientRect();
        if (
          Math.abs(laidOut.width - plan.input.localW) > 0.02 ||
          Math.abs(laidOut.height - plan.input.localH) > 0.02
        )
          throw new EquationPresentationFailure(
            "unsupported-primitive",
            "The equation presentation box was altered by host styling.",
          );
        const captured = captureEquationDisplayList(math, host, view, limits, checkpoint);
        checkpoint();
        const displaySignature = JSON.stringify(captured.operations);
        const displayBytes = captured.bytes + displaySignature.length * 2;
        if (displayBytes > limits.displayListBytes)
          throw new EquationPresentationFailure(
            "budget",
            "Equation retained display list exceeds the presentation budget.",
          );
        // Validate live layout/fonts before raster reuse. Equal source signatures alone
        // cannot prove equal pixels after stylesheet or FontFaceSet changes.
        const hit = cache.get(key);
        if (
          hit &&
          hit.ready.isValid() &&
          hit.displaySignature === displaySignature &&
          hit.fonts.length === verifiedFonts.length &&
          hit.fonts.every((face, index) => face === verifiedFonts[index])
        ) {
          cache.delete(key);
          cache.set(key, hit);
          return hit.ready;
        }
        canvas = ownerDocument.createElement("canvas");
        canvas.width = plan.pixelWidth;
        canvas.height = plan.pixelHeight;
        const context = canvas.getContext("2d");
        if (!context)
          throw new EquationPresentationFailure(
            "canvas",
            "Native canvas equation presentation is unavailable.",
          );
        const Path = (view as Window & { Path2D?: typeof Path2D }).Path2D;
        if (captured.operations.some((operation) => operation.kind === "path") && !Path)
          throw new EquationPresentationFailure(
            "canvas",
            "Native SVG path painting is unavailable.",
          );
        context.save();
        try {
          context.scale(plan.input.density, plan.input.density);
          context.beginPath();
          context.rect(0, 0, plan.input.localW, plan.input.localH);
          context.clip();
          paintEquationDisplayList(context, captured.operations, checkpoint, (d) => new Path!(d));
        } finally {
          context.restore();
        }
        checkpoint();
        let valid = true;
        const ownedCanvas = canvas;
        const ready: EquationPresentationReady = Object.freeze({
          status: "ready",
          sourceIdentity: plan.input.sourceIdentity,
          signature: plan.signature,
          canvas: ownedCanvas,
          pixelWidth: plan.pixelWidth,
          pixelHeight: plan.pixelHeight,
          localW: plan.input.localW,
          localH: plan.input.localH,
          displayList: captured.operations,
          isValid: () => valid,
        });
        const entry: CacheEntry = {
          ready,
          bytes:
            plan.rasterBytes +
            displayBytes +
            plan.signature.length * 4 +
            verifiedFonts.length * 64 +
            128,
          displaySignature,
          fonts: verifiedFonts,
          dispose() {
            if (valid) {
              valid = false;
              ownedCanvas.width = 0;
              ownedCanvas.height = 0;
            }
          },
        };
        while (cache.size >= limits.cacheEntries) evictFirst();
        // Replace an older raster under the same exact source key without leaking it.
        const duplicate = cache.get(key);
        if (duplicate) {
          retainedBytes -= duplicate.bytes;
          duplicate.dispose();
          cache.delete(key);
        }
        while (
          retainedBytes + workingBytes - reservation + entry.bytes > limits.retainedBytes &&
          evictFirst()
        ) {
          /* LRU */
        }
        if (retainedBytes + workingBytes - reservation + entry.bytes > limits.retainedBytes) {
          entry.dispose();
          throw new EquationPresentationFailure(
            "budget",
            "Equation retained resources exceed the shared byte budget.",
          );
        }
        cache.set(key, entry);
        retainedBytes += entry.bytes;
        retained = true;
        return ready;
      } catch (error) {
        return unavailable(error);
      } finally {
        host?.remove();
        if (!retained && canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        if (nodesReserved) workingNodes -= countedNodes;
        workingBytes -= reservation;
        prepares--;
      }
    },
  };
}
