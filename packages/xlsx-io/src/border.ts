import type { CellBorder } from "@idea10/core/style";

export function readExcelBorder(value: unknown): CellBorder | undefined {
  const border = value as Record<string, unknown> | undefined;
  const color = (border?.color as Record<string, unknown> | undefined)?.argb;
  const style = border?.style;
  return typeof style === "string" &&
    ["thin", "medium", "dashed", "dotted", "double"].includes(style) &&
    typeof color === "string" &&
    /^ff[0-9a-f]{6}$/i.test(color)
    ? { style: style as CellBorder["style"], color: `#${color.slice(2).toLowerCase()}` }
    : undefined;
}

export function writeExcelBorder(border: CellBorder): Record<string, unknown> {
  return { style: border.style, color: { argb: `FF${border.color.slice(1).toUpperCase()}` } };
}
