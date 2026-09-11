import type { CSSProperties } from "vue";
import { DEFAULT_CELL_FONT_SIZE, type CellStyle } from "@idea10/core/style";

/** Relative font size for a cell displayed as superscript or subscript. */
export const CELL_TEXT_SCRIPT_SCALE = 0.75;

export function getCellTextRenderFontSize(style?: Readonly<CellStyle>): number {
  const size = style?.fontSize ?? DEFAULT_CELL_FONT_SIZE;
  return style?.fontScript ? size * CELL_TEXT_SCRIPT_SCALE : size;
}

export function getCellTextDecorationStyle(
  style?: Readonly<CellStyle>,
): Pick<CSSProperties, "textDecoration" | "textUnderlineOffset"> {
  if (style?.underline && style.strikethrough) {
    const double = style.underline === "double" || style.underline === "doubleAccounting";
    return {
      textDecoration: double ? "underline line-through double" : "underline line-through",
      ...(style.underline === "singleAccounting" || style.underline === "doubleAccounting"
        ? { textUnderlineOffset: "0.18em" }
        : {}),
    };
  }
  return {
    ...getCellTextUnderlineStyle(style),
    ...getCellTextStrikethroughStyle(style),
  };
}

export function getCellTextUnderlineStyle(
  style?: Readonly<CellStyle>,
): Pick<CSSProperties, "textDecoration" | "textUnderlineOffset"> {
  const underline = style?.underline;
  if (!underline) return {};

  const double = underline === "double" || underline === "doubleAccounting";
  const accounting = underline === "singleAccounting" || underline === "doubleAccounting";
  return {
    textDecoration: double ? "underline double" : "underline",
    // Accounting underlines sit a little farther from the glyphs in spreadsheet apps.
    ...(accounting ? { textUnderlineOffset: "0.18em" } : {}),
  };
}

export function getCellTextStrikethroughStyle(
  style?: Readonly<CellStyle>,
): Pick<CSSProperties, "textDecoration"> {
  return style?.strikethrough ? { textDecoration: "line-through" } : {};
}

export function getCellTextTypographyStyle(
  style?: Readonly<CellStyle>,
  options?: { includeDecorations?: boolean },
): Pick<
  CSSProperties,
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "color"
  | "textDecoration"
  | "textUnderlineOffset"
> {
  if (!style) return {};
  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize || style.fontScript
      ? { fontSize: `${getCellTextRenderFontSize(style)}px` }
      : {}),
    ...(style.bold ? { fontWeight: 700 } : {}),
    ...(style.italic ? { fontStyle: "italic" } : {}),
    ...(options?.includeDecorations === false ? {} : getCellTextDecorationStyle(style)),
    ...(style.textColor ? { color: style.textColor } : {}),
  };
}

export function getCellTextScriptStyle(
  style?: Readonly<CellStyle>,
): Pick<CSSProperties, "transform"> {
  if (style?.fontScript === "superscript") return { transform: "translateY(-0.35em)" };
  if (style?.fontScript === "subscript") return { transform: "translateY(0.2em)" };
  return {};
}
