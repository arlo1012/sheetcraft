const COLOR = /^#[0-9a-f]{6}$/i;

export type ThemeColorSlot =
  | "dark1"
  | "light1"
  | "dark2"
  | "light2"
  | "accent1"
  | "accent2"
  | "accent3"
  | "accent4"
  | "accent5"
  | "accent6"
  | "hyperlink"
  | "followedHyperlink";
/** A live theme-color binding. Tint is a signed fraction in [-1, 1]. */
export type ThemeColorReference = { slot: ThemeColorSlot; tint?: number };
export type ThemeColorToken = ThemeColorSlot;
/** Office names these major and minor fonts; aliases retain the existing Core terminology. */
export type ThemeFontRole = "major" | "minor";
export type ThemeFontToken = "heading" | "body";
export type WorkbookThemeColors = {
  name: string;
  dark1: string;
  light1: string;
  dark2: string;
  light2: string;
  hyperlink: string;
  followedHyperlink: string;
};
export type WorkbookThemeFonts = {
  name: string;
  headingEastAsia: string;
  bodyEastAsia: string;
  /** Absent means unknown; empty means an explicit automatic theme slot. */
  headingComplexScript?: string;
  bodyComplexScript?: string;
};
export type WorkbookThemeEffects = {
  id: string;
  name: string;
  shadow: "none" | "soft" | "hard";
  reflection: boolean;
  bevel: boolean;
  outlineWidth: number;
  gradient: boolean;
};
export type WorkbookCustomColor = WorkbookThemeColors & {
  id: string;
  accentColors: [string, string, string, string, string, string];
};
export type WorkbookCustomFont = {
  id: string;
  name: string;
  headingFont: string;
  bodyFont: string;
  headingEastAsia: string;
  bodyEastAsia: string;
};

export type WorkbookTheme = {
  id: string;
  name: string;
  /** Accent colors in the same order Excel exposes them in a theme. */
  accentColors: [string, string, string, string, string, string];
  headingFont: string;
  bodyFont: string;
  colors?: WorkbookThemeColors;
  fonts?: WorkbookThemeFonts;
  effects?: WorkbookThemeEffects;
  customColors?: WorkbookCustomColor[];
  customFonts?: WorkbookCustomFont[];
};

export const DEFAULT_WORKBOOK_THEME: Required<WorkbookTheme> = {
  id: "office",
  name: "Office",
  accentColors: ["#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"],
  headingFont: "Inter",
  bodyFont: "Inter",
  colors: {
    name: "Office",
    dark1: "#000000",
    light1: "#ffffff",
    dark2: "#1f1f1f",
    light2: "#eeeeee",
    hyperlink: "#0563c1",
    followedHyperlink: "#954f72",
  },
  fonts: { name: "Office", headingEastAsia: "宋体", bodyEastAsia: "宋体" },
  effects: {
    id: "office",
    name: "Office",
    shadow: "soft",
    reflection: false,
    bevel: false,
    outlineWidth: 1,
    gradient: false,
  },
  customColors: [],
  customFonts: [],
};

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`Workbook theme ${label} must be a non-empty string.`);
  return value.trim();
}
function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !COLOR.test(value))
    throw new TypeError(`Workbook theme ${label} must be a hexadecimal RGB color.`);
  return value.toLowerCase();
}
function accentColors(value: unknown, label = "accent colors"): WorkbookTheme["accentColors"] {
  if (!Array.isArray(value) || value.length !== 6)
    throw new TypeError(`Workbook theme ${label} must contain six colors.`);
  return value.map((entry, index) =>
    color(entry, `${label} ${index + 1}`),
  ) as WorkbookTheme["accentColors"];
}
function colors(value: unknown, fallbackName: string): WorkbookThemeColors {
  const source = value === undefined ? DEFAULT_WORKBOOK_THEME.colors : value;
  if (!source || typeof source !== "object")
    throw new TypeError("Workbook theme colors must be an object.");
  const record = source as Record<string, unknown>;
  return {
    name: text(record.name ?? fallbackName, "color scheme name"),
    dark1: color(record.dark1, "dark 1"),
    light1: color(record.light1, "light 1"),
    dark2: color(record.dark2, "dark 2"),
    light2: color(record.light2, "light 2"),
    hyperlink: color(record.hyperlink, "hyperlink"),
    followedHyperlink: color(record.followedHyperlink, "followed hyperlink"),
  };
}
function fonts(value: unknown, fallbackName: string): WorkbookThemeFonts {
  const source = value === undefined ? DEFAULT_WORKBOOK_THEME.fonts : value;
  if (!source || typeof source !== "object")
    throw new TypeError("Workbook theme fonts must be an object.");
  const prototype: unknown = Object.getPrototypeOf(source);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Workbook theme fonts require an ordinary data record.");
  const keys = [
    "name",
    "headingEastAsia",
    "bodyEastAsia",
    "headingComplexScript",
    "bodyComplexScript",
  ];
  for (const key of keys)
    if (key in source && !Object.hasOwn(source, key))
      throw new TypeError("Workbook theme fonts require own data fields.");
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    if (typeof key !== "string" || !keys.includes(key) || !("value" in descriptor))
      throw new TypeError("Workbook theme fonts require known own data fields.");
  }
  const record = source as Record<string, unknown>;
  const result: WorkbookThemeFonts = {
    name: text(record.name ?? fallbackName, "font scheme name"),
    headingEastAsia: text(record.headingEastAsia, "heading East Asian font"),
    bodyEastAsia: text(record.bodyEastAsia, "body East Asian font"),
  };
  for (const key of ["headingComplexScript", "bodyComplexScript"] as const) {
    if (!Object.hasOwn(record, key)) continue;
    const value = record[key];
    if (typeof value !== "string" || value.length > 256 || (value !== "" && !value.trim()))
      throw new TypeError(
        "Workbook theme complex-script font must be bounded text or explicitly empty.",
      );
    result[key] = value;
  }
  return result;
}

