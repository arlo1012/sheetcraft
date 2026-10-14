import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderEquationSource } from "../../../../modules/sheet-drawings/equation/equation-render";
import { createEquationPresentationService } from "../../../../modules/sheet-drawings/equation/equation-presentation";
import {
  captureEquationDisplayList,
  equationDOMNodeCount,
  paintEquationDisplayList,
} from "../../../../modules/sheet-drawings/equation/equation-presentation-dom";
import {
  equationPresentationLimits,
  type EquationPresentationInput,
} from "../../../../modules/sheet-drawings/equation/equation-presentation-plan";

// This fixture tests extraction and resource contracts. Rectangles, baselines, font
// loading, and native canvas are controlled doubles, not browser pixel acceptance.
const native = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  transform: vi.fn(),
  fill: vi.fn(),
  font: "",
  fillStyle: "",
  textAlign: "left",
  textBaseline: "alphabetic",
  direction: "ltr",
  fontKerning: "auto",
});
let context: ReturnType<typeof native>;
let fonts: { load: ReturnType<typeof vi.fn>; check: ReturnType<typeof vi.fn> };
let faceCache: Map<string, FontFace>;
const loadFaces = async (font: string): Promise<FontFace[]> => {
  const family = /"([^"]+)"/u.exec(font)?.[1] ?? "";
  const [style = "normal", weight = "400"] = font.split(" ");
  const key = `${family}/${style}/${weight}`;
  let face = faceCache.get(key);
  if (!face) {
    face = { family, style, weight, status: "loaded" } as FontFace;
    faceCache.set(key, face);
  }
  return [face];
};
const input = (source = "x"): EquationPresentationInput => ({
  sourceIdentity: {},
  source,
  fontSize: 20,
  color: "#111111",
  localW: 100,
  localH: 60,
  density: 2,
});
const bounds = (x = 10, y = 10, w = 16, h = 20) => new DOMRect(x, y, w, h);

