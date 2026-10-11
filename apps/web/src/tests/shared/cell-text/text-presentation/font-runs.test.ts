import { describe, expect, test, vi } from "vitest";
import type { AutoRowHeightFont, TextMeasurer } from "@sheetcraft/sheet-engine/text-layout";
import { layoutCellText } from "../../../../shared/cell-text/text-presentation";

const measurer: TextMeasurer = {
  measure: (text, font) =>
    Array.from(text).length * font.size * (font.family === "Symbols" ? 1 : 0.5),
  measureMetrics: (text, font) => ({
    width: Array.from(text).length * font.size * (font.family === "Symbols" ? 1 : 0.5),
    ascent: font.size * (font.family === "Symbols" ? 1.2 : 0.7),
    descent: font.size * (font.family === "Symbols" ? 0.4 : 0.2),
  }),
};
const options = {
  text: "a☀b",
  fontRuns: [{ start: 1, end: 2, fontFamily: "Symbols" }],
  style: { fontFamily: "Base", fontSize: 10 },
  width: 100,
  height: 100,
  measurer,
};

describe("attributed cell text layout", () => {
  test("uses the native bidi paragraph's uniform maximum advance across explicit newlines", () => {
    const tallMetrics: TextMeasurer = {
      measure: (text) => Array.from(text).length * 10,
      measureMetrics: (text, font) => ({
        width: Array.from(text).length * 10,
        ascent: font.family === "Tall" ? 35 : 8,
        descent: font.family === "Tall" ? 5 : 2,
      }),
    };
    const result = layoutCellText({
      ...options,
      text: "a\nTא",
      fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }],
      measurer: tallMetrics,
    });
    expect(result.canvasBidiRequired).toBe(true);
    expect(result.lineHeight).toBe(40);
    expect(result.height).toBe(80);
    expect(result.lines.map((line) => [line.height, line.y])).toEqual([
      [40, 0],
      [40, 40],
    ]);
    expect(result.bidiDocument?.text).toBe("a\nTא");
    const latinMath = layoutCellText({
      ...options,
      text: "a\nTΩ",
      fontRuns: [{ start: 2, end: 3, fontFamily: "Tall" }],
      measurer: tallMetrics,
    });
    expect(latinMath.canvasBidiRequired).toBeUndefined();
    expect(latinMath.height).toBe(52.5);
    expect(latinMath.lines.map((line) => line.height)).toEqual([12.5, 40]);
  });

  test("covers inherited gaps, inherits font properties, and uses maximal actual extents", () => {
    const result = layoutCellText({
      ...options,
      style: { ...options.style, bold: true, italic: true },
    });
    const line = result.lines[0]!;
    expect(
      line.segments?.map((segment) => [segment.text, segment.font.family, segment.width]),
    ).toEqual([
      ["a", "Base", 5],
      ["☀", "Symbols", 10],
      ["b", "Base", 5],
    ]);
    expect(
      line.segments?.every(
        (segment) => segment.font.size === 10 && segment.font.weight === 700 && segment.font.italic,
      ),
    ).toBe(true);
    expect(line.ascent).toBe(12);
    expect(line.descent).toBe(4);
    expect(result.width).toBe(20);
    expect(line.height).toBe(16);
    expect(result.height).toBe(16);
  });

  test("single effective families and newline-only font runs keep per-line bidi advances", () => {
    const glyphMetrics: TextMeasurer = {
      measure: (text) => text.length * 10,
      measureMetrics: (text) => ({
        width: text.length * 10,
        ascent: text.includes("T") ? 35 : 8,
        descent: text.includes("T") ? 5 : 2,
      }),
    };
    for (const fontRuns of [
      [{ start: 0, end: 4, fontFamily: "Tall" }],
      [{ start: 2, end: 3, fontFamily: "Base" }],
      [{ start: 1, end: 2, fontFamily: "Tall" }],
    ]) {
      const result = layoutCellText({
        ...options,
        text: "a\nTא",
        fontRuns,
        measurer: glyphMetrics,
      });
      expect(result.canvasBidiRequired).toBeUndefined();
      expect(result.height).toBe(52.5);
      expect(result.lines.map((line) => line.height)).toEqual([12.5, 40]);
    }
  });

  test("wraps independently of font boundaries and keeps original CRLF offsets", () => {
    const result = layoutCellText({
      ...options,
      text: "ab☀c\r\nD",
      width: 30,
      style: { ...options.style, wrapText: true },
      fontRuns: [{ start: 2, end: 3, fontFamily: "Symbols" }],
    });
    expect(result.lines.map((line) => line.text)).toEqual(["ab☀", "c", "D"]);
    expect(result.lines[2]?.segments?.[0]?.start).toBe(6);
    expect(result.lines.map((line) => line.height)).toEqual([16, 12.5, 12.5]);
    expect(result.lines.map((line) => line.y)).toEqual([0, 16, 28.5]);
    expect(result.height).toBe(41);
  });

  test("merges effective families for shaping without splitting combining/ZWJ clusters", () => {
    const measure = vi.fn((text: string, font: AutoRowHeightFont) => measurer.measure(text, font));
    const result = layoutCellText({
      ...options,
      text: "é👩‍💻x",
      fontRuns: [
        { start: 0, end: 1, fontFamily: "Symbols" },
        { start: 2, end: 4, fontFamily: "Symbols" },
      ],
      measurer: { measure },
    });
    expect(
      result.lines[0]?.segments?.map((segment) => [segment.text, segment.font.family]),
    ).toEqual([
      ["é👩‍💻", "Symbols"],
      ["x", "Base"],
    ]);
    expect(measure.mock.calls.some(([text]) => text === "é👩‍💻")).toBe(true);
    expect(measure.mock.calls.some(([text]) => text === "́" || text === "\u200d")).toBe(false);
  });

  test("shrink and rotation use attributed width and actual line extent", () => {
    const result = layoutCellText({
      ...options,
      text: "☀".repeat(10),
      width: 45,
      fontRuns: [{ start: 0, end: 10, fontFamily: "Symbols" }],
      style: { ...options.style, shrinkToFit: true, textRotation: 30 },
    });
    const rotatedWidth =
      result.width * Math.cos(Math.PI / 6) + result.height * Math.sin(Math.PI / 6);
    expect(rotatedWidth).toBeCloseTo(40);
    expect(result.font.size).toBeLessThan(10);
    expect(result.lines[0]?.segments?.[0]?.font.size).toBe(result.font.size);
    expect(options.style.fontSize).toBe(10);
  });

  test("horizontal fill copies the entire document with corresponding UTF-16 run offsets", () => {
    const result = layoutCellText({
      ...options,
      width: 55,
      style: { ...options.style, horizontalAlign: "fill" },
    });
    expect(result.lines[0]?.text).toBe("a☀ba☀b");
    expect(
      result.lines[0]?.segments
        ?.filter((segment) => segment.font.family === "Symbols")
        .map((segment) => [segment.start, segment.end]),
    ).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  test("number-format repeat stays inherited while independently projected before/after runs shift", () => {
    const result = layoutCellText({
      ...options,
      text: "☀X☀",
      width: 65,
      fill: { before: "☀X", character: ".", after: "☀" },
      fillFontRuns: {
        before: [{ start: 0, end: 1, fontFamily: "Symbols" }],
        after: [{ start: 0, end: 1, fontFamily: "Symbols" }],
      },
    });
    const line = result.lines[0]!;
    expect(line.text).toBe("☀X.......☀");
    expect(
      line.segments?.map((segment) => [segment.text, segment.font.family, segment.start]),
    ).toEqual([
      ["☀", "Symbols", 0],
      ["X.......", "Base", 1],
      ["☀", "Symbols", 9],
    ]);
    expect(() =>
      layoutCellText({ ...options, fill: { before: "a", character: ".", after: "☀b" } }),
    ).toThrow("verified before/after projection");
  });

  test("validates number-format font-run offsets against each independent fill part", () => {
    expect(() =>
      layoutCellText({
        ...options,
        fill: { before: "a", character: ".", after: "☀b" },
        fillFontRuns: { before: [{ start: 0, end: 2, fontFamily: "Symbols" }] },
      }),
    ).toThrow("within the text");
  });

  test("stacked text keeps original grapheme families and places columns using actual extents", () => {
    const result = layoutCellText({
      ...options,
      text: "é\r\n☀",
      style: { ...options.style, textRotation: "vertical" },
      fontRuns: [{ start: 4, end: 5, fontFamily: "Symbols" }],
    });
    expect(result.lines.map((line) => line.text)).toEqual(["é", "☀"]);
    expect(result.lines.map((line) => line.segments?.[0]?.font.family)).toEqual([
      "Base",
      "Symbols",
    ]);
    expect(result.lines[1]?.segments?.[0]?.start).toBe(4);
    expect(result.lineHeight).toBe(16);
    expect(result.height).toBe(16);
    expect(result.lines[1]?.x).toBe(10);
  });

  test("mixed bidi requires whole-paragraph native layout, including when font boundaries wrap apart", () => {
    const result = layoutCellText({
      ...options,
      text: "ABאב",
      width: 20,
      style: { ...options.style, wrapText: true },
      fontRuns: [{ start: 2, end: 4, fontFamily: "Symbols" }],
    });
    expect(result.lines.every((line) => line.segments?.length === 1)).toBe(true);
    expect(result.canvasBidiRequired).toBe(true);
    expect(result.bidiDocument?.text).toBe("ABאב");
    expect(
      layoutCellText({
        ...options,
        text: "ABאב",
        fontRuns: [{ start: 0, end: 4, fontFamily: "Symbols" }],
      }).canvasBidiRequired,
    ).toBeUndefined();
    const supplementary = layoutCellText({
      ...options,
      text: "A\u{1e900}",
      fontRuns: [{ start: 1, end: 3, fontFamily: "Symbols" }],
    });
    expect(supplementary.canvasBidiRequired).toBe(true);
  });
});
