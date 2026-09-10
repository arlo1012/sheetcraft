import type { CSSProperties } from "vue";
import type { CellStyle } from "@idea10/core/style";
import type { FormulaValue } from "@idea10/core/formula";
import {
  isCellTextWrapped,
  resolveCellHorizontalAlignment,
  resolveCellTextDirection,
  getCellIndentPixels,
} from "../../shared/cell-text/text-presentation";
import { browserCellTextMeasurer } from "../../shared/cell-text/text-metrics";
import { WRAPPED_CELL_LINE_HEIGHT } from "@idea10/sheet-engine/row-height";

const ALIGNMENT_JUSTIFICATION = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
  fill: "flex-start",
  justify: "flex-start",
  distributed: "flex-start",
} as const;

const VERTICAL_ALIGNMENT = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
  justify: "flex-start",
  distributed: "center",
} as const;

function getTypographyStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  if (!style) {
    return {};
  }

  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize ? { fontSize: `${style.fontSize}px` } : {}),
    ...(style.bold ? { fontWeight: 700 } : {}),
    ...(style.italic ? { fontStyle: "italic" } : {}),
    ...(style.underline ? { textDecoration: "underline" } : {}),
    ...(style.textColor ? { color: style.textColor } : {}),
  };
}

export function getCellContentStyle(
  style: Readonly<CellStyle> | undefined,
  preserveLineBreaks = false,
  value?: FormulaValue,
  text = "",
): CSSProperties {
  const wrapped = isCellTextWrapped(style);
  const multiline = wrapped || preserveLineBreaks;
  const direction = resolveCellTextDirection(text, style?.textDirection);
  const alignment = resolveCellHorizontalAlignment(style?.horizontalAlign, value, direction);
  const multilineStyle: CSSProperties = multiline
    ? {
        whiteSpace: wrapped ? "pre-wrap" : "pre",
        ...(wrapped ? { overflowWrap: "anywhere" } : {}),
        wordBreak: "normal",
        lineHeight: String(WRAPPED_CELL_LINE_HEIGHT),
        textAlign: alignment === "fill" || alignment === "distributed" ? "left" : alignment,
      }
    : {};

  return {
    ...getTypographyStyle(style),
    ...multilineStyle,
    ...(style?.fillColor ? { backgroundColor: style.fillColor } : {}),
    justifyContent: ALIGNMENT_JUSTIFICATION[alignment],
    alignItems: VERTICAL_ALIGNMENT[style?.verticalAlign ?? "bottom"],
  };
}

export function getCellEditorStyle(
  style: Readonly<CellStyle> | undefined,
  value?: FormulaValue,
  text = "",
): CSSProperties {
  const direction = resolveCellTextDirection(text, style?.textDirection);
  const alignment = resolveCellHorizontalAlignment(style?.horizontalAlign, value, direction);
  const indent = getCellIndentPixels(style, browserCellTextMeasurer);
  return {
    ...getTypographyStyle(style),
    ...(style?.fontSize ? { minHeight: `${style.fontSize + 2}px` } : {}),
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
    ...(style?.fillColor ? { backgroundColor: style.fillColor } : {}),
    alignItems: VERTICAL_ALIGNMENT[style?.verticalAlign ?? "bottom"],
  };
}