beforeEach(() => {
  context = native();
  faceCache = new Map();
  fonts = {
    load: vi.fn(loadFaces),
    check: vi.fn(() => true),
  };
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    if (pseudo) return { content: "none" } as CSSStyleDeclaration;
    const host = element.closest("div");
    const size = Number.parseFloat((host as HTMLElement | null)?.style.fontSize || "20") * 1.21;
    const math = element.closest(".mathnormal");
    const inline = (element as HTMLElement).style;
    return {
      display: element.localName === "div" ? "flex" : "inline",
      position: element.localName === "div" ? "fixed" : "static",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      flexWrap: "nowrap",
      boxSizing: "content-box",
      left: "-100000px",
      top: "0px",
      pointerEvents: "none",
      lineHeight: "normal",
      direction: "ltr",
      writingMode: "horizontal-tb",
      paddingTop: "0px",
      paddingRight: "0px",
      paddingBottom: "0px",
      paddingLeft: "0px",
      marginTop: "0px",
      marginRight: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      fontFamily: math ? "KaTeX_Math" : "KaTeX_Main, math, serif",
      fontSize: `${size}px`,
      fontWeight: "400",
      fontStyle: math ? "italic" : "normal",
      color: "rgb(17, 17, 17)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      overflow:
        element.classList.contains("hide-tail") || element.localName === "div"
          ? "hidden"
          : "visible",
      overflowX:
        element.classList.contains("hide-tail") || element.localName === "div"
          ? "hidden"
          : "visible",
      overflowY:
        element.classList.contains("hide-tail") || element.localName === "div"
          ? "hidden"
          : "visible",
      borderTopWidth: "0px",
      borderRightWidth: "0px",
      borderLeftWidth: "0px",
      borderBottomWidth: element.classList.contains("frac-line") ? "1px" : "0px",
      borderBottomStyle: element.classList.contains("frac-line") ? "solid" : "none",
      borderBottomColor: "rgb(17, 17, 17)",
      fill: "rgb(17, 17, 17)",
      stroke: "none",
      fillRule: "nonzero",
      transform: inline.transform || "none",
      borderRadius: "0px",
      opacity: "1",
      visibility: "visible",
    } as CSSStyleDeclaration;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.localName === "div")
      return bounds(
        0,
        0,
        Number.parseFloat((this as HTMLElement).style.width || "100"),
        Number.parseFloat((this as HTMLElement).style.height || "60"),
      );
    if (
      (this as HTMLElement).style?.width === "0px" &&
      (this as HTMLElement).style?.height === "0px"
    )
      return bounds(10, 25, 0, 0);
    return bounds();
  });
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(bounds(10, 10, 8, 20));
  vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([
    bounds(10, 10, 8, 20),
  ] as unknown as DOMRectList);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(SVGPathElement.prototype, "getScreenCTM").mockReturnValue({
    a: 0.02,
    b: 0,
    c: 0,
    d: 0.02,
    e: 10,
    f: 10,
  } as DOMMatrix);
  vi.stubGlobal(
    "Path2D",
    class {
      constructor(readonly d: string) {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
  document.body.innerHTML = "";
});

test.each([
  ["\\frac{1}{2}", ["text", "rect"]],
  ["\\sqrt{x}", ["text", "path"]],
  ["x_2^3", ["text"]],
  ["\\begin{matrix}a&b\\\\c&d\\end{matrix}", ["text"]],
  ["\\overrightarrow{AB}", ["text", "path"]],
])("public KaTeX %s extracts supported measured glyph/rule/SVG operations", (source, kinds) => {
  const rendered = renderEquationSource(source as string);
  expect(rendered.status).toBe("ready");
  if (rendered.status !== "ready") return;
  const host = document.createElement("div");
  host.innerHTML = rendered.html;
  document.body.append(host);
  const math = host.querySelector<HTMLElement>(".katex")!;
  const result = captureEquationDisplayList(
    math,
    host,
    window,
    equationPresentationLimits(),
    () => {},
  );
  for (const kind of kinds) expect(result.operations.some((op) => op.kind === kind)).toBe(true);
  expect(result.operations.every((op) => Object.isFrozen(op))).toBe(true);
  expect(host.querySelector('[style*="vertical-align: baseline"]')).toBeNull();
  paintEquationDisplayList(
    context as unknown as CanvasRenderingContext2D,
    result.operations,
    () => {},
    (d) => new Path2D(d),
  );
  expect(context.fillText).toHaveBeenCalled();
  for (const operation of result.operations) {
    if (operation.kind === "text") expect(operation.baseline).toBe(25);
    if (operation.kind === "path") {
      expect(operation.clips.length).toBeGreaterThan(0);
      expect(operation.matrix).toEqual([0.02, 0, 0, 0.02, 10, 10]);
      expect(context.fill).toHaveBeenCalled();
    }
  }
});

test("unsupported effects, non-path SVG and draw-op limits never silently omit primitives", () => {
  const host = document.createElement("div");
  host.innerHTML = '<span class="katex"><span style="transform:scaleX(-1)">x</span></span>';
  document.body.append(host);
  const capture = () =>
    captureEquationDisplayList(
      host.firstElementChild as HTMLElement,
      host,
      window,
      equationPresentationLimits(),
      () => {},
    );
  expect(capture).toThrow(/unsupported/u);
  host.innerHTML =
    '<span class="katex"><svg viewBox="0 0 10 10"><line x1="0" x2="10" /></svg></span>';
  expect(capture).toThrow(/unsupported/u);
  host.innerHTML = '<span class="katex"><span>x</span><span>y</span></span>';
  expect(() =>
    captureEquationDisplayList(
      host.firstElementChild as HTMLElement,
      host,
      window,
      equationPresentationLimits({ drawOps: 1 }),
      () => {},
    ),
  ).toThrow(/budget/u);
});

test("missing real layout and layout-changing baseline probes fail and remove the probe", () => {
  const host = document.createElement("div");
  host.innerHTML = '<span class="katex"><span>x</span></span>';
  document.body.append(host);
  const capture = () =>
    captureEquationDisplayList(
      host.firstElementChild as HTMLElement,
      host,
      window,
      equationPresentationLimits(),
      () => {},
    );
  vi.mocked(Range.prototype.getBoundingClientRect).mockReturnValueOnce(bounds(0, 0, 0, 0));
  expect(capture).toThrow(/laid-out/u);
  vi.mocked(Range.prototype.getBoundingClientRect)
    .mockReturnValueOnce(bounds())
    .mockReturnValueOnce(bounds(11));
  expect(capture).toThrow(/changed layout/u);
  expect(host.querySelectorAll("span")).toHaveLength(2);
});

test("service caches exact source pixels by identity, bounds LRU bytes and disposes hidden DOM/canvases", async () => {
  const service = createEquationPresentationService({ document, limits: { cacheEntries: 1 } });
  const firstInput = input();
  const first = await service.prepare(firstInput, { isCurrent: () => true });
  expect(first.status).toBe("ready");
  expect(document.body.children).toHaveLength(0);
  if (first.status !== "ready") return;
  expect(await service.prepare(firstInput, { isCurrent: () => true })).toBe(first);
  expect(await service.prepare(firstInput, { isCurrent: () => false })).toMatchObject({
    reason: "stale",
  });
  const replacement = await service.prepare(
    { ...firstInput, sourceIdentity: {} },
    { isCurrent: () => true },
  );
  expect(replacement.status).toBe("ready");
  expect(replacement).not.toBe(first);
  expect(first.isValid()).toBe(false);
  expect(first.canvas.width).toBe(0);
  service.dispose();
  if (replacement.status === "ready") expect(replacement.isValid()).toBe(false);
  expect(await service.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "disposed",
  });
});

