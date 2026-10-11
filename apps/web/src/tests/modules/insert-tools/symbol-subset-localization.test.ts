import { describe, expect, test } from "vitest";
import data from "../../../modules/insert-tools/symbols/assets/unicode-catalog.json";
import { filterSymbolPoints } from "../../../modules/insert-tools/symbols/symbol-dialog-model";
import { BUNDLED_SYMBOL_FONTS } from "../../../modules/insert-tools/symbols/symbol-fonts";
import {
  UNICODE_BLOCK_LABELS_ZH_CN,
  symbolUnicodeBlockLabel,
} from "../../../modules/insert-tools/symbols/unicode-block-labels.zh-CN";
import {
  SymbolUnicodeCatalog,
  type UnicodeCatalogData,
} from "../../../modules/insert-tools/symbols/unicode-catalog";

const catalog = new SymbolUnicodeCatalog(data as unknown as UnicodeCatalogData);

describe("Symbol Unicode subset localization", () => {
  test("maps every pinned Unicode 17 block exactly once with a unique single-line label", () => {
    const officialNames = catalog.blocks.map(([, , name]) => name);
    const labels = Object.values(UNICODE_BLOCK_LABELS_ZH_CN);
    expect(catalog.version).toBe("17.0.0");
    expect(officialNames).toHaveLength(346);
    expect(new Set(officialNames).size).toBe(346);
    expect(Object.keys(UNICODE_BLOCK_LABELS_ZH_CN).sort()).toEqual([...officialNames].sort());
    expect(new Set(labels).size).toBe(346);
    for (const name of officialNames) {
      const label = symbolUnicodeBlockLabel(name, "zh-CN");
      expect(label).not.toBe(name);
      expect(label.trim()).toBe(label);
      expect(label).not.toMatch(/[\r\n\t]/);
      expect(label).toMatch(/[\u3400-\u9fff]/);
    }
  });

  test("uses accurate concise Chinese labels for common font subsets", () => {
    const expected: Readonly<Record<string, string>> = {
      "Basic Latin": "基本拉丁文",
      "Latin-1 Supplement": "拉丁文-1补充",
      "Latin Extended-A": "拉丁文扩展-A",
      "Latin Extended-B": "拉丁文扩展-B",
      "IPA Extensions": "国际音标扩展",
      "Greek and Coptic": "希腊文和科普特文",
      Cyrillic: "西里尔文",
      "Cyrillic Supplement": "西里尔文补充",
      "Combining Diacritical Marks": "组合附加符号",
      "General Punctuation": "常用标点",
      "Superscripts and Subscripts": "上标和下标",
      "Currency Symbols": "货币符号",
      "Letterlike Symbols": "字母式符号",
      "Number Forms": "数字形式",
      Arrows: "箭头",
      "Mathematical Operators": "数学运算符",
      "Miscellaneous Technical": "杂项技术符号",
      "Box Drawing": "制表符",
      "Block Elements": "方块元素",
      "Geometric Shapes": "几何图形",
      "Miscellaneous Symbols": "杂项符号",
      Dingbats: "装饰符号",
      "Miscellaneous Mathematical Symbols-A": "杂项数学符号-A",
      "Miscellaneous Mathematical Symbols-B": "杂项数学符号-B",
      "Supplemental Mathematical Operators": "补充数学运算符",
      "Supplemental Arrows-A": "补充箭头-A",
      "Supplemental Arrows-B": "补充箭头-B",
      "Supplemental Arrows-C": "补充箭头-C",
      "Miscellaneous Symbols and Arrows": "杂项符号和箭头",
      "Mathematical Alphanumeric Symbols": "数学字母数字符号",
      "CJK Unified Ideographs": "中日韩统一表意文字",
      "CJK Unified Ideographs Extension J": "中日韩统一表意文字扩展-J",
      "Small Form Variants": "小型变体",
      "Halfwidth and Fullwidth Forms": "半角和全角形式",
    };
    for (const [officialName, label] of Object.entries(expected))
      expect(symbolUnicodeBlockLabel(officialName, "zh-CN")).toBe(label);
  });

  test("preserves unfamiliar script identities and falls back safely for unknown blocks", () => {
    for (const name of ["Todhri", "Sidetic", "Tulu-Tigalari", "Beria Erfe", "Tai Yo"])
      expect(symbolUnicodeBlockLabel(name, "zh-CN")).toContain(name);
    for (const name of ["Future Unicode Block", "toString", "__proto__"])
      expect(symbolUnicodeBlockLabel(name, "zh-CN")).toBe(name);
  });

  test("keeps every official block name unchanged in English and by default", () => {
    for (const [, , name] of catalog.blocks) {
      expect(symbolUnicodeBlockLabel(name, "en-US")).toBe(name);
      expect(symbolUnicodeBlockLabel(name, "en-GB")).toBe(name);
      expect(symbolUnicodeBlockLabel(name)).toBe(name);
    }
  });

  test("Chinese arrow and math queries cover matching blocks only within the active font", () => {
    for (const font of BUNDLED_SYMBOL_FONTS) {
      const points = catalog.codePoints(font.ranges);
      for (const [query, officialTerm] of [
        ["箭头", "Arrows"],
        ["数学", "Mathematical"],
      ]) {
        const blocks = catalog.blocks.filter(([, , name]) => name.includes(officialTerm!));
        const expected = points.filter((cp) =>
          blocks.some(([start, end]) => cp >= start && cp <= end),
        );
        expect(filterSymbolPoints(catalog, points, query!, "unicode-hex", "zh-CN")).toEqual(
          expected,
        );
      }
    }
    const points = Uint32Array.from([0x0041, 0x03a9, 0x2192, 0x2211, 0x27f6, 0x2900]);
    expect([...filterSymbolPoints(catalog, points, " 补充箭头 ", "unicode-hex", "zh-CN")]).toEqual([
      0x27f6, 0x2900,
    ]);
    expect([...filterSymbolPoints(catalog, points, "数学运算符", "unicode-hex", "zh-CN")]).toEqual([
      0x2211,
    ]);
    expect([...filterSymbolPoints(catalog, points, "基本拉丁文", "unicode-hex", "zh-CN")]).toEqual([
      0x0041,
    ]);
  });

  test("retains literal, code, category, alias and official English name matching in Chinese", () => {
    const points = Uint32Array.from([0x0009, 0x0041, 0x00a3, 0x2153, 0x2192, 0x2211, 0x1f600]);
    for (const query of [
      "→",
      "U+2192",
      "0x2192",
      "2192",
      "8594",
      "Sm",
      "number forms",
      "RIGHTWARDS ARROW",
      "character tabulation",
      "😀",
      "1F600",
      "128512",
      "",
      "not a character name",
    ])
      expect(filterSymbolPoints(catalog, points, query, "unicode-hex", "zh-CN")).toEqual(
        filterSymbolPoints(catalog, points, query, "unicode-hex", "en-US"),
      );
    expect([
      ...filterSymbolPoints(catalog, points, "rightwards arrow", "unicode-hex", "zh-CN"),
    ]).toEqual([0x2192]);
    expect([
      ...filterSymbolPoints(catalog, points, "character tabulation", "unicode-hex", "zh-CN"),
    ]).toEqual([0x0009]);
  });

  test("leaves legacy English calls and Latin-1 code-format bounds unchanged", () => {
    const points = Uint32Array.from([0x0041, 0x00a3, 0x2192, 0x2211]);
    for (const query of ["", "Arrows", "MATHEMATICAL OPERATORS", "箭头", "数学"])
      expect(filterSymbolPoints(catalog, points, query, "unicode-hex")).toEqual(
        filterSymbolPoints(catalog, points, query, "unicode-hex", "en-US"),
      );
    expect(filterSymbolPoints(catalog, points, "箭头", "unicode-hex", "en-US")).toHaveLength(0);
    for (const format of ["latin1-decimal", "latin1-hex"] as const) {
      expect([...filterSymbolPoints(catalog, points, "", format, "zh-CN")]).toEqual([
        0x0041, 0x00a3,
      ]);
      expect([...filterSymbolPoints(catalog, points, "货币符号", format, "zh-CN")]).toEqual([]);
      expect([...filterSymbolPoints(catalog, points, "拉丁文", format, "zh-CN")]).toEqual([
        0x0041, 0x00a3,
      ]);
      expect([...filterSymbolPoints(catalog, points, "箭头", format, "zh-CN")]).toEqual([]);
    }
  });
});
