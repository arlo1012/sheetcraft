function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Choose the stronger text contrast against a validated six-digit sRGB tab color. */
export function getSheetTabForeground(color: string): "#000000" | "#FFFFFF" {
  const red = linearChannel(Number.parseInt(color.slice(1, 3), 16));
  const green = linearChannel(Number.parseInt(color.slice(3, 5), 16));
  const blue = linearChannel(Number.parseInt(color.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}

export function getSheetTabColorStyles(color?: string) {
  if (!color) return undefined;
  const hoverColor = `#${[1, 3, 5]
    .map((start) =>
      Math.round(Number.parseInt(color.slice(start, start + 2), 16) * 0.82)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
  return {
    "--sheet-tab-color": color,
    "--sheet-tab-contrast-color": getSheetTabForeground(color),
    "--sheet-tab-hover-color": hoverColor,
    "--sheet-tab-hover-contrast-color": getSheetTabForeground(hoverColor),
  };
}
