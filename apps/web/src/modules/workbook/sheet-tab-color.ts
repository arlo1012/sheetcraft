import { getContrastingForeground, mixHexColors } from "../../shared/color/contrast";

export function getSheetTabColorStyles(color?: string) {
  if (!color) return undefined;
  const hoverColor = mixHexColors(color, "#000000", 0.82);
  return {
    "--sheet-tab-color": color,
    "--sheet-tab-contrast-color": getContrastingForeground(color),
    "--sheet-tab-hover-color": hoverColor,
    "--sheet-tab-hover-contrast-color": getContrastingForeground(hoverColor),
  };
}
