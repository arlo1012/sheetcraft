import type { CellBorder } from "@sheetcraft/core/style";

const EXCEL_BORDER_LINE_STYLES = new Set<CellBorder["style"]>([
  "hair",
  "thin",
  "medium",
  "thick",
  "dotted",
  "dashed",
  "mediumDashed",
  "dashDot",
  "mediumDashDot",
  "dashDotDot",
  "mediumDashDotDot",
  "slantDashDot",
  "double",
]);

export function readExcelBorder(value: unknown): CellBorder | undefined {
  const border = value as Record<string, unknown> | undefined;
  const color = (border?.color as Record<string, unknown> | undefined)?.argb;
  const style = border?.style;
  return typeof style === "string" &&
    EXCEL_BORDER_LINE_STYLES.has(style as CellBorder["style"]) &&
    typeof color === "string" &&
    /^ff[0-9a-f]{6}$/i.test(color)
    ? { style: style as CellBorder["style"], color: `#${color.slice(2).toLowerCase()}` }
    : undefined;
}

export function writeExcelBorder(border: CellBorder): Record<string, unknown> {
  return { style: border.style, color: { argb: `FF${border.color.slice(1).toUpperCase()}` } };
}
