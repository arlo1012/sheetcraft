type ContrastingForeground = "#000000" | "#FFFFFF";

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Chooses black or white foreground with the stronger contrast for a validated six-digit sRGB hex color. */
export function getContrastingForeground(background: string): ContrastingForeground {
  const red = linearChannel(Number.parseInt(background.slice(1, 3), 16));
  const green = linearChannel(Number.parseInt(background.slice(3, 5), 16));
  const blue = linearChannel(Number.parseInt(background.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}

/** Mixes two validated six-digit hex colors, using `opacity` as the foreground color weight. */
export function mixHexColors(color: string, background: string, opacity: number): string {
  const channels = [1, 3, 5].map((start) => {
    const foreground = Number.parseInt(color.slice(start, start + 2), 16);
    const backdrop = Number.parseInt(background.slice(start, start + 2), 16);
    return Math.round(foreground * opacity + backdrop * (1 - opacity))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`.toUpperCase();
}