function effects(value: unknown, fallbackName: string): WorkbookThemeEffects {
  const source = value === undefined ? DEFAULT_WORKBOOK_THEME.effects : value;
  if (!source || typeof source !== "object")
    throw new TypeError("Workbook theme effects must be an object.");
  const record = source as Record<string, unknown>;
  const shadow = record.shadow;
  if (shadow !== "none" && shadow !== "soft" && shadow !== "hard")
    throw new TypeError("Workbook theme effect shadow must be none, soft, or hard.");
  for (const key of ["reflection", "bevel", "gradient"] as const)
    if (typeof record[key] !== "boolean")
      throw new TypeError(`Workbook theme effect ${key} must be boolean.`);
  if (
    typeof record.outlineWidth !== "number" ||
    !Number.isFinite(record.outlineWidth) ||
    record.outlineWidth < 0
  )
    throw new TypeError(
      "Workbook theme effect outline width must be a non-negative finite number.",
    );
  return {
    id: text(record.id, "effect id"),
    name: text(record.name ?? fallbackName, "effect name"),
    shadow,
    reflection: record.reflection as boolean,
    bevel: record.bevel as boolean,
    outlineWidth: record.outlineWidth,
    gradient: record.gradient as boolean,
  };
}
function customColors(value: unknown): WorkbookCustomColor[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("Workbook theme custom colors must be an array.");
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object")
      throw new TypeError("Workbook theme custom color must be an object.");
    const record = entry as Record<string, unknown>;
    const id = text(record.id, "custom color id");
    if (ids.has(id)) throw new TypeError("Workbook theme custom color IDs must be unique.");
    ids.add(id);
    return {
      id,
      accentColors: accentColors(record.accentColors, "custom accent colors"),
      ...colors(record, text(record.name, "custom color name")),
    };
  });
}
function customFonts(value: unknown): WorkbookCustomFont[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("Workbook theme custom fonts must be an array.");
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object")
      throw new TypeError("Workbook theme custom font must be an object.");
    const record = entry as Record<string, unknown>;
    const id = text(record.id, "custom font id");
    if (ids.has(id)) throw new TypeError("Workbook theme custom font IDs must be unique.");
    ids.add(id);
    return {
      id,
      name: text(record.name, "custom font name"),
      headingFont: text(record.headingFont, "custom heading font"),
      bodyFont: text(record.bodyFont, "custom body font"),
      headingEastAsia: text(record.headingEastAsia, "custom heading East Asian font"),
      bodyEastAsia: text(record.bodyEastAsia, "custom body East Asian font"),
    };
  });
}

