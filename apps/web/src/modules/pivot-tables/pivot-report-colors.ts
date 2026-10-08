import type { PivotReportLayout } from "@idea10/core/pivot-tables";
/** Resolve product tokens at the Web boundary; Core persists concrete workbook colors. */
export function getPivotReportColors(): Pick<PivotReportLayout, "fillColor" | "borderColor"> {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return {};
  const style = getComputedStyle(document.documentElement);
  const fillColor = style.getPropertyValue("--idea-palette-brand-2").trim();
  const borderColor = style.getPropertyValue("--idea-palette-brand-3").trim();
  const hex = /^#[0-9a-f]{6}$/i;
  return {
    ...(hex.test(fillColor) ? { fillColor } : {}),
    ...(hex.test(borderColor) ? { borderColor } : {}),
  };
}
