import type { CSSProperties } from "vue";
import type { CellStyle } from "../workbook/cell-style";

const ALIGNMENT_JUSTIFICATION = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

function getTextStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
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
    ...(style.fillColor ? { backgroundColor: style.fillColor } : {}),
  };
}

export function getCellContentStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...getTextStyle(style),
    ...(style?.horizontalAlign
      ? { justifyContent: ALIGNMENT_JUSTIFICATION[style.horizontalAlign] }
      : {}),
  };
}

export function getCellEditorStyle(style: Readonly<CellStyle> | undefined): CSSProperties {
  return {
    ...getTextStyle(style),
    ...(style?.fontSize ? { minHeight: `${style.fontSize + 8}px` } : {}),
    ...(style?.horizontalAlign ? { textAlign: style.horizontalAlign } : {}),
  };
}
