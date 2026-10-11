import { describe, expect, test, vi } from "vitest";
import {
  getAttributedTextLineHeight,
  getAttributedTextLayoutLineHeights,
  getAttributedTextSegments,
  measureAttributedText,
  requiresAttributedNativeBidiLayout,
  splitAttributedTextLines,
  supportsAttributedGraphemeSegmentation,
} from "../../attributed-text-layout.js";
import {
  getCellTextGraphemes,
  MAX_CELL_TEXT_LAYOUT_LINES,
  splitCellTextLines,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "../../text-layout.js";

const font: AutoRowHeightFont = { family: "Base", size: 10, weight: 700, italic: true };
const fixed: TextMeasurer = { measure: (text) => getCellTextGraphemes(text).length * 10 };
const familyWidth: TextMeasurer = {
  measure: (text, currentFont) =>
    (text.length * 10 - (text.match(/AV/gu)?.length ?? 0) * 4) *
    (currentFont.family === "Wide" ? 2 : 1),
};

describe("attributed text layout", () => {
  test("signals native bidi only for distinct effective text families, excluding delimiter-only runs", () => {
    const document = { text: "a\nTא", fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }] };
    expect(requiresAttributedNativeBidiLayout(document, font)).toBe(true);
    expect(requiresAttributedNativeBidiLayout({ ...document, text: "a\nTΩ" }, font)).toBe(false);
    expect(requiresAttributedNativeBidiLayout({ ...document, text: "a\nTΩ" }, font, "rtl")).toBe(
      true,
    );
    expect(requiresAttributedNativeBidiLayout({ text: document.text }, font, "rtl")).toBe(false);
    expect(
      requiresAttributedNativeBidiLayout(
        { ...document, fontRuns: [{ start: 0, end: document.text.length, fontFamily: "Tall" }] },
        font,
      ),
    ).toBe(false);
    expect(
      requiresAttributedNativeBidiLayout(
        { ...document, fontRuns: [{ start: 2, end: 3, fontFamily: "Base" }] },
        font,
      ),
    ).toBe(false);
    expect(
      requiresAttributedNativeBidiLayout(
        { text: "a\r\nא", fontRuns: [{ start: 1, end: 3, fontFamily: "Tall" }] },
        font,
      ),
    ).toBe(false);
    expect(
      requiresAttributedNativeBidiLayout(
        { text: "áא", fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }] },
        font,
      ),
    ).toBe(false);
    expect(
      requiresAttributedNativeBidiLayout(
        { text: "A\u{1e900}", fontRuns: [{ start: 1, end: 3, fontFamily: "Tall" }] },
        font,
      ),
    ).toBe(true);
  });

  test("uniform native bidi advances leave ordinary LTR and single-effective-family metrics alone", () => {
    const document = { text: "a\nTא", fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }] };
    const lines = [
      { ascent: 8, descent: 2 },
      { ascent: 35, descent: 5 },
    ];
    expect(getAttributedTextLayoutLineHeights(document, lines, font)).toEqual([40, 40]);
    expect(getAttributedTextLayoutLineHeights({ ...document, text: "a\nTΩ" }, lines, font)).toEqual(
      [12.5, 40],
    );
    expect(
      getAttributedTextLayoutLineHeights(
        { ...document, fontRuns: [{ start: 0, end: document.text.length, fontFamily: "Tall" }] },
        lines,
        font,
      ),
    ).toEqual([12.5, 40]);
    expect(
      getAttributedTextLayoutLineHeights(
        { ...document, fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }] },
        lines,
        font,
      ),
    ).toEqual([12.5, 40]);
    expect(getAttributedTextLayoutLineHeights(document, [], font)).toEqual([]);
  });

  test("measures whole effective families with inherited gaps and inherited size/style", () => {
    const measure = vi.fn(familyWidth.measure);
    const document = {
      text: "AVAV",
      fontRuns: [
        { start: 0, end: 1, fontFamily: "Wide" },
        { start: 1, end: 2, fontFamily: "Wide" },
        { start: 2, end: 3, fontFamily: "Base" },
      ],
    };
    expect(measureAttributedText(document, font, { measure })).toBe(48);
    expect(measure.mock.calls).toEqual([
      ["AV", { ...font, family: "Wide" }],
      ["AV", font],
    ]);
    expect(getAttributedTextSegments(document, font)).toEqual([
      { text: "AV", start: 0, end: 2, font: { ...font, family: "Wide" } },
      { text: "AV", start: 2, end: 4, font },
    ]);
    expect(measureAttributedText(document, font, familyWidth, 2, 4)).toBe(16);
  });

  test("uses complete line shaping across word tokens and never wraps at a font boundary", () => {
    const shaping: TextMeasurer = {
      measure: (text) => text.length * 10 - (text.includes("A V") ? 12 : 0),
    };
    expect(splitAttributedTextLines({ text: "A V" }, 25, font, shaping, true)).toMatchObject([
      { text: "A V", width: 18, start: 0, end: 3, paragraphEnd: true },
    ]);
    const mixed = {
      text: "ab cd",
      fontRuns: [{ start: 1, end: 4, fontFamily: "Wide" }],
    };
    expect(
      splitAttributedTextLines(mixed, 70, font, familyWidth, true).map((line) => line.text),
    ).toEqual(["ab ", "cd"]);
    expect(
      splitAttributedTextLines(mixed, 80, font, familyWidth, true).map((line) => line.text),
    ).toEqual(["ab cd"]);
  });

  test("keeps original UTF-16 offsets across CRLF, CR, LF, and trailing empty paragraphs", () => {
    const document = {
      text: "A\r\nB\rC\n",
      fontRuns: [{ start: 3, end: 4, fontFamily: "Wide" }],
    };
    const lines = splitAttributedTextLines(document, 1, font, familyWidth, false);
    expect(
      lines.map(({ text, start, end, width, paragraphEnd }) => ({
        text,
        start,
        end,
        width,
        paragraphEnd,
      })),
    ).toEqual([
      { text: "A", start: 0, end: 1, width: 10, paragraphEnd: true },
      { text: "B", start: 3, end: 4, width: 20, paragraphEnd: true },
      { text: "C", start: 5, end: 6, width: 10, paragraphEnd: true },
      { text: "", start: 7, end: 7, width: 0, paragraphEnd: true },
    ]);
    expect(lines[1]?.segments[0]?.font.family).toBe("Wide");
    for (const line of lines) expect(document.text.slice(line.start, line.end)).toBe(line.text);
  });

  test("preserves supplementary, combining, ZWJ, and flag clusters using leading-scalar family", () => {
    expect(supportsAttributedGraphemeSegmentation()).toBe(true);
    const document = {
      text: "😀a\u0301👩‍💻🇺🇳",
      fontRuns: [
        { start: 3, end: 4, fontFamily: "Combining Override" },
        { start: 4, end: 6, fontFamily: "Leading Override" },
        { start: 6, end: 9, fontFamily: "ZWJ Override" },
      ],
    };
    const lines = splitAttributedTextLines(document, 1, font, fixed, true);
    expect(lines.map(({ text, start, end }) => ({ text, start, end }))).toEqual([
      { text: "😀", start: 0, end: 2 },
      { text: "a\u0301", start: 2, end: 4 },
      { text: "👩‍💻", start: 4, end: 9 },
      { text: "🇺🇳", start: 9, end: 13 },
    ]);
    expect(lines.map((line) => line.segments[0]?.font.family)).toEqual([
      "Base",
      "Base",
      "Leading Override",
      "Base",
    ]);
    expect(document.fontRuns[0]).toEqual({ start: 3, end: 4, fontFamily: "Combining Override" });
    expect(() => measureAttributedText(document, font, fixed, 2, 3)).toThrow(RangeError);
    expect(() => measureAttributedText(document, font, fixed, 1, 2)).toThrow(RangeError);
  });

  test("takes authoritative widths and maximal ascent/descent from optional segment metrics", () => {
    const measurer: TextMeasurer = {
      measure: vi.fn(() => 999),
      measureMetrics: (text, currentFont) => ({
        width: text.length * (currentFont.family === "Tall" ? 20 : 10),
        ascent: currentFont.family === "Tall" ? 30 : 7,
        descent: currentFont.family === "Tall" ? 4 : 8,
      }),
    };
    const [line] = splitAttributedTextLines(
      {
        text: "ab",
        fontRuns: [{ start: 1, end: 2, fontFamily: "Tall" }],
      },
      100,
      font,
      measurer,
      false,
    );
    expect(line).toMatchObject({ width: 30, ascent: 30, descent: 8 });
    expect(line?.segments[1]).toMatchObject({ width: 20, ascent: 30, descent: 4 });
    expect(getAttributedTextLineHeight(line!, font)).toBe(38);
    expect(measurer.measure).not.toHaveBeenCalled();
  });

  test("retains legacy word/CJK wrapping with additive fontless measurements", () => {
    for (const text of ["aa bb", "中文测试", "abcdef", "one two\r\nthree", "\n", ""]) {
      for (const wrap of [true, false]) {
        const lines = splitAttributedTextLines({ text }, 25, font, fixed, wrap);
        expect(
          lines.map(({ text: lineText, width, paragraphEnd }) => ({
            text: lineText,
            width,
            paragraphEnd,
          })),
        ).toEqual(splitCellTextLines(text, 25, font, fixed, wrap));
      }
    }
  });

  test("bounds newline and narrow long-word output at the shared maximum", () => {
    expect(
      splitAttributedTextLines({ text: "x\n".repeat(5_000) }, 1, font, fixed, false),
    ).toHaveLength(MAX_CELL_TEXT_LAYOUT_LINES);
    expect(
      splitAttributedTextLines({ text: "x".repeat(5_000) }, 1, font, fixed, true),
    ).toHaveLength(MAX_CELL_TEXT_LAYOUT_LINES);
  });
});
