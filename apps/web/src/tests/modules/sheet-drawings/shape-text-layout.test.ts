import { describe, expect, test, vi } from "vitest";
import type { ShapeTextDirection } from "@sheetcraft/core/shape-text";
import { getCellTextGraphemes } from "@sheetcraft/sheet-engine/text-layout";
import {
  getShapeTextNativeDirection,
  layoutShapeText,
  shapeTextCanvasFont,
  ShapeTextLayoutError,
  SHAPE_TEXT_LAYOUT_LIMITS,
  type ShapeTextLayoutInput,
  type ShapeTextMeasurer,
} from "../../../modules/sheet-drawings/shape-text-layout";
import {
  getShapeTextVerticalOrientation,
  SHAPE_TEXT_VERTICAL_ORIENTATION_SOURCE_SHA,
  SHAPE_TEXT_VERTICAL_ORIENTATION_VERSION,
} from "../../../modules/sheet-drawings/shape-text-vertical-orientation";

const measurer: ShapeTextMeasurer = {
  measure: (value) => getCellTextGraphemes(value).length * 10,
  measureMetrics: (value) => ({
    width: getCellTextGraphemes(value).length * 10,
    ascent: 15,
    descent: 5,
    inkLeft: 0,
    inkRight: getCellTextGraphemes(value).length * 10,
  }),
};
function input(overrides: Partial<ShapeTextLayoutInput> = {}): ShapeTextLayoutInput {
  return {
    text: "alpha beta gamma\nsecond line",
    textRect: { x: 0, y: 0, width: 100, height: 100 },
    font: { family: "Test face", size: 20, weight: 400, italic: false },
    normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 25 },
    measurer,
    layout: {
      direction: "horizontal",
      blockAlignment: "start",
      lineOrder: "rtl",
      marginsPt: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 },
      wrap: true,
      overflow: false,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: { alignment: "left", beforePt: 0, afterPt: 0, lineSpacing: { kind: "normal" } },
    ...overrides,
  };
}
function withLayout(
  changes: Partial<ShapeTextLayoutInput["layout"]>,
  rest: Partial<ShapeTextLayoutInput> = {},
) {
  const base = input(rest);
  return { ...base, layout: { ...base.layout, ...changes } };
}
function errorCode(value: ShapeTextLayoutInput): string {
  try {
    layoutShapeText(value);
  } catch (error) {
    expect(error).toBeInstanceOf(ShapeTextLayoutError);
    return (error as ShapeTextLayoutError).code;
  }
  throw new Error("Expected a bounded layout failure.");
}

