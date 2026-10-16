import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeTextDirection } from "@sheetcraft/core/shape-text";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { getDrawingShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import {
  ensureDrawingShapeTextFont,
  getDrawingShapeTextRect,
  getDrawingShapeTextNativeWarpSource,
  layoutDrawingShapeText,
  prepareDrawingShapeTextCandidate,
  resolveDrawingShapeText,
  SHAPE_TEXT_AUTOFIT_LIMITS,
  ShapeTextRuntimeError,
  type DrawingShapeTextRuntimeOptions,
} from "../../../modules/sheet-drawings/shape-text-runtime";
import { ShapeTextLayoutError } from "../../../modules/sheet-drawings/shape-text-layout";

const resource = vi.hoisted(() => ({
  states: new Map<string, "idle" | "loading" | "ready" | "error">(),
  ensure: vi.fn<(family: string) => Promise<void>>(),
  fontRevision: { value: 0 },
}));
vi.mock("../../../shared/cell-text/text-metrics", () => ({
  cellTextFontRevision: resource.fontRevision,
  invalidateCellTextFontMetrics: vi.fn(),
}));
vi.mock("../../../shared/cell-text/font-resources", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../shared/cell-text/font-resources")>();
  return {
    ...original,
    getCellFontResourceStatus: (family: string) => ({
      family,
      kind: original.getCellFontResourceKind(family),
      state: resource.states.get(family) ?? "idle",
    }),
    ensureCellFontResource: resource.ensure,
  };
});

const native: DrawingShapeTextRuntimeOptions = {
  measurer: {
    measure: (text) => [...text].length * 10,
    measureMetrics: (text) => ({
      width: [...text].length * 10,
      ascent: 15,
      descent: 5,
      inkLeft: 0,
      inkRight: [...text].length * 10,
    }),
  },
  normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
};
function drawing(changes: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    id: "text-shape",
    name: "Text shape",
    kind: "textBox",
    anchor: { row: 3, column: 4 },
    offsetX: 7,
    offsetY: 11,
    width: 100,
    height: 100,
    text: "abc",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#123456",
    fontSize: 20,
    bold: false,
    italic: false,
    rotation: 0,
    ...changes,
  };
}
function autoFit(changes: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  const shapeText = createDefaultShapeText();
  shapeText.layout.autoFit = "resize-shape";
  shapeText.layout.marginsPt = { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 };
  return drawing({ shapeText, ...changes });
}
beforeEach(() => {
  resource.states.clear();
  resource.ensure.mockReset().mockImplementation(async (family) => {
    resource.states.set(family, "ready");
  });
  resource.fontRevision.value = 0;
});

