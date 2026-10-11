import { describe, expect, test } from "vitest";
import data from "../../../modules/insert-tools/symbols/assets/unicode-catalog.json";
import { BUNDLED_SYMBOL_FONTS } from "../../../modules/insert-tools/symbols/symbol-fonts";
import {
  SymbolUnicodeCatalog,
  fontHasCodePoint,
  isUnicodeScalar,
  parseSymbolCharacterCode,
  symbolCharacterCode,
  type UnicodeCatalogData,
} from "../../../modules/insert-tools/symbols/unicode-catalog";

const catalog = new SymbolUnicodeCatalog(data as unknown as UnicodeCatalogData);

describe("complete Symbol Unicode and font catalog", () => {
  test("uses the complete pinned UCD, including expanded algorithmic names", () => {
    expect(catalog.version).toBe("17.0.0");
    expect(catalog.blocks).toHaveLength(346);
    expect(catalog.codePoints()).toHaveLength(159631);
    expect(catalog.character(0x2192)).toMatchObject({ name: "RIGHTWARDS ARROW", category: "Sm" });
    expect(catalog.character(0x4e12)?.name).toBe("CJK UNIFIED IDEOGRAPH-4E12");
    expect(catalog.character(0x2f89f)?.name).toBe("CJK COMPATIBILITY IDEOGRAPH-2F89F");
    expect(catalog.character(0xac00)?.name).toBe("HANGUL SYLLABLE GA");
    expect(catalog.character(0x1f600)?.name).toBe("GRINNING FACE");
    expect(catalog.character(0x10ffff)).toMatchObject({ category: "Cn", name: undefined });
  });

  test("does not invent universal names for controls, private use, or unassigned values", () => {
    expect(catalog.character(0x0009)).toMatchObject({ category: "Cc" });
    expect(catalog.character(0x0009)?.aliases).toContainEqual({
      name: "CHARACTER TABULATION",
      type: "control",
    });
    expect(catalog.character(0xe000)).toMatchObject({ category: "Co", name: undefined });
    expect(catalog.character(0x0378)).toMatchObject({ category: "Cn", name: undefined });
    for (const point of [0x0009, 0x200d, 0xe000, 0x0378, 0xd800])
      expect(catalog.isBrowseCharacter(point)).toBe(false);
    expect(catalog.isBrowseCharacter(0xe000, true)).toBe(true);
    expect(catalog.character(0xd800)).toBeUndefined();
  });

  test("separates each font's real repertoire rather than borrowing fallback or suite coverage", () => {
    expect(BUNDLED_SYMBOL_FONTS).toHaveLength(4);
    const sans = BUNDLED_SYMBOL_FONTS.find((font) => font.id === "noto-sans")!;
    const math = BUNDLED_SYMBOL_FONTS.find((font) => font.id === "noto-math")!;
    const symbols = BUNDLED_SYMBOL_FONTS.find((font) => font.id === "noto-symbols")!;
    const symbols2 = BUNDLED_SYMBOL_FONTS.find((font) => font.id === "noto-symbols-2")!;
    expect(symbols2.family).toBe("Noto Sans Symbols 2");
    expect(fontHasCodePoint(math.ranges, 0x2192)).toBe(true);
    expect(fontHasCodePoint(math.ranges, 0x2211)).toBe(true);
    expect(fontHasCodePoint(symbols2.ranges, 0x2192)).toBe(false);
    expect(fontHasCodePoint(symbols2.ranges, 0x2211)).toBe(false);
    expect(catalog.codePoints(sans.ranges)).toHaveLength(3065);
    expect(catalog.codePoints(math.ranges)).toHaveLength(3030);
    expect(catalog.codePoints(symbols.ranges)).toHaveLength(1105);
    expect(catalog.codePoints(symbols2.ranges)).toHaveLength(2949);
    for (const font of BUNDLED_SYMBOL_FONTS)
      expect(fontHasCodePoint(font.ranges, 0x1f600)).toBe(false);
    for (const point of [NaN, 0.5, Infinity, -1, 0xd800, 0x110000])
      expect(fontHasCodePoint(math.ranges, point)).toBe(false);
  });

  test("font subsets are nonempty and their counts account for the whole face", () => {
    for (const font of BUNDLED_SYMBOL_FONTS) {
      const points = catalog.codePoints(font.ranges);
      const subsets = catalog.subsets(points);
      expect(subsets.every((subset) => subset.count > 0)).toBe(true);
      expect(subsets.reduce((total, subset) => total + subset.count, 0)).toBe(points.length);
      expect(new Set(points).size).toBe(points.length);
      for (let index = 1; index < points.length; index++)
        expect(points[index]!).toBeGreaterThan(points[index - 1]!);
    }
    const math = BUNDLED_SYMBOL_FONTS.find((font) => font.id === "noto-math")!;
    const subsets = catalog.subsets(catalog.codePoints(math.ranges));
    expect(subsets.find((subset) => subset.name === "Arrows")?.count).toBe(112);
    expect(subsets.find((subset) => subset.name === "Mathematical Operators")?.count).toBe(256);
    expect(subsets.some((subset) => subset.name === "Number Forms")).toBe(false);
  });

  test("the independent open-font set covers arrows/math/number forms without claiming every glyph", () => {
    const union = new Set(
      BUNDLED_SYMBOL_FONTS.flatMap((font) => [...catalog.codePoints(font.ranges)]),
    );
    expect(union.size).toBe(8754);
    const count = (start: number, end: number) =>
      [...union].filter((point) => point >= start && point <= end).length;
    expect(count(0x2190, 0x21ff)).toBe(112);
    expect(count(0x2200, 0x22ff)).toBe(256);
    expect(count(0x2150, 0x218f)).toBe(60);
    expect(count(0x2600, 0x26ff)).toBe(256);
    expect(count(0x2700, 0x27bf)).toBe(180);
  });

  test("parses full Unicode scalars in either base and rejects malformed/truncated values", () => {
    expect(parseSymbolCharacterCode(" U+1f600 ", "hex")).toBe(0x1f600);
    expect(parseSymbolCharacterCode("0x2192", "hex")).toBe(0x2192);
    expect(parseSymbolCharacterCode("128512", "decimal")).toBe(0x1f600);
    expect(symbolCharacterCode(0x0041)).toBe("0041");
    expect(symbolCharacterCode(0x1f600)).toBe("1F600");
    expect(symbolCharacterCode(0x1f600, "decimal")).toBe("128512");
    for (const input of ["", "G100", "110000", "D800", "DFFF", "-1", "1F600x", "1234567", "U+"])
      expect(parseSymbolCharacterCode(input, "hex")).toBeUndefined();
    for (const input of ["-1", "1114112", "55296", "56319", "1.5", "1e3", "0x41", "12x"])
      expect(parseSymbolCharacterCode(input, "decimal")).toBeUndefined();
    for (const point of [-1, NaN, Infinity, 0.1, 0xd800, 0xdfff, 0x110000]) {
      expect(isUnicodeScalar(point)).toBe(false);
      expect(() => symbolCharacterCode(point)).toThrow(RangeError);
    }
  });

  test("searches true names, aliases, blocks and supplementary characters", () => {
    expect(catalog.matches(0x2192, "rightwards arrow")).toBe(true);
    expect(catalog.matches(0x2192, "U+2192")).toBe(true);
    expect(catalog.matches(0x2153, "number forms")).toBe(true);
    expect(catalog.matches(0x0009, "character tabulation")).toBe(true);
    expect(catalog.matches(0x1f600, "😀")).toBe(true);
    expect(catalog.matches(0x2192, "leftwards arrow")).toBe(false);
    expect(catalog.matches(0x2192, "")).toBe(true);
  });
});
