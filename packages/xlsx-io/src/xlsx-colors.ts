const DEFAULT_THEME = [
  "FFFFFF",
  "000000",
  "EEECE1",
  "1F497D",
  "4F81BD",
  "C0504D",
  "9BBB59",
  "8064A2",
  "4BACC6",
  "F79646",
] as const;

const INDEXED_COLORS: Record<number, string> = {
  8: "000000",
  9: "FFFFFF",
  10: "FF0000",
  11: "00FF00",
  12: "0000FF",
  13: "FFFF00",
  14: "FF00FF",
  15: "00FFFF",
  16: "800000",
  17: "008000",
  18: "000080",
  19: "808000",
  20: "800080",
  21: "008080",
  22: "C0C0C0",
  23: "808080",
};

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes)?.[2];
}

function themeColors(themeXml: string | undefined): readonly string[] {
  if (!themeXml) return DEFAULT_THEME;
  const scheme = /<a:clrScheme\b[^>]*>([\s\S]*?)<\/a:clrScheme>/i.exec(themeXml)?.[1];
  if (!scheme) return DEFAULT_THEME;
  const names = [
    "lt1",
    "dk1",
    "lt2",
    "dk2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
  ];
  const colors = names.map((name) => {
    const body = new RegExp(`<a:${name}\\b[^>]*>([\\s\\S]*?)<\\/a:${name}>`, "i").exec(scheme)?.[1];
    return /<(?:a:)?(?:srgbClr|sysClr)\b[^>]*\b(?:val|lastClr)="([0-9a-f]{6})"/i
      .exec(body ?? "")?.[1]
      ?.toUpperCase();
  });
  return colors.every((color): color is string => !!color) ? colors : DEFAULT_THEME;
}

export function tint(color: string, amount: number | undefined): string {
  if (amount === undefined || !Number.isFinite(amount) || amount === 0) return color;
  const factor = Math.max(-1, Math.min(1, amount));
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const maximum = Math.max(...rgb);
  const minimum = Math.min(...rgb);
  let hue = 0;
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  let saturation = 0;
  if (delta) {
    saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    if (maximum === rgb[0]) hue = (rgb[1]! - rgb[2]!) / delta + (rgb[1]! < rgb[2]! ? 6 : 0);
    else if (maximum === rgb[1]) hue = (rgb[2]! - rgb[0]!) / delta + 2;
    else hue = (rgb[0]! - rgb[1]!) / delta + 4;
    hue /= 6;
  }
  const adjusted = factor < 0 ? lightness * (1 + factor) : lightness + (1 - lightness) * factor;
  const upper =
    adjusted < 0.5 ? adjusted * (1 + saturation) : adjusted + saturation - adjusted * saturation;
  const lower = 2 * adjusted - upper;
  const hueValue = (part: number) => {
    let value = part;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return lower + (upper - lower) * 6 * value;
    if (value < 1 / 2) return upper;
    if (value < 2 / 3) return lower + (upper - lower) * (2 / 3 - value) * 6;
    return lower;
  };
  const values =
    saturation === 0
      ? [adjusted, adjusted, adjusted]
      : [hueValue(hue + 1 / 3), hueValue(hue), hueValue(hue - 1 / 3)];
  return values
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

/** Materialize XLSX theme/indexed colors into portable RGB before Core reads them. */
export function materializeXlsxStyleColors(stylesXml: string, themeXml?: string): string {
  const palette = themeColors(themeXml);
  return stylesXml.replace(/<(?:color|fgColor|bgColor)\b([^>]*)\/?\s*>/gi, (tag, attrs: string) => {
    if (attribute(attrs, "rgb")) return tag;
    const theme = Number(attribute(attrs, "theme"));
    const indexed = Number(attribute(attrs, "indexed"));
    const color =
      Number.isInteger(theme) && theme >= 0 && theme < palette.length
        ? palette[theme]
        : INDEXED_COLORS[indexed];
    if (!color) return tag;
    return tag.replace(/\/?\s*>$/, ` rgb="FF${tint(color, Number(attribute(attrs, "tint")))}"/>`);
  });
}
