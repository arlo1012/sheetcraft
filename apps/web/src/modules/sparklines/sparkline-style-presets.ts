import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";

export type SparklineStylePreset = {
  id: number;
  color: string;
  markerColor: string;
  negativeColor: string;
};

/** Appearance recipes only; source, type, point visibility and axes belong to the selected charts. */
export function getSparklineStylePresets(
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
): SparklineStylePreset[] {
  return theme.accentColors.map((color, index) => ({
    id: index + 1,
    color,
    markerColor: color,
    negativeColor: "#c0504d",
  }));
}

export function sparklineStylePatch(
  preset: SparklineStylePreset,
): Pick<CellSparkline, "color" | "markerColor" | "negativeColor"> {
  return {
    color: preset.color,
    markerColor: preset.markerColor,
    negativeColor: preset.negativeColor,
  };
}

export function matchesSparklineStyle(
  value: CellSparkline,
  mixed: readonly (keyof CellSparkline)[],
  preset: SparklineStylePreset,
): boolean {
  return (
    !["color", "markerColor", "negativeColor"].some((field) =>
      mixed.includes(field as keyof CellSparkline),
    ) &&
    value.color.toLowerCase() === preset.color.toLowerCase() &&
    (value.markerColor ?? value.color).toLowerCase() === preset.markerColor.toLowerCase() &&
    value.negativeColor.toLowerCase() === preset.negativeColor.toLowerCase()
  );
}
