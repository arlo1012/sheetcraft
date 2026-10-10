import { describe, expect, test } from "vitest";
import {
  DEFAULT_CELL_TEXT_COLOR,
  mergeCellStyle,
  normalizeCellStyle,
  normalizeCellStylePatch,
  normalizeDirectCellStyle,
  normalizeDirectCellStylePatch,
} from "../../style.js";
import { normalizeCellStyleForBinding } from "../../workbook.js";

describe("direct font color default", () => {
  test("normalizes only matching literal RGB into a reset, including uppercase input", () => {
    expect(normalizeDirectCellStyle({ textColor: "#20242C" })).toBeUndefined();
    expect(normalizeDirectCellStylePatch({ textColor: "#20242C" })).toEqual({ textColor: null });
    expect(normalizeDirectCellStyle({ fontSize: 18, textColor: DEFAULT_CELL_TEXT_COLOR })).toEqual({
      fontSize: 18,
    });
    expect(normalizeDirectCellStyle({ textColor: "#000000" })).toEqual({ textColor: "#000000" });
    expect(normalizeDirectCellStyle({ textColor: "#FF0000" })).toEqual({ textColor: "#ff0000" });
  });

  test("retains explicit theme intent even when its resolved cache matches the default", () => {
    const bound = { textColor: "#20242C", textColorTheme: { slot: "dark1" as const } };
    const expected = { textColor: DEFAULT_CELL_TEXT_COLOR, textColorTheme: { slot: "dark1" } };
    expect(normalizeDirectCellStyle(bound)).toEqual(expected);
    expect(normalizeDirectCellStylePatch(bound)).toEqual(expected);
    expect(normalizeDirectCellStyle({ textColorTheme: { slot: "dark1" } })).toEqual({
      textColorTheme: { slot: "dark1" },
    });
  });

  test("keeps a reset patch rather than omitting it over an existing color or theme", () => {
    const reset = normalizeDirectCellStylePatch({ textColor: DEFAULT_CELL_TEXT_COLOR });
    expect(mergeCellStyle({ textColor: "#ff0000", bold: true }, reset)).toEqual({ bold: true });
    expect(
      mergeCellStyle({ textColor: "#ff0000", textColorTheme: { slot: "accent1" } }, reset),
    ).toBeUndefined();
    expect(
      normalizeDirectCellStylePatch({
        textColor: DEFAULT_CELL_TEXT_COLOR,
        textColorTheme: null,
      }),
    ).toEqual({ textColor: null, textColorTheme: null });
  });

  test("does not reset fill, border, font or other direct style fields", () => {
    const style = {
      textColor: DEFAULT_CELL_TEXT_COLOR,
      fillColor: DEFAULT_CELL_TEXT_COLOR,
      fillPattern: "darkGrid" as const,
      fillPatternColor: DEFAULT_CELL_TEXT_COLOR,
      borderTop: { style: "thin" as const, color: DEFAULT_CELL_TEXT_COLOR },
      fontFamily: "Inter",
      fontSize: 13,
      bold: true as const,
    };
    const { textColor: _color, ...otherFields } = style;
    expect(normalizeDirectCellStyle(style)).toEqual(otherFields);
    expect(normalizeDirectCellStylePatch(style)).toEqual({ ...otherFields, textColor: null });
  });

  test("leaves generic definition and overlay helpers literal-preserving", () => {
    const style = { textColor: DEFAULT_CELL_TEXT_COLOR };
    expect(normalizeCellStyle(style)).toEqual(style);
    expect(normalizeCellStylePatch(style)).toEqual(style);
    expect(mergeCellStyle({ textColor: "#ffffff" }, style)).toEqual(style);
  });

  test("preserves definition-owned named font color and resets direct named overrides", () => {
    const style = { textColor: DEFAULT_CELL_TEXT_COLOR, bold: true as const };
    const binding = { styleId: "custom", includes: ["font" as const] };
    expect(normalizeCellStyleForBinding(style, binding)).toEqual(style);
    expect(normalizeCellStyleForBinding(style, { ...binding, overrides: ["bold"] })).toEqual(style);
    expect(normalizeCellStyleForBinding(style, { ...binding, overrides: ["textColor"] })).toEqual({
      bold: true,
    });
    expect(normalizeCellStyleForBinding(style, { styleId: "custom", includes: ["fill"] })).toEqual({
      bold: true,
    });
    expect(normalizeCellStyleForBinding(style)).toEqual({ bold: true });
  });
});
