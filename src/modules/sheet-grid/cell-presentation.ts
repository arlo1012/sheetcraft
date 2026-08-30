import type { CSSProperties } from "vue";
import type { CellStyle } from "../workbook/cell-style";

const ALIGNMENT_JUSTIFICATION = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

const VERTICAL_ALIGNMENT = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
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

export function getCellContentStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...getTypographyStyle(style),
    ...(style?.fillColor ? { backgroundColor: style.fillColor } : {}),
    ...(style?.horizontalAlign
      ? { justifyContent: ALIGNMENT_JUSTIFICATION[style.horizontalAlign] }
      : {}),
    ...(style?.verticalAlign ? { alignItems: VERTICAL_ALIGNMENT[style.verticalAlign] } : {}),
  };
}

export function getCellEditorStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...getTypographyStyle(style),
    ...(style?.fontSize ? { minHeight: `${style.fontSize + 2}px` } : {}),
    ...(style?.horizontalAlign ? { textAlign: style.horizontalAlign } : {}),
  };
}

export function getCellEditorFrameStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...(style?.fillColor ? { backgroundColor: style.fillColor } : {}),
    alignItems: VERTICAL_ALIGNMENT[style?.verticalAlign ?? "middle"],
  };
}