export function normalizeWorkbookTheme(value: WorkbookTheme): Required<WorkbookTheme> {
  if (!value || typeof value !== "object") throw new TypeError("Workbook theme must be an object.");
  const id = text(value.id, "id");
  const name = text(value.name, "name");
  return {
    id,
    name,
    accentColors: accentColors(value.accentColors),
    headingFont: text(value.headingFont, "heading font"),
    bodyFont: text(value.bodyFont, "body font"),
    colors: colors(value.colors, name),
    fonts: fonts(value.fonts, name),
    effects: effects(value.effects, name),
    customColors: customColors(value.customColors),
    customFonts: customFonts(value.customFonts),
  };
}
export function cloneWorkbookTheme(theme: WorkbookTheme): Required<WorkbookTheme> {
  return normalizeWorkbookTheme(theme);
}
/** Matches Excel/WPS's HSL luminance tint behavior used by our XLSX reader. */
function tinted(colorValue: string, tint: number | undefined): string {
  if (tint === undefined || tint === 0) return colorValue;
  if (typeof tint !== "number" || !Number.isFinite(tint) || tint < -1 || tint > 1)
    throw new TypeError("Theme color tint must be a finite number between -1 and 1.");
  const rgb = [1, 3, 5].map(
    (offset) => Number.parseInt(colorValue.slice(offset, offset + 2), 16) / 255,
  );
  const maximum = Math.max(...rgb);
  const minimum = Math.min(...rgb);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  let hue = 0;
  let saturation = 0;
  if (delta) {
    saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    if (maximum === rgb[0]) hue = (rgb[1]! - rgb[2]!) / delta + (rgb[1]! < rgb[2]! ? 6 : 0);
    else if (maximum === rgb[1]) hue = (rgb[2]! - rgb[0]!) / delta + 2;
    else hue = (rgb[0]! - rgb[1]!) / delta + 4;
    hue /= 6;
  }
  const adjusted = tint < 0 ? lightness * (1 + tint) : lightness + (1 - lightness) * tint;
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
  return `#${values
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function normalizeThemeColorReference(value: ThemeColorReference): ThemeColorReference {
  if (!value || typeof value !== "object" || !("slot" in value))
    throw new TypeError("Theme color reference must be an object.");
  const slot = value.slot;
  if (
    typeof slot !== "string" ||
    ![
      "dark1",
      "light1",
      "dark2",
      "light2",
      "accent1",
      "accent2",
      "accent3",
      "accent4",
      "accent5",
      "accent6",
      "hyperlink",
      "followedHyperlink",
    ].includes(slot)
  )
    throw new TypeError("Theme color reference slot is invalid.");
  if (
    value.tint !== undefined &&
    (typeof value.tint !== "number" ||
      !Number.isFinite(value.tint) ||
      value.tint < -1 ||
      value.tint > 1)
  )
    throw new TypeError("Theme color tint must be a finite number between -1 and 1.");
  return value.tint === undefined || value.tint === 0
    ? { slot: slot as ThemeColorSlot }
    : { slot: slot as ThemeColorSlot, tint: value.tint };
}
export function resolveThemeColor(
  theme: WorkbookTheme,
  reference: ThemeColorSlot | ThemeColorReference,
): string {
  const normalized = normalizeWorkbookTheme(theme);
  const { slot, tint } =
    typeof reference === "string"
      ? { slot: reference, tint: undefined }
      : normalizeThemeColorReference(reference);
  const base = slot.startsWith("accent")
    ? normalized.accentColors[Number(slot.slice(6)) - 1]!
    : normalized.colors[slot as keyof WorkbookThemeColors];
  return tinted(base, tint);
}
export function resolveThemeFont(
  theme: WorkbookTheme,
  role: ThemeFontRole | ThemeFontToken,
  eastAsia = false,
): string {
  const normalized = normalizeWorkbookTheme(theme);
  const heading = role === "heading" || role === "major";
  return heading
    ? eastAsia
      ? normalized.fonts.headingEastAsia
      : normalized.headingFont
    : eastAsia
      ? normalized.fonts.bodyEastAsia
      : normalized.bodyFont;
}
/** CSS-ready Latin/East Asian stack used as the persisted renderer cache. */
export function resolveThemeFontFamily(
  theme: WorkbookTheme,
  role: ThemeFontRole | ThemeFontToken,
): string {
  const latin = resolveThemeFont(theme, role);
  const eastAsia = resolveThemeFont(theme, role, true);
  const families = [...new Set([latin, eastAsia])];
  return families
    .map((family) => `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
    .join(", ");
}
