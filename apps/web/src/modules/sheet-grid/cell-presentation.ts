import type { CSSProperties } from "vue";
import type { CellStyle } from "@sheetcraft/core/style";
import type { FormulaValue } from "@sheetcraft/core/formula";
import {
  resolveCellHorizontalAlignment,
  resolveCellTextDirection,
  getCellIndentPixels,
} from "../../shared/cell-text/text-presentation";
import { browserCellTextMeasurer } from "../../shared/cell-text/text-metrics";
import {
  getCellTextRenderFontSize,
  getCellTextTypographyStyle,
} from "../../shared/cell-text/font-presentation";
import { getCellFillStyle } from "../../shared/cell-fill/fill-presentation";

const VERTICAL_ALIGNMENT = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
  justify: "flex-start",
  distributed: "center",
} as const;

export function getCellEditorStyle(
  style: Readonly<CellStyle> | undefined,
  value?: FormulaValue,
  text = "",
): CSSProperties {
  const direction = resolveCellTextDirection(text, style?.textDirection);
  const alignment = resolveCellHorizontalAlignment(style?.horizontalAlign, value, direction);
  const indent = getCellIndentPixels(style, browserCellTextMeasurer);
  return {
    ...getCellTextTypographyStyle(style),
    ...(style?.fontSize || style?.fontScript
      ? { minHeight: `${getCellTextRenderFontSize(style) + 2}px` }
      : {}),
    textAlign:
      alignment === "fill" || alignment === "justify" || alignment === "distributed"
        ? direction === "rtl"
          ? "right"
          : "left"
        : alignment,
    direction,
    ...(indent
      ? {
          paddingLeft: `${(alignment === "left" || alignment === "distributed" ? indent : 0) + 5}px`,
          paddingRight: `${(alignment === "right" || alignment === "distributed" ? indent : 0) + 5}px`,
        }
      : {}),
  };
}

export function getCellEditorFrameStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...getCellFillStyle(style),
    alignItems: VERTICAL_ALIGNMENT[style?.verticalAlign ?? "bottom"],
  };
}
