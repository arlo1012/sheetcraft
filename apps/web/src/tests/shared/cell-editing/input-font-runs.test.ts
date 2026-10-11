import { describe, expect, test } from "vitest";
import { formatCellContentForInput, parseCellContent } from "@sheetcraft/core/input";
import { applyInputFontRuns, getInputFontRuns } from "../../../shared/cell-editing/input-font-runs";
import type { CellContent } from "@sheetcraft/core/formula";

describe("literal input font projection", () => {
  test.each(["123", "TRUE", "=A1", "#REF!", "'Ω", "Ω", ""])(
    "round trips %j without styling the escape prefix",
    (value) => {
      const content: CellContent = {
        kind: "literal",
        value,
        ...(value ? { fontRuns: [{ start: 0, end: value.length, fontFamily: "Noto Sans" }] } : {}),
      };
      const input = formatCellContentForInput(content);
      const runs = getInputFontRuns(input, content);
      expect(applyInputFontRuns(input, runs, parseCellContent(input))).toEqual(content);
      if (input !== value && value) expect(runs?.[0]?.start).toBe(1);
    },
  );

  test("text number format also strips just the explicit input escape", () => {
    expect(
      applyInputFontRuns(
        "'123",
        [{ start: 1, end: 4, fontFamily: "Noto Sans Math" }],
        parseCellContent("'123", { asText: true }),
      ),
    ).toEqual({
      kind: "literal",
      value: "123",
      fontRuns: [{ start: 0, end: 3, fontFamily: "Noto Sans Math" }],
    });
  });

  test("never attaches runs to computed/numeric/boolean/image content", () => {
    for (const input of ["123", "TRUE", "=A1", "#REF!"]) {
      const content = parseCellContent(input);
      expect(
        applyInputFontRuns(
          input,
          [{ start: 0, end: input.length, fontFamily: "Noto Sans" }],
          content,
        ),
      ).toEqual(content);
    }
    expect(
      getInputFontRuns("", { kind: "image", image: { assetId: "a", altText: "" } }),
    ).toBeUndefined();
  });

  test("mismatched input and split surrogate metadata fail before mutation", () => {
    expect(() => getInputFontRuns("different", { kind: "literal", value: "text" })).toThrow();
    expect(() =>
      applyInputFontRuns("😀", [{ start: 0, end: 1, fontFamily: "Noto Sans" }], {
        kind: "literal",
        value: "😀",
      }),
    ).toThrow();
  });
});