test("stale async font capture and clear dispose temporary DOM and never cache obsolete source", async () => {
  let current = true;
  fonts.load.mockImplementation(() => new Promise(() => {}));
  const service = createEquationPresentationService({ document });
  const pending = service.prepare(input(), { isCurrent: () => current });
  expect(document.body.children).toHaveLength(1);
  current = false;
  expect(await pending).toMatchObject({ status: "unavailable", reason: "stale" });
  expect(document.body.children).toHaveLength(0);
  current = true;
  const clearing = service.prepare(input(), { isCurrent: () => current });
  service.clear();
  expect(await clearing).toMatchObject({ reason: "stale" });
  expect(document.body.children).toHaveLength(0);
  service.dispose();
});

test("source is captured before font await; pending resources are bounded across concurrent requests", async () => {
  let resolve!: (faces: FontFace[]) => void;
  fonts.load.mockImplementation((font: string) =>
    font.includes("KaTeX_Main")
      ? loadFaces(font)
      : new Promise<FontFace[]>((done) => {
          resolve = done;
        }),
  );
  const service = createEquationPresentationService({
    document,
    limits: { concurrentPrepares: 1 },
  });
  const mutable = { ...input("x") };
  const pending = service.prepare(mutable, { isCurrent: () => true });
  mutable.source = "y";
  expect(await service.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "budget",
  });
  resolve([{ family: "KaTeX_Math", weight: "400", style: "italic", status: "loaded" } as FontFace]);
  const ready = await pending;
  expect(ready.status).toBe("ready");
  if (ready.status === "ready")
    expect(ready.displayList.find((op) => op.kind === "text")).toMatchObject({ text: "x" });
  service.dispose();
});

test("total pending bytes and DOM nodes are bounded independently of request count", async () => {
  fonts.load.mockImplementation(() => new Promise(() => {}));
  let current = true;
  const bytes = createEquationPresentationService({
    document,
    limits: { retainedBytes: 150_000, displayListBytes: 1024 },
  });
  const pending = bytes.prepare(input(), { isCurrent: () => current });
  expect(await bytes.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "budget",
  });
  current = false;
  expect(await pending).toMatchObject({ reason: "stale" });
  bytes.dispose();
  const rendered = renderEquationSource("x");
  if (rendered.status !== "ready") throw new Error("fixture source");
  const temporary = document.createElement("div");
  temporary.innerHTML = rendered.html;
  const count = equationDOMNodeCount(temporary, 100) + 1;
  current = true;
  const nodes = createEquationPresentationService({ document, limits: { nodes: count } });
  const nodePending = nodes.prepare(input(), { isCurrent: () => current });
  expect(await nodes.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "budget",
  });
  current = false;
  expect(await nodePending).toMatchObject({ reason: "stale" });
  expect(document.body.children).toHaveLength(0);
  nodes.dispose();
});