describe("bounded numeric shape text layout", () => {
  test.each([
    [true, false],
    [true, true],
    [false, false],
    [false, true],
  ] as const)("wrap=%s and overflow=%s are independent", (wrap, overflow) => {
    const result = layoutShapeText(
      withLayout({ wrap, overflow }, { textRect: { x: 0, y: 0, width: 60, height: 20 } }),
    );
    expect(result.lines.length).toBe(wrap ? 5 : 2);
    expect(result.lines.filter((line) => line.paragraphEnd)).toHaveLength(2);
    expect(
      result.lines
        .filter((line) => line.paragraphIndex === 0)
        .map((line) => line.text)
        .join(""),
    ).toBe("alpha beta gamma");
    expect(result.clipRect).toEqual(overflow ? null : result.contentRect);
    expect(result.requiredExtent.height).toBe(wrap ? 125 : 50);
    expect(result.requiredExtent.width).toBe(wrap ? 60 : 160);
    expect(result.fits).toBe(false);
    if (overflow) expect(result.visibleInkBounds).toEqual(result.inkBounds);
    else expect(result.visibleInkBounds!.height).toBeLessThanOrEqual(20);
  });

  test("hard breaks, CRLF, leading whitespace and trailing blank paragraphs survive", () => {
    const result = layoutShapeText(withLayout({ wrap: false }, { text: "  a\r\n\r\nb \r" }));
    expect(result.lines.map((line) => line.text)).toEqual(["  a", "", "b ", ""]);
    expect(result.lines.every((line) => line.paragraphEnd)).toBe(true);
    expect(result.requiredExtent).toEqual({ width: 30, height: 100, inline: 30, block: 100 });
    expect(result.runs.map((run) => run.text)).toEqual(["  a", "b "]);
  });
  test("an empty source still reserves one blank paragraph", () => {
    const result = layoutShapeText(input({ text: "" }));
    expect(result.lines).toHaveLength(1);
    expect(result.runs).toHaveLength(0);
    expect(result.inkBounds).toBeNull();
    expect(result.requiredExtent.height).toBe(25);
  });
  test("physical margins apply once to the actual non-frame text rectangle", () => {
    const base = input({
      text: "abc",
      textRect: { x: 20, y: 30, width: 100, height: 80 },
      pointsToPx: 2,
    });
    base.layout.marginsPt = { leftPt: 3, rightPt: 5, topPt: 7, bottomPt: 11 };
    const result = layoutShapeText(base);
    expect(result.contentRect).toEqual({ x: 26, y: 44, width: 84, height: 44 });
    expect(result.runs[0]!.x).toBe(26);
    expect(result.runs[0]!.y).toBe(61.5);
    expect(result.requiredExtent).toEqual({ width: 46, height: 61, inline: 30, block: 25 });
    expect(base.textRect).toEqual({ x: 20, y: 30, width: 100, height: 80 });
  });
  test("before/after spacing surrounds hard paragraphs, never soft lines", () => {
    const base = input({
      text: "abc def\nghi",
      textRect: { x: 0, y: 0, width: 40, height: 200 },
      pointsToPx: 1,
    });
    base.paragraph = {
      alignment: "left",
      beforePt: 2,
      afterPt: 3,
      lineSpacing: { kind: "normal" },
    };
    const result = layoutShapeText(base);
    expect(result.lines.map((line) => line.blockStart)).toEqual([2, 27, 57]);
    expect(result.requiredExtent.block).toBe(85);
  });
  test("exact point spacing uses a fixed advance even when ink overlaps", () => {
    const base = input({ text: "a\nb", pointsToPx: 1 });
    base.paragraph.lineSpacing = { kind: "exact", pt: 8 };
    const result = layoutShapeText(base);
    expect(result.lines.map((line) => line.blockAdvance)).toEqual([8, 8]);
    expect(result.runs[1]!.y - result.runs[0]!.y).toBe(8);
    expect(result.requiredExtent.block).toBe(28);
    expect(result.fits).toBe(false); // Negative leading places ink above the margin edge.
  });
  test("justified native words share one font baseline despite different glyph ink extents", () => {
    const native: ShapeTextMeasurer = {
      measure: (text) => text.length * 10,
      measureMetrics: (text) => ({
        width: text.length * 10,
        ascent: text.includes("A") ? 15 : 8,
        descent: text.includes("g") ? 5 : 0,
        inkLeft: 0,
        inkRight: text.length * 10,
      }),
    };
    const base = input({
      text: "A g xx yy",
      textRect: { x: 0, y: 0, width: 75, height: 100 },
      measurer: native,
    });
    base.paragraph.alignment = "justify";
    const result = layoutShapeText(base);
    const words = result.lines[0]!.runs.filter((run) => /\S/u.test(run.text));
    expect(new Set(words.map((run) => run.y)).size).toBe(1);
    expect(words.every((run) => run.ascentPx === 15 && run.descentPx === 5)).toBe(true);
    expect(words[0]!.inkBounds.y).toBeLessThan(words[1]!.inkBounds.y);
    const stacked = layoutShapeText(
      withLayout({ direction: "stacked", wrap: false }, { text: "Ag", measurer: native }),
    );
    expect(stacked.runs[1]!.y - stacked.runs[0]!.y).toBe(25);
  });
  test("normal line advance reserves actual resolved font extents", () => {
    const result = layoutShapeText(
      input({
        text: "x",
        measurer: {
          measure: () => 10,
          measureMetrics: () => ({ width: 10, ascent: 30, descent: 10 }),
        },
      }),
    );
    expect(result.lines[0]!.blockAdvance).toBe(40);
    expect(result.requiredExtent.height).toBe(40);
    expect(result.inkBoundsAccuracy).toBe("advance-box");
  });
  test("justification expands only internal gaps on soft lines", () => {
    const base = input({ text: "ab c de f", textRect: { x: 0, y: 0, width: 75, height: 100 } });
    base.paragraph.alignment = "justify";
    const result = layoutShapeText(base);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.paragraphEnd).toBe(false);
    expect(result.lines[0]!.inlineExtent).toBe(75);
    expect(result.lines[1]!.paragraphEnd).toBe(true);
    expect(result.lines[1]!.inlineExtent).toBeLessThan(75);
    expect(result.lines.map((line) => line.text).join("")).toBe(base.text);
    const firstWord = result.lines[0]!.runs.find((run) => run.text === "ab")!;
    expect(firstWord.text).toBe("ab");
    expect(result.lines[0]!.runs.at(-1)!.x).toBeGreaterThan(30);
  });
  test("pure CJK soft lines justify between intact clusters, never on paragraph-final lines", () => {
    const base = input({ text: "中文文", textRect: { x: 0, y: 0, width: 25, height: 100 } });
    base.paragraph.alignment = "justify";
    const result = layoutShapeText(base);
    expect(result.lines.map((line) => line.inlineExtent)).toEqual([25, 10]);
    expect(result.lines[0]!.runs.map((run) => run.x)).toEqual([0, 15]);
    expect(result.runs.map((run) => run.text).join("")).toBe(base.text);
    const vertical = {
      ...base,
      textRect: { x: 0, y: 0, width: 100, height: 60 },
      layout: { ...base.layout, direction: "vertical-rl" as const },
    };
    const verticalResult = layoutShapeText(vertical);
    expect(verticalResult.lines.map((line) => line.inlineExtent)).toEqual([60, 25]);
    expect(verticalResult.lines[0]!.runs[0]!.y).toBe(17.5);
    expect(verticalResult.lines[0]!.runs[1]!.y).toBe(52.5);
  });
  test.each(["left", "center", "right"] as const)(
    "paragraph %s aligns on the logical inline axis",
    (alignment) => {
      const base = input({ text: "abc" });
      base.paragraph.alignment = alignment;
      const result = layoutShapeText(base);
      expect(result.runs[0]!.x).toBe(alignment === "left" ? 0 : alignment === "center" ? 35 : 70);
    },
  );

  test.each([
    "horizontal",
    "vertical-rl",
    "vertical-lr",
    "rotate-90",
    "rotate-270",
    "stacked",
  ] as const)("%s respects the observed Latin orientation and logical column axis", (direction) => {
    const base = input({
      text: "ab cd\nef gh",
      textRect: { x: 0, y: 0, width: 288, height: 192 },
      font: { family: "Calibri", size: 32, weight: 400, italic: false },
      normalLineMetrics: { ascent: 24, descent: 8, lineAdvance: 44 },
      measurer: {
        measure: (text) => getCellTextGraphemes(text).length * 16,
        measureMetrics: (text) => ({
          width: getCellTextGraphemes(text).length * 16,
          ascent: 24,
          descent: 8,
          inkLeft: 0,
          inkRight: getCellTextGraphemes(text).length * 16,
        }),
      },
    });
    base.layout.direction = direction;
    base.layout.marginsPt = { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 };
    const result = layoutShapeText(base),
      first = result.runs[0]!;
    expect(result.lines).toHaveLength(direction === "stacked" ? 4 : 2);
    expect(first.angle).toBe(
      direction === "horizontal" || direction === "stacked"
        ? 0
        : direction === "rotate-270"
          ? 270
          : 90,
    );
    if (direction === "horizontal") expect(result.runs[1]!.y).toBeGreaterThan(first.y);
    else {
      const nextParagraph = result.lines.find((line) => line.paragraphIndex === 1)!.runs[0]!;
      expect(nextParagraph.x > first.x).toBe(
        direction === "vertical-lr" || direction === "rotate-270",
      );
      if (direction === "rotate-270") expect(first.y).toBeCloseTo(187.2);
      else expect(first.y).toBeGreaterThanOrEqual(4.8 - 1e-7);
    }
  });
  test.each(["rtl", "ltr"] as const)(
    "stacked %s keeps glyphs upright and changes default block anchor",
    (lineOrder) => {
      const result = layoutShapeText(
        withLayout(
          { direction: "stacked", lineOrder },
          { text: "ab\ncd", textRect: { x: 0, y: 0, width: 200, height: 100 } },
        ),
      );
      expect(result.runs.map((run) => run.text)).toEqual(["a", "b", "c", "d"]);
      expect(result.runs.every((run) => run.angle === 0)).toBe(true);
      expect(result.runs[1]!.y - result.runs[0]!.y).toBe(25);
      expect(result.runs[2]!.x > result.runs[0]!.x).toBe(lineOrder === "ltr");
      expect(result.lines[0]!.rect.x).toBe(lineOrder === "ltr" ? 0 : 175);
    },
  );
  test("stacked generous height and nowrap do not invent space-delimited columns", () => {
    for (const wrap of [true, false]) {
      const result = layoutShapeText(
        withLayout(
          { direction: "stacked", wrap },
          { text: "ab cd", textRect: { x: 0, y: 0, width: 200, height: 500 } },
        ),
      );
      expect(result.lines).toHaveLength(1);
      expect(result.runs.map((run) => run.text)).toEqual(["a", "b", " ", "c", "d"]);
      expect(result.requiredExtent.inline).toBe(125);
    }
    const noWrap = layoutShapeText(
      withLayout(
        { direction: "stacked", wrap: false },
        { text: "ab cd", textRect: { x: 0, y: 0, width: 200, height: 50 } },
      ),
    );
    expect(noWrap.lines).toHaveLength(1);
    expect(noWrap.fits).toBe(false);
  });
  test.each([
    "horizontal",
    "vertical-rl",
    "vertical-lr",
    "rotate-90",
    "rotate-270",
    "stacked",
  ] as const)("%s resolves block center/end along its own physical axis", (direction) => {
    const results = ["start", "center", "end"].map((blockAlignment) =>
      layoutShapeText(
        withLayout(
          { direction, blockAlignment: blockAlignment as "start" | "center" | "end" },
          { text: "ab", textRect: { x: 0, y: 0, width: 200, height: 200 } },
        ),
      ),
    );
    expect(results.map((value) => value.lines[0]!.blockStart)).toEqual([0, 87.5, 175]);
    const coordinate = results.map((value) =>
      direction === "horizontal" ? value.runs[0]!.y : value.runs[0]!.x,
    );
    expect(Math.abs(coordinate[1]! - coordinate[0]!)).toBe(87.5);
    expect(Math.abs(coordinate[2]! - coordinate[0]!)).toBe(175);
  });
  test("lineOrder only changes stacked columns", () => {
    for (const direction of [
      "horizontal",
      "vertical-rl",
      "vertical-lr",
      "rotate-90",
      "rotate-270",
    ] as ShapeTextDirection[]) {
      const rtl = layoutShapeText(withLayout({ direction, lineOrder: "rtl" }, { text: "ab\ncd" }));
      const ltr = layoutShapeText(withLayout({ direction, lineOrder: "ltr" }, { text: "ab\ncd" }));
      expect(rtl).toEqual(ltr);
    }
  });
  test("Unicode17 mixed vertical keeps CJK and emoji upright, Latin intact sideways, and differs from whole rotation", () => {
    const source = "中文ab，。ー😀e\u0301";
    const mixed = layoutShapeText(
      withLayout(
        { direction: "vertical-rl", wrap: false },
        { text: source, textRect: { x: 0, y: 0, width: 200, height: 500 } },
      ),
    );
    const rotated = layoutShapeText(
      withLayout(
        { direction: "rotate-90", wrap: false },
        { text: source, textRect: { x: 0, y: 0, width: 200, height: 500 } },
      ),
    );
    expect(mixed.runs.map((run) => run.text).join("")).toBe(source);
    expect(mixed.runs.find((run) => run.text === "中")!.angle).toBe(0);
    expect(mixed.runs.find((run) => run.text === "ab")!.angle).toBe(90);
    expect(mixed.runs.find((run) => run.text === "😀")!.angle).toBe(0);
    expect(mixed.runs.find((run) => run.text === "e\u0301")!.text).toBe("e\u0301");
    expect(mixed.runs.find((run) => run.text === "，")!.verticalGlyphFallback).toBe(true);
    expect(mixed.runs.find((run) => run.text === "。")!.angle).toBe(0);
    expect(mixed.runs.find((run) => run.text === "ー")!.angle).toBe(90);
    expect(rotated.runs).toHaveLength(1);
    expect(rotated.runs[0]!.text).toBe(source);
    expect(rotated.runs[0]!.angle).toBe(90);
  });
  test("official fixed Unicode17 data includes punctuation, Hangul and supplementary Han", () => {
    expect(SHAPE_TEXT_VERTICAL_ORIENTATION_VERSION).toBe("17.0.0");
    expect(SHAPE_TEXT_VERTICAL_ORIENTATION_SOURCE_SHA).toBe(
      "c601f181231bd3afdfef4bb75b660ffe7ceef0d6",
    );
    expect(
      [0x41, 0x4e2d, 0xac00, 0x20000, 0x3001, 0x3002, 0x30fc, 0xff08, 0x1f600].map(
        getShapeTextVerticalOrientation,
      ),
    ).toEqual(["R", "U", "U", "U", "Tu", "Tu", "Tr", "Tr", "U"]);
  });
  test.each(["horizontal", "vertical-rl", "rotate-90", "rotate-270"] as const)(
    "%s preserves complete Arabic native shaping runs",
    (direction) => {
      const source = "السَّلَامُ عليكم";
      const measured: string[] = [];
      const result = layoutShapeText(
        withLayout(
          { direction, wrap: false },
          {
            text: source,
            measurer: {
              measure: (value) => {
                measured.push(value);
                return 60;
              },
            },
          },
        ),
      );
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0]!.text).toBe(source);
      expect(result.runs[0]!.direction).toBe("rtl");
      expect(measured).toEqual([source]);
    },
  );
  test("unavailable complex vertical/stacked shaping is explicit", () => {
    expect(errorCode(withLayout({ direction: "stacked" }, { text: "سلام" }))).toBe(
      "unavailable-script",
    );
    expect(errorCode(withLayout({ direction: "vertical-rl" }, { text: "中سلام" }))).toBe(
      "unavailable-script",
    );
    expect(errorCode(withLayout({ direction: "vertical-rl" }, { text: "ᚁ" }))).toBe(
      "unavailable-script",
    );
    const base = input({
      text: "שלום שלום שלום",
      textRect: { x: 0, y: 0, width: 105, height: 100 },
    });
    base.paragraph.alignment = "justify";
    expect(errorCode(base)).toBe("unavailable-script");
  });
  test("combining, family emoji and flags are never split by narrow wrapping or stacking", () => {
    const source = "e\u0301👨‍👩‍👧‍👦🇨🇳";
    const result = layoutShapeText(
      input({ text: source, textRect: { x: 0, y: 0, width: 1, height: 100 } }),
    );
    expect(result.lines.map((line) => line.text)).toEqual(["e\u0301", "👨‍👩‍👧‍👦", "🇨🇳"]);
    const stacked = layoutShapeText(
      withLayout({ direction: "stacked", wrap: false }, { text: source }),
    );
    expect(stacked.runs.map((run) => run.text)).toEqual(["e\u0301", "👨‍👩‍👧‍👦", "🇨🇳"]);
  });
  test("native ink overhang and rotation feed unclipped bounds and measured requirements", () => {
    const precise: ShapeTextMeasurer = {
      measure: () => 20,
      measureMetrics: () => ({ width: 20, ascent: 15, descent: 5, inkLeft: -3, inkRight: 24 }),
    };
    const horizontal = layoutShapeText(
      withLayout({ wrap: false, overflow: true }, { text: "x", measurer: precise }),
    );
    expect(horizontal.inkBounds).toEqual({ x: -3, y: 2.5, width: 27, height: 20 });
    expect(horizontal.requiredExtent.width).toBe(27);
    expect(horizontal.inkBoundsAccuracy).toBe("ink-metrics");
    const rotated = layoutShapeText(
      withLayout({ direction: "rotate-270", wrap: false }, { text: "x", measurer: precise }),
    );
    expect(rotated.inkBounds).toEqual({ x: 2.5, y: 76, width: 20, height: 27 });
  });
  test("italic native overhang uses outer textRect margin space without failing fixed-width AutoFit", () => {
    const precise: ShapeTextMeasurer = {
      measure: () => 20,
      measureMetrics: () => ({ width: 20, ascent: 15, descent: 5, inkLeft: -3, inkRight: 24 }),
    };
    const base = withLayout(
      { marginsPt: { leftPt: 6, rightPt: 6, topPt: 4, bottomPt: 4 }, autoFit: "resize-shape" },
      {
        text: "x",
        textRect: { x: 10, y: 20, width: 50, height: 60 },
        measurer: precise,
        pointsToPx: 1,
        font: { family: "Test face", size: 20, weight: 400, italic: true },
      },
    );
    const result = layoutShapeText(base);
    expect(result.contentRect).toEqual({ x: 16, y: 24, width: 38, height: 52 });
    expect(result.clipRect).toEqual(base.textRect);
    expect(result.inkBounds!.x).toBe(13);
    expect(result.visibleInkBounds).toEqual(result.inkBounds);
    expect(result.requiredExtent.width).toBe(32);
    expect(result.requiredExtent.height).toBe(33);
    expect(result.fits).toBe(true);
    const withoutMargins = layoutShapeText({
      ...base,
      layout: { ...base.layout, marginsPt: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 } },
    });
    expect(withoutMargins.fits).toBe(false);
    expect(withoutMargins.visibleInkBounds!.x).toBe(10);
  });
  test("overflow permission and AutoFit marker do not change natural measurement or frame", () => {
    const base = input({ text: "abc def ghij", textRect: { x: 20, y: 30, width: 50, height: 20 } });
    const before = structuredClone({
      text: base.text,
      textRect: base.textRect,
      layout: base.layout,
      paragraph: base.paragraph,
      font: base.font,
    });
    const hidden = layoutShapeText(base),
      visible = layoutShapeText({
        ...base,
        layout: { ...base.layout, overflow: true, autoFit: "resize-shape", keepFlat: true },
      });
    expect(visible.requiredExtent).toEqual(hidden.requiredExtent);
    expect(visible.runs).toEqual(hidden.runs);
    expect({
      text: base.text,
      textRect: base.textRect,
      layout: base.layout,
      paragraph: base.paragraph,
      font: base.font,
    }).toEqual(before);
    visible.runs[0]!.font.family = "changed output";
    expect(base.font.family).toBe("Test face");
  });
  test("no 2D counter-rotation or body projection is introduced by keepFlat", () => {
    const ordinary = layoutShapeText(input({ text: "ab" }));
    const flat = layoutShapeText(withLayout({ keepFlat: true }, { text: "ab" }));
    expect(flat).toEqual(ordinary);
    expect(flat.runs[0]!.angle).toBe(0);
  });
  test("missing geometry, inline extent, metrics and malformed scalars return bounded errors", () => {
    expect(errorCode(input({ textRect: undefined }))).toBe("unavailable-text-rect");
    expect(errorCode(input({ textRect: { x: 0, y: 0, width: 0, height: 1 } }))).toBe(
      "unavailable-text-rect",
    );
    expect(
      errorCode(withLayout({ marginsPt: { leftPt: 100, rightPt: 0, topPt: 0, bottomPt: 0 } })),
    ).toBe("unavailable-text-rect");
    expect(
      errorCode(input({ normalLineMetrics: { ascent: 0, descent: 0, lineAdvance: 25 } })),
    ).toBe("unavailable-metrics");
    expect(errorCode(input({ measurer: { measure: () => NaN } }))).toBe("unavailable-metrics");
    expect(
      errorCode(input({ normalLineMetrics: { ascent: 1e308, descent: 1e308, lineAdvance: 25 } })),
    ).toBe("unavailable-metrics");
    expect(
      errorCode(
        input({
          measurer: {
            measure: () => 10,
            measureMetrics: () => ({
              width: 10,
              ascent: 15,
              descent: 5,
              inkLeft: -1e308,
              inkRight: 1e308,
            }),
          },
        }),
      ),
    ).toBe("unavailable-metrics");
    expect(
      errorCode(
        input({
          measurer: {
            measure: () => {
              throw new Error("Font missing");
            },
          },
        }),
      ),
    ).toBe("unavailable-metrics");
    expect(errorCode(input({ text: "\ud800" }))).toBe("invalid-input");
    expect(errorCode(input({ text: "\udc00" }))).toBe("invalid-input");
  });
  test("a too-small block can still be measured for a larger AutoFit candidate", () => {
    const result = layoutShapeText(
      withLayout(
        { marginsPt: { leftPt: 0, rightPt: 0, topPt: 10, bottomPt: 10 } },
        { text: "ab", textRect: { x: 0, y: 0, width: 100, height: 5 }, pointsToPx: 1 },
      ),
    );
    expect(result.contentRect.height).toBe(0);
    expect(result.requiredExtent.height).toBe(45);
    expect(result.fits).toBe(false);
    expect(result.visibleInkBounds).toBeNull();
  });
  test("without a full grapheme segmenter layout fails rather than using scalar fallback", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter")!;
    Object.defineProperty(Intl, "Segmenter", { configurable: true, value: undefined });
    try {
      expect(errorCode(input({ text: "e\u0301" }))).toBe("unavailable-grapheme-segmentation");
    } finally {
      Object.defineProperty(Intl, "Segmenter", descriptor);
    }
  });
  test("4096 lines are accepted, the next line and excess input are never silently truncated", () => {
    expect(
      layoutShapeText(
        withLayout({ wrap: false }, { text: "\n".repeat(SHAPE_TEXT_LAYOUT_LIMITS.lines - 1) }),
      ).lines,
    ).toHaveLength(4096);
    expect(
      errorCode(withLayout({ wrap: false }, { text: "\n".repeat(SHAPE_TEXT_LAYOUT_LIMITS.lines) })),
    ).toBe("layout-budget");
    expect(errorCode(input({ text: "a".repeat(100001) }))).toBe("layout-budget");
    expect(
      errorCode(
        input({ text: "a".repeat(100000), textRect: { x: 0, y: 0, width: 1, height: 100 } }),
      ),
    ).toBe("layout-budget");
  });
  test("long-word shaping uses bounded logarithmic probes rather than every growing prefix", () => {
    const measure = vi.fn((value: string) => value.length);
    const result = layoutShapeText(
      input({
        text: "a".repeat(100000),
        font: { family: "Test face", size: 1, weight: 400, italic: false },
        measurer: { measure },
        textRect: { x: 0, y: 0, width: 16000, height: 200 },
      }),
    );
    expect(result.lines).toHaveLength(7);
    expect(result.lines.map((line) => line.text).join("")).toHaveLength(100000);
    expect(measure.mock.calls.length).toBeLessThan(250); // Logarithmic probes and bounded cache, never every prefix.
    expect(measure.mock.calls.reduce((sum, call) => sum + call[0].length, 0)).toBeLessThan(2000000);
    expect(result.measurementCount).toBe(measure.mock.calls.length);
  });
  test("Canvas font and native base direction are shared public shaping inputs", () => {
    expect(shapeTextCanvasFont({ family: "A face", size: 20, weight: 700, italic: true })).toBe(
      'italic 700 20px "A face"',
    );
    expect(
      shapeTextCanvasFont({ family: "Arial, sans-serif", size: 20, weight: 400, italic: false }),
    ).toBe("400 20px Arial, sans-serif");
    expect(getShapeTextNativeDirection("שלום A")).toBe("rtl");
    expect(getShapeTextNativeDirection("A שלום")).toBe("ltr");
    expect(getShapeTextNativeDirection("\u200f123")).toBe("rtl");
  });
});
