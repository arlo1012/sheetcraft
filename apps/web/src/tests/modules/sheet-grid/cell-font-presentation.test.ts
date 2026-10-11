import { describe, expect, test } from "vitest";
import type { CellContent } from "@sheetcraft/core/formula";
import { getCellValuePresentationForGrid } from "../../../modules/sheet-grid/cell-value-presentation";

const content: CellContent = {
  kind: "literal",
  value: "aΩa",
  fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
};

function present(code?: string, value = "aΩa", source: CellContent = content) {
  return getCellValuePresentationForGrid(
    value,
    code ? { numberFormat: { kind: "custom", code } } : undefined,
    "en-US",
    "1900",
    source,
  );
}

describe("font-family positions in formatted cell text", () => {
  test("preserves General positions without altering the literal", () => {
    expect(present()).toEqual({ text: "aΩa", fontRuns: content.fontRuns });
    expect(content).toEqual({
      kind: "literal",
      value: "aΩa",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
    });
  });

  test("maps actual text placeholders through prefixes, suffixes and repeated copies", () => {
    expect(present('0;0;0;"aΩa"@"!"')).toEqual({
      text: "aΩaaΩa!",
      fontRuns: [{ start: 4, end: 5, fontFamily: "Noto Sans Math" }],
    });
    expect(present('0;0;0;@"/"@')).toEqual({
      text: "aΩa/aΩa",
      fontRuns: [
        { start: 1, end: 2, fontFamily: "Noto Sans Math" },
        { start: 5, end: 6, fontFamily: "Noto Sans Math" },
      ],
    });
  });

  test("static or hidden text has no source-font override", () => {
    expect(present('0;0;0;"aΩa"')).toEqual({ text: "aΩa" });
    expect(present('0;0;0;""')).toEqual({ text: "" });
  });

  test("projects both sides of a fill directive independently", () => {
    expect(present('0;0;0;@*x"/"@')).toEqual({
      text: "aΩa/aΩa",
      fill: { before: "aΩa", after: "/aΩa", character: "x" },
      fontRuns: [
        { start: 1, end: 2, fontFamily: "Noto Sans Math" },
        { start: 5, end: 6, fontFamily: "Noto Sans Math" },
      ],
      fillFontRuns: {
        before: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
        after: [{ start: 2, end: 3, fontFamily: "Noto Sans Math" }],
      },
    });
  });

  test("formula results and mismatched values cannot borrow literal metadata", () => {
    expect(present(undefined, "other")).toEqual({ text: "other" });
    expect(present(undefined, "aΩa", { kind: "formula", formula: { source: '= "aΩa"' } })).toEqual({
      text: "aΩa",
    });
  });

  test("supplementary scalars and newline offsets survive formatting", () => {
    expect(
      present('0;0;0;"("@")"', "𐐀\r\nΩ", {
        kind: "literal",
        value: "𐐀\r\nΩ",
        fontRuns: [
          { start: 0, end: 2, fontFamily: "Noto Sans" },
          { start: 4, end: 5, fontFamily: "Noto Sans Math" },
        ],
      }),
    ).toEqual({
      text: "(𐐀\r\nΩ)",
      fontRuns: [
        { start: 1, end: 3, fontFamily: "Noto Sans" },
        { start: 5, end: 6, fontFamily: "Noto Sans Math" },
      ],
    });
  });
});