test("invalid source, unverified fonts, invalid canvas and finite node budgets are typed unavailable", async () => {
  const service = createEquationPresentationService({ document });
  expect(await service.prepare(input("\\invalidcommand"), { isCurrent: () => true })).toMatchObject(
    { reason: "invalid-source" },
  );
  fonts.load.mockResolvedValue([]);
  expect(await service.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "font",
  });
  expect(document.body.children).toHaveLength(0);
  fonts.load.mockImplementation(loadFaces);
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  expect(await service.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "canvas",
  });
  service.dispose();
  const tiny = createEquationPresentationService({ document, limits: { nodes: 2 } });
  expect(await tiny.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "budget",
  });
  // A failed DOM reservation must not subtract nodes it never reserved.
  expect(await tiny.prepare(input(), { isCurrent: () => true })).toMatchObject({
    reason: "budget",
  });
  tiny.dispose();
});

test.each([
  ["shell centering", "div", { alignItems: "start" }],
  ["ancestor transform", "body", { transform: "matrix(-1, 0, 0, -1, 0, 0)" }],
  ["ancestor rotate", "body", { rotate: "180deg" }],
  ["ancestor zoom", "html", { zoom: "2" }],
  ["ancestor mask", "body", { maskImage: "url(mask.svg)" }],
  ["glyph stretch", ".mathnormal", { fontStretch: "expanded" }],
  ["glyph kerning", ".mathnormal", { fontKerning: "none" }],
] as const)(
  "%s cannot return ready even when measured box dimensions are unchanged",
  async (_label, selector, changes) => {
    const original = vi.mocked(window.getComputedStyle).getMockImplementation()!;
    vi.mocked(window.getComputedStyle).mockImplementation((element, pseudo) => {
      const style = original(element, pseudo);
      return !pseudo && element.matches(selector as string)
        ? ({ ...style, ...changes } as CSSStyleDeclaration)
        : style;
    });
    const service = createEquationPresentationService({ document });
    expect(await service.prepare(input(), { isCurrent: () => true })).toMatchObject({
      reason: "unsupported-primitive",
    });
    expect(document.body.children).toHaveLength(0);
    service.dispose();
  },
);

test.each([
  ["clip border", ".hide-tail", { borderTopWidth: "1px" }],
  ["clip margin", ".hide-tail", { overflowClipMargin: "3px" }],
  ["SVG background", "svg", { backgroundColor: "red" }],
  ["SVG border", "svg", { borderLeftWidth: "1px" }],
  ["SVG paint server", "path", { fill: "url(#gradient)" }],
] as const)(
  "%s is explicit unsupported output rather than omitted or approximated",
  (_label, selector, changes) => {
    const original = vi.mocked(window.getComputedStyle).getMockImplementation()!;
    vi.mocked(window.getComputedStyle).mockImplementation((element, pseudo) => {
      const style = original(element, pseudo);
      return !pseudo && element.matches(selector as string)
        ? ({ ...style, ...changes } as CSSStyleDeclaration)
        : style;
    });
    const source = renderEquationSource("\\sqrt{x}");
    if (source.status !== "ready") throw new Error("fixture source");
    const host = document.createElement("div");
    host.innerHTML = source.html;
    document.body.append(host);
    expect(() =>
      captureEquationDisplayList(
        host.querySelector<HTMLElement>(".katex")!,
        host,
        window,
        equationPresentationLimits(),
        () => {},
      ),
    ).toThrow(/unsupported/u);
  },
);

