import type { PivotReportLayout } from "@sheetcraft/core/pivot-tables";
/** Resolve product tokens at the Web boundary; Core persists concrete workbook colors. */
export function getPivotReportColors(): Pick<PivotReportLayout, "fillColor" | "borderColor"> {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return {};
  const style = getComputedStyle(document.documentElement);
  const fillColor = style.getPropertyValue("--sheetcraft-palette-brand-2").trim();
  const borderColor = style.getPropertyValue("--sheetcraft-palette-brand-3").trim();
  const hex = /^#[0-9a-f]{6}$/i;
  return {
    ...(hex.test(fillColor) ? { fillColor } : {}),
    ...(hex.test(borderColor) ? { borderColor } : {}),
  };
}