describe("drawing shape-text resolution", () => {
  test("active warp retains the genuine native tuple and an unreflected straight editor source", () => {
    const source = autoFit({
      kind: "shape",
      shapeGeometry: { preset: "rightArrow" },
      shapeFlipX: true,
      shapeFlipY: true,
      width: 240,
      height: 160,
    });
    source.shapeText!.warp = { preset: "textWave1" };
    const rect = getDrawingShapeGeometry(source)!.textRect!;
    expect(getDrawingShapeTextRect(source)).toEqual({
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    });
    const layout = layoutDrawingShapeText(source, native);
    expect(layout.runs[0]!.angle).toBe(0);
    const retained = getDrawingShapeTextNativeWarpSource(source, layout);
    expect(retained.measurer).toBe(native.measurer);
    expect(retained.text).toBe(source.text);
    expect(retained.fontRevision).toBe(0);
    expect(getDrawingShapeTextNativeWarpSource(structuredClone(source), layout)).toBe(retained);
    for (const changed of [
      { ...source, text: "changed" },
      { ...source, fontSize: source.fontSize + 1 },
      { ...source, width: source.width + 1 },
      { ...source, shapeText: { ...source.shapeText!, warp: { preset: "textPlain" as const } } },
    ])
      expect(() => getDrawingShapeTextNativeWarpSource(changed, layout)).toThrow(
        /prepare its layout/,
      );
    const previousLanguage = document.documentElement.lang;
    try {
      document.documentElement.lang = previousLanguage === "zh-CN" ? "en-US" : "zh-CN";
      expect(() => getDrawingShapeTextNativeWarpSource(source, layout)).toThrow(
        /prepare its layout/,
      );
    } finally {
      document.documentElement.lang = previousLanguage;
    }
    resource.fontRevision.value++;
    expect(() => getDrawingShapeTextNativeWarpSource(source, layout)).toThrow(/ready font changed/);
  });
  test("None restores ordinary V180 and never manufactures a native warp lease", () => {
    const source = autoFit({ shapeFlipY: true });
    const layout = layoutDrawingShapeText(source, native);
    expect(layout.runs[0]!.angle).toBe(180);
    expect(() => getDrawingShapeTextNativeWarpSource(source, layout)).toThrow(/prepare its layout/);
  });
  test("AutoFit normalization preserves its final native source lease and retained warp", () => {
    const source = autoFit({
      kind: "shape",
      wordArt: true,
      shapeGeometry: { preset: "rect" },
      width: 100,
      height: 100,
    });
    source.shapeText!.layout.wrap = false;
    source.shapeText!.layout.overflow = true;
    source.shapeText!.warp = { preset: "textWave1" };
    // Deliberately distinct input property order is not a stale owner change.
    source.shapeText!.style = { fill: { kind: "none" } };
    const prepared = prepareDrawingShapeTextCandidate(source, native);
    expect(prepared.resized).toBe(true);
    expect(prepared.drawing.shapeText!.warp).toEqual(source.shapeText!.warp);
    expect(getDrawingShapeTextNativeWarpSource(prepared.drawing, prepared.layout).text).toBe("abc");
  });
  test("legacy reads preserve absent models and existing effective inset/layout", () => {
    const source = drawing({ kind: "shape", height: 60 });
    const before = structuredClone(source);
    const result = resolveDrawingShapeText(source, native);
    expect(result.drawing).toBe(source);
    expect(result.textRect).toEqual({ x: 6, y: 6, width: 88, height: 48 });
    expect(result.layoutOptions.marginsPt).toEqual({
      leftPt: 0,
      rightPt: 0,
      topPt: 0,
      bottomPt: 0,
    });
    expect(result.layoutOptions.blockAlignment).toBe("center");
    expect(result.paragraph.alignment).toBe("center");
    expect(source).toEqual(before);
    expect(source.shapeText).toBeUndefined();
    expect(prepareDrawingShapeTextCandidate(source, native).drawing).toBe(source);
  });
  test("legacy text boxes use a simple frame and apply their old 6px inset once", () => {
    const source = drawing({ textDirection: "vertical" });
    const resolved = resolveDrawingShapeText(source, native);
    expect(resolved.textRect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(resolved.layoutOptions.direction).toBe("vertical-rl");
    expect(layoutDrawingShapeText(source, native).contentRect).toEqual({
      x: 6,
      y: 6,
      width: 88,
      height: 88,
    });
    expect(source.shapeText).toBeUndefined();
    expect(source.textDirection).toBe("vertical");
  });
  test("uses a preset's true textRect rather than a bounding-frame substitute", () => {
    const source = autoFit({
      kind: "shape",
      shapeGeometry: { preset: "triangle" },
      width: 240,
      height: 160,
    });
    const rect = getDrawingShapeGeometry(source)!.textRect!;
    expect(getDrawingShapeTextRect(source)).toEqual({
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    });
    expect(getDrawingShapeTextRect(source)).not.toEqual({ x: 0, y: 0, width: 240, height: 160 });
  });
  test("missing actual text rectangles and unsupported drawing kinds fail clearly", () => {
    expect(() => resolveDrawingShapeText(drawing({ kind: "icon" }), native)).toThrow(
      ShapeTextRuntimeError,
    );
    expect(() =>
      resolveDrawingShapeText(drawing(), { ...native, getTextRect: () => undefined }),
    ).toThrowError(expect.objectContaining({ code: "unavailable-text-rect" }));
  });
  test("preserves the exact display family stack and a genuine ready-font revision", () => {
    const source = autoFit();
    source.shapeText!.fontFamily = 'Unknown installed face, "Noto Sans", sans-serif';
    resource.states.set("Noto Sans", "ready");
    resource.fontRevision.value = 9;
    const resolved = resolveDrawingShapeText(source, native);
    expect(resolved.font.family).toBe(source.shapeText!.fontFamily);
    expect(resolved.fontRevision).toBe(9);
    expect(resolved.normalLineMetricPolicy).toBe("provided-native");
    expect(resource.ensure).not.toHaveBeenCalled();
  });
  test.each(["idle", "loading", "error"] as const)(
    "owned font in %s state cannot be measured or fitted",
    (state) => {
      const source = autoFit();
      source.shapeText!.fontFamily = "Noto Sans";
      resource.states.set("Noto Sans", state);
      expect(() => prepareDrawingShapeTextCandidate(source, native)).toThrowError(
        expect.objectContaining({
          code: "font-not-ready",
          family: "Noto Sans",
        }),
      );
      expect(resource.ensure).not.toHaveBeenCalled();
      expect(source.height).toBe(100);
    },
  );
  test("a missing local alias in a quoted CSS stack is an explicit readiness failure", () => {
    const source = autoFit();
    const alias = `SheetcraftLocal_${"a".repeat(64)}`;
    source.shapeText!.fontFamily = `"${alias}", Arial`;
    expect(() => resolveDrawingShapeText(source, native)).toThrowError(
      expect.objectContaining({
        code: "font-not-ready",
        family: alias,
      }),
    );
  });
  test("unknown ordinary system stacks remain usable without owned-resource loading", async () => {
    const source = autoFit();
    source.shapeText!.fontFamily = 'Never installed here, "Other display fallback", serif';
    expect(resolveDrawingShapeText(source, native).font.family).toBe(source.shapeText!.fontFamily);
    await ensureDrawingShapeTextFont(source);
    expect(resource.ensure).not.toHaveBeenCalled();
  });
  test("explicit ensure loads only owned resources and waits for actual ready completion", async () => {
    const source = autoFit();
    const alias = `SheetcraftLocal_${"b".repeat(64)}`;
    source.shapeText!.fontFamily = `"Noto Sans", "${alias}", Arial`;
    await ensureDrawingShapeTextFont(source);
    expect(resource.ensure.mock.calls.map(([family]) => family)).toEqual(["Noto Sans", alias]);
    expect(resolveDrawingShapeText(source, native).font.family).toBe(source.shapeText!.fontFamily);
    resource.ensure.mockResolvedValue(undefined);
    resource.states.clear();
    await expect(ensureDrawingShapeTextFont(source)).rejects.toMatchObject({
      code: "font-not-ready",
    });
  });
  test("font-load failures retain their identity instead of silently measuring a fallback", async () => {
    const source = autoFit();
    source.shapeText!.fontFamily = "Noto Sans";
    const cause = new Error("missing managed bytes");
    resource.ensure.mockRejectedValue(cause);
    await expect(ensureDrawingShapeTextFont(source)).rejects.toBe(cause);
    expect(() => resolveDrawingShapeText(source, native)).toThrow(ShapeTextRuntimeError);
  });
  test("a partial native-measurement injection never triggers an approximate fallback", () => {
    expect(() => resolveDrawingShapeText(drawing(), { measurer: native.measurer })).toThrowError(
      expect.objectContaining({ code: "invalid-input" }),
    );
  });
});

describe("atomic fixed-width shape-text AutoFit candidates", () => {
  test("grows and shrinks from actual laid-out text without modifying its source", () => {
    const grow = autoFit({ width: 50, height: 20, text: "abcdefghijklmno" });
    const before = structuredClone(grow);
    const grown = prepareDrawingShapeTextCandidate(grow, native);
    expect(grown.drawing.height).toBeGreaterThanOrEqual(60);
    expect(grown.drawing.height).toBeLessThan(60.02);
    expect(grown.drawing.width).toBe(50);
    expect(grown.layout.lines).toHaveLength(3);
    expect(grown.layout.fits).toBe(true);
    expect(grown.resized).toBe(true);
    expect(grown.evaluations).toBeLessThanOrEqual(32);
    expect(grow).toEqual(before);
    const shrink = autoFit({ height: 200, text: "a\nb" });
    const shrunk = prepareDrawingShapeTextCandidate(shrink, native);
    expect(shrunk.drawing.height).toBeGreaterThanOrEqual(40);
    expect(shrunk.drawing.height).toBeLessThan(40.02);
    expect(shrunk.drawing.anchor).toEqual(shrink.anchor);
    expect(shrunk.drawing.offsetX).toBe(shrink.offsetX);
    expect(shrunk.drawing.offsetY).toBe(shrink.offsetY);
    expect(shrink.height).toBe(200);
  });
  test("overflow permission stays independent and never skips required fitting", () => {
    const source = autoFit({ width: 50, height: 20, text: "abcdefghijklmno" });
    source.shapeText!.layout.overflow = true;
    const result = prepareDrawingShapeTextCandidate(source, native);
    expect(result.drawing.height).toBeGreaterThanOrEqual(60);
    expect(result.layout.clipRect).toBeNull();
    expect(result.layout.fits).toBe(true);
    expect(result.drawing.shapeText!.layout.overflow).toBe(true);
  });
  test("manual height disables active AutoFit in the same candidate and keeps that exact height", () => {
    const source = autoFit({ height: 150 });
    const result = prepareDrawingShapeTextCandidate(source, {
      ...native,
      manualHeightChange: true,
    });
    expect(result.drawing.height).toBe(150);
    expect(result.drawing.shapeText!.layout.autoFit).toBe("none");
    expect(result.evaluations).toBe(1);
    expect(result.resized).toBe(false);
    expect(source.shapeText!.layout.autoFit).toBe("resize-shape");
  });
  test("manual height on legacy drawings does not materialize a model", () => {
    const source = drawing({ height: 150 });
    const result = prepareDrawingShapeTextCandidate(source, {
      ...native,
      manualHeightChange: true,
    });
    expect(result.drawing).toBe(source);
    expect(result.drawing.shapeText).toBeUndefined();
  });
  test("a width-only candidate remeasures and shrinks while retaining active AutoFit", () => {
    const source = autoFit({ width: 100, height: 60, text: "abcdefghijklmno" });
    const result = prepareDrawingShapeTextCandidate(source, native);
    expect(result.drawing.width).toBe(100);
    expect(result.drawing.height).toBeGreaterThanOrEqual(40);
    expect(result.drawing.height).toBeLessThan(40.02);
    expect(result.drawing.shapeText!.layout.autoFit).toBe("resize-shape");
  });
  test("an already fitting minimal height preserves its drawing identity", () => {
    const source = autoFit({ height: 20 });
    const result = prepareDrawingShapeTextCandidate(source, native);
    expect(result.drawing).toBe(source);
    expect(result.resized).toBe(false);
    expect(result.layout.fits).toBe(true);
  });
  test.each([
    "horizontal",
    "vertical-rl",
    "vertical-lr",
    "rotate-90",
    "rotate-270",
    "stacked",
  ] satisfies ShapeTextDirection[])("%s returns a verified product-numeric layout", (direction) => {
    const source = autoFit({ text: "abcd", height: 100 });
    source.shapeText!.layout.direction = direction;
    const result = prepareDrawingShapeTextCandidate(source, native);
    expect(result.layout.fits).toBe(true);
    expect(result.drawing.width).toBe(source.width);
    expect(result.layout).toEqual(layoutDrawingShapeText(result.drawing, native));
    expect(result.evaluations).toBeLessThanOrEqual(32);
  });
  test("re-evaluates an aspect-dependent textRect and returns the matching final layout atomically", () => {
    const source = autoFit({ text: "abcdefghijklmno", height: 30, rotation: 37 });
    const getTextRect = vi.fn((value: SheetGraphicDrawing) => ({
      x: 0,
      y: 0,
      width: Math.min(value.width, value.height),
      height: value.height,
    }));
    const options = { ...native, getTextRect };
    const result = prepareDrawingShapeTextCandidate(source, options);
    expect(result.layout.fits).toBe(true);
    expect(getTextRect).toHaveBeenCalledTimes(result.evaluations);
    expect(result.evaluations).toBeLessThanOrEqual(32);
    expect(result.layout).toEqual(layoutDrawingShapeText(result.drawing, options));
    expect(result.drawing.anchor).toEqual(source.anchor);
    expect(result.drawing.offsetX).toBe(source.offsetX);
    expect(result.drawing.offsetY).toBe(source.offsetY);
    expect(result.drawing.rotation).toBe(37);
  });
  test("does not skip a fitting intermediate geometry just because the maximum height fails", () => {
    const source = autoFit({ text: "abc", height: 20 });
    const options = {
      ...native,
      getTextRect: (value: SheetGraphicDrawing) => ({
        x: 0,
        y: 0,
        width: value.height > 100 ? 5 : 100,
        height: value.height > 100 ? 1 : value.height / 2,
      }),
    };
    const result = prepareDrawingShapeTextCandidate(source, options);
    expect(result.layout.fits).toBe(true);
    expect(result.drawing.height).toBeGreaterThanOrEqual(40);
    expect(result.drawing.height).toBeLessThan(40.02);
  });
  test("no fixed-width fit fails explicitly within the height and evaluation bounds", () => {
    const source = autoFit({ width: 20, height: 20, text: "abcdefgh" });
    source.shapeText!.layout.wrap = false;
    const before = structuredClone(source);
    const getTextRect = vi.fn(getDrawingShapeTextRect);
    expect(() => prepareDrawingShapeTextCandidate(source, { ...native, getTextRect })).toThrowError(
      expect.objectContaining({ code: "autofit-no-fit" }),
    );
    expect(getTextRect.mock.calls.length).toBeLessThanOrEqual(
      SHAPE_TEXT_AUTOFIT_LIMITS.evaluations,
    );
    expect(
      getTextRect.mock.calls.every(([value]) => value.height <= SHAPE_TEXT_AUTOFIT_LIMITS.extentPx),
    ).toBe(true);
    expect(source).toEqual(before);
  });
  test("unsupported script and invalid measurements keep the draft untouched and fail explicitly", () => {
    const source = autoFit({ text: "مرحبا" });
    source.shapeText!.layout.direction = "stacked";
    const before = structuredClone(source);
    expect(() => prepareDrawingShapeTextCandidate(source, native)).toThrow(ShapeTextLayoutError);
    expect(source).toEqual(before);
    expect(() =>
      prepareDrawingShapeTextCandidate(autoFit(), {
        ...native,
        measurer: { measure: () => NaN },
      }),
    ).toThrow(ShapeTextLayoutError);
  });
});

describe("attributed shape-text runtime and native AutoFit", () => {
  test("loads all distinct owned fonts across uniform and selected ranges", async () => {
    const alias = `SheetcraftLocal_${"c".repeat(64)}`;
    const source = autoFit({ text: "abc" });
    source.shapeText!.fontFamily = "Noto Sans";
    source.shapeText!.characterRuns = [
      { start: 0, end: 1, fontFamily: alias },
      { start: 1, end: 2, fontFamily: alias, color: "#ff0000" },
    ];
    await ensureDrawingShapeTextFont(source);
    expect(resource.ensure.mock.calls.map(([family]) => family)).toEqual(["Noto Sans", alias]);
    const result = resolveDrawingShapeText(source, {
      ...native,
      resolveNormalLineMetrics: () => native.normalLineMetrics!,
    });
    expect(result.characterSegments!.map((segment) => segment.font.family)).toEqual([
      alias,
      alias,
      "Noto Sans",
    ]);
    expect(result.characterSegments!.map((segment) => segment.color)).toEqual([
      undefined,
      "#ff0000",
      undefined,
    ]);
  });
  test("missing selected local resource blocks real layout and preserves the entire source", () => {
    const source = autoFit();
    const alias = `SheetcraftLocal_${"d".repeat(64)}`;
    source.shapeText!.characterRuns = [
      { start: 0, end: 1, fontFamily: alias, bold: true, color: "#ff0000" },
    ];
    const before = structuredClone(source);
    expect(() => layoutDrawingShapeText(source, native)).toThrowError(
      expect.objectContaining({ code: "font-not-ready", family: alias }),
    );
    expect(source).toEqual(before);
  });
  test("selected large native font contributes real geometry to one fixed-width AutoFit candidate", () => {
    const source = autoFit({ width: 100, height: 10, text: "ab" });
    source.shapeText!.characterRuns = [{ start: 0, end: 1, fontSize: 60, italic: true }];
    const prepared = prepareDrawingShapeTextCandidate(source, {
      ...native,
      resolveNormalLineMetrics: (font) => ({
        ascent: font.size * 0.75,
        descent: font.size * 0.25,
        lineAdvance: font.size,
      }),
    });
    expect(prepared.drawing.height).toBeGreaterThanOrEqual(60);
    expect(prepared.layout.runs.map((run) => run.font.size)).toEqual([60, 20]);
    expect(prepared.drawing.shapeText!.characterRuns).toEqual(source.shapeText!.characterRuns);
    expect(source.height).toBe(10);
  });
  test("vertical flip keeps attributed fields and authoritative offsets", () => {
    const source = autoFit({ shapeFlipY: true });
    source.shapeText!.characterRuns = [{ start: 0, end: 1, underline: true, color: "#ff0000" }];
    const result = layoutDrawingShapeText(source, native);
    expect(result.runs.map((run) => [run.sourceStart, run.sourceEnd, run.angle])).toEqual([
      [0, 1, 180],
      [1, 3, 180],
    ]);
    expect(result.runs[0]!.color).toBe("#ff0000");
    expect(result.runs[0]!.underline).toBe(true);
  });
});

describe("modern WordArt natural no-wrap AutoFit", () => {
  test("fits natural source width and height without changing font or wrapping", () => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.wrap = false;
    shapeText.layout.overflow = true;
    shapeText.layout.autoFit = "resize-shape";
    const source = drawing({
      kind: "shape",
      wordArt: true,
      shapeGeometry: { preset: "rect" },
      shapeText,
      text: "abcdefghijklmnopqrst",
      width: 100,
      height: 100,
    });
    const before = structuredClone(source);
    const result = prepareDrawingShapeTextCandidate(source, native);
    expect(result.layout.fits).toBe(true);
    expect(result.drawing.width).toBeCloseTo(219.2, 5);
    expect(result.drawing.height).toBeCloseTo(29.6, 1);
    expect(result.drawing.fontSize).toBe(20);
    expect(result.drawing.shapeText?.layout.wrap).toBe(false);
    expect(result.resized).toBe(true);
    expect(source).toEqual(before);
  });
  test("ordinary no-wrap shapes keep fixed-width rejection; explicit WordArt width disables AutoFit", () => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.wrap = false;
    shapeText.layout.overflow = true;
    shapeText.layout.autoFit = "resize-shape";
    const source = drawing({
      kind: "shape",
      shapeGeometry: { preset: "rect" },
      shapeText,
      text: "abcdefghijklmnopqrst",
      width: 100,
      height: 100,
    });
    expect(() => prepareDrawingShapeTextCandidate(source, native)).toThrow(/fixed-width/);
    const modern = { ...source, wordArt: true as const };
    const result = prepareDrawingShapeTextCandidate(modern, { ...native, manualWidthChange: true });
    expect(result.drawing.width).toBe(100);
    expect(result.drawing.shapeText?.layout.autoFit).toBe("none");
  });
});

test("literal source run effects remain sparse through resolved native character segments", () => {
  const shape = drawing({
    kind: "shape",
    shapeText: {
      ...createDefaultShapeText(),
      characterRuns: [
        {
          start: 0,
          end: 1,
          shadow: { kind: "none" },
          reflection: { kind: "none" },
          glow: { kind: "none" },
        },
      ],
    },
  });
  const resolved = resolveDrawingShapeText(shape, native);
  expect(resolved.characterSegments![0]).toMatchObject({
    start: 0,
    end: 1,
    shadow: { kind: "none" },
    reflection: { kind: "none" },
    glow: { kind: "none" },
  });
  expect(resolved.characterSegments![1]).not.toHaveProperty("shadow");
  const layout = layoutDrawingShapeText(shape, native);
  expect(layout.runs[0]).toHaveProperty("glow", { kind: "none" });
  expect(layout.runs[1]).not.toHaveProperty("glow");
});