test("changed allowlisted font during await fails before any raster is retained", async () => {
  const resolves: Array<() => void> = [];
  fonts.load.mockImplementation(
    (font: string) =>
      new Promise<FontFace[]>((resolve) => {
        resolves.push(() => {
          void loadFaces(font).then(resolve);
        });
      }),
  );
  let switched = false;
  const original = vi.mocked(window.getComputedStyle).getMockImplementation()!;
  vi.mocked(window.getComputedStyle).mockImplementation((element, pseudo) => {
    const style = original(element, pseudo);
    return !pseudo && switched && element.matches(".mathnormal")
      ? ({ ...style, fontFamily: "KaTeX_Main", fontStyle: "normal" } as CSSStyleDeclaration)
      : style;
  });
  const service = createEquationPresentationService({ document });
  const pending = service.prepare(input(), { isCurrent: () => true });
  switched = true;
  for (const resolve of resolves) resolve();
  expect(await pending).toMatchObject({ reason: "font" });
  expect(context.fillText).not.toHaveBeenCalled();
  expect(document.body.children).toHaveLength(0);
  service.dispose();
});

test("font events invalidate cache only, preserve active cold loads and detach on disposal", async () => {
  const handlers = new Map<string, () => void>();
  const remove = vi.fn((event: string) => handlers.delete(event));
  Object.assign(fonts, {
    addEventListener: (event: string, callback: () => void) => handlers.set(event, callback),
    removeEventListener: remove,
  });
  const service = createEquationPresentationService({ document });
  const pending = service.prepare(input(), { isCurrent: () => true });
  handlers.get("loading")?.();
  const ready = await pending;
  expect(ready.status).toBe("ready");
  handlers.get("loadingdone")?.();
  if (ready.status === "ready") expect(ready.isValid()).toBe(false);
  service.dispose();
  expect(remove).toHaveBeenCalledTimes(3);
});

test("all-rule output still verifies the root KaTeX_Main metrics face", async () => {
  const service = createEquationPresentationService({ document });
  const ready = await service.prepare(input("\\rule{1em}{1em}"), { isCurrent: () => true });
  expect(ready.status).toBe("ready");
  expect(fonts.load).toHaveBeenCalledWith('normal 400 24.2px "KaTeX_Main"', "M");
  service.dispose();
});

test("native color setter rejection fails closed instead of keeping an old fill", () => {
  let fill = "#000000";
  Object.defineProperty(context, "fillStyle", {
    get: () => fill,
    set: (value: string) => {
      if (value !== "url(#gradient)") fill = value;
    },
  });
  expect(() =>
    paintEquationDisplayList(
      context as unknown as CanvasRenderingContext2D,
      [{ kind: "rect", x: 0, y: 0, w: 1, h: 1, clips: [], color: "url(#gradient)" }],
      () => {},
      (d) => new Path2D(d),
    ),
  ).toThrow(/rejected/u);
  expect(context.fillRect).not.toHaveBeenCalled();
});

test("empty generated pseudo-elements with paint cannot disappear from a ready display list", () => {
  const original = vi.mocked(window.getComputedStyle).getMockImplementation()!;
  vi.mocked(window.getComputedStyle).mockImplementation((element, pseudo) =>
    pseudo === "::before"
      ? ({ content: '""', backgroundColor: "red" } as CSSStyleDeclaration)
      : original(element, pseudo),
  );
  const host = document.createElement("div");
  host.innerHTML = '<span class="katex"><span>x</span></span>';
  document.body.append(host);
  expect(() =>
    captureEquationDisplayList(
      host.firstElementChild as HTMLElement,
      host,
      window,
      equationPresentationLimits(),
      () => {},
    ),
  ).toThrow(/pseudo-element/u);
});

test("same source key with changed measured pixels replaces and disposes the old raster", async () => {
  const service = createEquationPresentationService({ document });
  const captured = input();
  const first = await service.prepare(captured, { isCurrent: () => true });
  expect(first.status).toBe("ready");
  vi.mocked(Range.prototype.getBoundingClientRect).mockReturnValue(bounds(12, 10, 8, 20));
  const second = await service.prepare(captured, { isCurrent: () => true });
  expect(second.status).toBe("ready");
  expect(second).not.toBe(first);
  if (first.status === "ready") {
    expect(first.isValid()).toBe(false);
    expect(first.canvas.width).toBe(0);
  }
  service.dispose();
});
