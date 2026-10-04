const COLOR = /^#[0-9a-f]{6}$/i;

export type WorkbookTheme = {
  id: string;
  name: string;
  /** Accent colors in the same order Excel exposes them in a theme. */
  accentColors: [string, string, string, string, string, string];
  headingFont: string;
  bodyFont: string;
};

export const DEFAULT_WORKBOOK_THEME: WorkbookTheme = {
  id: "office",
  name: "Office",
  accentColors: ["#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"],
  headingFont: "Inter",
  bodyFont: "Inter",
};

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`Workbook theme ${label} must be a non-empty string.`);
  return value.trim();
}

export function normalizeWorkbookTheme(value: WorkbookTheme): WorkbookTheme {
  if (!value || typeof value !== "object") throw new TypeError("Workbook theme must be an object.");
  if (!Array.isArray(value.accentColors) || value.accentColors.length !== 6)
    throw new TypeError("Workbook theme must contain six accent colors.");
  const accentColors = value.accentColors.map((color) => {
    if (typeof color !== "string" || !COLOR.test(color))
      throw new TypeError("Workbook theme accent colors must be hexadecimal RGB colors.");
    return color.toLowerCase();
  }) as WorkbookTheme["accentColors"];
  return {
    id: text(value.id, "id"),
    name: text(value.name, "name"),
    accentColors,
    headingFont: text(value.headingFont, "heading font"),
    bodyFont: text(value.bodyFont, "body font"),
  };
}

export function cloneWorkbookTheme(theme: WorkbookTheme): WorkbookTheme {
  return normalizeWorkbookTheme(theme);
}
