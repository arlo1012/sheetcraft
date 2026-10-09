import { NUMBER_FORMAT_LOCALES } from "@sheetcraft/core/number-format";
import { supportsDateFormatLocale } from "../../../shared/number-format/date-presets";

export type NumberFormatRegionOption = Readonly<{ value: string; label: string }>;

export function getDateFormatRegionOptions(
  displayLocale: string,
  currentRegion: string,
): NumberFormatRegionOption[] {
  const names = new Intl.DisplayNames([displayLocale], {
    type: "language",
    languageDisplay: "standard",
  });
  const collator = new Intl.Collator(displayLocale);
  const label = (region: string): string => {
    try {
      return names.of(region) ?? region;
    } catch {
      return region;
    }
  };
  const options = NUMBER_FORMAT_LOCALES.filter(({ locale }) => supportsDateFormatLocale(locale))
    .map(({ locale }) => ({ value: locale, label: label(locale) }))
    .sort((left, right) => collator.compare(left.label, right.label));
  // Reopening an imported document must keep its original locale, even when
  // this runtime cannot offer localized presets for a new selection.
  if (!options.some(({ value }) => value === currentRegion)) {
    options.push({ value: currentRegion, label: label(currentRegion) });
  }
  return options;
}
