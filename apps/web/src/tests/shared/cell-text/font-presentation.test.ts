import { describe, expect, test } from "vitest";
import {
  CELL_TEXT_SCRIPT_SCALE,
  getCellTextDecorationStyle,
  getCellTextRenderFontSize,
  getCellTextScriptStyle,
  getCellTextStrikethroughStyle,
  getCellTextUnderlineStyle,
  getCellTextTypographyStyle,
} from "../../../shared/cell-text/font-presentation";

describe("cell text font presentation", () => {
  test("combines double accounting underline with strikethrough", () => {
    const style = { underline: "doubleAccounting" as const, strikethrough: true as const };
    expect(getCellTextUnderlineStyle(style)).toEqual({
      textDecoration: "underline double",
      textUnderlineOffset: "0.18em",
    });
    expect(getCellTextStrikethroughStyle(style)).toEqual({ textDecoration: "line-through" });
    expect(getCellTextDecorationStyle(style)).toEqual({
      textDecoration: "underline line-through double",
      textUnderlineOffset: "0.18em",
    });
  });

  test("uses a smaller, raised or lowered rendering font without changing the model size", () => {
    const style = { fontSize: 20, fontScript: "superscript" as const };
    expect(getCellTextRenderFontSize(style)).toBe(20 * CELL_TEXT_SCRIPT_SCALE);
    expect(getCellTextTypographyStyle(style).fontSize).toBe("15px");
    expect(getCellTextScriptStyle(style)).toEqual({ transform: "translateY(-0.35em)" });
    expect(style.fontSize).toBe(20);
    expect(getCellTextScriptStyle({ fontScript: "subscript" })).toEqual({
      transform: "translateY(0.2em)",
    });
  });
});
