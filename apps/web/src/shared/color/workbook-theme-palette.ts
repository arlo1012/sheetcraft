import {
  resolveThemeColor,
  resolveThemeFontFamily,
  type ThemeColorReference,
  type ThemeColorSlot,
  type ThemeFontRole,
  type WorkbookTheme,
} from "@sheetcraft/core/workbook-theme";

const paletteSlots: readonly ThemeColorSlot[] = [
  "light1",
  "dark1",
  "light2",
  "dark2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
];

export function createWorkbookThemePalette(theme: WorkbookTheme) {
  return [0, 0.8, 0.6, 0.4, -0.25, -0.5].flatMap((tint, row) =>
    paletteSlots.map((slot) => {
      // White/black columns need visible shades, rather than six identical swatches.
      const base = resolveThemeColor(theme, slot);
      const tone =
        row === 0
          ? 0
          : base === "#ffffff"
            ? -[0, 0.05, 0.15, 0.25, 0.35, 0.5][row]!
            : base === "#000000"
              ? [0, 0.5, 0.35, 0.25, 0.15, 0.05][row]!
              : tint;
      const reference: ThemeColorReference = tone === 0 ? { slot } : { slot, tint: tone };
      return { color: resolveThemeColor(theme, reference), reference };
    }),
  );
}

/** A Latin family followed by its East Asian fallback supports mixed-script cells. */
export function getWorkbookThemeFontFamily(theme: WorkbookTheme, role: ThemeFontRole): string {
  return resolveThemeFontFamily(theme, role);
}
