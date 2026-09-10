import { describe, expect, test } from "vitest";
import {
  getCellTextGraphemes,
  splitCellTextLines,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "../../text-layout.js";

const font: AutoRowHeightFont = { family: "Test Sans", size: 10, weight: 400, italic: false };
const measurer: TextMeasurer = { measure: (text) => Array.from(text).length * 10 };

describe("cell text layout", () => {
  test("preserves word, CJK, and long-word line breaking", () => {
    expect(splitCellTextLines("aa bb", 25, font, measurer, true)).toEqual([
      { text: "aa", width: 20, paragraphEnd: false },
      { text: " ", width: 10, paragraphEnd: false },
      { text: "bb", width: 20, paragraphEnd: true },
    ]);
    expect(splitCellTextLines("中文测试", 25, font, measurer, true)).toEqual([
      { text: "中文", width: 20, paragraphEnd: false },
      { text: "测试", width: 20, paragraphEnd: true },
    ]);
    expect(splitCellTextLines("abcdef", 25, font, measurer, true)).toEqual([
      { text: "ab", width: 20, paragraphEnd: false },
      { text: "cd", width: 20, paragraphEnd: false },
      { text: "ef", width: 20, paragraphEnd: true },
    ]);
  });

  test("marks explicit paragraph endings and leaves no-wrap paragraphs intact", () => {
    expect(splitCellTextLines("one two\nthree", 35, font, measurer, true)).toEqual([
      { text: "one", width: 30, paragraphEnd: false },
      { text: " ", width: 10, paragraphEnd: false },
      { text: "two", width: 30, paragraphEnd: true },
      { text: "thr", width: 30, paragraphEnd: false },
      { text: "ee", width: 20, paragraphEnd: true },
    ]);
    expect(splitCellTextLines("one two\nthree", 1, font, measurer, false)).toEqual([
      { text: "one two", width: 70, paragraphEnd: true },
      { text: "three", width: 50, paragraphEnd: true },
    ]);
  });

  test("keeps grapheme clusters intact", () => {
    expect(getCellTextGraphemes("A👩‍💻B")).toEqual(["A", "👩‍💻", "B"]);
  });
});
