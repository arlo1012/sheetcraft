import type { CSSProperties } from "vue";
import type { CellStyle } from "@idea10/core/style";
import {
  getCellTextScriptStyle,
  getCellTextTypographyStyle,
} from "../../shared/cell-text/font-presentation";
import type { HeaderFooterFormat } from "./header-footer-text";

export function getHeaderFooterTypographyStyle(
  format: HeaderFooterFormat,
  fontScale = 1,
): CSSProperties {
  const style: CellStyle = {
    fontFamily: format.fontFamily,
    fontSize: (format.fontSize * 4 * fontScale) / 3,
    bold: format.bold || undefined,
    italic: format.italic || undefined,
    underline: format.underline || undefined,
    strikethrough: format.strikethrough || undefined,
    fontScript: format.fontScript,
    textColor: `#${format.color}`,
  };
  return getCellTextTypographyStyle(style);
}

export function getHeaderFooterScriptStyle(format: HeaderFooterFormat): CSSProperties {
  return format.fontScript
    ? { display: "inline-block", ...getCellTextScriptStyle({ fontScript: format.fontScript }) }
    : {};
}
